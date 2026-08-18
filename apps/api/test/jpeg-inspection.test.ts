import { describe, expect, it } from "vitest";
import { inspectJpegDimensions } from "../src/media/jpeg-inspection";
import { instagramJpegFixture } from "./helpers/jpeg";

describe("inspectJpegDimensions", () => {
  it("reads dimensions from a structurally valid JPEG", () => {
    expect(inspectJpegDimensions(instagramJpegFixture(924, 875))).toEqual({ height: 875, width: 924 });
  });

  it("rejects renamed, truncated, and unterminated data", () => {
    expect(inspectJpegDimensions(Buffer.from("not a jpeg"))).toBeUndefined();
    expect(inspectJpegDimensions(instagramJpegFixture().subarray(0, 24))).toBeUndefined();

    const missingEndMarker = instagramJpegFixture();
    missingEndMarker[missingEndMarker.byteLength - 1] = 0;
    expect(inspectJpegDimensions(missingEndMarker)).toBeUndefined();
  });
});
