# Customer Value Review (Since AI Hackathon 2026, Lindström challenge)

A customer-level value and sustainability review for a fictional multi-site customer, built on the
official synthetic data pack. **All data is synthetic; nothing here is audited or real Lindström performance.**

```bash
npm install
npm run ui        # http://localhost:5173  (reads data/pack/*.xlsx, refuses to start if any number fails to recompute)
npm run pack      # prints NorthStar's headline numbers and reconciles them with the pack's own Customer_Impacts sheet
npm run check     # typecheck + tests + verify
```

- `src/pack/` reads the xlsx, builds the verifiable ledger (Excel cell → source → measure → site → customer), the view model and the rule-generated observations.
- `web/index.html` is the dashboard. Every figure opens its evidence chain; every figure carries a status (synthetic, calculated, allocated, estimated).
- To use an approved export instead of the synthetic pack: `LANKA_PACK=/path/to/export.xlsx npm run ui` (same sheet and column names).
- **Ask this review (any modern browser, no GPU).** The question box understands a question and answers it from the figures. `src/pack/answer.ts` holds about 25 intents (topics the review covers, forms such as "which site is worst", and things the data cannot answer, each with the module that would). A small embedding model in the browser (`web/intent.js`, bge-small, 34 MB, CPU only) scores how close the question is to each intent's example phrasings; word patterns and entity detection (sites without accents, Q1-Q4, baseline, "worst/best") are added to that. The answer is composed from the view's own cells, so every figure links to its ledger evidence, the same question gives the same answer, and nothing is generated. A question that matches nothing well gets "not sure" and real questions to try; each answer shows how it was read and lets the reader choose another reading. Without the model it falls back to keywords. Measured with `scripts/answer-eval.ts` on 39 questions written after tuning and not used for it: right intent 77% with the model vs 56% on keywords alone, and the wrong ones are mostly neighbouring topics or a "can't answer" that should have been an answer. With a CPU slowed 6x, the model is ready in 14 s and a question takes 0.25 s.
- **On-device AI (optional, WebGPU).** `web/narrate.js` runs a small model (Ternary Bonsai 2) in the browser. It rewrites the findings in plain words. It never computes: it is handed the figures of one finding and may only restate them. `src/pack/narrate.ts` is the checker: every figure must be one it was given, an estimate must be called an estimate, and causes, overclaims, copied fact layouts and sites outside the facts are refused. After a refused answer the model gets one retry; after that the rules-written sentence is shown, marked "Rules". Without WebGPU everything else still works, including the question box above. `npm run models` downloads the weights once for offline demos; `npm run models -- --light` fetches only the question model (about 90 MB).
  - `node scripts/review-ai-run.mjs write CUST001 water` and `... ask "question"` run the real model in headless Chrome (`PORT=… npm run ui` first); `node scripts/review-ai-eval.mjs` measures acceptance across every customer and priority.
- The earlier Finnish concept demo and its browser-model experiments live at `/legacy` and are described below.

---

# LANKA — elävä asiakaskatsaus

Hackathon-konsepti Lindströmin haasteeseen: *"What value did we actually create?"*

> **Jaettu katsaustila, jossa jokainen luku on jäljitettävissä tapahtumaan,
> jokainen havainto päättyy mitattavaan sitoumukseen, ja katsaus mukautuu
> siihen kuka sitä lukee.**

## Miksi

Arvo ei ole luku. Arvo on **vertailu + todiste + teko**. Nykymuotoinen
kvartaaliraportti tuottaa sivuja, ei päätöksiä. LANKA tekee katsauksesta
silmukan: havainto → selitys → päätös → mitattu vaikutus.

Ratkaiseva arkkitehtoninen valinta: **kielimalli ei koskaan laske.**
Laskenta on deterministinen ja ajetaan ennen mallia. Malli saa vain sanoittaa
validoituja väitteitä, joilla on ID. Validaattori hylkää lähteettömät luvut,
perusteettomat kausaliteetit ja ylisanat ilman vertailudataa.

## Dokumentit

| | Sisältö | Kenelle |
|---|---|---|
| [`docs/01-pitch.md`](docs/01-pitch.md) | Yhden rivin konsepti, hissipuhe, 9 dian runko, neljän pilarin mappaus, 8 vaikeaa kysymystä | Koko tiimi |
| [`docs/02-data-model-and-validator.md`](docs/02-data-model-and-validator.md) | Provenienssiverkko (Source → Measure → Claim → Observation → Commitment), skeemat, 10 validaattorisääntöä, referenssitoteutus, toteutusjärjestys | Rakentajat |
| [`docs/03-demo-script.md`](docs/03-demo-script.md) | 5 min / 3 min / 90 s käsikirjoitukset, roolijako, rehearsal-checklist, failover | Esittäjät |

## Neljä pilaria (Lindströmin oma kriteeristö)

| Briefin sana | Toteutus |
|---|---|
| Personalised analytics | Sama totuus, kolme linssiä: vastuullisuus / tasapainoinen / talous |
| Traceable calculations | Klikkaus väitteestä → kaava → raakatapahtuma, kerroinversio näkyvissä |
| Decision support | Jokainen havainto → ehdotus + vaikutusarvio + trade-off |
| Interfaces | Katsaus on jaettu tila, ei PDF |

## Mitä on rakennettu

Koko silmukka on pystyssä: deterministinen seed-datasetti,
`Source → Measure → recompute` -ketju, väitteet, syy-reunat, validaattori,
katsauksen ranking, **recommendation → commitment → mitattu tulos**, ja
selaimessa toimiva UI kolmella linssillä.

```bash
npm install
npm run check      # typecheck + 35 testiä + verify
npm run ui         # http://localhost:5173 — /data.json rakennetaan joka pyynnöllä
npm run seed       # kirjoittaa seed/customer.json (243 lähdettä, 6 toimipistettä, 3 kvartaalia)
npm run facts      # kirjoittaa docs/facts.md — ainoa paikka josta lukuja lainataan
npm run review     # kolme havaintoa + todisteketju + hyväksytty/hylätty narratiivi
npm run review sustainability   # sama data, vastuullisuuslinssi
```

```
src/
  model.ts       tyypit: Source, Factor, Measure, Claim, Driver, Observation, Recommendation, Commitment
  expr.ts        turvallinen laskin (+ - * / sulut), ei eval:ia
  seed/plan.ts   asiakkaan luvut — yksi totuuden lähde (3 kvartaalia)
  seed/generate.ts  deterministinen generaattori
  ledger.ts      mittarit kaavoineen, recompute, 1e-9 toleranssi
  claims.ts      väitteet johdantoineen + syy-reunat
  validator.ts   10 sääntöä, slottipohjainen renderöinti
  review.ts      ranking, claim budget, linssit
  actions.ts     vaihtoehdot, accept, progress (mitattu tulos)
  export.ts      koko UI-payload, esilaskettu ja esivalidoitu
  server.ts      nollariippuvuuksinen http-palvelin
  assemble.ts    build tai kaadu
web/               index.html + style.css + app.js (ei kehyksiä)
tests/             35 testiä: luvut, portti, silmukka ja UI (jsdom)
seed/customer.json   generoitu datasetti (commitoitu, jotta demo on deterministinen)
docs/facts.md        generoidut luvut — älä muokkaa käsin
```

Viisi asiaa jotka koodi todistaa eikä väitä:

1. **Jokainen luku lasketaan uudelleen** kaavastaan ja syötteistään (`npm run verify`).
2. **53 % on dataa, ei käsikirjoitusta.** Se tulee kaavasta
   `(mat_delta × baseline_intensity) / water_delta`. Muuta mattotiheyttä, luku muuttuu.
3. **Portti hylkää oikeasti.** Testi muuttaa väitteen 13,99 % → 14,00 % ja
   validaattori torjuu lauseen `RECOMPUTE_MISMATCH`:lla.
4. **Vastatarkistus kumoaa intuitiivisen selityksen.** Ilman mattotiheyden nostoa
   ominaiskulutus olisi ollut 0,1112 m³/kg — korkeampi kuin toteutunut 0,1096.
   Matto ei siis selitä ominaiskulutuksen nousua, ja UI sanoo sen ääneen.
5. **Sitoumus mitataan, ei oleteta.** Q4:n toteuma −9,2 % ylittää −8 %:n tavoitteen;
   `progress()` laskee sen mittareista, ei ehdotuksen lupauksesta.

## Kielimalli selaimessa (edge AI)

Katsauksen tekstin voi kirjoittaa pieni kielimalli **käyttäjän omassa selaimessa**
(WebGPU): Prism ML:n Ternary Bonsai 2 4B, n. 0,95 Gt, ladataan kerran Hugging Facesta
ja välimuistitetaan. Moottori on `web/vendor/bonsai.js` (PrismML-Eng/Talk `kernels.ts`,
Apache-2.0, ks. `web/vendor/BONSAI-*`).

Malli ei laske eikä näe raakadataa. Se saa yhden havainnon kerrallaan valmiine
lukuineen ja saa vain kopioida ne. `slotify` sitoo jokaisen kopioidun luvun takaisin
väitteeseensä; luku joka ei täsmää on `UNSOURCED_NUMBER`. Jokainen lause menee saman
portin läpi kuin käsin kirjoitettu. Jos malli epäonnistuu kahdesti, lause tulee
pohjasta, ja UI merkitsee kumpi kirjoitti (AI / pohja).

**Kysy katsaukselta:** asiakas tai KAM kysyy omin sanoin. Koodi (ei malli) päättää
mitkä väitteet kysymys koskee (`src/ask.ts`). Toinen pieni malli selaimessa
(EmbeddingGemma 300M, ~195 Mt, `web/semantic.js`) lukee kysymyksen merkityksen ja
järjestää sanalistojen löytämät aiheet; se ei koskaan tuo aihetta, jota kysymys ei
maininnut, eikä päätä vastataanko. Mitattu 40 sokkokysymyksellä
(`node scripts/ask-eval.ts`): oikea fakta ensin 27 → 32 / 40. Kielimalli muotoilee vastauksen,
portti tarkistaa, ja jokaisesta luvusta pääsee todisteeseen. Vertailu muihin tai
aihe jota datassa ei ole → rehellinen "ei todennettua dataa".

```bash
npm run ui                                  # kysymyskenttä + nappi "Kirjoita selaimessa"
node scripts/edge-run.mjs ask "Miksi vedenkulutus nousi?"   # kysymys headless-Chromessa
node scripts/edge-run.mjs balanced 4B       # sama headless-Chromessa, tulostaa tuloksen
npm run write                               # sama silmukka palvelimella (OpenAI-yhteensopiva, LLM_URL/LLM_MODEL)
```

**Ilman nettiä (demo):** `npm run models` lataa kerran kaikki mallit kansioon
`models/` (~1,2 Gt, ei gitissä), ja palvelin jakaa ne itse. Sivu ei silloin hae mitään
internetistä — todistettu `node scripts/offline-check.mjs`: tyhjä selainprofiili, kaikki
localhostin ulkopuoliset pyynnöt estetty. **WebGPU toimii vain `localhost`issa tai HTTPS:llä**,
joten demo ajetaan esityskoneella itsellään, ei toisen koneen osoitteesta.

**Kun dataa ei ole:** vastaus kertoo rehellisesti "ei todennettua dataa" ja nimeää
Lindströmin oman lisämoduulin, joka vastaisi (nimet heidän esimerkkidashboardistaan):
toimitukset → *Transparency & control*, vertailu → *Performance reporting & benchmarking*,
ennusteet → *Predictive & AI-assisted insights*, ESG/auditointi → *Sustainability &
compliance intelligence*. Jos mikään ei sovi, moduulia ei keksitä.

Moottorin päivitys: `npx esbuild <Talk>/kernels.ts --bundle --format=esm --minify --outfile=web/vendor/bonsai.js`.

## Linssit

Sama data, sama totuus, eri järjestys. Tämä ratkaisi rehellisyysongelman: kustannus
on euromääräisesti suurin, joten tasapainoinen linssi nostaa sen kärkeen. Vastuullisuus-
linssi nostaa veden. Kumpikaan ei ole väärässä, ja lukuja ei ole viritetty.

## Seuraavaksi

- LLM-kerros: malli saa vain sijoittaa slotteja `[[clm:id]]` ja `{{drv:id}}`.
- Vertaisdata: vasta usean asiakkaan jälkeen "olette 12 % alueen keskiarvoa parempia"
  on todistettavissa.
- Sitoumushistoria: useampi kvartaali peräkkäin, jolloin silmukka näyttää trendin.
