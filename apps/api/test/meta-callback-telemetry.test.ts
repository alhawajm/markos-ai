import { PassThrough } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import {
  classifyMetaCallbackContentType,
  META_CALLBACK_STAGE_EVENT,
  reportMetaCallbackStage,
} from "../src/meta/meta-callback-telemetry";

describe("Meta callback telemetry", () => {
  it("classifies callback media types without logging raw headers or payloads", async () => {
    expect(
      classifyMetaCallbackContentType(
        "application/x-www-form-urlencoded; charset=UTF-8",
      ),
    ).toBe("form");
    expect(classifyMetaCallbackContentType(undefined)).toBe("missing");
    expect(classifyMetaCallbackContentType("application/octet-stream")).toBe(
      "other",
    );

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
        stage: "credential_lookup",
        outcome: "completed",
        credentialMatched: false,
      },
    });
    await new Promise<void>((resolve) => stream.end(resolve));

    expect(serialized).toContain(META_CALLBACK_STAGE_EVENT);
    expect(serialized).toContain('"callbackType":"deauthorize"');
    expect(serialized).toContain('"credentialMatched":false');
    expect(serialized).not.toContain("signed_request");
    expect(serialized).not.toContain("accountId");
  });
});
