import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";

export interface StoredMediaObject {
  key: string;
  publicUrl: string;
  sizeBytes: number;
}

export interface StoreMediaObjectInput {
  workspaceId: string;
  filename: string;
  contentType: string;
  bytes: Buffer;
}

export interface MediaStorageDriver {
  readonly kind: "local" | "s3";
  createProviderFetchUrl(input: { key: string; workspaceId: string }): Promise<string>;
  read(input: { key: string; workspaceId: string }): Promise<Buffer>;
  remove(input: { key: string; workspaceId: string }): Promise<void>;
  store(input: StoreMediaObjectInput): Promise<StoredMediaObject>;
}

export class MediaStorageError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

type S3StorageConfig = {
  accessKeyId: string;
  bucketName: string;
  endpoint: string;
  region: string;
  secretAccessKey: string;
  signedUrlTtlSeconds: number;
  urlStyle: "path" | "virtual";
};

type SignedUrlFactory = (client: S3Client, command: GetObjectCommand, options: { expiresIn: number }) => Promise<string>;

export class LocalMediaStorageDriver implements MediaStorageDriver {
  readonly kind = "local" as const;
  private readonly publicBaseUrl: string;
  private readonly storageRoot: string;

  constructor(options: { publicBaseUrl?: string; storageRoot?: string } = {}) {
    this.publicBaseUrl = normalizedPublicBaseUrl(options.publicBaseUrl);
    this.storageRoot = resolve(options.storageRoot ?? env.MEDIA_STORAGE_DIR);
  }

  async store(input: StoreMediaObjectInput): Promise<StoredMediaObject> {
    const storedFilename = generatedFilename(input.filename);
    const workspaceDir = safeChildPath(this.storageRoot, input.workspaceId);
    const filePath = safeChildPath(workspaceDir, storedFilename);

    try {
      await mkdir(workspaceDir, { recursive: true });
      await writeFile(filePath, input.bytes, { flag: "wx" });
    } catch {
      throw new MediaStorageError("MEDIA_STORAGE_WRITE_FAILED");
    }

    return {
      key: localStorageKey(input.workspaceId, storedFilename),
      publicUrl: stableMediaUrl(this.publicBaseUrl, input.workspaceId, storedFilename),
      sizeBytes: input.bytes.byteLength
    };
  }

  async read(input: { key: string; workspaceId: string }): Promise<Buffer> {
    const { storedFilename } = parseOwnedStorageKey(input.key, "local", input.workspaceId);
    const workspaceDir = safeChildPath(this.storageRoot, input.workspaceId);

    try {
      return await readFile(safeChildPath(workspaceDir, storedFilename));
    } catch {
      throw new MediaStorageError("MEDIA_STORAGE_READ_FAILED");
    }
  }

  async remove(input: { key: string; workspaceId: string }): Promise<void> {
    const { storedFilename } = parseOwnedStorageKey(input.key, "local", input.workspaceId);
    const workspaceDir = safeChildPath(this.storageRoot, input.workspaceId);

    try {
      await unlink(safeChildPath(workspaceDir, storedFilename));
    } catch {
      throw new MediaStorageError("MEDIA_STORAGE_DELETE_FAILED");
    }
  }

  async createProviderFetchUrl(input: { key: string; workspaceId: string }): Promise<string> {
    const { storedFilename } = parseOwnedStorageKey(input.key, "local", input.workspaceId);
    return stableMediaUrl(this.publicBaseUrl, input.workspaceId, storedFilename);
  }
}

export class S3MediaStorageDriver implements MediaStorageDriver {
  readonly kind = "s3" as const;
  private readonly client: S3Client;
  private readonly config: S3StorageConfig;
  private readonly publicBaseUrl: string;
  private readonly signUrl: SignedUrlFactory;

  constructor(
    options: {
      client?: S3Client;
      config?: S3StorageConfig;
      publicBaseUrl?: string;
      signUrl?: SignedUrlFactory;
    } = {}
  ) {
    this.config = options.config ?? requiredS3Config();
    this.publicBaseUrl = normalizedPublicBaseUrl(options.publicBaseUrl);
    this.client =
      options.client ??
      new S3Client({
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey
        },
        endpoint: this.config.endpoint,
        forcePathStyle: this.config.urlStyle === "path",
        region: this.config.region
      });
    this.signUrl = options.signUrl ?? (getSignedUrl as SignedUrlFactory);
  }

  async store(input: StoreMediaObjectInput): Promise<StoredMediaObject> {
    const storedFilename = generatedFilename(input.filename);
    const objectKey = objectStorageKey(input.workspaceId, storedFilename);

    try {
      await this.client.send(
        new PutObjectCommand({
          Body: input.bytes,
          Bucket: this.config.bucketName,
          ContentType: input.contentType,
          IfNoneMatch: "*",
          Key: objectKey
        })
      );
    } catch {
      throw new MediaStorageError("MEDIA_STORAGE_WRITE_FAILED");
    }

    return {
      key: `s3:${objectKey}`,
      publicUrl: stableMediaUrl(this.publicBaseUrl, input.workspaceId, storedFilename),
      sizeBytes: input.bytes.byteLength
    };
  }

  async read(input: { key: string; workspaceId: string }): Promise<Buffer> {
    const { objectKey } = parseOwnedStorageKey(input.key, "s3", input.workspaceId);

    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucketName,
          Key: objectKey
        })
      );

      if (response.Body === undefined) throw new Error("missing body");
      return Buffer.from(await response.Body.transformToByteArray());
    } catch {
      throw new MediaStorageError("MEDIA_STORAGE_READ_FAILED");
    }
  }

  async remove(input: { key: string; workspaceId: string }): Promise<void> {
    const { objectKey } = parseOwnedStorageKey(input.key, "s3", input.workspaceId);

    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.config.bucketName,
          Key: objectKey
        })
      );
    } catch {
      throw new MediaStorageError("MEDIA_STORAGE_DELETE_FAILED");
    }
  }

  async createProviderFetchUrl(input: { key: string; workspaceId: string }): Promise<string> {
    const { objectKey } = parseOwnedStorageKey(input.key, "s3", input.workspaceId);

    try {
      const signedUrl = await this.signUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.config.bucketName,
          Key: objectKey
        }),
        { expiresIn: this.config.signedUrlTtlSeconds }
      );

      if (!isHttpsUrl(signedUrl)) throw new Error("invalid signed url");
      return signedUrl;
    } catch {
      throw new MediaStorageError("MEDIA_PROVIDER_URL_SIGNING_FAILED");
    }
  }
}

export async function storeWorkspaceMedia(input: StoreMediaObjectInput, driver: MediaStorageDriver = createMediaStorageDriver()): Promise<StoredMediaObject> {
  return driver.store(input);
}

export async function readStoredMedia(workspaceId: string, key: string, driver?: MediaStorageDriver): Promise<Buffer> {
  return (driver ?? storageDriverForKey(key)).read({ key, workspaceId });
}

export async function deleteStoredMedia(workspaceId: string, key: string, driver?: MediaStorageDriver): Promise<void> {
  if (key.startsWith("external:")) return;
  await (driver ?? storageDriverForKey(key)).remove({ key, workspaceId });
}

export async function createProviderFetchUrl(
  input: { workspaceId: string; storageKey: string; publicUrl: string },
  driver?: MediaStorageDriver
): Promise<string> {
  if (input.storageKey.startsWith("external:")) {
    if (!isHttpsUrl(input.publicUrl)) throw new MediaStorageError("MEDIA_PROVIDER_URL_INVALID");
    return input.publicUrl;
  }

  return (driver ?? storageDriverForKey(input.storageKey)).createProviderFetchUrl({
    key: input.storageKey,
    workspaceId: input.workspaceId
  });
}

export function storageKeysForRoute(workspaceId: string, storedFilename: string): string[] {
  try {
    assertSafeSegment(workspaceId);
    assertSafeSegment(storedFilename);
    return [localStorageKey(workspaceId, storedFilename), `s3:${objectStorageKey(workspaceId, storedFilename)}`];
  } catch {
    return [];
  }
}

export function createMediaStorageDriver(): MediaStorageDriver {
  return env.MEDIA_STORAGE_DRIVER === "s3" ? new S3MediaStorageDriver() : new LocalMediaStorageDriver();
}

function storageDriverForKey(key: string): MediaStorageDriver {
  if (key.startsWith("local:")) return new LocalMediaStorageDriver();
  if (key.startsWith("s3:")) return new S3MediaStorageDriver();
  throw new MediaStorageError("MEDIA_STORAGE_KEY_INVALID");
}

function requiredS3Config(): S3StorageConfig {
  const config = {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    bucketName: env.AWS_S3_BUCKET_NAME,
    endpoint: env.AWS_ENDPOINT_URL,
    region: env.AWS_DEFAULT_REGION,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    signedUrlTtlSeconds: env.SIGNED_URL_TTL,
    urlStyle: env.AWS_S3_URL_STYLE
  };

  if (
    config.accessKeyId === undefined ||
    config.bucketName === undefined ||
    config.endpoint === undefined ||
    config.region === undefined ||
    config.secretAccessKey === undefined ||
    config.urlStyle === undefined
  ) {
    throw new MediaStorageError("MEDIA_STORAGE_CONFIGURATION_INVALID");
  }

  return config as S3StorageConfig;
}

function parseOwnedStorageKey(key: string, kind: "local" | "s3", workspaceId: string): { objectKey: string; storedFilename: string } {
  assertSafeSegment(workspaceId);
  const prefix = `${kind}:`;

  if (!key.startsWith(prefix)) throw new MediaStorageError("MEDIA_STORAGE_KEY_INVALID");

  const objectKey = key.slice(prefix.length);
  const parts = objectKey.split("/");

  if (parts.length !== 2 || parts[0] !== workspaceId || parts[1] === undefined) {
    throw new MediaStorageError("MEDIA_STORAGE_KEY_INVALID");
  }

  assertSafeSegment(parts[1]);
  return { objectKey, storedFilename: parts[1] };
}

function localStorageKey(workspaceId: string, storedFilename: string): string {
  return `local:${objectStorageKey(workspaceId, storedFilename)}`;
}

function objectStorageKey(workspaceId: string, storedFilename: string): string {
  assertSafeSegment(workspaceId);
  assertSafeSegment(storedFilename);
  return `${workspaceId}/${storedFilename}`;
}

function generatedFilename(originalFilename: string): string {
  return `${randomUUID()}${safeExtension(originalFilename)}`;
}

function safeExtension(filename: string): string {
  const extension = extname(filename).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : "";
}

function assertSafeSegment(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value) || value === "." || value === "..") {
    throw new MediaStorageError("MEDIA_STORAGE_KEY_INVALID");
  }
}

function safeChildPath(parent: string, segment: string): string {
  assertSafeSegment(segment);
  const child = resolve(parent, segment);
  const childRelativePath = relative(parent, child);

  if (childRelativePath.length === 0 || childRelativePath.startsWith("..") || isAbsolute(childRelativePath)) {
    throw new MediaStorageError("MEDIA_STORAGE_KEY_INVALID");
  }

  return child;
}

function stableMediaUrl(publicBaseUrl: string, workspaceId: string, storedFilename: string): string {
  return `${publicBaseUrl}/media-files/${encodeURIComponent(workspaceId)}/${encodeURIComponent(storedFilename)}`;
}

function normalizedPublicBaseUrl(override?: string): string {
  return (override ?? env.MEDIA_PUBLIC_BASE_URL ?? env.API_BASE_URL).replace(/\/$/, "");
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username.length === 0 && url.password.length === 0;
  } catch {
    return false;
  }
}
