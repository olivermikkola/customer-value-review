import { createHash } from "node:crypto";

/** Stable JSON: key order does not affect the hash. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

export function checksum(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex").slice(0, 16);
}

/** Money and percentages are presented rounded; comparisons use the raw value. */
export function round(value: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function pct(value: number, digits = 1): string {
  const s = round(value * 100, digits).toFixed(digits).replace(".", ",");
  return `${s} %`;
}

export function eur(value: number): string {
  return `${round(value, 0).toLocaleString("fi-FI")} €`;
}

export function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** Integer split that always sums exactly to `total`. */
export function splitExact(total: number, weights: number[]): number[] {
  const wSum = sum(weights);
  const raw = weights.map((w) => (total * w) / wSum);
  const out = raw.map((v) => Math.round(v));
  const drift = total - sum(out);
  out[out.length - 1] = out[out.length - 1]! + drift;
  return out;
}
