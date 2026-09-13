import { describe, expect, it } from "vitest";
import { parseOfferingMoney, profileChanges, profileTab, profileTabs } from "../app/[locale]/_components/business-profile-fields";
import {
  createEmptyOnboardingDraft,
  onboardingClearedFields,
  onboardingDraftWithCatalog,
  payloadForOnboardingStep
} from "../app/[locale]/_components/onboarding-draft";
import type { OfferingCatalogRecord } from "@markos/shared-types";

describe("business profile editing contracts", () => {
  it("only clears optional fields shown in the shortened onboarding editor", () => {
    const draft = { ...createEmptyOnboardingDraft(), businessName: "Owner name", market: "Manama" };
    expect(onboardingClearedFields(1, draft)).toEqual(["industry"]);
    expect(onboardingClearedFields(6, draft)).toEqual(["voiceNotes"]);
    expect(
      profileChanges([{ key: "items", label: ["Competitors", "المنافسون"], kind: "competitors" }], {
        items: [{ name: "Local cafe", website: "", notes: "Owner notes" }]
      })
    ).toEqual({ items: [{ name: "Local cafe", notes: "Owner notes" }] });
  });
  it("opens Marketing Strategy by default and keeps stable URL section names", () => {
    expect(profileTab(null)).toBe("marketing-strategy");
    expect(profileTab("unknown")).toBe("marketing-strategy");
    expect(profileTab("business")).toBe("business");
    expect(profileTabs.map((tab) => tab.id)).toEqual(["marketing-strategy", "products-services", "audience-market", "brand-voice", "business"]);
  });
  it("preserves owner wording and expresses deliberate clearing without touching unrelated fields", () => {
    expect(
      profileChanges(
        [
          { key: "description", label: ["Description", "الوصف"] },
          { key: "values", label: ["Values", "القيم"], kind: "list" },
          { key: "website", label: ["Website", "الموقع"] }
        ],
        { description: "  Exact wording\nنص عربي  ", values: "Craft\n\n  Local service  ", website: "", name: "Unrelated" }
      )
    ).toEqual({ description: "  Exact wording\nنص عربي  ", values: ["Craft", "  Local service  "], website: null });
  });
  it("stores prices in currency minor units and rejects rounding or unsafe integers", () => {
    expect(parseOfferingMoney("3.125", "BHD")).toBe(3125);
    expect(parseOfferingMoney("3.12", "USD")).toBe(312);
    expect(parseOfferingMoney("300", "JPY")).toBe(300);
    expect(parseOfferingMoney("", "BHD")).toBeUndefined();
    for (const value of ["1.2345", "-1", "1e3", "9007199254740993"]) expect(() => parseOfferingMoney(value, "BHD")).toThrow();
    expect(() => parseOfferingMoney("1.5", "JPY")).toThrow();
  });
  it("round-trips stable offering identity, revision, currency, lifecycle and advanced prices through onboarding", () => {
    const catalog = {
      version: 7,
      offerings: [
        {
          id: "offering-id",
          version: 3,
          kind: "SERVICE",
          name: "جلسة",
          nameEn: "Session",
          nameAr: "جلسة",
          currency: "USD",
          status: "PAUSED",
          priceType: "RANGE",
          minPriceMinor: 10000,
          maxPriceMinor: 20000,
          description: "Owner description"
        }
      ]
    } as OfferingCatalogRecord;
    const draft = onboardingDraftWithCatalog(createEmptyOnboardingDraft(), catalog);
    expect(payloadForOnboardingStep(2, draft).body).toMatchObject({
      expectedVersion: 7,
      items: [
        {
          id: "offering-id",
          version: 3,
          name: "جلسة",
          nameEn: "Session",
          nameAr: "جلسة",
          currency: "USD",
          status: "PAUSED",
          priceType: "RANGE",
          minPriceMinor: 10000,
          maxPriceMinor: 20000
        }
      ]
    });
  });
});
