import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { backupMasterKey, decryptBackup, encryptBackup, signBackupManifest, verifyBackupManifest } from "../src/operations/backup-crypto";
import { assertRecoveryKey } from "../src/operations/backup-store";

async function collect(stream: AsyncIterable<Uint8Array>) {
  const pieces: Buffer[] = [];
  for await (const p of stream) pieces.push(Buffer.from(p));
  return Buffer.concat(pieces);
}
async function* chunks(bytes: Buffer, size = 23) {
  for (let i = 0; i < bytes.length; i += size) yield bytes.subarray(i, i + size);
}
describe("portable recovery encryption", () => {
  it("authenticates the media-to-workspace mapping as well as the encrypted objects", () => {
    const key = randomBytes(32),
      manifest = { format: "markos-recovery-v1", media: [{ workspaceId: "workspace-a", key: "backup-a" }] };
    const signed = { ...manifest, signature: signBackupManifest(manifest, key) };
    expect(verifyBackupManifest(signed, key)).toEqual(manifest);
    expect(() => verifyBackupManifest({ ...signed, media: [{ workspaceId: "workspace-b", key: "backup-a" }] }, key)).toThrow();
    expect(() => verifyBackupManifest(signed, randomBytes(32))).toThrow();
  });
  it("authenticates headers and data across arbitrary stream boundaries without depending on this PC", async () => {
    const key = randomBytes(32),
      input = Buffer.from("Business data العربية".repeat(1000));
    const encrypted = await collect(encryptBackup(chunks(input), key));
    expect(encrypted.includes(Buffer.from("Business data"))).toBe(false);
    expect(await collect(decryptBackup(chunks(encrypted, 7), key))).toEqual(input);
    expect(backupMasterKey(key.toString("base64"))).toEqual(key);
    await expect(collect(decryptBackup(chunks(encrypted), randomBytes(32)))).rejects.toThrow();
    for (const offset of [0, 18, encrypted.length - 17, encrypted.length - 1]) {
      const corrupt = Buffer.from(encrypted);
      corrupt[offset] = corrupt[offset]! ^ 1;
      await expect(collect(decryptBackup(chunks(corrupt), key))).rejects.toThrow();
    }
    await expect(collect(decryptBackup(chunks(encrypted.subarray(0, -3)), key))).rejects.toThrow();
  });
  it("limits retention/upload keys to the recovery namespace", () => {
    expect(() => assertRecoveryKey("markos-recovery/v1/runs/test/database.dump.enc")).not.toThrow();
    for (const key of ["workspace/media.jpg", "markos-recovery/v1/runs/../media.jpg", "s3://bucket/key"]) expect(() => assertRecoveryKey(key)).toThrow();
    expect(() => backupMasterKey("bad-key")).toThrow();
  });
});
