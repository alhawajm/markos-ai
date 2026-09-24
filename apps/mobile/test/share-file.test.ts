import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ available: vi.fn(), share: vi.fn(), assert: vi.fn(), create: vi.fn(), write: vi.fn(), remove: vi.fn() }));
vi.mock("expo-file-system", () => ({
  Paths: { cache: "cache" },
  File: class {
    exists = true;
    uri = "file://private/export.pdf";
    create = mocks.create;
    write = mocks.write;
    delete = mocks.remove;
  }
}));
vi.mock("expo-sharing", () => ({ isAvailableAsync: mocks.available, shareAsync: mocks.share }));
vi.mock("../src/auth/transport", () => ({ sessionController: { assertEpoch: mocks.assert } }));
import { shareFile } from "../src/share-file";
describe("private native export sharing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.available.mockResolvedValue(true);
    mocks.share.mockResolvedValue(undefined);
  });
  it("shares the actual bytes with the PDF type and clears the temporary file", async () => {
    const bytes = new Uint8Array([37, 80, 68, 70]);
    await shareFile(bytes, "report.pdf", "application/pdf", 2, "Save report");
    expect(mocks.write).toHaveBeenCalledWith(bytes);
    expect(mocks.share).toHaveBeenCalledWith("file://private/export.pdf", expect.objectContaining({ UTI: "com.adobe.pdf", mimeType: "application/pdf" }));
    expect(mocks.remove).toHaveBeenCalledOnce();
  });
  it("cleans up a rejected share and returns the error for retry", async () => {
    mocks.share.mockRejectedValue(new Error("share failed"));
    await expect(shareFile(new Uint8Array(), "data.json", "application/json", 2, "Save data")).rejects.toThrow("share failed");
    expect(mocks.remove).toHaveBeenCalledOnce();
  });
  it("never shares another workspace's late export", async () => {
    mocks.assert
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new Error("session changed");
      });
    await expect(shareFile(new Uint8Array(), "report.pdf", "application/pdf", 2, "Save report")).rejects.toThrow("session changed");
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.share).not.toHaveBeenCalled();
  });
});
