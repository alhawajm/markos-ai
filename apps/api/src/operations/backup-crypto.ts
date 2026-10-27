import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

const magic = Buffer.from("MARKOS-BACKUP-1\n");
export function signBackupManifest(manifest: object, master: Buffer): string {
  return createHmac("sha256", master).update("markos-recovery-manifest-v1\n").update(JSON.stringify(manifest)).digest("hex");
}
export function verifyBackupManifest(value: unknown, master: Buffer): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("BACKUP_MANIFEST_INVALID");
  const { signature, ...manifest } = value as Record<string, unknown>;
  if (
    typeof signature !== "string" ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    !timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(signBackupManifest(manifest, master), "hex"))
  )
    throw new Error("BACKUP_MANIFEST_AUTHENTICATION_FAILED");
  return manifest;
}
export const backupHeaderBytes = magic.length + 28;
export function backupMasterKey(value: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) throw new Error("BACKUP_KEY_INVALID");
  return key;
}
function derive(master: Buffer, salt: Buffer): Buffer {
  if (master.length !== 32) throw new Error("BACKUP_KEY_INVALID");
  return Buffer.from(hkdfSync("sha256", master, salt, "markos-recovery-v1", 32));
}
export async function* encryptBackup(source: AsyncIterable<Uint8Array>, master: Buffer): AsyncGenerator<Buffer> {
  const salt = randomBytes(16),
    iv = randomBytes(12),
    key = derive(master, salt);
  const header = Buffer.concat([magic, salt, iv]);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(header);
  try {
    yield header;
    for await (const chunk of source) yield cipher.update(chunk);
    yield cipher.final();
    yield cipher.getAuthTag();
  } finally {
    key.fill(0);
  }
}
/** Authenticate first before passing a restored dump to PostgreSQL. */
export async function* decryptBackup(source: AsyncIterable<Uint8Array>, master: Buffer): AsyncGenerator<Buffer> {
  let buffered = Buffer.alloc(0),
    key: Buffer | undefined;
  let decipher: ReturnType<typeof createDecipheriv> | undefined;
  try {
    for await (const chunk of source) {
      buffered = Buffer.concat([buffered, chunk]);
      if (!decipher && buffered.length >= backupHeaderBytes) {
        const header = buffered.subarray(0, backupHeaderBytes);
        if (!header.subarray(0, magic.length).equals(magic)) throw new Error("BACKUP_FORMAT_INVALID");
        key = derive(master, header.subarray(magic.length, magic.length + 16));
        const gcm = createDecipheriv("aes-256-gcm", key, header.subarray(magic.length + 16));
        gcm.setAAD(header);
        decipher = gcm;
        buffered = buffered.subarray(backupHeaderBytes);
      }
      if (decipher && buffered.length > 16) {
        yield decipher.update(buffered.subarray(0, -16));
        buffered = buffered.subarray(-16);
      }
    }
    if (!decipher || buffered.length !== 16) throw new Error("BACKUP_TRUNCATED");
    (decipher as ReturnType<typeof createDecipheriv> & { setAuthTag(tag: Buffer): void }).setAuthTag(buffered);
    yield decipher.final();
  } finally {
    key?.fill(0);
  }
}
