import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { buildUiData } from "./export.ts";

const WEB = join(import.meta.dirname, "..", "web");
const PORT = Number(process.env.PORT ?? 5173);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/data.json") {
    // Rebuilt per request so the UI can never drift from the ledger.
    res.writeHead(200, { "content-type": MIME[".json"]! });
    res.end(JSON.stringify(buildUiData()));
    return;
  }

  const name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  if (!/^[a-z0-9.\-]+$/i.test(name)) {
    res.writeHead(400).end("bad path");
    return;
  }

  try {
    const body = readFileSync(join(WEB, name));
    res.writeHead(200, { "content-type": MIME[extname(name)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

server.listen(PORT, () => {
  console.log(`LANKA  →  http://localhost:${PORT}`);
});
