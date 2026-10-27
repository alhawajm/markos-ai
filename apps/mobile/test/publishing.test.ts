import { describe, expect, it } from "vitest";
import type { ContentRecord, NotificationRecord, PublishJobRecord } from "@markos/shared-types";
import { calendarReadQuerySchema } from "@markos/validation";
import {
  groupCalendar,
  notificationPresentation,
  percentageChange,
  publicationState,
  publishingMessage,
  uncertainPublish,
  weekRange
} from "../src/publishing/model";
const t = (en: string) => en;
describe("phone publishing workflow", () => {
  it.each(["2026-09-24T20:59:00Z", "2026-09-26T22:00:00Z", "2026-12-31T23:00:00Z"])(
    "sends exactly seven Bahrain calendar dates across boundaries (%s)",
    (instant) => {
      const range = weekRange(0, new Date(instant));
      expect(range.days).toHaveLength(7);
      expect(new Date(range.from + "T00:00:00Z").getUTCDay()).toBe(0);
      expect(Date.parse(range.to) - Date.parse(range.from)).toBe(6 * 86400000);
      expect(calendarReadQuerySchema.safeParse({ from: range.from, to: range.to }).success).toBe(true);
    }
  );
  it("retains planned drafts and uses lifecycle timestamps instead of creation time", () => {
    const records = [
      { id: "planned", status: "DRAFT", plannedAt: "2026-09-24T23:00:00+03:00" },
      { id: "published", status: "PUBLISHED", plannedAt: "2026-09-23T00:00:00Z", publishedAt: "2026-09-25T01:00:00+03:00" },
      { id: "unscheduled", status: "APPROVED" }
    ] as ContentRecord[];
    expect(groupCalendar(records).map((group) => ({ day: group.day, ids: group.items.map((item) => item.id) }))).toEqual([
      { day: "2026-09-24", ids: ["planned"] },
      { day: "2026-09-25", ids: ["published"] }
    ]);
  });
  it("does not show an old failed or processing attempt as the new schedule", () => {
    const content = { status: "SCHEDULED", scheduledAt: "2026-09-25T12:00:00Z" } as ContentRecord;
    const old = { status: "PROCESSING", scheduledFor: "2026-09-24T12:00:00Z" } as PublishJobRecord;
    expect(publicationState(content, old)).toBe("SCHEDULED");
    expect(publicationState(content, { ...old, scheduledFor: content.scheduledAt! })).toBe("PROCESSING");
    expect(publicationState({ ...content, status: "PUBLISHED" }, old)).toBe("PUBLISHED");
  });
  it.each(["INSTAGRAM_PUBLISH_RESULT_UNKNOWN", "INSTAGRAM_PUBLISH_LEASE_LOST", "PUBLISH_WORKER_UNEXPECTED_ERROR"])(
    "requires account checking for an uncertain result %s",
    (code) => {
      expect(uncertainPublish(code)).toBe(true);
      expect(publishingMessage(code, t)).toContain("duplicate");
    }
  );
  it("does not follow untrusted notification URLs or arbitrary templates", () => {
    const item: NotificationRecord = {
      id: "fixture",
      userId: "owner",
      channel: "IN_APP",
      createdAt: "2026-09-24T00:00:00Z",
      updatedAt: "2026-09-24T00:00:00Z",
      templateKey: "publishing_failed",
      payload: { contentItemId: "https://evil.test", errorCode: "secret-provider-response" }
    };
    expect(notificationPresentation(item, t).contentId).toBeUndefined();
    expect(notificationPresentation(item, t).message).not.toContain("secret-provider-response");
    expect(notificationPresentation({ ...item, payload: { contentItemId: "11111111-1111-4111-8111-111111111111" } }, t).contentId).toBeDefined();
    expect(notificationPresentation({ ...item, templateKey: "other" }, t).contentId).toBeUndefined();
  });
  it("localizes publication notices and preserves unavailable versus zero performance", () => {
    expect(notificationPresentation({ templateKey: "publishing_succeeded", payload: {} } as NotificationRecord, (_en, ar) => ar).title).toContain("إنستغرام");
    expect(percentageChange(null, "en")).toBe("—");
    expect(percentageChange(0, "en")).toBe("0%");
    expect(percentageChange(12.25, "en")).toBe("+12.3%");
  });
});
