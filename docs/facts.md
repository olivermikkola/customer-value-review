# Generoidut luvut

> Tämä tiedosto on tuotettu komennolla `npm run facts`. Älkää muokatko käsin —
> älkääkä lainatko pitchiin lukuja muualta kuin täältä.

| Suure | Q3 2024 | Q3 2025 | Muutos | Luottamus |
|---|---|---|---|---|
| Pesty pyykki | 36 100 kg | 38 400 kg | 6,4 % | mitattu |
| Mattopyykki | 8 900 kg | 13 000 kg | 46,1 % | mitattu |
| Vedenkulutus | 3 472 m³ | 4 210 m³ | 21,3 % | mitattu |
| Veden ominaiskulutus | 0,0962 m³/kg | 0,1096 m³/kg | 14,0 % | mitattu |
| Veden päästöt | 1 180 kgCO₂e | 1 431 kgCO₂e | 21,3 % | arvioitu |
| Palvelulaskutus | 71 114 € | 78 264 € | 10,1 % | mitattu |
| Katoamisen kustannus | 4 182 € | 6 154 € | 47,2 % | mitattu |

## Juokseva tarina

- Veden kokonaismuutos: **738 m³**
- Mattotiheyden osuus: **53,4 %** (394 m³)
- Selittämätön osa: **344 m³** — syy: hypoteesi, ei vahvistettu
- Korjaussuhde: 4,2 pp (13,1 % → 17,2 %)
- Vältetty vesi vs. oma pesula: **8 078 m³** (luottamus: proxy)

## Väitteet

| Väite | Arvo | Luottamus | Materiaalisuus |
|---|---|---|---|
| `clm:water-intensity-up` | 13,99 % | measured | 0,47 |
| `clm:water-volume-up` | 21,26 % | measured | 0,53 |
| `clm:linen-up` | 6,37 % | measured | 0,32 |
| `clm:mat-up` | 46,07 % | measured | 0,77 |
| `clm:cost-up` | 10,05 % | measured | 0,40 |
| `clm:loss-cost-up` | 47,15 % | measured | 0,94 |
| `clm:repair-rate-up` | 4,17 pp | measured | 0,42 |
| `clm:co2-up` | 21,26 % | estimated | 0,53 |
| `clm:water-avoided` | 8 078,00 m3 | proxy | 0,40 |
| `clm:water-attribution` | 53,43 % | measured | 0,53 |
| `clm:water-unattributed` | 343,67 m3 | measured | 0,34 |
| `clm:water-q4` | 3 902,00 m3 | measured | 0,98 |
| `clm:intensity-counterfactual` | 0,1112 m3/kg | estimated | 1,00 |

## Kerroin, joka on heikoin lenkki

`fac:counterfactual-laundry-water@v1` = 0,32 m³/kg on **proxy**, ei mittaus.
Kaikki "vältetty vesi" -väitteet periytyvät siitä. Validointi ennen ulkoista
käyttöä on pakollinen — juuri siksi luottamustaso näytetään käyttäjälle.
