import { afterEach, describe, expect, it, vi } from "vitest";
import { getBrowserApiBaseUrl } from "../app/[locale]/_components/api-base-url";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("browser API origin", () => {
  it.each(["localhost", "127.0.0.1", "[::1]"])("keeps %s development login on the page origin", hostname => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:4000");
    vi.stubGlobal("window", { location: { hostname, origin: `http://${hostname}:3000` } });
    expect(getBrowserApiBaseUrl()).toBe(`http://${hostname}:3000`);
  });
  it("keeps the deployed API configuration", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.test/");
    vi.stubGlobal("window", { location: { hostname: "web.example.test", origin: "https://web.example.test" } });
    expect(getBrowserApiBaseUrl()).toBe("https://api.example.test");
  });
});
