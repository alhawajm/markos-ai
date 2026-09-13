import { describe, expect, it, vi } from "vitest";
import type { AuthSession, OnboardingState } from "@markos/shared-types";
import { appEntryRedirect } from "../app/[locale]/_components/app-entry";

const session = { user: { isVerified: true, email: "owner@example.com" } } as AuthSession;
const state = (status: string, profile: string) => ({ status, businessProfile: { status: profile } }) as OnboardingState;

describe("application entry", () => {
  it("sends unverified accounts to verification before reading workspace knowledge", async () => {
    const client = { onboarding: vi.fn() };
    expect(await appEntryRedirect({ ...session, user: { ...session.user, isVerified: false } }, client, "ar")).toBe("/ar/verify?email=owner%40example.com");
    expect(client.onboarding).not.toHaveBeenCalled();
  });
  it.each([
    ["NOT_STARTED", "NONE"],
    ["IN_PROGRESS", "DRAFT"],
    ["COMPLETE", "DRAFT"],
    ["IN_PROGRESS", "APPROVED"]
  ])("blocks %s onboarding with %s profile", async (status, profile) => {
    expect(await appEntryRedirect(session, { onboarding: async () => state(status, profile) }, "en")).toBe("/en/onboarding");
  });
  it("allows completed and approved workspaces", async () => {
    expect(await appEntryRedirect(session, { onboarding: async () => state("COMPLETE", "APPROVED") }, "en")).toBeNull();
  });
  it("fails closed for failed or malformed checks", async () => {
    await expect(
      appEntryRedirect(
        session,
        {
          onboarding: async () => {
            throw new Error("offline");
          }
        },
        "en"
      )
    ).rejects.toThrow("offline");
    await expect(appEntryRedirect(session, { onboarding: async () => [] as unknown as OnboardingState }, "en")).rejects.toThrow(
      "Could not check onboarding status"
    );
  });
});
