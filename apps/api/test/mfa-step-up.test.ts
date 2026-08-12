import { describe, expect, it } from "vitest";
import { isMfaStepUpActive } from "../src/auth/tokens";

describe("MFA step-up window", () => {
  it("accepts only an unexpired absolute deadline", () => {
    expect(isMfaStepUpActive(1_001, 1_000)).toBe(true);
    expect(isMfaStepUpActive(1_000, 1_000)).toBe(false);
    expect(isMfaStepUpActive(999, 1_000)).toBe(false);
    expect(isMfaStepUpActive(null, 1_000)).toBe(false);
  });
});
