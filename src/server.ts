import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { buildUiData } from "./export.ts";
import { assemble } from "./assemble.ts";
import { gate, tasksFor } from "./llm.ts";
import { askTask } from "./ask.ts";
import { TOPICS } from "./topics.ts";
import { DEFAULT_EMBEDDER, EMBEDDERS } from "./embedders.ts";
import type { Lens } from "./review.ts";
import { LOCAL, MODELS } from "./local.ts";
import { deck as packDeck, ask as packAsk, loadAll, meta as packMeta, trace as packTrace, view as packView } from "./pack/api.ts";

const pack = await loadAll();

const WEB = join(import.meta.dirname, "..", "web");

/**
 * Files under models/, with byte ranges: the Bonsai engine reads its weights
 * in ranges, exactly as it does from Hugging Face.
 */
function serveModelFile(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, rel: string) {
  const path = normalize(join(MODELS, rel));
  if (!path.startsWith(MODELS + sep) || !existsSync(path) || !statSync(path).isFile()) {
    res.writeHead(404).end("not found");
    return;
  }
  const size = statSync(path).size;
  const type = MIME[extname(path)] ?? (path.endsWith(".wasm") ? "application/wasm" : "application/octet-stream");
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  const head = req.method === "HEAD";
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      res.writeHead(416, { "content-range": `bytes */${size}` }).end();
      return;
    }
    res.writeHead(206, {
      "content-type": type,
      "content-length": end - start + 1,
      "content-range": `bytes ${start}-${end}/${size}`,
      "accept-ranges": "bytes",
    });
    if (head) res.end();
    else createReadStream(path, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { "content-type": type, "content-length": size, "accept-ranges": "bytes" });
  if (head) res.end();
  else createReadStream(path).pipe(res);
}
const PORT = Number(process.env.PORT ?? 5173);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/api/export.pptx") {
    packDeck(pack, url.searchParams.get("customer") ?? "CUST001", url.searchParams).then(
      (d) => {
        if (!d) return void res.writeHead(404).end("unknown customer");
        res.writeHead(200, { "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation", "content-disposition": `attachment; filename="${d.name}"`, "cache-control": "no-store" });
        res.end(d.body);
      },
      (e) => res.writeHead(500).end(String(e)),
    );
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    const json = (code: number, body: unknown) => {
      res.writeHead(code, { "content-type": MIME[".json"]!, "cache-control": "no-store" });
      res.end(JSON.stringify(body));
    };
    const customer = url.searchParams.get("customer") ?? "CUST001";
    const out =
      url.pathname === "/api/meta" ? packMeta(pack)
      : url.pathname === "/api/view" ? packView(pack, customer, url.searchParams)
      : url.pathname === "/api/ask" ? packAsk(pack, customer, (url.searchParams.get("q") ?? "").slice(0, 300))
      : url.pathname === "/api/trace" ? packTrace(pack, customer, url.searchParams.get("measure") ?? "")
      : undefined;
    if (out === undefined) return json(404, { error: "unknown endpoint" });
    if (out === null) return json(404, { error: "unknown customer or measure" });
    return json(200, out);
  }

  if (url.pathname === "/legacy") {
    res.writeHead(200, { "content-type": MIME[".html"]! });
    res.end(readFileSync(join(WEB, "legacy.html")));
    return;
  }

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

  if (url.pathname.startsWith("/models/")) {
    serveModelFile(req, res, decodeURIComponent(url.pathname.slice("/models/".length)));
    return;
  }

  // Which model files this server has locally; the page uses them instead of the internet.
  if (url.pathname === "/local") {
    const has = (rel: string) => existsSync(join(MODELS, rel));
    const spec = EMBEDDERS[DEFAULT_EMBEDDER]!;
    res.writeHead(200, { "content-type": MIME[".json"]! });
    res.end(
      JSON.stringify({
        bonsai: has(LOCAL.bonsai) ? `/models/${LOCAL.bonsai}` : null,
        hf: has(join(LOCAL.hf, spec.repo, "config.json")) ? `/models/${LOCAL.hf}/` : null,
        ort: has(join(LOCAL.ort, "ort-wasm-simd-threaded.jsep.wasm")) ? `/models/${LOCAL.ort}/` : null,
      }),
    );
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
