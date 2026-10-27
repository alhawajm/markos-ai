import type { SessionController } from "./session-controller";
import { MarkosApiError } from "@markos/api-client";

/** Keep cancellation and the identity check active until the response body has arrived. */
export function scopedFetchFor(
  controller: Pick<SessionController, "assertEpoch" | "getEpoch" | "subscribe">,
  epoch: number,
  fetchImpl: typeof fetch = fetch
): typeof fetch {
  return async (input, init) => {
    const abort = new AbortController();
    const unsubscribe = controller.subscribe(() => {
      if (epoch !== controller.getEpoch()) abort.abort();
    });
    const cancel = () => abort.abort();
    init?.signal?.addEventListener("abort", cancel, { once: true });
    if (init?.signal?.aborted) abort.abort();
    const path = String(input);
    const longRequest = path.includes("/generate") || (init?.method === "POST" && /\/onboarding\/document-analysis(?:\/[^/]+\/retry)?$/.test(path));
    let timedOut = false;
    const timeout = setTimeout(
      () => {
        timedOut = true;
        cancel();
      },
      longRequest ? 165_000 : 35_000
    );
    try {
      controller.assertEpoch(epoch);
      const response = await fetchImpl(input, { ...init, credentials: "omit", signal: abort.signal });
      // Native fetch's ArrayBuffer-to-text path does not reliably preserve UTF-8.
      const body = response.headers.get("content-type")?.includes("json") ? await response.text() : await response.blob();
      controller.assertEpoch(epoch);
      return new Response(response.status === 204 ? null : body, { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) {
      controller.assertEpoch(epoch);
      if (timedOut) throw new MarkosApiError("Request timed out", 0, "REQUEST_TIMEOUT");
      throw error;
    } finally {
      clearTimeout(timeout);
      unsubscribe();
      init?.signal?.removeEventListener("abort", cancel);
    }
  };
}
