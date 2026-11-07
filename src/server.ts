import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { DEFAULT_EMBEDDER, EMBEDDERS } from "./embedders.ts";
import { LOCAL, MODELS } from "./local.ts";
import { answer as packAnswer, reply as packReply, intents as packIntents, gate as packGate, narrate as packNarrate, deck as packDeck, ask as packAsk, loadAll, meta as packMeta, trace as packTrace, view as packView } from "./pack/api.ts";

const pack = await loadAll();

/** Similarities from the browser's embedding model: numbers only, anything else is dropped. */
function parseSims(raw: string | null): Record<string, number> | undefined {
  try {
    const o = JSON.parse(raw ?? "null") as Record<string, unknown> | null;
    if (!o || typeof o !== "object") return undefined;
    return Object.fromEntries(Object.entries(o).filter((e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1])));
  } catch {
    return undefined;
  }
}

/** The embedding model that reads questions. bge-small: 34 MB, CPU only; see scripts/answer-eval.ts for the comparison. */
const ANSWER_EMBEDDER = process.env.CVR_EMBEDDER && EMBEDDERS[process.env.CVR_EMBEDDER] ? process.env.CVR_EMBEDDER : "bge-small";

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

  if (url.pathname === "/api/gate" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const out = packGate(pack, JSON.parse(body));
        res.writeHead(out ? 200 : 404, { "content-type": MIME[".json"]!, "cache-control": "no-store" });
        res.end(JSON.stringify(out ?? { error: "unknown task" }));
      } catch {
        res.writeHead(400).end("bad json");
      }
    });
    return;
  }

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

  // The small meaning model and the phrasings it compares questions with; local files when `npm run models` has fetched them.
  if (url.pathname === "/api/intents") {
    const has = (rel: string) => existsSync(join(MODELS, rel));
    const spec = EMBEDDERS[ANSWER_EMBEDDER]!;
    res.writeHead(200, { "content-type": MIME[".json"]!, "cache-control": "no-store" });
    res.end(JSON.stringify({
      embedderId: ANSWER_EMBEDDER, embedder: spec,
      hf: has(join(LOCAL.hf, spec.repo, "config.json")) ? `/models/${LOCAL.hf}/` : null,
      ort: has(join(LOCAL.ort, "ort-wasm-simd-threaded.jsep.wasm")) ? `/models/${LOCAL.ort}/` : null,
      ...packIntents(),
    }));
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
      : url.pathname === "/api/narrate" ? packNarrate(pack, customer, url.searchParams)
      : url.pathname === "/api/reply" ? packReply(pack, customer, (url.searchParams.get("q") ?? "").slice(0, 300), url.searchParams, parseSims(url.searchParams.get("sims")), url.searchParams.get("force") ?? undefined)
      : url.pathname === "/api/answer" ? packAnswer(pack, customer, (url.searchParams.get("q") ?? "").slice(0, 300), url.searchParams)
      : url.pathname === "/api/trace" ? packTrace(pack, customer, url.searchParams.get("measure") ?? "")
      : undefined;
    if (out === undefined) return json(404, { error: "unknown endpoint" });
    if (out === null) return json(404, { error: "unknown customer or measure" });
    return json(200, out);
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
  console.log(`Customer Value Review  →  http://localhost:${PORT}`);
});
