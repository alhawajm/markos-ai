import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { env } from "../src/config/env";
import { accountDeletionPreview, deleteAccount, processAccountErasures } from "../src/workspace/account-deletion";
import { storeWorkspaceMedia, readStoredMedia } from "../src/media/storage-service";
import { generateTotpCode, generateTotpSecret } from "../src/auth/totp";
import { requestAccountDeletionCode, verifyAccountDeletionCode } from "../src/workspace/account-deletion-proof";
import { processAuthEmails } from "../src/auth/auth-email";
if (!new URL(env.DATABASE_URL).pathname.endsWith("markos_production_features_test"))
  throw new Error("Use the disposable markos_production_features_test database");
const password = "CorrectHorseBattery99!";
async function owner() {
  return prisma.user.create({
    data: { email: `${randomUUID()}@markos.test`, fullName: "Deletion test", passwordHash: await argon2.hash(password), isVerified: true }
  });
}
async function workspace(userId: string) {
  const value = await prisma.workspace.create({ data: { name: "Delete this test workspace", slug: randomUUID(), ownerUserId: userId } });
  await prisma.workspaceMember.create({ data: { workspaceId: value.id, userId, role: "OWNER" } });
  return value;
}
describe("complete account deletion", () => {
  it("reauthenticates passwordless accounts by a user-bound expiring email code", async () => {
    const a = await owner(),
      b = await owner();
    await workspace(a.id);
    await prisma.user.update({ where: { id: a.id }, data: { passwordHash: null, googleId: randomUUID() } });
    const preview = await accountDeletionPreview(a.id);
    expect(preview.passwordRequired).toBe(false);
    const challenge = await requestAccountDeletionCode(a.id);
    let code = "";
    for (let i = 0; i < 10 && !code; i++)
      await processAuthEmails(async (mail) => {
        if (mail.email === a.email && mail.kind === "DELETE_CODE") code = mail.code!;
      });
    expect(code).toMatch(/^\d{8}$/);
    expect(() => verifyAccountDeletionCode(b.id, b.authVersion, challenge.challengeToken, code)).toThrow();
    expect(() => verifyAccountDeletionCode(a.id, a.authVersion + 1, challenge.challengeToken, code)).toThrow();
    expect(() => verifyAccountDeletionCode(a.id, a.authVersion, challenge.challengeToken + "x", code)).toThrow();
    await expect(
      deleteAccount(a.id, { confirmationToken: preview.confirmationToken, challengeToken: challenge.challengeToken, emailCode: code })
    ).resolves.toMatchObject({ deleted: true });
    await processAccountErasures();
  });
  it("deletes all owned workspaces and local media, removes other memberships and preserves other owners’ data", async () => {
    const a = await owner(),
      b = await owner();
    const a1 = await workspace(a.id),
      a2 = await workspace(a.id),
      b1 = await workspace(b.id);
    await prisma.workspaceMember.create({ data: { workspaceId: b1.id, userId: a.id, role: "EDITOR" } });
    await prisma.workspaceMember.create({ data: { workspaceId: a1.id, userId: b.id, role: "VIEWER" } });
    const object = await storeWorkspaceMedia({
      workspaceId: a1.id,
      filename: "delete-me.jpg",
      contentType: "image/jpeg",
      bytes: Buffer.from("account erasure test")
    });
    await prisma.mediaAsset.create({
      data: {
        workspaceId: a1.id,
        s3Key: object.key,
        cdnUrl: object.publicUrl,
        filename: "delete-me.jpg",
        mimeType: "image/jpeg",
        sizeBytes: object.sizeBytes,
        type: "IMAGE"
      }
    });
    const preview = await accountDeletionPreview(a.id);
    expect(preview.ownedWorkspaces.map((w) => w.id).sort()).toEqual([a1.id, a2.id].sort());
    expect(preview.otherWorkspaces).toEqual([{ id: b1.id, name: b1.name }]);
    await deleteAccount(a.id, { confirmationToken: preview.confirmationToken, password });
    expect(await prisma.workspaceMember.count({ where: { userId: a.id, deletedAt: null } })).toBe(0);
    expect(await prisma.workspaceMember.count({ where: { workspaceId: a1.id, deletedAt: null } })).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).passwordHash).toBeNull();
    expect((await prisma.workspace.findUniqueOrThrow({ where: { id: b1.id } })).deletedAt).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: b.id } })).deletedAt).toBeNull();
    expect((await processAccountErasures()).failed).toBe(0);
    expect(await prisma.mediaAsset.count({ where: { workspaceId: a1.id } })).toBe(0);
    await expect(readStoredMedia(a1.id, object.key)).rejects.toThrow();
    expect(await prisma.workspaceErasureJob.count({ where: { workspaceId: { in: [a1.id, a2.id] }, status: "COMPLETE" } })).toBe(2);
    expect((await processAccountErasures()).completed).toBe(0);
  });
  it("requires current credentials and rejects a stale workspace list without erasing anything", async () => {
    const a = await owner(),
      a1 = await workspace(a.id);
    const preview = await accountDeletionPreview(a.id);
    await expect(deleteAccount(a.id, { password: "wrong", confirmationToken: preview.confirmationToken })).rejects.toMatchObject({
      code: "ACCOUNT_DELETE_AUTH_FAILED"
    });
    await workspace(a.id);
    await expect(deleteAccount(a.id, { password, confirmationToken: preview.confirmationToken })).rejects.toMatchObject({ code: "ACCOUNT_DELETE_CHANGED" });
    expect((await prisma.workspace.findUniqueOrThrow({ where: { id: a1.id } })).deletedAt).toBeNull();
    const secret = generateTotpSecret();
    await prisma.user.update({ where: { id: a.id }, data: { mfaEnabled: true, mfaSecret: secret } });
    const latest = await accountDeletionPreview(a.id);
    await expect(deleteAccount(a.id, { password, confirmationToken: latest.confirmationToken })).rejects.toMatchObject({ code: "MFA_INVALID" });
    await expect(deleteAccount(a.id, { password, confirmationToken: latest.confirmationToken, totpCode: generateTotpCode(secret) })).resolves.toEqual({
      deleted: true,
      cleanup: "QUEUED"
    });
    await processAccountErasures();
  });
});
