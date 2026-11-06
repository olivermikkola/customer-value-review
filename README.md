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

## Tila

Konsepti ja spesifikaatio valmiina. Seuraava askel: seed-datasetti ja
provenienssikerros (`Source` → `Measure` → `Claim` → `recompute`), jonka päälle
narratiivi ja UI.
