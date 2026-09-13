// A loopback-only server for this UI draft. No API, database, or environment files are loaded.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = new Map([
  ["/docs/prototypes/business-profile.html", ["docs/prototypes/business-profile.html", "text/html"]],
  ["/docs/prototypes/business-profile.css", ["docs/prototypes/business-profile.css", "text/css"]],
  ["/docs/prototypes/business-profile.js", ["docs/prototypes/business-profile.js", "text/javascript"]],
  ["/docs/prototypes/business-profile-icons.svg", ["docs/prototypes/business-profile-icons.svg", "image/svg+xml"]],
  ["/apps/web/app/sunlit-theme.css", ["apps/web/app/sunlit-theme.css", "text/css"]]
]);
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://127.0.0.1").pathname;
  if (path === "/") {
    response.writeHead(302, { Location: "/docs/prototypes/business-profile.html" });
    response.end();
    return;
  }
  const file = files.get(path);
  if (!file || !["GET", "HEAD"].includes(request.method)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  try {
    const body = await readFile(resolve(root, file[0]));
    response.writeHead(200, { "Content-Type": `${file[1]}; charset=utf-8`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(500);
    response.end("Preview asset unavailable");
  }
});
server.listen(3100, "127.0.0.1", () => console.log("MARKOS Business Profile UI draft: http://127.0.0.1:3100"));
