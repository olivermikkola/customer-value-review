/**
 * The dashboard's server, as a module the browser can run: same functions as src/server.ts,
 * but the pack comes from a JSON file (scripts/build-static.ts) instead of the xlsx.
 * Used by the GitHub Pages build so the page needs no server.
 */
import { EMBEDDERS } from "../embedders.ts";
import { deck, gate, intents, loadFromPack, meta, narrate, reply, trace, view, answer, ask, type Loaded } from "../pack/api.ts";
import type { Pack } from "../pack/read.ts";

let d: Loaded | null = null;

export function init(pack: Pack) {
  d = loadFromPack(pack);
}

function parseSims(raw: string | null): Record<string, number> | undefined {
  try {
    const o = JSON.parse(raw ?? "null") as Record<string, unknown> | null;
    if (!o || typeof o !== "object") return undefined;
    return Object.fromEntries(Object.entries(o).filter((e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1])));
  } catch {
    return undefined;
  }
}

/** One /api/* request. Returns the JSON body and status. */
export function handle(method: string, pathname: string, search: string, body?: string): { status: number; json: unknown } {
  if (!d) return { status: 503, json: { error: "not ready" } };
  const q = new URLSearchParams(search);
  const customer = q.get("customer") ?? "CUST001";
  const text = (q.get("q") ?? "").slice(0, 300);
  if (pathname === "/api/gate" && method === "POST") {
    const out = gate(d, JSON.parse(body ?? "{}"));
    return out ? { status: 200, json: out } : { status: 404, json: { error: "unknown task" } };
  }
  if (pathname === "/api/intents") return { status: 200, json: { embedderId: "bge-small", embedder: EMBEDDERS["bge-small"], hf: null, ort: null, ...intents() } };
  const out =
    pathname === "/api/meta" ? meta(d)
    : pathname === "/api/view" ? view(d, customer, q)
    : pathname === "/api/ask" ? ask(d, customer, text)
    : pathname === "/api/narrate" ? narrate(d, customer, q)
    : pathname === "/api/reply" ? reply(d, customer, text, q, parseSims(q.get("sims")), q.get("force") ?? undefined)
    : pathname === "/api/answer" ? answer(d, customer, text, q)
    : pathname === "/api/trace" ? trace(d, customer, q.get("measure") ?? "")
    : undefined;
  if (out === undefined) return { status: 404, json: { error: "unknown endpoint" } };
  if (out === null) return { status: 404, json: { error: "unknown customer or measure" } };
  return { status: 200, json: out };
}

export async function exportDeck(search: string) {
  if (!d) throw new Error("not ready");
  const q = new URLSearchParams(search);
  return deck(d, q.get("customer") ?? "CUST001", q);
}
