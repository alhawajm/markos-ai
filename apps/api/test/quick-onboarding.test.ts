import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";
import { validateInstagramDatabaseTarget } from "./helpers/instagram-database";
import { generateBusinessProfile as requestBusinessProfile } from "../src/ai/business-profile-client";
vi.mock("../src/ai/business-profile-client", () => ({ generateBusinessProfile: vi.fn() }));
const profile = {
  businessName: "Pearl Bakery",
  ...Object.fromEntries(
    ["tagline", "overview", "uniqueValue", "offerSummary", "idealCustomer", "marketPosition", "brandVoice", "marketingFocus"].map((k) => [
      k,
      { en: "A neighborhood bakery in Bahrain.", ar: "مخبز محلي في البحرين." }
    ])
  )
};
let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  if (!validateInstagramDatabaseTarget(process.env)) throw new Error("Disposable local test DB required");
  app = await buildApp();
});
afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});
beforeEach(() =>
  vi
    .mocked(requestBusinessProfile)
    .mockResolvedValue({ model: "test", prompt_version: "test", tokens_in: 10, tokens_out: 20, profile } as Awaited<ReturnType<typeof requestBusinessProfile>>)
);
async function fixture() {
  const r = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email: `quick-${randomUUID()}@markos.test`,
      password: "CorrectHorseBattery99!",
      fullName: "Quick Setup",
      workspaceName: `Quick ${randomUUID()}`,
      locale: "en"
    }
  });
  expect(r.statusCode).toBe(201);
  const session = r.json().data;
  await prisma.user.update({ where: { id: session.user.id }, data: { isVerified: true } });
  return { session, headers: { authorization: `Bearer ${session.tokens.accessToken}` } };
}
const details = { name: "Pearl Bakery", offer: "Fresh bread and pastries" };
it("previews with two required answers, saves no business facts until one confirmation, enters without Instagram", async () => {
  const f = await fixture();
  const preview = await app.inject({ method: "POST", url: "/v1/onboarding/quick/preview", headers: f.headers, payload: { details } });
  expect(preview.statusCode).toBe(200);
  const draft = preview.json().data;
  expect(draft.businessProfile.status).toBe("DRAFT");
  expect(await prisma.knowledgeVault.count({ where: { workspaceId: f.session.workspace.id, deletedAt: null } })).toBe(0);
  expect(vi.mocked(requestBusinessProfile).mock.lastCall![0]).toMatchObject({ concise: true });
  const confirm = () =>
    app.inject({ method: "POST", url: "/v1/onboarding/quick/confirm", headers: f.headers, payload: { interactionId: draft.businessProfile.interactionId } });
  const saved = await confirm();
  expect(saved.statusCode).toBe(200);
  expect(saved.json().data.status).toBe("COMPLETE");
  expect(saved.json().data.businessProfile.status).toBe("APPROVED");
  const catalog = await prisma.offeringCatalog.findFirst({ where: { workspaceId: f.session.workspace.id } });
  expect(catalog?.summary).toBe(details.offer);
  const again = await confirm();
  expect(again.statusCode).toBe(200);
  expect(again.json().data.businessProfile.interactionId).toBe(draft.businessProfile.interactionId);
});
it("rejects foreign summaries and spoofed workspace fields without creating knowledge", async () => {
  const f = await fixture(),
    other = await fixture();
  const preview = await app.inject({ method: "POST", url: "/v1/onboarding/quick/preview", headers: f.headers, payload: { details } });
  const id = preview.json().data.businessProfile.interactionId;
  expect((await app.inject({ method: "POST", url: "/v1/onboarding/quick/confirm", headers: other.headers, payload: { interactionId: id } })).statusCode).toBe(
    409
  );
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/v1/onboarding/quick/preview",
        headers: other.headers,
        payload: { workspaceId: f.session.workspace.id, details }
      })
    ).statusCode
  ).toBe(400);
  expect(await prisma.knowledgeVault.count({ where: { workspaceId: other.session.workspace.id } })).toBe(0);
});
it("keeps an outdated summary from overwriting newer business facts", async () => {
  const f = await fixture();
  const preview = await app.inject({ method: "POST", url: "/v1/onboarding/quick/preview", headers: f.headers, payload: { details } });
  const id = preview.json().data.businessProfile.interactionId;
  expect((await app.inject({ method: "PUT", url: "/v1/onboarding/company", headers: f.headers, payload: { name: "Owner’s newer name" } })).statusCode).toBe(
    200
  );
  expect((await app.inject({ method: "POST", url: "/v1/onboarding/quick/confirm", headers: f.headers, payload: { interactionId: id } })).statusCode).toBe(409);
});
