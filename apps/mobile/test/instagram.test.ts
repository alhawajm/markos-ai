import { describe, expect, it } from "vitest";
import type { ContentRecord, PublishReadiness, PublishingLiveReadiness } from "@markos/shared-types";
import { authenticatorCode, authorizationUrl, canManageInstagram, canScheduleContent, scheduleBlockers } from "../src/instagram/model";
const api = "https://api.markos.test";
function start(url = "https://www.instagram.com/oauth/authorize") {
  const parsed = new URL(url);
  parsed.searchParams.set("state", "signed-state");
  parsed.searchParams.set("redirect_uri", `${api}/v1/workspace/instagram/oauth/callback`);
  return { authorizationUrl: parsed.toString(), stateExpiresAt: new Date(Date.now() + 600000).toISOString() };
}
describe("native Instagram consent", () => {
  it("opens only the provider HTTPS consent with the configured API callback", () =>
    expect(authorizationUrl(start(), api)).toContain("https://www.instagram.com/oauth/authorize"));
  it.each([
    "https://evil.test/oauth/authorize",
    "http://www.instagram.com/oauth/authorize",
    "https://user:pass@www.instagram.com/oauth/authorize",
    "https://www.instagram.com/direct",
    "https://www.instagram.com/oauth/authorize#token"
  ])("rejects unsafe authorization %s", (url) => expect(() => authorizationUrl(start(url), api)).toThrow());
  it("rejects expired grants and changed callbacks", () => {
    expect(() => authorizationUrl({ ...start(), stateExpiresAt: "2020-01-01" }, api)).toThrow();
    expect(() => authorizationUrl(start(), "https://other.test")).toThrow();
    const grant = start();
    const url = new URL(grant.authorizationUrl);
    url.searchParams.set("redirect_uri", `${api}/v1/workspace/instagram/oauth/callback?returnTo=https://evil.test`);
    expect(() => authorizationUrl({ ...grant, authorizationUrl: url.toString() }, api)).toThrow();
  });
  it("accepts Arabic and Persian code entry and follows workspace roles", () => {
    expect(authenticatorCode("١٢٣۴۵۶")).toBe("123456");
    expect(canManageInstagram(["EDITOR"])).toBe(false);
    expect(canManageInstagram(["OWNER"])).toBe(true);
    expect(canScheduleContent(["EDITOR"])).toBe(true);
    expect(canScheduleContent(["VIEWER"])).toBe(false);
  });
});
describe("scheduling preflight", () => {
  const connection = { connected: true };
  const contentItem = { status: "APPROVED", revision: 3 } as ContentRecord;
  const content: PublishReadiness = { ready: false, reasons: ["CONTENT_NOT_SCHEDULED", "SCHEDULE_TIME_NOT_IN_FUTURE"], connection, contentItem };
  const live = { ready: true, reasons: [], connection, mode: "live" } as unknown as PublishingLiveReadiness;
  it("uses the proposed schedule while preserving all media/account checks", () => {
    expect(scheduleBlockers(content, live, 3)).toEqual([]);
    expect(scheduleBlockers({ ...content, reasons: [...content.reasons, "PUBLIC_MEDIA_REQUIRED"] }, live, 3)).toEqual(["PUBLIC_MEDIA_REQUIRED"]);
  });
  it("blocks drafts, changed revisions, disconnected accounts and non-live publishing", () => {
    expect(scheduleBlockers({ ...content, contentItem: { ...contentItem, status: "DRAFT" } }, live, 3)).toContain("CONTENT_NOT_READY");
    expect(scheduleBlockers(content, live, 2)).toContain("CONTENT_REVISION_CONFLICT");
    expect(scheduleBlockers(content, { ...live, connection: { connected: false } }, 3)).toContain("INSTAGRAM_NOT_CONNECTED");
    expect(scheduleBlockers(content, { ...live, mode: "dry_run" }, 3)).toContain("INSTAGRAM_PUBLISH_MODE_NOT_LIVE");
  });
  it("fails closed for unexplained server blockers", () => {
    expect(scheduleBlockers(content, { ...live, ready: false }, 3)).toContain("PUBLISHING_UNAVAILABLE");
    expect(scheduleBlockers({ ...content, reasons: [] }, live, 3)).toContain("PUBLISHING_UNAVAILABLE");
  });
});
