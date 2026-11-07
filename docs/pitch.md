# Pitch and demo script (English)

Three minutes. Every figure below is on screen; all data is synthetic.

## The one-line version

Customers ask Lindström for proof of the value of their textile service. We turn multi-site data into a review where **every number opens its evidence**, **the view follows what the customer cares about**, and **limits are shown, not hidden**.

## Flow (3 min)

**0:00 Problem (20 s).** "A KAM walks into an annual review with spreadsheets from five systems. The customer asks: what did we get, compared with doing it ourselves, and what should we do next? Today that is days of work and the answer is hard to defend."

**0:20 Customer view (30 s).** Open NorthStar Foods (24 sites, 3 countries). "One customer, one page. It starts on *service performance* because the pack ranks hygiene and service first for food. 98.3 % of cycles on time, 53 requests per 1 000 wearers."

**0:50 Personalise (40 s).** Type: *"Focus on emissions in Q3 compared with home washing."* The page re-orders: emissions first, Q3, home washing as the comparison. "Same data, different story. Switch to Apex Industrial (manufacturing): it opens on cost and allocation." Point at the observations: each has evidence, a question for the meeting, an action, and its limits.

**1:30 Credibility (50 s).** Click a number (emission saving). Show the drawer: formula, inputs, drill down to an Excel cell. "Every figure recomputes from its inputs. If one does not, the server will not start." Point at the badges (Synthetic / Calculated / Allocated / Estimated) and the range: "255 tCO₂e saved, but between 189 and 321 depending on the baseline. We show the range, not one confident number."

**2:20 Site drill-down (20 s).** Sort the 24 sites by surplus garments; open one. "Where to act, not just what happened."

**2:40 Output (20 s).** Click *Download review (.pptx)*. "The customer-ready deck comes from the same figures, with sources and limits on every slide. The speaker notes name the measure behind each number."

## Close (10 s)

"Next: approved data in place of the synthetic pack. The path is in our data-readiness note: hierarchy, wearer count, prices and approved baselines are the gaps."

## Design choices worth naming if asked

1. **Numbers are computed by transparent rules, not by a language model.** A model may later phrase them; it will not decide them.
2. **Credibility over big claims.** Range on every assumption-driven figure; the 77 % emission saving vs. local laundry is shown as an estimate from illustrative factors.
3. **One truth, many views.** Priority and industry reorder; they never change a number.
4. **Ready for real data.** One setting swaps the pack for an approved export; unmapped rows are counted, not dropped.

## Hard questions

| Question | Answer |
|---|---|
| Is the 77 % real? | No. It follows from the pack's illustrative baseline factors. It is labelled Estimated and shown with its range. |
| Where does water per customer come from? | Laundry totals shared by washed-kg share. Not metered per customer; stated on the page. |
| What does one repair avoid? | The pack assumes one postponed replacement. We test half of that and show both. |
| Why no cost saving? | The pack has no prices. We show garment capital tied up in unused allocation and say so. |
| Is AI involved? | Not in the numbers. Personalisation and observations are rules, so the same input always gives the same view. A small model on the device reads the question box (34 MB, no GPU, no cloud); the answers are composed from the same figures, with evidence. An optional language model only rewrites findings, and a checker refuses anything it was not given. |

## Before presenting

- `npm run ui`, open `http://localhost:5173` on the presenting machine.
- Check `npm run check` is green and the deck downloads once.
- Have one finished `.pptx` saved as a fallback.
