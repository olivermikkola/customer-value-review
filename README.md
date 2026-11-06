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
| Personalised analytics | Sama totuus, neljä linssiä: CFO / vastuullisuus / työmaapäällikkö / HR |
| Traceable calculations | Klikkaus väitteestä → kaava → raakatapahtuma, kerroinversio näkyvissä |
| Decision support | Jokainen havainto → ehdotus + vaikutusarvio + trade-off |
| Interfaces | Katsaus on jaettu tila, ei PDF |

## Mitä on rakennettu

Ydin on pystyssä: deterministinen seed-datasetti, `Source → Measure → recompute`
-ketju, väitteet, syy-reunat, validaattori ja katsauksen ranking. Ei UI:ta vielä.

```bash
npm install
npm run check      # typecheck + 27 testiä + verify
npm run seed       # kirjoittaa seed/customer.json (162 lähdettä, 6 toimipistettä)
npm run facts      # kirjoittaa docs/facts.md — ainoa paikka josta lukuja lainataan
npm run review     # kolme havaintoa + todisteketju + hyväksytty/hylätty narratiivi
npm run review sustainability   # sama data, vastuullisuuslinssi
```

```
src/
  model.ts       tyypit: Source, Factor, Measure, Claim, Driver, Observation
  expr.ts        turvallinen laskin (+ - * / sulut), ei eval:ia
  seed/plan.ts   asiakkaan luvut — yksi totuuden lähde
  seed/generate.ts  deterministinen generaattori
  ledger.ts      mittarit kaavoineen, recompute, 1e-9 toleranssi
  claims.ts      väitteet johdantoineen + syy-reunat
  validator.ts   10 sääntöä, slottipohjainen renderöinti
  review.ts      ranking, claim budget, linssit
  assemble.ts    build tai kaadu
tests/           27 testiä: luvut täsmäävät, portti pitää
seed/customer.json   generoitu datasetti (commitoitu, jotta demo on deterministinen)
docs/facts.md        generoidut luvut — älä muokkaa käsin
```

Kolme asiaa jotka koodi todistaa eikä väitä:

1. **Jokainen luku lasketaan uudelleen** kaavastaan ja syötteistään (`npm run verify`).
2. **53 % on dataa, ei käsikirjoitusta.** Se tulee kaavasta
   `(mat_delta × baseline_intensity) / water_delta`. Muuta mattotiheyttä, luku muuttuu.
3. **Portti hylkää oikeasti.** Testi muuttaa väitteen 13,99 % → 14,00 % ja
   validaattori torjuu lauseen `RECOMPUTE_MISMATCH`:lla.

## Seuraavaksi

`Recommendation` + `Commitment` (silmukka), trade-off explorer, ja UI
(`docs/03-demo-script.md` on jo spec).
