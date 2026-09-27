import { describe, expect, it, vi } from "vitest";
vi.mock("../src/ui", () => ({}));
vi.mock("../src/providers", () => ({}));
import { moneyText, offeringInput, offeringValues, parseMoney } from "../src/business/offering";
const t = (en: string) => en;
describe("mobile offering prices", () => {
  it("parses BHD fils, Arabic numerals and currency-specific precision without rounding", () => {
    expect(parseMoney("3.125", "BHD")).toBe(3125);
    expect(parseMoney("٣٫١٢٥", "BHD")).toBe(3125);
    expect(parseMoney("300", "JPY")).toBe(300);
    expect(parseMoney(moneyText(Number.MAX_SAFE_INTEGER, "BHD"), "BHD")).toBe(Number.MAX_SAFE_INTEGER);
    for (const value of ["-1", "1e3", "1.2345", "9007199254740993"]) expect(() => parseMoney(value, "BHD")).toThrow();
    expect(() => parseMoney("1.5", "JPY")).toThrow();
  });
  it("drops stale price fields on type changes and retains bilingual names and restored amounts", () => {
    const saved = { name: "Event", nameAr: "فعالية", kind: "SERVICE", currency: "BHD", priceType: "FIXED", priceMinor: 3125, status: "ACTIVE" };
    expect(offeringValues(saved)._price).toBe("3.125");
    expect(offeringInput(saved, t).priceMinor).toBe(3125);
    expect(offeringInput({ ...saved, priceType: "QUOTE", status: "ARCHIVED" }, t)).toEqual({
      name: "Event",
      nameAr: "فعالية",
      kind: "SERVICE",
      currency: "BHD",
      priceType: "QUOTE",
      status: "ARCHIVED"
    });
    expect(() => offeringInput({ ...saved, priceType: "RANGE", _minimum: "9", _maximum: "2" }, t)).toThrow();
  });
});
