# (c) Demo-käsikirjoitus

Oletus: 5 minuuttia, kaksi puhujaa (**A** = demo-ohjaaja, **B** = kertoja).
Kaikki luvut ovat samat kuin `02-data-model-and-validator.md` — älkää vaihtako niitä.

## Ennen esitystä: deterministinen seed

Demo kaatuu jos data elää. Lukitkaa:

- [ ] Seedattu datasetti commitoitu repoon (`seed/customer.json`)
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

*(näkyy: 3 korttia. Oletuslinssi on vastuullisuus, joten vesi on kärjessä)*

**A:** "Oletus on vastuullisuuslinssi: kärjessä on vesi. Vaihdetaan talouslinssiin —
sama data, sama totuus, eri järjestys."

*(klikkaa linssiä. Kortit järjestyvät uudelleen: katoaminen nousee ensimmäiseksi)*

**A:** "Kumpikaan järjestys ei ole väärä. Painotus on lukijan, ei toimittajan."

### 1:20–2:05 — Havainto 1: kolme syvyyttä

**A:** "Vastuullisuuslinssillä ensimmäinen: veden ominaiskulutus nousi 14,0 prosenttia."

*(klikkaa korttia → taso 2: kaava ja luvut)*
"Neljä tuhatta kaksisataakymmenen kuutiota jaettuna 38 400 kilolla pyykkiä.
Kerroin on versioitu — v3, Espoon pesulan mittaridata. Vertailujakso on sama
kvartaali vuosi sitten: 0,0962."

*(vierittää Vastatarkistus-korttiin)*
"Ja tässä tärkein kohta koko demossa. Intuitio sanoo: mattoja pestiin enemmän,
siksi ominaiskulutus nousi. Järjestelmä laskee vastatarkistuksen: ilman
mattotiheyden nostoa ominaiskulutus olisi ollut **0,1112** — korkeampi kuin
toteutunut 0,1096. Matto ei siis selittänyt nousua. Se oli nousun vastavoima."

### 2:05–2:50 — Missä selitys loppuu

**A:** *(avaa kolmannen kortin, Veden kokonaiskulutus)*
"Kokonaiskulutus sentään selittyy osin: mattotiheyden nosto kahdella toimipisteellä
selittää **53,4 prosenttia** noususta. Ei sata. Loput 344 kuutiota ajoittuu
pesulan vajaiden kuormien jaksoon — ja se lukee ruudulla sanoilla *syytä ei ole
vahvistettu*."

**B:** "Se myönnytys on tuote. Katsaus joka selittää kaiken on katsaus jota kukaan
ei usko kolmatta kvartaalia."

### 2:50–3:20 — Validaattori (15 s, iso vaikutus)

**A:** "Mutta entä jos kielimalli yrittää kaunistella? Kokeillaan."
*(klikkaa kysymysnappia: "Ollaanko me parempia kuin muut?")*

*(ruudulle ilmestyy punainen kortti: `UNSUPPORTED_SUPERLATIVE` — ylisana ilman
vertailudataa)*

**A:** "Hylätty. Malli ei saa sanoa 'parempi kuin muut', koska meillä ei ole
vertaisdataa. Se saa sanoa vain sen minkä pystymme todistamaan. Tämä ei ole
kauneusvirhe — tämä on greenwashing-suoja, ja se on sama sääntö jota EU:n
green claims -vaatimukset käytännössä pyytävät."

### 3:20–3:55 — Trade-off ja ansa

**A:** *(avaa trade-off explorerin)*
"Kolme vaihtoehtoa. A: pudota mattotiheys takaisin kahteen kertaan viikossa —
vesi alas 9,4 prosenttia, mutta palvelutaso laskee ja liukastumisriski nousee.
C: vaihda kevyempään mattoon — vesi alas kuusi prosenttia."

**B:** "C näyttää voitolta. Mutta katso toista saraketta."

**A:** *(osoittaa)*
"Kevyempi matto kestää 20 prosenttia vähemmän pesuja. Elinkaaren CO₂ nousee
kahdeksan prosenttia. Järjestelmä merkitsee sen itse: *rebound-vaikutus*."

**A:** "Valitaan B: säilytetään tiheys, optimoidaan eräkoko. Tavoite −8 prosenttia
ominaiskulutuksessa, palvelutaso ennallaan, ei lisäkustannusta."

### 3:55–4:25 — Sitoumus ja silmukka

**A:** *(klikkaa "hyväksy ja seuraa")*
"Tästä tulee sitoumus. Baseline tallennettu, tavoite −8 prosenttia, seurantapäivä
seuraava katsaus."

*(hyppää ajassa eteenpäin — nappi "siirry Q4:ään")*
"Ja tässä se mikä erottaa katsauksen raportista: **mitattiin**. −9,2 prosenttia,
tavoite ylitetty, palvelutaso ennallaan."

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
2. Validaattori-beat → lyhennä 10 sekuntiin: näytä pelkkä punainen
   hylkäyskortti (`UNSUPPORTED_SUPERLATIVE`), älä selitä sääntöjä
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
