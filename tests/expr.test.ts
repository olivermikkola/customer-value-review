import assert from "node:assert/strict";
import test from "node:test";
import { evaluate, variables } from "../src/expr.ts";

test("respects precedence", () => {
  assert.equal(evaluate("2 + 3 * 4", {}), 14);
  assert.equal(evaluate("(2 + 3) * 4", {}), 20);
});

test("binds variables", () => {
  assert.equal(evaluate("water_m3 / linen_kg", { water_m3: 4210, linen_kg: 38400 }), 4210 / 38400);
});

test("unary minus", () => {
  assert.equal(evaluate("-a + 1", { a: 3 }), -2);
});

test("division by zero throws rather than returning Infinity", () => {
  assert.throws(() => evaluate("a / b", { a: 1, b: 0 }), /division by zero/);
});

test("unbound variable throws", () => {
  assert.throws(() => evaluate("a + b", { a: 1 }), /unbound variable/);
});

test("reports the variables a formula needs", () => {
  assert.deepEqual(variables("a * (b - c)"), ["a", "b", "c"]);
});

test("rejects anything that is not arithmetic", () => {
  assert.throws(() => evaluate("process.exit(1)", {}), /unexpected character/);
  assert.throws(() => evaluate("a; b", {}), /unexpected character/);
});
