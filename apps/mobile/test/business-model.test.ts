import { describe, expect, it, vi } from "vitest";
import type { BusinessKnowledgeRecord, OnboardingDocumentAnalysisRecord, OnboardingDocumentProfileDraft } from "@markos/shared-types";
import {
  changesBetween,
  documentApproval,
  fromDocuments,
  fromKnowledge,
  knowledgeVersion,
  listedPrice,
  onboardingPayload,
  schemas
} from "../src/business/model";
import { recoverDocumentAnalysis } from "../src/business/recovery";
const knowledge = {
  version: 9,
  approved: false,
  updatedAt: null,
  modules: { company: { name: "Blooms", email: "owner@example.test" }, story: {}, audience: {}, competitors: {}, brand: {}, objectives: {} },
  catalog: { version: 4, offerings: [], summary: "Flowers", differentiators: [], salesChannels: [] }
} as unknown as BusinessKnowledgeRecord;

describe("native business profile contracts", () => {
  it("submits manual setup fields using the API clearing contract, without clearing hidden facts", () => {
    const body = onboardingPayload("company", { ...knowledge.modules.company, location: "Manama", industry: "" });
    expect(body).toMatchObject({ name: "Blooms", email: "owner@example.test", location: "Manama" });
    for (const key of body.clearFields as string[]) {
      expect(body).not.toHaveProperty(key);
      expect((schemas.company.shape as Record<string, { isOptional: () => boolean }>)[key]!.isOptional()).toBe(true);
    }
    expect(body.clearFields).not.toContain("email");
    const products = onboardingPayload("products", { items: [{ name: "Bouquet", priceMinor: 1250, currency: "BHD", description: "" }], summary: "" });
    expect(products.clearFields).toEqual([]);
    expect(products.items).toEqual([{ name: "Bouquet", priceMinor: 1250, currency: "BHD" }]);
  });
  it("keeps profile and catalog versions distinct for every save", () => {
    expect(knowledgeVersion(knowledge, "products")).toBe(4);
    expect(knowledgeVersion(knowledge, "company")).toBe(9);
    expect(fromKnowledge(knowledge).products.expectedVersion).toBe(4);
    expect(knowledgeVersion({ ...knowledge, catalog: null }, "products")).toBe(0);
  });
  it("approves only the reviewed document draft, preserves Arabic and explicit colors, and normalizes empty list rows", () => {
    const extracted = {
      company: { name: "Blooms", languages: ["en", "ar"], socials: [] },
      offerings: { items: [{ name: "ورد", kind: "PRODUCT", currency: "BHD", priceMinor: 1250 }], differentiators: [], salesChannels: [] },
      story: {},
      audience: {},
      competitors: {},
      brand: { colors: ["#FFAAC0"], toneWords: ["Warm"] },
      objectives: {}
    } as unknown as OnboardingDocumentProfileDraft;
    const draft = fromDocuments(extracted);
    draft.company = { ...draft.company, name: "أزهار وردية" };
    draft.brand = { colors: [], toneWords: [" Warm ", "", "واضح"] };
    const approved = documentApproval(draft);
    expect(approved.company.name).toBe("أزهار وردية");
    expect(approved.brand).toMatchObject({ colors: [], toneWords: ["Warm", "واضح"] });
    expect(approved.offerings.items?.[0]?.priceMinor).toBe(1250);
    expect(approved.story).toBeUndefined();
    expect(extracted.company.name).toBe("Blooms");
    expect(extracted.brand.colors).toEqual(["#FFAAC0"]);
  });
  it("rejects missing essentials and duplicate offerings before document approval", () => {
    const draft = fromKnowledge(knowledge);
    draft.company = { name: "" };
    expect(() => documentApproval(draft)).toThrow();
    draft.company = { name: "Blooms" };
    draft.products = { items: [{ name: "Flowers" }, { name: " flowers " }] };
    expect(() => documentApproval(draft)).toThrow();
  });
  it("saves focused edits without replacing untouched fields, including intentional clears", () => {
    const base = { name: "Blooms", website: "https://example.test", email: "owner@example.test", languages: ["ar", "en"] };
    expect(changesBetween(base, { ...base, website: "", name: "Blooms in Pink" })).toEqual({ name: "Blooms in Pink", website: null });
    expect(listedPrice({ priceMinor: 1250, currency: "BHD" })).toContain("1.250");
    expect(() => listedPrice({ priceMinor: 1250, currency: "invalid" })).not.toThrow();
  });
});
describe("document response recovery", () => {
  const active = { id: "analysis-one", status: "PROCESSING" } as OnboardingDocumentAnalysisRecord;
  it("recovers an accepted upload without replaying the paid analysis", async () => {
    const request = vi.fn().mockRejectedValue(new TypeError("Connection lost"));
    const read = vi.fn().mockResolvedValue(active);
    expect(await recoverDocumentAnalysis(request, read)).toBe(active);
    expect(request).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("never treats a different analysis or an expired one as a successful retry", async () => {
    const failure = new TypeError("Connection lost");
    await expect(
      recoverDocumentAnalysis(
        async () => {
          throw failure;
        },
        async () => active,
        "different"
      )
    ).rejects.toBe(failure);
    await expect(
      recoverDocumentAnalysis(
        async () => {
          throw failure;
        },
        async () => null
      )
    ).rejects.toBe(failure);
  });
});
