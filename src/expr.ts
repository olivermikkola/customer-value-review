/**
 * A tiny, safe arithmetic evaluator.
 *
 * Deliberately NOT eval() and NOT a library: a measure's formula is data, and
 * data must not be able to execute. Supports + - * / parentheses, unary
 * minus and max()/min() over named variables.
 */

type Node =
  | { t: "num"; v: number }
  | { t: "var"; name: string }
  | { t: "bin"; op: "+" | "-" | "*" | "/"; l: Node; r: Node }
  | { t: "neg"; e: Node }
  | { t: "call"; fn: "max" | "min"; args: Node[] };

type Token = { t: "num"; v: number } | { t: "name"; v: string } | { t: "op"; v: string };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9._]/.test(src[j]!)) j++;
      const raw = src.slice(i, j).replace(/_/g, "");
      const v = Number(raw);
      if (!Number.isFinite(v)) throw new Error(`bad number in formula: ${raw}`);
      out.push({ t: "num", v });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j]!)) j++;
      out.push({ t: "name", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/(),".includes(c)) {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    throw new Error(`unexpected character in formula: ${c}`);
  }
  return out;
}

export function parseExpr(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const eat = (v: string) => {
    const t = toks[p];
    if (!t || t.t !== "op" || t.v !== v) throw new Error(`expected "${v}" in: ${src}`);
    p++;
  };

  function expr(): Node {
    let node = term();
    while (peek()?.t === "op" && (peek() as { v: string }).v.match(/^[+-]$/)) {
      const op = (toks[p++] as { v: string }).v as "+" | "-";
      node = { t: "bin", op, l: node, r: term() };
    }
    return node;
  }

  function term(): Node {
    let node = unary();
    while (peek()?.t === "op" && (peek() as { v: string }).v.match(/^[*/]$/)) {
      const op = (toks[p++] as { v: string }).v as "*" | "/";
      node = { t: "bin", op, l: node, r: unary() };
    }
    return node;
  }

  function unary(): Node {
    const t = peek();
    if (t?.t === "op" && t.v === "-") {
      p++;
      return { t: "neg", e: unary() };
    }
    return atom();
  }

  function atom(): Node {
    const t = toks[p++];
    if (!t) throw new Error(`unexpected end of formula: ${src}`);
    if (t.t === "num") return { t: "num", v: t.v };
    if (t.t === "name") {
      const next = toks[p];
      if (next?.t === "op" && next.v === "(") {
        if (t.v !== "max" && t.v !== "min") throw new Error(`unknown function "${t.v}" in: ${src}`);
        p++;
        const args = [expr()];
        while (toks[p]?.t === "op" && (toks[p] as { v: string }).v === ",") {
          p++;
          args.push(expr());
        }
        eat(")");
        return { t: "call", fn: t.v, args };
      }
      return { t: "var", name: t.v };
    }
    if (t.v === "(") {
      const n = expr();
      eat(")");
      return n;
    }
    throw new Error(`unexpected token "${t.v}" in: ${src}`);
  }

  const root = expr();
  if (p !== toks.length) throw new Error(`trailing tokens in formula: ${src}`);
  return root;
}

export function evalNode(node: Node, env: Record<string, number>): number {
  switch (node.t) {
    case "num":
      return node.v;
    case "var": {
      const v = env[node.name];
      if (v === undefined) throw new Error(`unbound variable "${node.name}"`);
      return v;
    }
    case "neg":
      return -evalNode(node.e, env);
    case "call": {
      const vals = node.args.map((a) => evalNode(a, env));
      return node.fn === "max" ? Math.max(...vals) : Math.min(...vals);
    }
    case "bin": {
      const l = evalNode(node.l, env);
      const r = evalNode(node.r, env);
      switch (node.op) {
        case "+":
          return l + r;
        case "-":
          return l - r;
        case "*":
          return l * r;
        case "/":
          if (r === 0) throw new Error("division by zero in formula");
          return l / r;
      }
    }
  }
}

export function evaluate(formula: string, env: Record<string, number>): number {
  return evalNode(parseExpr(formula), env);
}

/** Variables a formula references. Used to prove every input is bound. */
export function variables(formula: string): string[] {
  const out = new Set<string>();
  const walk = (n: Node): void => {
    if (n.t === "var") out.add(n.name);
    else if (n.t === "neg") walk(n.e);
    else if (n.t === "call") n.args.forEach(walk);
    else if (n.t === "bin") {
      walk(n.l);
      walk(n.r);
    }
  };
  walk(parseExpr(formula));
  return [...out].sort();
}
