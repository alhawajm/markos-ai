import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { AuthSession, Role } from "@markos/shared-types";
import { contentReportSchema } from "@markos/validation";
import { prisma } from "../src/db/prisma";
import { withWorkspaceDbContext } from "../src/db/workspace-transaction";
import { buildApp } from "../src/http/app";
import { exportWorkspaceData, eraseWorkspaceData } from "../src/workspace/pdpl-service";
import { accountDeletionPreview, deleteAccount } from "../src/workspace/account-deletion";
import { validateInstagramDatabaseTarget } from "./helpers/instagram-database";

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  if (!validateInstagramDatabaseTarget(process.env)) throw new Error("Content report tests require a named disposable loopback database.");
  app = await buildApp();
});
afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});
async function fixture() {
  const result = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email: `report-${randomUUID()}@markos.test`,
      password: "CorrectHorseBattery99!",
      fullName: "Report test",
      workspaceName: `Report ${randomUUID()}`,
      locale: "en"
    }
  });
  expect(result.statusCode).toBe(201);
  const session = result.json().data as AuthSession;
  await prisma.user.update({ where: { id: session.user.id }, data: { isVerified: true } });
  const headers = { authorization: `Bearer ${session.tokens.accessToken}` };
  const created = await app.inject({
    method: "POST",
    url: "/v1/content",
    headers,
    payload: { caption: "Generated caption — محتوى للاختبار", brief: "A test" }
  });
  expect(created.statusCode).toBe(200);
  const item = created.json().data;
  const input = { requestId: randomUUID(), source: "CONTENT" as const, sourceId: item.id as string, reason: "OFFENSIVE" as const, note: "Please investigate" };
  return {
    session,
    headers,
    item,
    input,
    send: (payload: object = input) => app.inject({ method: "POST", url: "/v1/content-reports", headers, payload }),
    role: (role: Role) => prisma.workspaceMember.updateMany({ where: { workspaceId: session.workspace.id, userId: session.user.id }, data: { role } })
  };
}
it("stores bounded server-owned evidence without editing content, including Ready posts", async () => {
  const f = await fixture();
  await prisma.contentItem.update({ where: { id: f.item.id }, data: { status: "APPROVED", caption: "x".repeat(4500) } });
  const before = await prisma.contentItem.findUniqueOrThrow({ where: { id: f.item.id } });
  const response = await f.send();
  expect(response.statusCode).toBe(201);
  const saved = await prisma.contentReport.findUniqueOrThrow({ where: { id: response.json().data.id } });
  expect(saved).toMatchObject({ workspaceId: f.session.workspace.id, reportedById: f.session.user.id, status: "OPEN", reason: "OFFENSIVE" });
  expect(saved.excerpt).toBe("x".repeat(4000));
  expect(await prisma.contentItem.findUniqueOrThrow({ where: { id: f.item.id } })).toEqual(before);
  expect(response.json().data).not.toHaveProperty("excerpt");
});
it("replays identical simultaneous submissions and rejects changed request reuse", async () => {
  const f = await fixture();
  const [a, b] = await Promise.all([f.send(), f.send()]);
  expect([a.statusCode, b.statusCode]).toEqual([201, 201]);
  expect(a.json().data.id).toBe(b.json().data.id);
  expect(await prisma.contentReport.count({ where: { requestId: f.input.requestId } })).toBe(1);
  expect((await f.send({ ...f.input, reason: "OTHER" })).statusCode).toBe(409);
});
it("rejects foreign, deleted and nonexistent content without leaking it", async () => {
  const a = await fixture(),
    b = await fixture();
  expect((await a.send({ ...a.input, sourceId: b.item.id })).statusCode).toBe(404);
  expect((await a.send({ ...a.input, sourceId: randomUUID() })).statusCode).toBe(404);
  await prisma.contentItem.update({ where: { id: a.item.id }, data: { deletedAt: new Date() } });
  expect((await a.send()).statusCode).toBe(404);
});
it("accepts only assistant messages belonging to the active workspace", async () => {
  const a = await fixture(),
    b = await fixture();
  const conversation = await prisma.contentConversation.create({ data: { workspaceId: a.session.workspace.id, contentItemId: a.item.id } });
  const run = await prisma.conversationRun.create({
    data: {
      workspaceId: a.session.workspace.id,
      conversationId: conversation.id,
      userId: a.session.user.id,
      requestId: randomUUID(),
      instruction: "Test",
      baseRevision: 1,
      status: "SUCCEEDED"
    }
  });
  const message = await prisma.conversationMessage.create({
    data: { workspaceId: a.session.workspace.id, conversationId: conversation.id, runId: run.id, role: "assistant", text: "Assistant output" }
  });
  const input = { ...a.input, source: "ASSISTANT_MESSAGE", sourceId: message.id };
  expect((await b.send(input)).statusCode).toBe(404);
  const sent = await a.send(input);
  expect(sent.statusCode).toBe(201);
  expect((await prisma.contentReport.findUniqueOrThrow({ where: { id: sent.json().data.id } })).excerpt).toBe("Assistant output");
  const userMessage = await prisma.conversationMessage.create({
    data: { workspaceId: a.session.workspace.id, conversationId: conversation.id, runId: run.id, role: "user", text: "Private input" }
  });
  expect((await a.send({ ...input, requestId: randomUUID(), sourceId: userMessage.id })).statusCode).toBe(404);
});
it("supports campaign and general AI reports without copying reference files", async () => {
  const f = await fixture();
  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: f.session.workspace.id,
      title: "Campaign plan",
      objective: "Event",
      startsAt: new Date("2026-11-01T00:00:00Z"),
      endsAt: new Date("2026-11-04T00:00:00Z"),
      durationDays: 3,
      content: { strategy: "Plan text", referenceSummary: "private document extract" }
    }
  });
  const sent = await f.send({ ...f.input, source: "CAMPAIGN", sourceId: campaign.id });
  expect(sent.statusCode).toBe(201);
  expect((await prisma.contentReport.findUniqueOrThrow({ where: { id: sent.json().data.id } })).excerpt).toBe("Campaign plan\n\nEvent\n\nPlan text");
  expect((await f.send({ requestId: randomUUID(), source: "GENERAL_AI", reason: "HARMFUL", note: "The strategy advice was unsafe." })).statusCode).toBe(201);
});
it("enforces authentication, verification, strict inputs and explanation limits", async () => {
  const f = await fixture();
  expect((await app.inject({ method: "POST", url: "/v1/content-reports", payload: f.input })).statusCode).toBe(401);
  expect((await f.send({ ...f.input, excerpt: "forged" })).statusCode).toBe(400);
  expect((await f.send({ ...f.input, note: "x".repeat(1501) })).statusCode).toBe(400);
  expect(contentReportSchema.safeParse({ requestId: randomUUID(), source: "GENERAL_AI", reason: "OTHER", note: "short" }).success).toBe(false);
  await prisma.user.update({ where: { id: f.session.user.id }, data: { isVerified: false } });
  expect((await f.send()).statusCode).toBe(403);
});
it("limits moderator media access to the captured assets in the reported workspace", async () => {
  const a = await fixture(),
    b = await fixture(),
    admin = await fixture();
  const asset = await prisma.mediaAsset.create({
    data: {
      workspaceId: a.session.workspace.id,
      type: "IMAGE",
      filename: "reported.jpg",
      s3Key: "external:reported",
      cdnUrl: "https://example.com/reported.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 100
    }
  });
  const other = await prisma.mediaAsset.create({
    data: {
      workspaceId: b.session.workspace.id,
      type: "IMAGE",
      filename: "private.jpg",
      s3Key: "external:private",
      cdnUrl: "https://example.com/private.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 100
    }
  });
  const id = (await a.send()).json().data.id as string;
  // A legacy/corrupt reference must not widen moderation media access across workspaces.
  await prisma.contentReport.update({ where: { id }, data: { mediaAssetIds: [asset.id, other.id] } });
  const url = `/v1/admin/content-reports/${id}/media`;
  expect((await app.inject({ method: "GET", url, headers: a.headers })).statusCode).toBe(403);
  await admin.role("SUPPORT_ADMIN");
  const response = await app.inject({ method: "GET", url, headers: admin.headers });
  expect(response.statusCode).toBe(200);
  expect(response.json().data).toEqual([{ id: asset.id, filename: "reported.jpg", url: "https://example.com/reported.jpg" }]);
  expect(response.headers["cache-control"]).toBe("private, no-store");
  await prisma.mediaAsset.update({ where: { id: asset.id }, data: { deletedAt: new Date() } });
  expect((await app.inject({ method: "GET", url, headers: admin.headers })).json().data).toEqual([]);
});
it("RLS hides other workspaces and prevents cross-workspace report writes", async () => {
  const a = await fixture(),
    b = await fixture();
  await a.send();
  const other = (await b.send()).json().data.id;
  const rows = await withWorkspaceDbContext(a.session.workspace.id, (tx) => tx.contentReport.findMany());
  expect(rows.length).toBe(1);
  expect(rows.every((r) => r.workspaceId === a.session.workspace.id)).toBe(true);
  expect(
    await withWorkspaceDbContext(a.session.workspace.id, (tx) => tx.contentReport.updateMany({ where: { id: other }, data: { note: "tampered" } }))
  ).toMatchObject({ count: 0 });
  await expect(
    withWorkspaceDbContext(a.session.workspace.id, (tx) =>
      tx.contentReport.create({
        data: {
          workspaceId: b.session.workspace.id,
          reportedById: a.session.user.id,
          requestId: randomUUID(),
          source: "GENERAL_AI",
          reason: "OTHER",
          note: "invalid workspace"
        }
      })
    )
  ).rejects.toThrow();
});
it("restricts private moderation access, records decisions once and filters before limiting", async () => {
  const reporter = await fixture(),
    admin = await fixture();
  const id = (await reporter.send()).json().data.id as string;
  for (const role of ["OWNER", "FINANCE_ADMIN", "READONLY_ADMIN"] as const) {
    await admin.role(role);
    expect((await app.inject({ method: "GET", url: "/v1/admin/content-reports", headers: admin.headers })).statusCode).toBe(403);
  }
  await admin.role("SUPPORT_ADMIN");
  const list = await app.inject({ method: "GET", url: "/v1/admin/content-reports?status=OPEN&limit=100", headers: admin.headers });
  expect(list.statusCode).toBe(200);
  expect(list.json().data.some((r: { id: string }) => r.id === id)).toBe(true);
  const review = {
    method: "POST" as const,
    url: `/v1/admin/content-reports/${id}/review`,
    headers: admin.headers,
    payload: { status: "RESOLVED", note: "Investigated and adjusted the generation prompt." }
  };
  expect((await app.inject(review)).statusCode).toBe(403);
  await admin.role("PRODUCT_ADMIN");
  expect((await app.inject({ ...review, payload: { status: "RESOLVED", note: "" } })).statusCode).toBe(400);
  const results = await Promise.all([app.inject(review), app.inject(review)]);
  expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  expect(await prisma.auditLog.count({ where: { targetId: id, action: "CONTENT_REPORT_REVIEWED", workspaceId: reporter.session.workspace.id } })).toBe(1);
  const closed = await app.inject({ method: "GET", url: "/v1/admin/content-reports?status=RESOLVED&limit=1", headers: admin.headers });
  expect(closed.json().data).toHaveLength(1);
  expect(closed.json().data[0].status).toBe("RESOLVED");
});
it("includes reports in workspace export and erases them without affecting another workspace", async () => {
  const a = await fixture(),
    b = await fixture();
  const id = (await a.send()).json().data.id,
    other = (await b.send()).json().data.id;
  const exported = await exportWorkspaceData(a.session.workspace.id);
  expect(exported.records.contentReports).toEqual(expect.arrayContaining([expect.objectContaining({ id })]));
  await eraseWorkspaceData({ actorId: a.session.user.id, workspaceId: a.session.workspace.id });
  expect(await prisma.contentReport.findUnique({ where: { id } })).toBeNull();
  expect(await prisma.contentReport.findUnique({ where: { id: other } })).not.toBeNull();
});
it("removes a deleting account's submitted reports immediately", async () => {
  const a = await fixture(),
    b = await fixture();
  const id = (await a.send()).json().data.id,
    other = (await b.send()).json().data.id;
  const preview = await accountDeletionPreview(a.session.user.id);
  await deleteAccount(a.session.user.id, { confirmationToken: preview.confirmationToken, password: "CorrectHorseBattery99!" });
  expect(await prisma.contentReport.findUnique({ where: { id } })).toBeNull();
  expect(await prisma.contentReport.findUnique({ where: { id: other } })).not.toBeNull();
  await prisma.workspaceErasureJob.deleteMany({ where: { userId: a.session.user.id } });
});
