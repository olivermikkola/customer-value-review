import type { Claim, Driver } from "./model.ts";
import { buildObservations, type Lens } from "./review.ts";
import { formatClaim, render, validateNarrative, type Ctx, type NarrativeResult, type Verdict } from "./validator.ts";

/**
 * The language-model layer. The model never computes: it is handed the
 * finished values of a few claims and may only copy them. `slotify` maps every
 * copied value back to its claim (`[[clm:id]]`), and a number that matches no
 * claim given for that sentence stays a bare digit — which the gate rejects as
 * UNSOURCED_NUMBER. Every sentence then goes through the same gate as the
 * hand-written narrative.
 *
 * Any OpenAI-compatible endpoint works. Default: local Lemonade.
 */

export const LLM_URL = process.env.LLM_URL ?? "http://localhost:13305/api/v1";
export const LLM_MODEL = process.env.LLM_MODEL ?? "Gemma-3-4b-it-GGUF";

export const DIRECTION: Record<string, string> = { up: "nousi", down: "laski", flat: "pysyi ennallaan" };
const DIRECTION_PLURAL: Record<string, string> = { up: "nousivat", down: "laskivat", flat: "pysyivät ennallaan" };

/** The verb for a claim's label, in agreement: "päästöt nousivat", "laskutus nousi". */
export function verbFor(c: Claim): string {
  if (c.kind !== "change") return "oli";
  const plural = /[aeiouyäö]t$/i.test(c.label.trim());
  return (plural ? DIRECTION_PLURAL : DIRECTION)[c.stated.direction] ?? "muuttui";
}

export const SYSTEM = [
  "You write one or two sentences of a customer review for a Finnish workwear and laundry service.",
  "Write in correct, plain Finnish. Output only the sentences, one per line.",
  "HARD RULES:",
  "1. Copy each number exactly as given, with its unit. Never write any other number, never calculate.",
  "2. Every sentence must contain one of the given numbers and name what it measures (use its label).",
  "3. Cause words (koska, johtuu, aiheutti, selittää) only for a 'Todettu syy', and name that cause in the sentence.",
  "4. A 'Mahdollinen syy' is not a cause: write 'ajoittuu samaan aikaan' and 'syytä ei ole vahvistettu'.",
  "5. No superlatives (paras, merkittävästi, ennätys, huippu).",
].join("\n");

export interface SentenceTask {
  claimId: string;
  /** Claims whose values this task shows; only these may be matched back by `slotify`. */
  claimIds: string[];
  driverIds: string[];
  system: string;
  user: string;
  /** Written by us, passes the gate by construction. Used when the model fails twice. */
  fallback: string;
}

/**
 * One small task per finding instead of one big essay. A 2–4B model writes a
 * good sentence far more often than a good page, and when it does not, the
 * template keeps the review whole.
 */
export function tasksFor(claims: Claim[], drivers: Driver[], lens: Lens): SentenceTask[] {
  const byId = new Map(claims.map((c) => [c.id, c]));
  return buildObservations(claims, drivers, 3, lens).map((o) => {
    const c = byId.get(o.claimId)!;
    const verb = verbFor(c);
    const claimIds = [c.id];
    const lines = [`Fakta: ${c.label} ${verb} ${formatClaim(c)}.`];
    const mine = drivers.filter((x) => o.driverIds.includes(x.id));
    for (const d of mine) {
      lines.push(
        d.method === "hypothesis"
          ? `Mahdollinen syy (EI vahvistettu, sano 'ajoittuu samaan aikaan'): ${d.label}.`
          : `Todettu syy: ${d.label}.`,
      );
      for (const eid of d.evidenceClaimIds) {
        const e = byId.get(eid);
        if (!e) continue;
        claimIds.push(e.id);
        lines.push(`  Luku: ${e.label} ${formatClaim(e)}.`);
      }
    }
    lines.push(
      mine.length
        ? "Kirjoita kaksi lausetta: ensin fakta, sitten syy omalla nimellään. Älä aloita lausetta sanalla 'Tämä'."
        : "Kirjoita yksi lause.",
    );
    return {
      claimId: c.id,
      claimIds,
      driverIds: mine.map((d) => d.id),
      system: SYSTEM,
      user: lines.join("\n"),
      fallback: c.kind === "change" ? `${c.label} ${verb} [[${c.id}]].` : `${c.label}: [[${c.id}]].`,
    };
  });
}

const UNIT_WORDS: Record<string, string> = {
  "%": "%|prosentti\\p{L}*",
  pp: "pp|prosenttiyksikö\\p{L}*|prosenttiyksikkö\\p{L}*",
  EUR: "€|euro\\p{L}*",
  m3: "m³|m3|kuutio\\p{L}*",
  "m3/kg": "m³/kg|m3/kg",
  kg: "kg|kilo\\p{L}*",
  kgCO2e: "kgCO₂e|kgCO2e|kg CO₂e|kg CO2e",
};

const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Turn copied values back into slots. Only the task's own claims are
 * candidates, so a value that happens to equal another claim's (two claims
 * read 21,3 %) cannot be borrowed. Thousands separators and decimal points are
 * forgiven; the digits themselves are not.
 */
export function slotify(text: string, ctx: Ctx, claimIds: string[], driverIds: string[] = []): string {
  let out = text.replace(/[\u00a0\u202f]/g, " ");
  for (const id of driverIds) {
    const d = ctx.drivers.find((x) => x.id === id);
    if (!d) continue;
    // Models shorten names: "… krt/vko (Espoo, Vantaa)" often comes back without the brackets.
    const short = [d.label, d.label.split(" (")[0]!, d.label.split(", ")[0]!].filter((x) => /\d/.test(x) || x === d.label);
    for (const name of [...new Set(short)].sort((a, b) => b.length - a.length)) {
      out = out.replace(new RegExp(escape(name), "gi"), `{{${d.id}}}`);
    }
  }
  for (const id of claimIds) {
    const c = ctx.claims.get(id);
    if (!c) continue;
    const shown = formatClaim(c).replace(/[\u00a0\u202f]/g, " ");
    const num = shown.match(/^-?[\d ]+(?:,\d+)?/)?.[0]?.trim();
    if (!num) continue;
    const [int, dec] = num.split(",");
    const intRe = int!.split(" ").map(escape).join("[ \\u00a0]?");
    const numRe = dec ? `${intRe}[,.]${dec}` : intRe;
    const unit = UNIT_WORDS[c.stated.unit];
    const re = new RegExp(`(?<![\\d,.])${numRe}(?![\\d])${unit ? `(?:\\s?(?:${unit}))?` : ""}`, "gu");
    out = out.replace(re, `[[${c.id}]]`);
  }
  return out;
}

async function chat(messages: { role: string; content: string }[]): Promise<string> {
  const res = await fetch(`${LLM_URL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: LLM_MODEL, messages, temperature: 0.3, max_tokens: 600 }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`${LLM_URL} → HTTP ${res.status}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return body.choices?.[0]?.message?.content ?? "";
}

/** One sentence each; small models often ignore "one per line", so split on full stops too. */
export function splitSentences(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ""))
    .flatMap((l) => l.split(/(?<=[.!?])\s+(?=[A-ZÅÄÖ])/))
    // Small models mix the two slot styles; a driver slot in the claim brackets means the same thing.
    .map((l) => l.replace(/\[\[(drv:[A-Za-z0-9_\-]+)\]\]/g, "{{$1}}").trim())
    .filter((l) => l.length > 0);
}

export interface Gated extends NarrativeResult {
  /** The accepted sentences as the model wrote them (slots, not values) — carried into a retry. */
  kept: string[];
  /** What to tell the model when something was rejected; null when nothing was. */
  feedback: string | null;
}

/**
 * The one gate for every model, server-side or in the browser: split, validate,
 * and say what to fix. `keep` carries a previous round's accepted sentences.
 */
export function gate(
  raw: string,
  ctx: Ctx,
  keep: string[] = [],
  task?: Pick<SentenceTask, "claimIds" | "driverIds">,
): Gated {
  const fresh = splitSentences(raw).map((s) => (task ? slotify(s, ctx, task.claimIds, task.driverIds) : s));
  // A retry often repeats sentences that were already accepted; that is not a new claim, so drop it quietly.
  const sentences = [...keep, ...fresh.filter((s) => !keep.includes(s))];
  const result = validateNarrative(sentences, ctx);
  const kept = sentences.filter((s) => !result.rejected.some((r) => r.sentence === s));
  const feedback =
    result.rejected.length === 0
      ? null
      : [
          "Tarkistin hylkäsi nämä lauseet:",
          ...result.rejected.map((r) => `- "${render(r.sentence, ctx).text}" → ${r.code}${r.detail ? ` (${r.detail})` : ""}`),
          "Kirjoita vain korjatut lauseet uudelleen, yksi per rivi. Noudata sääntöjä.",
        ].join("\n");
  // Rejections carry the rendered text too, so a UI never shows raw slots.
  const rejected = result.rejected.map((r) => ({ ...r, shown: render(r.sentence, ctx).text }));
  return { ...result, rejected, kept, feedback };
}

export interface Draft {
  model: string;
  ms: number;
  /** Final review, in order, each sentence marked as written by the model or by the template. */
  sentences: { text: string; by: "model" | "template" }[];
  /** Everything the gate stopped — this is demo material. */
  rejected: Verdict[];
}

/**
 * For each finding: ask, gate, one retry with the gate's feedback, then the
 * template. web/edge.js runs the same loop with the model in the browser.
 */
export async function draftNarrative(claims: Claim[], drivers: Driver[], lens: Lens, ctx: Ctx): Promise<Draft> {
  const t0 = Date.now();
  let keep: string[] = [];
  const by = new Map<string, "model" | "template">();
  const rejected: Verdict[] = [];

  for (const task of tasksFor(claims, drivers, lens)) {
    const messages = [
      { role: "system", content: task.system },
      { role: "user", content: task.user },
    ];
    const first = await chat(messages);
    let g = gate(first, ctx, keep, task);
    rejected.push(...g.rejected);
    if (g.feedback) {
      const second = await chat([...messages, { role: "assistant", content: first }, { role: "user", content: g.feedback }]);
      g = gate(second, ctx, g.kept, task);
      rejected.push(...g.rejected);
    }
    for (const s of g.kept) if (!by.has(s)) by.set(s, "model");
    if (!g.kept.some((s) => s.includes(`[[${task.claimId}`))) {
      g = gate(task.fallback, ctx, g.kept);
      by.set(task.fallback, "template");
    }
    keep = g.kept;
  }

  const final = gate("", ctx, keep);
  return {
    model: LLM_MODEL,
    ms: Date.now() - t0,
    sentences: final.accepted.map((a, i) => ({ text: a.text, by: by.get(final.kept[i]!) ?? "model" })),
    rejected,
  };
}
