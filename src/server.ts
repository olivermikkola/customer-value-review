import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { buildUiData } from "./export.ts";
import { assemble } from "./assemble.ts";
import { gate, tasksFor } from "./llm.ts";
import { askTask } from "./ask.ts";
import { TOPICS } from "./topics.ts";
import { DEFAULT_EMBEDDER, EMBEDDERS } from "./embedders.ts";
import type { Lens } from "./review.ts";

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

  // The browser model asks for its prompt and hands every answer back to the
  // same gate the server-side model uses. The model may run anywhere; the gate does not move.
  if (url.pathname === "/prompt") {
    const { claims, drivers } = assemble();
    const lens = (url.searchParams.get("lens") ?? "balanced") as Lens;
    res.writeHead(200, { "content-type": MIME[".json"]! });
    res.end(JSON.stringify(tasksFor(claims, drivers, lens)));
    return;
  }

  // What the browser's embedding model compares questions against.
  if (url.pathname === "/topics") {
    res.writeHead(200, { "content-type": MIME[".json"]! });
    res.end(JSON.stringify({ embedder: EMBEDDERS[DEFAULT_EMBEDDER], topics: TOPICS }));
    return;
  }

  if (url.pathname === "/ask") {
    const { claims, drivers } = assemble();
    const q = (url.searchParams.get("q") ?? "").slice(0, 300);
    // Optional: similarity per topic id from the browser's embedding model. Numbers only; anything else is ignored.
    let sims: Record<string, number> | undefined;
    try {
      const raw = JSON.parse(url.searchParams.get("sims") ?? "null") as Record<string, unknown> | null;
      if (raw && typeof raw === "object") {
        sims = Object.fromEntries(
          Object.entries(raw).filter((e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1])),
        );
      }
    } catch {
      sims = undefined;
    }
    res.writeHead(200, { "content-type": MIME[".json"]! });
    res.end(JSON.stringify(askTask(q, claims, drivers, sims)));
    return;
  }

  if (url.pathname === "/gate" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const { raw, keep, claimIds, driverIds } = JSON.parse(body) as {
          raw: string;
          keep?: string[];
          claimIds?: string[];
          driverIds?: string[];
        };
        const list = (x: unknown) => (Array.isArray(x) ? x.map(String) : []);
        const { idx, claims, drivers } = assemble();
        const ctx = { claims: new Map(claims.map((c) => [c.id, c])), measures: idx.measures, drivers };
        res.writeHead(200, { "content-type": MIME[".json"]! });
        const task = claimIds ? { claimIds: list(claimIds), driverIds: list(driverIds) } : undefined;
        res.end(JSON.stringify(gate(String(raw ?? ""), ctx, list(keep), task)));
      } catch {
        res.writeHead(400).end("bad json");
      }
    });
    return;
  }

  const name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  if (!/^(vendor\/)?[a-z0-9.\-]+$/i.test(name)) {
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
