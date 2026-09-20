import { describe, expect, it } from "vitest";
import { bahrainInputValue, plannedAtInputToIso } from "../app/[locale]/_components/content-studio-draft-state";
describe("Create planned time", () => {
  it("round trips Bahrain time without depending on browser timezone", () => {
    expect(plannedAtInputToIso("2026-08-28T18:30")).toBe("2026-08-28T15:30:00.000Z");
    expect(bahrainInputValue("2026-08-28T15:30:00.000Z")).toBe("2026-08-28T18:30");
  });
  it("rejects malformed dates and keeps an absent date unset", () => {
    expect(plannedAtInputToIso("")).toBeNull();
    expect(() => plannedAtInputToIso("2026-02-31T18:30")).toThrow();
    expect(() => plannedAtInputToIso("tomorrow")).toThrow();
  });
});
