import { PassThrough } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { classifyMetaCallbackContentType, META_CALLBACK_STAGE_EVENT, reportMetaCallbackStage } from "../src/meta/meta-callback-telemetry";

describe("Meta callback telemetry", () => {
  it("classifies callback media types without logging raw headers or payloads", async () => {
    expect(classifyMetaCallbackContentType("application/x-www-form-urlencoded; charset=UTF-8")).toBe("form");
    expect(classifyMetaCallbackContentType(undefined)).toBe("missing");
    expect(classifyMetaCallbackContentType("application/octet-stream")).toBe("octet_stream");
    expect(classifyMetaCallbackContentType('multipart/form-data; boundary="safe-test-boundary"')).toBe("multipart");

    const stream = new PassThrough();
    let serialized = "";
    stream.on("data", (chunk) => {
      serialized += chunk.toString();
    });
    const logger = pino({ level: "info" }, stream);
    reportMetaCallbackStage({
      callbackType: "deauthorize",
      logger,
      requestId: "safe-meta-callback-request",
      update: {
        stage: "signature_verification",
        outcome: "rejected",
        failureCategory: "signature_verification_failed",
        verificationFailureCategory: "signature_mismatch"
      }
    });
    await new Promise<void>((resolve) => stream.end(resolve));

    expect(serialized).toContain(META_CALLBACK_STAGE_EVENT);
    expect(serialized).toContain('"callbackType":"deauthorize"');
    expect(serialized).toContain('"failureCategory":"signature_verification_failed"');
    expect(serialized).toContain('"verificationFailureCategory":"signature_mismatch"');
    expect(serialized).not.toContain("signed_request");
    expect(serialized).not.toContain("accountId");
  });
});
