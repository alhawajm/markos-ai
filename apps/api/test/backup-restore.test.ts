import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import type { S3Client } from "@aws-sdk/client-s3";
import { encryptBackup, signBackupManifest } from "../src/operations/backup-crypto";
import { parseRecoveryManifest, withVerifiedRecovery } from "../src/operations/backup-restore";
import { expireBackups } from "../src/operations/backup-retention";
import { recoveryPrefix } from "../src/operations/backup-store";

const run = "2026-10-26T00-00-00Z_019ba771-ff00-7000-8000-000000000001",
  prefix = recoveryPrefix + run + "/";
const workspaceId = "019ba771-ff00-7000-8000-000000000002",
  assetId = "019ba771-ff00-7000-8000-000000000003";
async function* stream(b: Buffer) {
  yield b;
}
async function fixture() {
  const master = randomBytes(32),
    objects = new Map<string, Buffer>();
  const create = async (key: string, plaintext: string) => {
    const pieces: Buffer[] = [];
    for await (const p of encryptBackup(stream(Buffer.from(plaintext)), master)) pieces.push(p);
    const bytes = Buffer.concat(pieces);
    objects.set(key, bytes);
    return { key, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  };
  const manifest = {
    format: "markos-recovery-v1",
    createdAt: "2026-10-26T00:00:00Z",
    completedAt: "2026-10-26T00:01:00Z",
    keyId: createHash("sha256").update(master).digest("hex").slice(0, 16),
    database: await create(prefix + "database.dump.enc", "database"),
    media: [{ ...(await create(`${prefix}media/${workspaceId}/${assetId}.enc`, "artwork")), workspaceId, id: assetId, sourceKey: workspaceId + "/artwork.jpg" }]
  };
  const signed = { ...manifest, signature: signBackupManifest(manifest, master) };
  objects.set(prefix + "complete.json", Buffer.from(JSON.stringify(signed)));
  const client = {
    send: vi.fn(async (command: { input: { Key: string } }) => {
      const value = objects.get(command.input.Key);
      if (!value) throw Error("missing");
      return { Body: stream(value) };
    })
  } as unknown as S3Client;
  return { master, objects, client, signed, manifest };
}
describe("recovery rehearsal safety", () => {
  it("restores and removes a private verified directory, without sending writes to object storage", async () => {
    const f = await fixture();
    let directory = "";
    await withVerifiedRecovery(f.client, "recovery", run, f.master, async (files) => {
      directory = files.directory;
      expect((await readFile(files.database)).toString()).toBe("database");
      expect(files.mediaObjects).toBe(1);
    });
    await expect(readFile(directory + "/database.dump")).rejects.toThrow();
    expect(vi.mocked(f.client.send).mock.calls.every(([command]) => command.constructor.name === "GetObjectCommand")).toBe(true);
  });
  it("never invokes the restore consumer after corrupted ciphertext or modified workspace mapping", async () => {
    const f = await fixture(),
      consume = vi.fn();
    const bytes = f.objects.get(f.manifest.media[0]!.key)!;
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
    await expect(withVerifiedRecovery(f.client, "recovery", run, f.master, consume)).rejects.toThrow();
    expect(consume).not.toHaveBeenCalled();
    expect(() =>
      parseRecoveryManifest({ ...f.signed, media: [{ ...f.manifest.media[0], workspaceId: "019ba771-ff00-7000-8000-000000000004" }] }, f.master, run)
    ).toThrow();
    expect(() => parseRecoveryManifest(f.signed, f.master, "../other")).toThrow();
  });
  it("expires only old recovery runs and preserves resumed runs, originals, and new snapshots", async () => {
    const old = recoveryPrefix + "2020-01-01T00-00-00Z_019ba771-ff00-7000-8000-000000000001/";
    const resumed = recoveryPrefix + "2020-01-02T00-00-00Z_019ba771-ff00-7000-8000-000000000001/";
    const files = [
      { Key: old + "incomplete.enc", LastModified: new Date("2020-01-01") },
      { Key: resumed + "old.enc", LastModified: new Date("2020-01-02") },
      { Key: resumed + "complete.json", LastModified: new Date() },
      { Key: prefix + "complete.json", LastModified: new Date() },
      { Key: "original/media.jpg", LastModified: new Date("2020-01-01") }
    ];
    const deleted: string[] = [];
    const client = {
      send: vi.fn(async (command: { constructor: { name: string }; input: { Prefix?: string; Key?: string } }) => {
        if (command.constructor.name === "DeleteObjectCommand") {
          deleted.push(command.input.Key!);
          return {};
        }
        return { Contents: files.filter((f) => f.Key.startsWith(command.input.Prefix!)) };
      })
    } as unknown as S3Client;
    await expireBackups(client, "recovery", 30);
    expect(deleted).toEqual([old + "incomplete.enc"]);
  });
});
