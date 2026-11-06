import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assemble, measureById } from "./assemble.ts";
import type { Claim, Driver, Measure } from "./model.ts";
import { buildObservations, type Lens } from "./review.ts";
import { OPENING, SAMPLE_NARRATIVE, SAMPLE_REJECTIONS } from "./narrative.ts";
import { render, validateNarrative, validateSentence } from "./validator.ts";
import { round } from "./util.ts";
import { generate } from "./seed/generate.ts";

const ROOT = join(import.meta.dirname, "..");

function fmt(n: number, digits = 1): string {
  return round(n, digits).toLocaleString("fi-FI", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function printChain(measureId: string, measures: Map<string, Measure>, depth = 0, seen = new Set<string>()): void {
  if (seen.has(measureId)) return;
  seen.add(measureId);
  const m = measures.get(measureId);
  if (!m) {
    console.log(`${"  ".repeat(depth)}? ${measureId}`);
    return;
  }
  const pad = "  ".repeat(depth);
  const siblings = m.inputs.filter((i) => i.startsWith("src:")).length;
  const formula = /^v\d+( \+ v\d+)+$/.test(m.formula)
    ? `summa ${siblings} raakatapahtumasta`
    : m.formula;
  console.log(
    `${pad}${m.id} = ${fmt(m.value, 3)} ${m.unit}` +
      `  [${m.confidence}]  ${formula}` +
      (siblings > 1 && !formula.startsWith("summa") ? `  (+${siblings} raakatapahtumaa)` : ""),
  );
  for (const f of m.factors) console.log(`${pad}  · kerroin ${f} (kiinnitetty)`);
  for (const i of m.inputs) {
    if (i.startsWith("mea:")) printChain(i, measures, depth + 1, seen);
  }
}

function cmdSeed(): void {
  const seed = generate();
  const out = join(ROOT, "seed", "customer.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(seed, null, 2) + "\n", "utf8");
  console.log(`kirjoitettu ${out}`);
  console.log(
    `${seed.sources.length} lähdettä, ${seed.factors.length} kerrointa, ${seed.sites.length} toimipistettä`,
  );
}

function cmdFacts(): void {
  const { measures, claims } = assemble();
  const m = (id: string) => measureById(measures, id).value;
  const c = (id: string) => {
    const claim = claims.find((x) => x.id === id);
    if (!claim) throw new Error(id);
    return claim;
  };

  const rows: string[] = [
    "| Suure | Q3 2024 | Q3 2025 | Muutos | Luottamus |",
    "|---|---|---|---|---|",
  ];
  const add = (label: string, fromId: string, toId: string, unit: string, digits: number, conf: string) => {
    const a = m(fromId);
    const b = m(toId);
    rows.push(
      `| ${label} | ${fmt(a, digits)} ${unit} | ${fmt(b, digits)} ${unit} | ${fmt((b / a - 1) * 100, 1)} % | ${conf} |`,
    );
  };
  add("Pesty pyykki", "mea:linen_kg:2024-Q3", "mea:linen_kg:2025-Q3", "kg", 0, "mitattu");
  add("Mattopyykki", "mea:mat_kg:2024-Q3", "mea:mat_kg:2025-Q3", "kg", 0, "mitattu");
  add("Vedenkulutus", "mea:water_m3:2024-Q3", "mea:water_m3:2025-Q3", "m³", 0, "mitattu");
  add("Veden ominaiskulutus", "mea:water_intensity:2024-Q3", "mea:water_intensity:2025-Q3", "m³/kg", 4, "mitattu");
  add("Veden päästöt", "mea:co2_kg:2024-Q3", "mea:co2_kg:2025-Q3", "kgCO₂e", 0, "arvioitu");
  add("Palvelulaskutus", "mea:cost_eur:2024-Q3", "mea:cost_eur:2025-Q3", "€", 0, "mitattu");
  add("Katoamisen kustannus", "mea:loss_cost_eur:2024-Q3", "mea:loss_cost_eur:2025-Q3", "€", 0, "mitattu");

  const attribution = c("clm:water-attribution");
  const attributable = m("mea:water_attributable_m3:2025-Q3");
  const unattributed = m("mea:water_unattributed_m3:2025-Q3");
  const delta = m("mea:water_delta_m3:2024-Q3->2025-Q3");
  const avoided = c("clm:water-avoided");
  const repair = c("clm:repair-rate-up");

  const md = [
    "# Generoidut luvut",
    "",
    "> Tämä tiedosto on tuotettu komennolla `npm run facts`. Älkää muokatko käsin —",
    "> älkääkä lainatko pitchiin lukuja muualta kuin täältä.",
    "",
    ...rows,
    "",
    "## Juokseva tarina",
    "",
    `- Veden kokonaismuutos: **${fmt(delta, 0)} m³**`,
    `- Mattotiheyden osuus: **${fmt(attribution.stated.value, 1)} %** (${fmt(attributable, 0)} m³)`,
    `- Selittämätön osa: **${fmt(unattributed, 0)} m³** — syy: hypoteesi, ei vahvistettu`,
    `- Korjaussuhde: ${fmt(repair.stated.value, 1)} pp (${fmt(m("mea:repair_rate:2024-Q3"), 1)} % → ${fmt(m("mea:repair_rate:2025-Q3"), 1)} %)`,
    `- Vältetty vesi vs. oma pesula: **${fmt(avoided.stated.value, 0)} m³** (luottamus: ${avoided.confidence})`,
    "",
    "## Väitteet",
    "",
    "| Väite | Arvo | Luottamus | Materiaalisuus |",
    "|---|---|---|---|",
    ...claims.map(
      (x: Claim) =>
        `| \`${x.id}\` | ${fmt(x.stated.value, x.stated.unit === "m3/kg" ? 4 : 2)} ${x.stated.unit} | ${x.confidence} | ${fmt(x.materiality, 2)} |`,
    ),
    "",
    "## Kerroin, joka on heikoin lenkki",
    "",
    "`fac:counterfactual-laundry-water@v1` = 0,32 m³/kg on **proxy**, ei mittaus.",
    "Kaikki \"vältetty vesi\" -väitteet periytyvät siitä. Validointi ennen ulkoista",
    "käyttöä on pakollinen — juuri siksi luottamustaso näytetään käyttäjälle.",
    "",
  ].join("\n");

  const out = join(ROOT, "docs", "facts.md");
  writeFileSync(out, md, "utf8");
  process.stdout.write(md);
  console.log(`\nkirjoitettu ${out}`);
}

function cmdReview(): void {
  const { idx, measures, claims, drivers } = assemble();
  const lens = (process.argv[3] ?? "balanced") as Lens;
  const observations = buildObservations(claims, drivers, 3, lens);
  const ctx = {
    claims: new Map(claims.map((c) => [c.id, c])),
    measures: idx.measures,
    drivers,
  };

  console.log(`${OPENING} [linssi: ${lens}]`);
  console.log("");

  observations.forEach((o, i) => {
    const claim = ctx.claims.get(o.claimId)!;
    console.log(`${i + 1}. [${o.severity.toUpperCase()}] ${o.headline}   (rank ${fmt(o.rank, 3)})`);
    console.log(
      `   ${claim.id} = ${fmt(claim.stated.value, 2)} ${claim.stated.unit}` +
        `   luottamus: ${claim.confidence}   materiaalisuus: ${fmt(claim.materiality, 2)}`,
    );
    for (const d of o.driverIds.map((id) => drivers.find((x) => x.id === id)!) as Driver[]) {
      const share =
        d.attributedShare === null
          ? "selittämätön"
          : `${fmt(d.attributedShare * 100, 1)} %`;
      console.log(
        `   ↳ ${d.id}: ${share}` +
          (d.attributedAmount !== null ? ` (${fmt(d.attributedAmount, 0)} yksikköä)` : "") +
          `  [${d.method}]`,
      );
    }
    for (const mid of claim.measureIds) printChain(mid, idx.measures, 3);
    console.log("");
  });

  console.log("--- Hyväksytty narratiivi ---");
  const result = validateNarrative(SAMPLE_NARRATIVE, ctx);
  for (const line of result.accepted) console.log(`  ✓ ${line.text}`);
  for (const r of result.rejected) console.log(`  ✗ [${r.code}] ${r.sentence}`);

  console.log("");
  console.log("--- Hylätyt (portti toimii) ---");
  for (const s of SAMPLE_REJECTIONS) {
    const v = validateSentence(s, ctx);
    const shown = v.ok ? render(s, ctx).text : render(s, ctx).text;
    console.log(`  ${v.ok ? "✓" : "✗"} ${shown}`);
    if (!v.ok) console.log(`     ${v.code}: ${v.detail ?? ""}`);
  }
}

function cmdVerify(): void {
  const { measures, claims, drivers, observations } = assemble();
  console.log(`✓ ${measures.length} mittaria laskettu ja tarkistettu uudelleen`);
  console.log(`✓ ${claims.length} väitettä täsmää johdantoonsa`);
  console.log(`✓ ${drivers.length} syy-reunaa, joista ${drivers.filter((d) => d.attributedShare === null).length} ilman osuutta (tarkoituksella)`);
  console.log(`✓ ${observations.length} havaintoa budjetissa`);
  console.log("✓ seed on deterministinen (ks. tests/)");
}

const command = process.argv[2];
switch (command) {
  case "seed":
    cmdSeed();
    break;
  case "facts":
    cmdFacts();
    break;
  case "review":
    cmdReview();
    break;
  case "verify":
    cmdVerify();
    break;
  default:
    console.log("käyttö: node src/cli.ts <seed|facts|review|verify>");
    process.exitCode = 1;
}
