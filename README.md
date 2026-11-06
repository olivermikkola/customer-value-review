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

```bash
npm run ui                                  # nappi "Kirjoita selaimessa"
node scripts/edge-run.mjs balanced 4B       # sama headless-Chromessa, tulostaa tuloksen
npm run write                               # sama silmukka palvelimella (OpenAI-yhteensopiva, LLM_URL/LLM_MODEL)
```

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
