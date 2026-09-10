// Loopback-only design preview. It loads no environment files and exposes no application API.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = new Map([
  ["/docs/prototypes/campaign-review.html", "text/html"],
  ["/docs/prototypes/campaign-review.css", "text/css"],
  ["/docs/prototypes/campaign-review.js", "text/javascript"],
  ["/docs/prototypes/business-profile-icons.svg", "image/svg+xml"],
  ["/apps/web/app/theme-tokens.css", "text/css"]
]);
for (const family of ["IBMPlexSans", "IBMPlexSansArabic"]) {
  for (const weight of ["Regular", "Medium", "SemiBold", "Bold"]) files.set(`/apps/web/app/fonts/${family}-${weight}.woff2`, "font/woff2");
}
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405);
    response.end();
    return;
  }
  if (url.pathname === "/") {
    response.writeHead(302, { Location: `/docs/prototypes/campaign-review.html${url.search}` });
    response.end();
    return;
  }
  const mimeType = files.get(url.pathname);
  if (!mimeType) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  try {
    const body = await readFile(resolve(root, url.pathname.slice(1)));
    response.writeHead(200, {
      "Content-Type": `${mimeType}${mimeType.startsWith("text/") ? "; charset=utf-8" : ""}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(500);
    response.end("Preview asset unavailable");
  }
});
server.listen(3101, "127.0.0.1", () => console.log("MARKOS Campaign review prototype: http://127.0.0.1:3101"));
