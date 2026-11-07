# Methodology note

Customer Value & Sustainability Review, Since AI Hackathon 2026 (Lindström challenge).

**Status of everything in this prototype:** all customer, site, operational, baseline and factor values come from the supplied synthetic data pack. Nothing here is real Lindström or customer performance, and nothing is audited or an approved customer claim. Every number on screen and in the deck carries a status label (below).

## 1. What the prototype does

For a fictional multi-site customer it builds a customer-level view with site drill-down, compares the circular textile service with a selectable alternative, and turns the result into a tailored dashboard and a PowerPoint review. Reproduce it with `npm run ui` and `npm run pack` (see the README).

## 2. Data sources

| Pack sheet | Used for | How |
|---|---|---|
| Customers, Sites, Laundries, Products | hierarchy, industry, laundry per site, product footprint and purchase cost | master data |
| Service_Activity | wearers, allocated pieces, scanned pieces, washed pieces/kg, service requests (customer, site, product, month) | one source per cell |
| Service_Cycles | on-time share and cycle time | per site-month aggregates of event rows; the row list is hashed |
| Repairs | repair counts by site, product, type, month | one source per cell |
| Laundry_Resources, Waste_Circularity | laundry-level water, energy, emissions, waste routes | one source per cell |
| Baselines | per-kg values for local laundry, home washing, in-house laundry | factors (see §5) |
| Industry_Priorities, Suggested_Prompts | personalisation rules and example prompts | rules |
| Assumptions, Data_Quality | shown in the UI and deck | verbatim |
| **Customer_Impacts** | **not an input.** Used only afterwards as an independent check on our own calculation (§7). | reconciliation |

The supplied workbook has no `Public_References` sheet, so no public Lindström facts are used anywhere. Product footprints and purchase costs are the pack's synthetic values.

## 3. Traceability and the chain of calculation

```
Excel cell → Source → site-month → site-quarter → site-year
                                        └──────► customer-quarter → customer-year
laundry-month totals → per-kg intensity ─┘      (allocation by washed-kg share)
baseline factor × washed kg → "what the alternative would have used" → saving
```

- A **Source** points at the exact cell (`Service_Activity!L2`) and keeps the pack's own data_status and a checksum.
- A **Measure** is a formula over named inputs (Sources, other Measures, Factors). Every measure can be recomputed from its inputs.
- On start-up the server recomputes every measure of every customer (about 22,000 for NorthStar) and **refuses to start** if one does not match. A test changes one source value and checks that the measures built on it fail.
- In the dashboard any number opens its formula and inputs; the deck's speaker notes list the measure id behind each figure.

## 4. Status labels

| Label | Meaning |
|---|---|
| Synthetic | summed directly from synthetic pack values |
| Calculated | ratios, averages, differences of those |
| Allocated | laundry-level figure shared out to the customer by washed-kg share |
| Estimated | depends on an assumption (comparison baseline, repair ratio, prices) |

A result takes the least clean status of anything it is built from, so an "Estimated" input can never end up under a "Calculated" label. Separately each measure keeps a confidence (measured / estimated / proxy).

## 5. Footprint and handprint logic

**Footprint (what the service uses, attributed to this customer).** For each laundry and month, water, process energy, process emissions, delivery emissions and each textile-waste route are divided by that laundry's washed kg to get a per-kg intensity. A site's footprint is its washed kg times its laundry's intensity for that month, summed over months. This is allocation by washed-kg share; nothing is metered at customer or site level.

**Handprint, part 1: saving versus an alternative.** The alternative's use is the customer's washed kg times a per-kg value from `Baselines` (water l/kg, energy kWh/kg, process plus delivery kgCO2e/kg). Saving = alternative − allocated actual. Selectable alternatives: outsourced local laundry (default), home washing, in-house laundry.

**Handprint, part 2: repair.** Replacements postponed = completed repairs × a postponement ratio. Avoided product emissions = Σ over products (repairs × product footprint) × ratio; avoided purchase cost likewise with purchase cost. The pack's assumption (A002) is ratio 1.

**Textile waste.** Reported in kg and as the share kept out of incineration (recycling + reuse + energy recovery). The pack has no emission factor per waste route, so no CO2e is claimed for waste. The baseline assumes all textile waste would be mixed waste (A004).

**Service and allocation KPIs.**
- On-time share = (cycles − late cycles) / cycles, with "late" taken from the pack's `performance_flag`.
- Utilisation = scanned assets / allocated pieces.
- Surplus garments at a site = allocated − scanned ÷ customer-average utilisation (never below 0).
- Capital in unscanned garments = Σ over products (allocated − scanned) × synthetic purchase cost.
- Active wearers at a site and month = the highest product-level count, because one wearer holds several product types and the pack has no wearer id. Summing would double-count. Periods use the monthly average.

## 6. Uncertainty: low / base / high

- **Baseline band.** The pack gives one value per baseline. Low and high move the per-kg values by −20 % and +20 %. This band is **our prototype assumption**, not Lindström data; it is labelled so in the factor source. Low is the conservative case (the alternative uses less).
- **Repair ratio.** Low 0.5, base 1.0 (the pack's A002), high 1.0. There is no evidence for a ratio above 1, so high is capped at the pack assumption.
- Every figure that depends on these shows the range next to the selected case; the switch at the top changes the case for the whole page and the deck.
- Example (NorthStar, 2025, vs. local laundry): emission saving 189 / 255 / 321 tCO2e (low / base / high). Read the width as the honest answer; the base value alone would suggest more precision than the data supports.

## 7. Independent check against the pack

Our recomputed totals against the pack's `Customer_Impacts` sheet, full year 2025:

| Check | NorthStar | Apex | Mediora |
|---|---|---|---|
| Washed kg | 0.0000 % | 0.0000 % | 0.0000 % |
| Fresh water allocated | 0.0041 % | 0.0012 % | 0.0109 % |
| Process energy allocated | 0.0009 % | 0.0219 % | 0.0149 % |
| Textile waste attributed | 0.0124 % | 0.0361 % | 0.0008 % |
| Water saving vs. local, base | 0.0098 % | 0.0026 % | 0.0284 % |
| Energy saving vs. local, base | 0.0010 % | 0.0490 % | 0.0306 % |
| Emission saving vs. local, base | 0.0002 % | 0.0005 % | 0.0004 % |

The largest difference is 0.05 %, from the pack rounding its per-kg columns. `npm run pack CUST001` prints this for any customer.

## 8. Personalisation

- **Priority** (overall, water, emissions, cost and allocation, circularity, service) reorders the first-screen figures and ranks the observations. It never changes a number.
- **Industry** uses the pack's `Industry_Priorities`: the customer's industry sets the starting priority (food and healthcare start on service, manufacturing on cost) and boosts the matching themes when ranking. These rules guide emphasis only and are not compliance advice.
- **Free text** ("Focus on emissions in Q3 compared with home washing") is read by keyword rules into priority, period, baseline and site. The same words always give the same view.
- **Observations** are generated by rules from the figures: each names its evidence, a question for the meeting, an action with an effort level, and its own limits.
- **No language model computes or decides anything.** Figures, rankings, observations and routing are rules. An optional on-device model (Ternary Bonsai 2, WebGPU, in the browser) only **rewrites** findings in plain words and answers questions, and only from the figures it is handed.
- **A checker stands between the model and the page** (`src/pack/narrate.ts`). It refuses any figure the model was not given (or given with another unit), an estimate not called an estimate, causal claims, overclaims ("best", "proven", "significant"), invented ratios ("half", "double"), a copy of the fact layout, and sites outside the facts. The server rebuilds the task itself, so the browser cannot widen what the model may say. After a refusal the model gets one retry; then the rules-written sentence is shown, marked "Rules". Every shown sentence carries a link to the evidence of each figure it states.
- **Questions the data cannot answer are refused honestly**: prices and invoices, other customers, forecasts, causes ("why"), change over time (the data covers 2025 only), audit readiness, orders. Where Lindström's own add-on module would answer it, it is named.
- **What the checker cannot do:** it verifies figures, units, hedging and forbidden claims, not meaning. A sentence made of allowed figures can still mislead. We read the model's output across all 3 customers × 6 priorities and 15 questions and fixed the cases we found; the same reading should be repeated before showing a new customer or priority.
- Measured on 90 writing tasks (3 customers × 6 priorities): 178 of 179 sentences were written by the model and accepted (`scripts/review-ai-eval.mjs`).

## 9. Missing data and limitations

- **No prices or invoices.** Cost appears only as garment capital tied up in unused allocation, at synthetic purchase cost. It is an order of magnitude, not a rental saving.
- **Water and emissions are not metered per customer.** They are laundry-level figures shared by washed kg.
- **Baselines are illustrative single values.** A 77 % emission saving against local laundry follows from the pack's factors; it is shown with its range and an Estimated label and should not be quoted as a result.
- **Repair handprint rests on one assumption** (one repair, one postponed replacement).
- **Product footprints and costs are synthetic** (assumption A005, low confidence).
- **No wearer identifier**, so wearer counts are a defined proxy (§5).
- **Hierarchy is synthetic** (A006); real parent-account mapping is outside the prototype.
- Unmapped records: 0 service-activity and 0 repair rows failed to join to a site. The count is checked and shown on every run so a real export with orphans would be visible, not dropped.
- Service cycles are bucketed by pickup month; any picked up outside 2025 would be listed as excluded (none in the pack).
