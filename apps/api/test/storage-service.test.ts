import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it } from "vitest";
import { createProviderFetchUrl, LocalMediaStorageDriver, MediaStorageError, S3MediaStorageDriver, storageKeysForRoute } from "../src/media/storage-service";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("LocalMediaStorageDriver", () => {
  it("stores workspace-prefixed immutable files and serves a stable URL", async () => {
    const storageRoot = await mkdtemp(join(tmpdir(), "markos-storage-"));
    temporaryDirectories.push(storageRoot);
    const driver = new LocalMediaStorageDriver({ publicBaseUrl: "https://api.example.test/", storageRoot });
    const bytes = Buffer.from("local image bytes");
    const stored = await driver.store({
      bytes,
      contentType: "image/jpeg",
      filename: "fixture.JPG",
      workspaceId: "workspace-a"
    });

    expect(stored).toMatchObject({
      key: expect.stringMatching(/^local:workspace-a\/[0-9a-f-]+\.jpg$/),
      publicUrl: expect.stringMatching(/^https:\/\/api\.example\.test\/media-files\/workspace-a\/[0-9a-f-]+\.jpg$/),
      sizeBytes: bytes.byteLength
    });
    await expect(driver.read({ key: stored.key, workspaceId: "workspace-a" })).resolves.toEqual(bytes);
    await expect(driver.createProviderFetchUrl({ key: stored.key, workspaceId: "workspace-a" })).resolves.toBe(stored.publicUrl);
    await expect(driver.read({ key: stored.key, workspaceId: "workspace-b" })).rejects.toMatchObject({
      code: "MEDIA_STORAGE_KEY_INVALID"
    });
    await driver.remove({ key: stored.key, workspaceId: "workspace-a" });
    await expect(driver.read({ key: stored.key, workspaceId: "workspace-a" })).rejects.toMatchObject({
      code: "MEDIA_STORAGE_READ_FAILED"
    });
  });
});

describe("S3MediaStorageDriver", () => {
  it("uploads with explicit metadata and signs a fresh provider-only GET URL", async () => {
    const sentCommands: unknown[] = [];
    const bytes = Buffer.from("bucket image bytes");
    const client = {
      async send(command: unknown) {
        sentCommands.push(command);

        if (command instanceof GetObjectCommand) {
          return {
            Body: {
              async transformToByteArray() {
                return Uint8Array.from(bytes);
              }
            }
          };
        }

        return {};
      }
    } as unknown as S3Client;
    const signCalls: Array<{ command: GetObjectCommand; expiresIn: number }> = [];
    const signedUrl = "https://markos-bucket.storage.railway.app/workspace-a/object.jpg?X-Amz-Signature=sensitive";
    const driver = new S3MediaStorageDriver({
      client,
      config: {
        accessKeyId: "fake-access-key",
        bucketName: "markos-staging",
        endpoint: "https://storage.railway.app",
        region: "auto",
        secretAccessKey: "fake-secret-key",
        signedUrlTtlSeconds: 3600,
        urlStyle: "virtual"
      },
      publicBaseUrl: "https://api.example.test",
      signUrl: async (_client, command, options) => {
        signCalls.push({ command, expiresIn: options.expiresIn });
        return signedUrl;
      }
    });
    const stored = await driver.store({
      bytes,
      contentType: "image/jpeg",
      filename: "fixture.jpg",
      workspaceId: "workspace-a"
    });
    const put = sentCommands[0] as PutObjectCommand;

    expect(put).toBeInstanceOf(PutObjectCommand);
    expect(put.input).toMatchObject({
      Body: bytes,
      Bucket: "markos-staging",
      ContentType: "image/jpeg",
      IfNoneMatch: "*",
      Key: expect.stringMatching(/^workspace-a\/[0-9a-f-]+\.jpg$/)
    });
    expect(stored.key).toMatch(/^s3:workspace-a\/[0-9a-f-]+\.jpg$/);
    expect(stored.publicUrl).toMatch(/^https:\/\/api\.example\.test\/media-files\/workspace-a\/[0-9a-f-]+\.jpg$/);
    expect(stored.publicUrl).not.toContain("X-Amz-");

    await expect(driver.createProviderFetchUrl({ key: stored.key, workspaceId: "workspace-a" })).resolves.toBe(signedUrl);
    expect(signCalls).toHaveLength(1);
    expect(signCalls[0]?.command.input).toMatchObject({
      Bucket: "markos-staging",
      Key: stored.key.slice("s3:".length)
    });
    expect(signCalls[0]?.expiresIn).toBe(3600);
    await expect(driver.read({ key: stored.key, workspaceId: "workspace-a" })).resolves.toEqual(bytes);
    await driver.remove({ key: stored.key, workspaceId: "workspace-a" });
    const deletion = sentCommands.at(-1) as DeleteObjectCommand;
    expect(deletion).toBeInstanceOf(DeleteObjectCommand);
    expect(deletion.input).toMatchObject({
      Bucket: "markos-staging",
      Key: stored.key.slice("s3:".length)
    });
  });

  it("fails closed on cross-workspace keys and sanitizes signing errors", async () => {
    let signed = false;
    const driver = new S3MediaStorageDriver({
      client: { send: async () => ({}) } as unknown as S3Client,
      config: {
        accessKeyId: "fake-access-key",
        bucketName: "markos-staging",
        endpoint: "https://storage.railway.app",
        region: "auto",
        secretAccessKey: "fake-secret-key",
        signedUrlTtlSeconds: 3600,
        urlStyle: "virtual"
      },
      publicBaseUrl: "https://api.example.test",
      signUrl: async () => {
        signed = true;
        throw new Error("fake-secret-key X-Amz-Signature=sensitive");
      }
    });

    await expect(driver.createProviderFetchUrl({ key: "s3:workspace-b/object.jpg", workspaceId: "workspace-a" })).rejects.toMatchObject({
      code: "MEDIA_STORAGE_KEY_INVALID"
    });
    expect(signed).toBe(false);

    const promise = driver.createProviderFetchUrl({ key: "s3:workspace-a/object.jpg", workspaceId: "workspace-a" });
    await expect(promise).rejects.toThrow("MEDIA_PROVIDER_URL_SIGNING_FAILED");
    await expect(promise).rejects.not.toThrow("fake-secret-key");
    await expect(promise).rejects.not.toThrow("X-Amz-Signature");
  });
});

describe("storage routing", () => {
  it("does not expose signed URLs to ordinary external-media callers", async () => {
    await expect(
      createProviderFetchUrl({
        publicUrl: "https://cdn.example.test/photo.jpg",
        storageKey: "external:https://cdn.example.test/photo.jpg",
        workspaceId: "workspace-a"
      })
    ).resolves.toBe("https://cdn.example.test/photo.jpg");
    expect(storageKeysForRoute("workspace-a", "photo.jpg")).toEqual(["local:workspace-a/photo.jpg", "s3:workspace-a/photo.jpg"]);
    expect(storageKeysForRoute("workspace-a", "../photo.jpg")).toEqual([]);
  });

  it("uses only bounded storage error codes", () => {
    const error = new MediaStorageError("MEDIA_STORAGE_WRITE_FAILED");
    expect(error.message).toBe("MEDIA_STORAGE_WRITE_FAILED");
  });
});
