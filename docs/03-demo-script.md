# (c) Demo-käsikirjoitus

Oletus: 5 minuuttia, kaksi puhujaa (**A** = demo-ohjaaja, **B** = kertoja).
Kaikki luvut ovat samat kuin `02-data-model-and-validator.md` — älkää vaihtako niitä.

## Ennen esitystä: deterministinen seed

Demo kaatuu jos data elää. Lukitkaa:

- [ ] Seedattu datasetti commitoitu repoon (`seed/q3.json`)
- [ ] Laskenta ajettu etukäteen, tulokset tallennettu — UI lukee tallennetut, ei laske lennossa
- [ ] LLM-narratiivi **kahdessa moodissa**: live ja `cached/` (sama sisältö, validaattori ajettu läpi)
- [ ] Verkkoyhteys ei ole missään kriittisessä polussa
- [ ] Selaimessa vain tämä yksi tabi, zoom 110 %, ei kirjanmerkkipalkkia
- [ ] Varavideo tallennettu (ks. "kun kaikki kaatuu")

---

## 5 minuutin versio

### 0:00–0:25 — Kysymys (ei diaa, ei logoa)

**B:** "Lindströmin haaste alkaa yhdellä kysymyksellä. *Mitä arvoa me oikeasti loimme?*"
*(tauko — kaksi sekuntia, anna sen laskeutua)*
"Me väitämme, että se ei ole raportointiongelma. Se on todistusongelma."

> **Miksi näin:** älkää aloittako itsestänne. Aloittakaa heidän lauseestaan.

### 0:25–0:50 — Uudelleenkehystys (dia 2)

**B:** "Arvo ei ole luku. 'Vettä kului 4 210 kuutiota' ei ole arvoa — se on mittari.
Arvosta tulee arvoa vasta kun vastaat kolmeen asiaan: *verrattuna mihin*, *mistä se
tiedetään*, ja *mitä sille voi tehdä*. Me rakensimme nämä kolme sisään tuotteeseen,
emme dioihin."

*(dia: kolme saraketta — Vertailu | Todiste | Teko)*

### 0:50–1:20 — Konteksti ja avaus

**A:** *(jakaa näytön, avaa LANKA)*
"Tämä on ravintolaketju, kuusi toimipistettä, yksi kvartaali. Katsaus avautuu
kolmeen havaintoon — ei neljäänkymmeneen sivuun. Järjestelmä on jo rankannut ne:
materiaalisuus × uutuus × tehtävyys."

*(näkyy: 3 korttia. Kortti 1 = vesi, kortti 2 = hävikki, kortti 3 = korjaussuhde)*

### 1:20–2:20 — Havainto 1: kolme syvyyttä

**A:** "Ensimmäinen: veden ominaiskulutus nousi 13,9 prosenttia."

*(klikkaa korttia → taso 2: kaava ja luvut)*
"Neljä tuhatta kaksisataakymmenen kuutiota jaettuna 38 400 kilolla pyykkiä.
Kerroin on versioitu — v3, Espoon pesulan mittaridata. Vertailujakso on sama
kvartaali vuosi sitten: 0,096."

**A:** *(klikkaa "miksi?" → taso 3: driver)*
"Ja tässä tärkein kohta koko demossa. Järjestelmä sanoo: mattotiheyden nosto kahdella
toimipisteellä selittää **noin 53 prosenttia**. Ei sata. Loput 344 kuutiota ajoittuu
pesulan vajaiden kuormien jaksoon — ja se lukee ruudulla sanoilla *syytä ei ole
vahvistettu*."

**B:** "Se myönnytys on tuote. Katsaus joka selittää kaiken on katsaus jota kukaan
ei usko kolmatta kvartaalia."

### 2:20–2:50 — Validaattori (15 s, iso vaikutus)

**A:** "Mutta entä jos kielimalli yrittää kaunistella? Kokeillaan."
*(kirjoittaa kyselykenttään: "Kerro miksi vesi nousi")*

*(ruudulle ilmestyy punainen kortti: `UNSUPPORTED_CAUSAL` — "väitteellä
clm:water-intensity-up-q3 ei ole vahvistettua syy-yhteyttä")*

**A:** "Hylätty. Malli ei saa sanoa 'johtui' ilman eksplisiittistä syy-reunaa.
Se saa sanoa 'ajoittuu samaan aikaan'. Tämä ei ole kauneusvirhe — tämä on
greenwashing-suoja, ja se on sama sääntö jota EU:n green claims -vaatimukset
käytännössä pyytävät."

### 2:50–3:40 — Trade-off ja ansa

**A:** *(avaa trade-off explorerin)*
"Kolme vaihtoehtoa. A: pudota mattotiheys takaisin kahteen kertaan viikossa —
vesi alas neljä prosenttia, mutta palvelutaso laskee ja liukastumisriski nousee.
C: vaihda kevyempään mattoon — vesi alas kuusi prosenttia."

**B:** "C näyttää voitolta. Mutta katso toista saraketta."

**A:** *(osoittaa)*
"Kevyempi matto kestää 20 prosenttia vähemmän pesuja. Elinkaaren CO₂ nousee
kahdeksan prosenttia. Järjestelmä merkitsee sen itse: *rebound-vaikutus*."

**A:** "Valitaan B: säilytetään tiheys, optimoidaan eräkoko. Vesi alas 9,2 prosenttia,
palvelutaso ennallaan, ei lisäkustannusta."

### 3:40–4:10 — Sitoumus ja silmukka

**A:** *(klikkaa "hyväksy")*
"Tästä tulee sitoumus. Baseline tallennettu, tavoite −8 prosenttia, seurantapäivä
seuraava katsaus."

*(hyppää ajassa eteenpäin — nappi "siirry Q4:ään")*
"Ja tässä se mikä erottaa katsauksen raportista: **mitattiin**. −9,2 prosenttia,
palvelutaso ennallaan, sitoumus suljettu."

**B:** "Katsaus ei ole dokumentti. Se on silmukka, joka sulkeutuu vasta kun vaikutus
on mitattu."

### 4:10–4:35 — Arkkitehtuuri (dia 6)

**B:** "Yksi asia arkkitehtuurista, koska se ratkaisee uskottavuuden:
**kielimalli ei koskaan laske eikä tuota lukua.** Laskenta on deterministinen ja
ajetaan ennen mallia. Malli saa valita ja sanoittaa väitteitä, joilla on ID.
Validaattori tarkistaa jokaisen lauseen kymmentä sääntöä vasten — lähteetön luku,
perusteeton kausaliteetti ja ylisana ilman vertailudataa hylätään."

*(dia: `Source → Measure → Claim → Narrative`, validaattori porttina)*

### 4:35–5:00 — Lopetus (dia 9)

**A:** "Neljä asiaa jotka briefissä pyydettiin: personoitu analytiikka, jäljitettävä
laskenta, päätöksentuki, käyttöliittymä. Tässä ne ovat yksi silmukka, ei neljä
ominaisuutta."

**B:** "Ja yksi asia jota kukaan muu ei voi tehdä: vertaisdata. Vasta kun Lindströmillä
on satoja asiakkaita samassa järjestelmässä, se voi sanoa *'te olette 12 prosenttia
alueen vastaavia parempia'* — ja todistaa sen. Se on teidän vallihautanne, ei meidän."

**B:** "Katsaus, joka ei raportoi menneisyyttä, vaan neuvottelee tulevaisuudesta.
Kiitos."

---

## 3 minuutin versio

Pudota tarkalleen tämä, tässä järjestyksessä:

1. Dia 2 → yhdeksi lauseeksi ("arvo on vertailu, todiste ja teko")
2. Validaattori-beat 2:20–2:50 → lyhennä 10 sekuntiin: näytä pelkkä punainen
   hylkäyskortti, älä selitä sääntöjä
3. Trade-off → näytä vain B ja C, yksi lause reboundista
4. Arkkitehtuuri → yksi lause: "kielimalli ei laske"
5. Lopetus → jätä vertaisdata pois, pidä "silmukka" -lause

Säilytä ehdottomasti: **53 % -myönnytys** ja **mitattu tulos**. Ne ovat kaksi
kohtaa jotka muistetaan.

## 90 sekunnin versio (hissi tai tuomariston pöydässä)

> "Kysymys 'mitä arvoa loimme' on todistusongelma, ei raportointiongelma.
> Me teimme katsauksesta elävän tilan: AI nostaa kolme olennaista havaintoa,
> jokainen avautuu väitteestä laskentaan ja raakatapahtumaan, ja jokainen päättyy
> sitoumukseen jota mitataan seuraavassa jaksossa. Kielimalli ei koskaan laske —
> validaattori hylkää lähteettömät luvut ja perusteettomat kausaliteetit, ja
> demossa se sanoo itse selittävänsä vain 53 prosenttia noususta. Se myönnytys
> on tuote. Siksi tämä on uskottava, ei vain vaikuttava."

---

## Roolijako

| | A (ohjaaja) | B (kertoja) |
|---|---|---|
| Tehtävä | Klikkaa, puhuu UI:sta | Kehystää, puhuu merkityksestä |
| Rytmi | Lyhyet toteavat lauseet | Yksi iso lause per beat |
| Sääntö | Älä selitä arkkitehtuuria | Älä koske hiireen |

Jos olette yksin: pidä B:n lauseet, ne ovat ne jotka jäävät mieleen. A:n
klikkaukset voi hoitaa hiljaisuudessa.

## Rehearsal-checklist

- [ ] Kello kädessä, kolme läpimenoa, tavoite 4:45 (jätä 15 s ilmaa)
- [ ] Jokainen klikkaus tehty 20 kertaa — ei etsimistä ruudulta
- [ ] "53 prosenttia" sanotaan samalla tavalla joka kerta
- [ ] Yksi harjoitus jossa jokin klikkaus epäonnistuu — jatka siitä huolimatta
- [ ] Kysymys-vastaus: 8 vaikeaa kysymystä (`01-pitch.md`) läpi ääneen
- [ ] Kukaan ei sano "meillä oli vain 24 tuntia" — se on tekosyy, ei konteksti

## Kun kaikki kaatuu

**Prioriteettijärjestys:** live-demo → cached-narratiivi → varavideo → pelkät diat + puhe.

Jos UI ei avaudu 10 sekunnissa: älä debuggaa lavalla. Sano "näytetään tallenne"
ja jatka. Kukaan ei muista että se oli tallenne; kaikki muistavat 40 sekunnin
säätämisen.

Jos LLM ei vastaa: cached-narratiivi on identtinen, validaattori on jo ajettu sen
läpi. Ero ei näy kenellekään.

Jos joku kysyy lennossa jotain jota data ei tue: **älkää improvisoiko lukua.**
"Tuota ei ole tässä datasetissä" on vahvempi vastaus kuin keksitty numero —
ja se on koko pitchin teesi.

## Mitä EI näytetä

- Ei login-ruutua, ei asetuksia, ei tyhjää tilaa, ei latausanimaatiota yli 1 s
- Ei koodia ruudulla (paitsi jos tuomari pyytää — silloin validaattori, 15 s)
- Ei "tämä on prototyyppi" -disclaimeria alussa. Sanokaa se vasta kysymyksissä.
- Ei vertailua muihin tiimeihin.

## Demo-datan istutettavat tarinat (vähimmäismäärä)

1. **Vesipiikki** jolla on osittainen syy (53 %) ja nimeämätön loppuosa ← päädemo
2. **Kustannusnousu** jonka syy on yhden toimipisteen katoavat vaatteet ← kortti 2
3. **Onnistuminen** jossa korjaussuhde nousi ja elinikä piteni ← kortti 3, vastapaino
   sille että kaikki havainnot olisivat ongelmia

Kolmas on tärkeä: katsaus joka löytää vain ongelmia tuntuu auditoinnilta.
