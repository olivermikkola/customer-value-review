# (b) Provenienssimalli ja claim-validaattori

Tämä on tuotteen selkäranka. Rakentakaa tämä ensin; kaikki muu nojaa siihen.

## Perusajatus

Yksikään luku ei ole olemassa irrallaan. Jokainen käyttäjälle näkyvä luku on
**väite (claim)**, joka osoittaa laskentaan, joka osoittaa raakatapahtumiin ja
kertoimiin. Muodostuu suunnattu verkko (DAG):

```
Source ──┐
         ├──> Measure ──> Claim ──> Observation ──> Narrative-lause
Factor ──┘                  │            │
                            │            └──> Recommendation ──> Commitment
                            └──> Driver (syy-yhteysreuna, erillinen!)
```

Ratkaiseva ero tavalliseen datamalliin: **syy-yhteys ei ole laskenta.** Se on
erillinen, eksplisiittisesti kuratoitu reuna. Ilman sitä järjestelmä ei saa sanoa
"johtui".

## Entiteetit

### Source — raakatapahtuma tai mittaus

```ts
type Source = {
  id: string;                    // "src:laundry-espoo:water:2025-Q3"
  kind: "meter" | "delivery" | "pickup" | "wash_batch"
      | "repair" | "loss" | "assignment" | "invoice" | "hr";
  siteId?: string;
  serviceId?: string;
  period: { from: string; to: string };   // ISO date
  value: number;
  unit: string;                  // "m3", "kg", "kpl", "EUR", "h"
  granularity: "event" | "daily" | "period";
  ref: string;                   // mistä järjestelmästä, mikä dokumentti
  ingestedAt: string;
  checksum: string;              // sisällön hash → muuttumattomuus
};
```

### Factor — kerroin, jolla on lähde ja versio

```ts
type Factor = {
  id: string;                    // "fac:water-per-kg-linen"
  name: string;
  value: number;
  unit: string;                  // "m3/kg"
  version: string;               // "v3"
  validFrom: string;
  validTo?: string;
  sourceRef: string;             // "Lindström Espoo pesula, mittaridata 2025"
  kind: "measured" | "estimated" | "industry_proxy";
};
```

Kerroin on aina **versioitu ja kiinnitetty**. Katsaus tallentaa sen version jota
se käytti — muuten vanha katsaus muuttuu hiljaa vääräksi kun kerrointa päivitetään.
Tämä on yksinään hyvä myyntiargumentti Lindströmin talousihmisille.

### Measure — laskettu suure

```ts
type Measure = {
  id: string;
  metricId: string;              // "water_intensity"
  scope: { customerId: string; siteId?: string; serviceId?: string };
  period: { from: string; to: string };
  value: number;
  unit: string;
  formula: string;               // "water_m3 / linen_kg"
  bindings: Record<string, string>; // { water_m3: "mea:...", linen_kg: "mea:..." }
  inputs: string[];              // bindingsin arvot jotka eivät ole kertoimia
  factors: string[];             // ["fac:water-per-kg-linen@v3"] — aina versioitu
  confidence: "measured" | "estimated" | "proxy";  // = min(inputs)
};
```

Luottamus periytyy: `min(inputtien luottamus)`. Mittaridata + punnitustositteet →
`measured`. Toimialaproxysta johdettu vertailuluku → `proxy`, ja UI näyttää sen.

**`formula` on dataa, ei koodia.** Se evaluoidaan pienellä laskimella joka tukee
vain `+ - * / ( )` ja nimettyjä muuttujia — ei `eval`:ia, ei kirjastoja. Siksi
`npm run verify` voi laskea jokaisen luvun uudelleen eikä kenenkään tarvitse
luottaa siihen joka luvun laski.

### Claim — väite

```ts
type Claim = {
  id: string;                    // "clm:water-intensity-up"
  kind: "change" | "level" | "comparison" | "avoided_impact" | "benchmark";
  label: string;                 // havainnon otsikko
  subject: { metricId: string; scope: Scope };
  measureIds: string[];          // mitä laskelmia väite käyttää
  /** Miten stated.value johdetaan. Deterministinen, ei LLM:n asia. */
  derivation:
    | { kind: "level"; measureId: string }
    | { kind: "change"; fromMeasureId: string; toMeasureId: string }
    | { kind: "delta"; fromMeasureId: string; toMeasureId: string }   // esim. pp
    | { kind: "comparison"; measureId: string; benchmarkMeasureId: string };
  stated: { value: number; unit: string; direction: "up" | "down" | "flat" };
  benchmarkMeasureId?: string;   // pakollinen kind === "comparison" | "benchmark"
  confidence: "measured" | "estimated" | "proxy";
  materiality: number;           // 0..1 — paljonko tämä liikuttaa rahaa/CO2:ta
};
```

`derivation` on koko validaattorin perusta: se kertoo miten `stated.value`
**pitää** laskea. V4 vertaa mallin esittämää lukua tähän, ei mihinkään muuhun.

### Driver — syy-yhteysreuna (erillinen!)

```ts
type Driver = {
  id: string;
  claimId: string;               // mitä väitettä selittää
  causeRef: string;              // "event:mat-frequency-increase@site-A,site-B"
  attributedShare: number | null; // 0..1 — paljonko selittää; null = ei tiedetä
  attributedAmount: number | null;
  method: "measured" | "modeled" | "hypothesis";
  evidenceClaimIds: string[];
};
```

`attributedShare` on se luku joka tekee demosta uskottavan. Sen pitää saada olla
**alle 1.0** — ja sen pitää saada olla **`null`**. Jos järjestelmä pakotetaan
selittämään 100 %, se valehtelee.

### Observation → Recommendation → Commitment

```ts
type Observation = {
  id: string; claimId: string; driverIds: string[];
  severity: "info" | "watch" | "act";
  rank: number;                  // ks. claim budget
};

type Recommendation = {
  id: string; observationId: string;
  action: string;
  expectedImpact: { metricId: string; delta: number; unit: string }[];
  effort: "low" | "medium" | "high";
  confidence: "measured" | "estimated" | "proxy";
  tradeoffs: { metricId: string; delta: number; unit: string }[];  // mitä huononee
};

type Commitment = {
  id: string; recommendationId: string;
  acceptedBy: "customer" | "account_team" | "both";
  acceptedAt: string;
  baselineMeasureId: string;     // mitä vasten mitataan
  target: { metricId: string; delta: number; unit: string };
  reviewDate: string;
  status: "open" | "measured" | "missed";
  resultMeasureId?: string;      // täytetään seuraavassa katsauksessa
};
```

`Commitment` on koko konseptin halvin ja arvokkain osa. Se on ainoa asia joka
erottaa "raportin" "silmukasta".

## Täysi ketju — juokseva esimerkki

Tämä ketju toistuu demossa. Pitäkää luvut samoina kaikkialla.

```
src:linen-weighed:2025-Q3   38 400 kg   (punnitustositteet, measured)
src:laundry-espoo:water:2025-Q3  4 210 m3 (pesulan mittari, measured)
src:linen-weighed:2024-Q3   36 100 kg
src:laundry-espoo:water:2024-Q3  3 472 m3

mea:water-intensity:2025-Q3 = 4210 / 38400 = 0.10964 m3/kg   measured
mea:water-intensity:2024-Q3 = 3472 / 36100 = 0.09618 m3/kg   measured

clm:water-intensity-up-q3
  stated: +14.0 %   (0.10964/0.09618 - 1 = +0.1399)
  confidence: measured
```

Sitten syy:

```
event:mat-frequency-increase@site-A,site-B   (2→3 kertaa/vko, alkaen 2025-07-01)
→ lisäpyykki 4 100 kg
→ odotettu lisävesi @ 2024 intensiteetti: 4100 × 0.09618 = 394 m3
→ toteutunut lisävesi: 738 m3
→ drv:mat-frequency  attributedShare = 394/738 = 0.534   method: measured

Loput 344 m3: ajoittuu Espoon pesulan vajaiden kuormien jaksoon 2025-08.
  → drv:partial-loads  attributedShare = null, method: hypothesis  (EI lukua!)
```

Väite jonka UI näyttää:

> Veden ominaiskulutus nousi **14,0 %** (0,096 → 0,110 m³/kg).
> Mattotiheyden nosto kahdella toimipisteellä selittää noin **53 %** noususta.
> Loppuosa ajoittuu Espoon pesulan vajaiden kuormien jaksoon — syytä ei ole vahvistettu.

Kolme lausetta, kolme klikattavaa väitettä, yksi nolo myönnytys. Juuri se myönnytys
voittaa pitchin.

## Validaattori

Portinvartija mallin ja käyttäjän välissä. Syöte: mallin tuottama lausejoukko +
claim-rekisteri. Ulostulo: hyväksytyt lauseet tai hylkäys syykoodilla.

### Säännöt

| # | Sääntö | Hylkäys |
|---|---|---|
| V1 | Jokainen numeerinen token on sidottu claim-ID:hen | `UNSOURCED_NUMBER` |
| V2 | Claim → ≥1 measure → ≥1 source tai factor | `BROKEN_CHAIN` |
| V3 | Yksiköt yhteneviä, muunnos eksplisiittinen | `UNIT_MISMATCH` |
| V4 | Väitteen luku lasketaan uudelleen inputeista, \|ero\| ≤ ε | `RECOMPUTE_MISMATCH` |
| V5 | Kerroinversio kiinnitetty, ei "latest" | `UNPINNED_FACTOR` |
| V6 | Luottamus = min(inputit); UI näyttää sen | `CONFIDENCE_INFLATED` |
| V7 | Kausaalikieli ("johtuu", "koska", "aiheutti") vaatii Driver-reunan | `UNSUPPORTED_CAUSAL` |
| V8 | Superlatiivi/komparatiivi ("paras", "merkittävästi parempi") vaatii benchmark claimin | `UNSUPPORTED_SUPERLATIVE` |
| V9 | Pyöristys ei saa kääntää etumerkkiä eikä liioitella prosenttia > 0,1 pp | `ROUNDING_DISTORTS` |
| V10 | Korkeintaan N havaintoa per katsaus (claim budget) | `BUDGET_EXCEEDED` |

V7 ja V8 ovat ne joilla erotutte. Ne ovat myös suora vastaus EU:n
green claims -vaatimuksiin, eli myyntikulma eikä vain insinöörin hienous.

### Referenssitoteutus

Toteutus on repossa: [`src/validator.ts`](../src/validator.ts). Ydinajatus on
**slotti**: malli ei koskaan kirjoita numeroa, se kirjoittaa paikan.

```ts
// Malli saa tuottaa vain tällaista:
"Veden ominaiskulutus nousi [[clm:water-intensity-up]] vuoden takaiseen verrattuna."
//                                            ^^ renderöijä täyttää tämän

// [[clm:x]]        -> väitteen arvo, muotoiltuna väitteen omasta yksiköstä
// [[clm:x:0]]      -> sama, 0 desimaalia
// {{drv:mat-frequency}} -> driven label, eli dataa (ei mallin proosaa)
```

Kun numero on aina slot, V1 lakkaa olemasta mielipide ja muuttuu mekaaniseksi
tarkistukseksi: poista slotit tekstistä, ja jos jäljelle jää yksi ainoa numero,
hylkäys. Sama temppu tekee V9:stä (pyöristys) tarkistettavan.

Ulos tulee hyväksytyt lauseet ja hylkäykset **syykoodeineen**:

```ts
type Verdict =
  | { ok: true }
  | { ok: false; code: Code; sentence: string; detail: string };
```

Kaksi toteutusyksityiskohtaa joilla tämä pysyy rehellisenä:

1. **Numerot eivät ole mallin tekstiä.** Malli valitsee väitteet ja järjestyksen —
   se ei tiedä yhtään lukua eikä voi keksiä sellaista. Siksi "hallusinoitu luku"
   ei ole riski jota hallitaan, vaan tila jota ei ole olemassa.
2. **`recompute` ajetaan oikeasti.** Jos väite ei täsmää laskettuun arvoon,
   hylkäys — ei "korjata hiljaa". Hiljainen korjaus on sama kuin valehtelu
   kauniimmalla fontilla.

Testi `tests/validator.test.ts` todistaa tämän: se vaihtaa yhden väitteen arvon
13,99 % → 14,00 % ja validaattori hylkää lauseen `RECOMPUTE_MISMATCH`:lla.

### Hylkäys näytetään, ei piiloteta

Demossa kannattaa näyttää yksi hylkäys. Esim. malli yrittää kirjoittaa
"vedenkulutus kasvoi **koska** mattoja pestiin enemmän" ilman Driver-reunaa →
punainen `UNSUPPORTED_CAUSAL`. Se on 15 sekuntia ja se myy koko arkkitehtuurin.

## Claim budget — miksi katsauksessa on kolme havaintoa

```
rank = materiality × novelty × actionability
```

- `materiality`: paljonko liikuttaa euroja tai CO2:ta
- `novelty`: onko uusi tässä jaksossa (toistuva havainto kyllästyttää)
- `actionability`: onko olemassa ehdotus jolla on mitattava vaikutus

Top 3–5. Tämä on tuote­päätös, ei tekninen rajoite: katsaus jonka voi lukea
90 sekunnissa on katsaus jonka asiakas oikeasti lukee.

## API-pinta (minimi)

```
GET  /reviews/:customerId/:period            → Observations (ranked, budgeted)
GET  /claims/:id                             → Claim + Measures + Sources (koko ketju)
GET  /measures/:id                           → kaava, inputit, kertoimet versioineen
POST /reviews/:id/ask        { question }    → validoitu vastaus + käytetyt claim-ID:t
POST /recommendations/:id/accept             → Commitment
GET  /commitments?status=open                → silmukan tila
POST /reviews/:id/narrate                    → LLM + validaattori, palauttaa hyväksytyt/hylätyt
```

`POST /narrate` palauttaa sekä hyväksytyt että hylätyt lauseet. Hylätyt menevät
lokiin — se loki on teidän evaluaatioreitti myöhempään tuotteistukseen.

## Toteutusjärjestys (jos aikaa on vähän)

1. `Source` + `Factor` + `Measure` + `recompute` — 3–4 h, pakollinen
2. `Claim` + V1/V2/V4 — 1–2 h, pakollinen
3. `Observation` ranking + narratiivi + V7 — 1–2 h, tämä on demo
4. `Driver.attributedShare` — 1 h, tämä on uskottavuus
5. `Commitment` — 30 min, tämä on erottautuminen
6. V8/V9/V10 + `Recommendation` + trade-off explorer — vasta jos jää aikaa
