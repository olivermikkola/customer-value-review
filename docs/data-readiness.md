# Data-readiness note

Maps what the prototype uses to the Lindström source types it could later come from, and names the gaps. Everything today is synthetic.

## 1. Field mapping

The pack README says which Lindström reports each sheet's *structure* was informed by. That is the realistic future source for each field.

| Prototype field | Pack sheet / columns | Likely future source | Join keys |
|---|---|---|---|
| Active wearers, allocated pieces, scanned assets | Service_Activity: `active_wearers`, `allocated_pieces`, `active_assets_scanned` | Allocated pieces (Tableau) | customer, site, product, month |
| Washed pieces, packed pieces, washing % | Service_Activity: `washed_pieces`, `packed_pieces`, `washing_pct` | Washing % report | customer, site, product, month |
| Washed kg per customer | Service_Activity: `customer_washed_kg` | Washed kg per customer (not in the pack's source list; to be confirmed) | customer, site, product, month |
| Service requests | Service_Activity: `service_requests` | service request system / Tableau (to be confirmed) | customer, site, month |
| Pickup → delivery cycles, late flag | Service_Cycles | End-to-end delivery report (Tableau) | asset, site, laundry |
| Repair counts by type | Repairs: `repair_count`, `repair_type` | Repairs table. Data discovery confirms monthly counts by Account Top Level, Delivery Customer, Product Code, Laundry and Repair Name | customer, site, product, laundry, month, repair name |
| Laundry washed kg | Laundry_Resources: `washed_kg` | WWS Washed Kg | laundry, month |
| Laundry water, energy, emissions | Laundry_Resources | Workwear laundry environmental impact comparison (calculator) | laundry, month |
| Textile waste by route | Waste_Circularity | Textile waste kg | laundry, month |
| Alternative-laundry per-kg values | Baselines | same calculator's scenario factors | baseline id |
| Product footprint, purchase cost | Products | approved product footprints and item master | product |
| Customer, site, industry | Customers, Sites | customer hierarchy (Account Top Level → Delivery Customer) | customer, site |

## 2. How the prototype is built to take real data

- The pack path is one setting: `LANKA_PACK=/path/to/export.xlsx npm run ui`. Sheet and column names are validated on load; a missing sheet or column stops the load with a clear message, and a non-numeric cell names its row.
- Every source keeps its sheet and cell, so a real export can be traced the same way.
- Unmapped rows (a site or product not in master data) are counted and shown, not dropped.
- Real exports from Tableau, Power BI, Excel or eLindström would be mapped to the same column names by a small adapter; the measures, observations, dashboard and deck would not change.
- Customers, sites, products, laundries and periods are data, not code: a larger multi-site customer or another country adds rows, not logic. A full-year NorthStar build takes about 0.2 s after a 0.6 s file read.
- The 12-month, calendar-year window is a constant in `src/pack/build.ts`; a rolling or fiscal window is the main structural change needed.

## 3. Gaps that block a real customer review

| Gap | Why it matters | What would close it |
|---|---|---|
| **Customer hierarchy and site mapping** | The prototype assumes a clean parent → site tree. Real accounts have several delivery customers, renames and merges. | Account Top Level → Delivery Customer mapping with validity dates |
| **Wearer identity** | Active wearers can only be a proxy (highest product count). | a de-duplicated wearer count per site and month, or an approved definition |
| **Service price / invoice data** | No true cost or value-for-money view is possible. | contract and invoice lines per customer and site |
| **Customer-level water, energy, emissions** | Today allocated by washed-kg share from laundry totals. | metered or calculator output per customer and laundry route |
| **Approved baseline factors** | The alternatives are illustrative values; the ±20 % band is ours. | approved factors per country and service line, with ranges |
| **Emission factors for waste routes** | Waste can be shown in kg only. | factors per treatment route and market |
| **Product footprints** | Synthetic and low confidence. | approved product footprint per product code |
| **Repair → avoided replacement evidence** | The handprint rests on "one repair, one replacement". | observed replacement rates for repaired vs. unrepaired items |
| **Delivery distances and routing per customer** | Delivery emissions are laundry-level. | route or distance data per site |
| **Late-cycle reasons** | The review can say a site is late, not why. | reason codes on the delivery report |
| **Multi-year history** | No trend beyond the year, no before/after for agreed actions. | at least two years of the same exports |
| **Data approval and access** | Real figures need an owner and sign-off before customer use. | named data owner per source; approval before external use |

## 4. Path to the longer-term product

1. Swap the synthetic pack for an approved export with the same shape (one customer first).
2. Close the hierarchy and wearer gaps; add price data to give cost a real meaning.
3. Replace illustrative baselines and factors with approved ones; keep the low/base/high view, with approved ranges.
4. Keep the evidence chain: each figure still opens to its source row, which is what makes a customer-facing number defensible.
5. Move the dashboard behind eLindström as a customer-value module; keep the deck export for steering committees.
