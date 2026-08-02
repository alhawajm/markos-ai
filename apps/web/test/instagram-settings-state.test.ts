import { describe, expect, it } from "vitest";
import {
  containsCredentialFields,
  instagramStatusLabel,
  sanitizedCallbackUrl,
} from "../app/[locale]/_components/instagram-settings-state";

describe("active Instagram settings state", () => {
  it("cleans callback material without changing unrelated query values", () => {
    expect(
      sanitizedCallbackUrl(
        "https://markos.test/en/app/settings?instagram=connected&tab=accounts&code=x&state=y#error",
      ),
    ).toBe("/en/app/settings?tab=accounts#error");
  });
  it("maps the visible lifecycle states", () => {
    expect(
      instagramStatusLabel({ connected: false, status: "DISCONNECTED" }),
    ).toBe("disconnected");
    expect(instagramStatusLabel({ connected: true, status: "CONNECTED" })).toBe(
      "connected",
    );
    expect(
      instagramStatusLabel({ connected: false, status: "CONNECTING" }),
    ).toBe("connecting");
    expect(
      instagramStatusLabel({
        connected: false,
        status: "REAUTHORIZE_REQUIRED",
      }),
    ).toBe("reauthorize");
    expect(
      instagramStatusLabel({ connected: false, status: "REFRESH_FAILED" }),
    ).toBe("failed");
  });
  it("detects credential-shaped frontend payloads", () => {
    expect(
      containsCredentialFields({ username: "business", recentMedia: [] }),
    ).toBe(false);
    expect(
      containsCredentialFields({ accessToken: "must-not-reach-browser" }),
    ).toBe(true);
  });
});
