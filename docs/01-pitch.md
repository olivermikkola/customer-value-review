# (a) Pitch

## Nimi

**LANKA** — elävä asiakaskatsaus. (Kansainvälinen variantti: **LOOM**.)

Nimi toimii koska metafora on koko tuote: sadat irralliset tapahtumat ovat lankoja,
katsaus on niistä kudottu kangas — ja kangasta voi aina purkaa takaisin langoiksi.
Se on myös teidän tekninen lupauksenne (traceability) sanottuna yhdellä sanalla.

## Yhden rivin konsepti

> **LANKA on jaettu katsaustila, jossa jokainen luku on jäljitettävissä tapahtumaan,
> jokainen havainto päättyy mitattavaan sitoumukseen, ja katsaus mukautuu siihen
> kuka sitä lukee.**

## Kolme pituutta

**7 sanaa:**
Asiakaskatsaus, joka ei raportoi menneisyyttä vaan neuvottelee tulevaisuudesta.

**25 sanaa:**
LANKA kokoaa Lindströmin operatiiviset tapahtumat ja kiertotalousluvut yhdeksi eläväksi
katsaukseksi: AI nostaa esiin olennaiset havainnot, avaa jokaisen luvun todisteketjuksi
ja muuttaa havainnot seurattaviksi sitoumuksiksi.

**60 sekuntia (hissipuhe):**
"Kysymys 'mitä arvoa me oikeasti loimme' ei ole raportointiongelma, se on
todistusongelma. Lindströmillä on satoja operatiivisia tapahtumia asiakasta kohden —
toimituksia, pesueriä, korjauksia, hävikkiä, vettä, energiaa — mutta ei tapaa muuttaa
niitä väitteiksi, joita asiakas voi uskoa ja joista voi neuvotella. Me rakensimme
LANKA:n: jaetun tilan, jossa katsaus on elävä keskustelu. AI nostaa kolme olennaisinta
havaintoa, ja jokainen niistä avautuu kolme tasoa syvemmälle — väitteestä laskentaan,
laskennasta raakatapahtumaan. Kielimalli ei koskaan laske eikä keksi lukua: se saa
vain sanoittaa validoituja väitteitä, ja validaattori hylkää lauseen jossa on luku
ilman lähdettä. Kun havainto on ymmärretty, se päättyy ehdotukseen, jolla on
vaikutusarvio, ja hyväksytty ehdotus muuttuu sitoumukseksi jota mitataan seuraavassa
katsauksessa. Näin katsauksesta tulee silmukka eikä slide."

## Slide-rakenne (9 diaa, 5 min)

| # | Dia | Yksi lause jonka sanot | Aika |
|---|---|---|---|
| 1 | Kysymys | "Mitä arvoa me oikeasti loimme?" — ja hiljaisuus. | 20 s |
| 2 | Miksi tämä on vaikeaa | Arvo ei ole luku, se on **vertailu + todiste + teko**. | 30 s |
| 3 | Nykytila | Kvartaaliraportti: 40 sivua, 0 klikattavaa lukua, 0 sitoumusta. | 20 s |
| 4 | LANKA | Kolme tasoa: havainto → laskenta → tapahtuma. Yksi totuus, monta syvyyttä. | 40 s |
| 5 | Demo | (ks. `03-demo-script.md`) | 150 s |
| 6 | Miten se ei valehtele | LLM ei laske. Validaattori hylkää lähteettömät luvut ja perusteettomat kausaliteetit. | 40 s |
| 7 | Neljä pilaria | Taulukko alla — Lindströmin oma kriteeristö, rivi riviltä. | 30 s |
| 8 | Miksi vain Lindström | Vertaisdata. Kukaan muu ei voi sanoa "te olette 12 % parempia kuin alueen vastaavat". | 20 s |
| 9 | Lopetus | "Katsaus ei ole dokumentti. Se on silmukka, joka sulkeutuu vasta kun vaikutus on mitattu." | 20 s |

## Neljä pilaria — rivi riviltä heidän omaan briefiinsä

Tämä dia on tärkein. Briefissä lukee neljä asiaa, ja teidän pitää näyttää että
osuitte niihin kaikkiin **eksplisiittisesti**, ei "sivutuotteena".

| Briefin sana | Mitä se tarkoittaa | Missä se näkyy demossa |
|---|---|---|
| **Personalised analytics** | Sama totuus, eri linssi | Linssinvaihto: CFO / vastuullisuus / työmaapäällikkö / HR |
| **Traceable calculations** | Ei lukua ilman lähdettä | Klikkaus väitteestä → kaava → raakatapahtuma; kerroinversio näkyvissä |
| **Decision support** | Ei havaintoa ilman tekoa | Jokainen havainto päättyy ehdotukseen + vaikutusarvio + trade-off |
| **Interfaces** | Katsaus on tila, ei PDF | Jaettu lanka, jossa sekä account team että asiakas |

## Erottautuminen — mitä muut tekevät ja miksi te voitatte

| Ilmeinen ratkaisu | Miksi se häviää | Mitä te teette |
|---|---|---|
| Dashboard | Kaunis, mutta ei vastaa "mitä arvoa" | Väitelähtöinen: luvut palvelevat havaintoa |
| Chatbot datan päällä | Vastaa mihin tahansa → ei evaluoitavissa, tuntuu demolta | Kapea, validoitu, evaluoitu vastaus + porautuminen |
| Raporttigeneraattori | Yksi suunta, ei vuorovaikutusta | Jaettu tila + sitoumukset |
| LLM kirjoittaa yhteenvedon | Hallusinaatioriski tuhoaa uskottavuuden | LLM ei laske; validaattori portinvartijana |
| Sustainability-laskuri | Ei kytkentää operatiiviseen arkeen | Sama ketju tuottaa sekä kustannus- että ympäristöväitteet |

## Vaikeat kysymykset ja vastaukset

**"Eikö tämä ole ChatGPT-kääre?"**
Ei, ja tässä se todistetaan: kielimalli ei koskaan tuota lukua eikä kaavaa. Laskenta on
deterministinen ja ajetaan ennen mallia. Malli saa vain valita ja sanoittaa väitteitä,
joilla on ID. Validaattori hylkää lauseen, jossa on numero jota ei ole sidottu
väitteeseen — näytämme tämän livenä.

**"Onko luvut oikein?"**
Luvut tulevat synteettisestä datasta, mutta ketju on aito: jokainen luku on laskettu
raakatapahtumista tunnetulla kertoimella, jolla on lähde ja versio. Tuotannossa
tapahtumat tulisivat Lindströmin ERP:stä ja pesulajärjestelmistä — skeema on sama.

**"Mistä tiedätte että vesi nousi juuri mattotiheyden takia?"**
Emme tiedäkään, ja se on koko pointti. Järjestelmä sanoo "selittää noin 53 %" ja
näyttää loput selittämättömänä. Kausaliteetti vaatii eksplisiittisen syy-yhteysreunan;
ilman sitä väite degradoidaan muotoon "ajoittuu samaan aikaan". Tämä on
greenwashing-suoja, ei kauneusvirhe.

**"Miksi asiakas maksaisi tästä?"**
Koska se muuttaa katsauksen myyntitilanteesta yhteiseksi päätöksenteoksi. Ja koska
CSRD / EU Green Claims Directive vaatii että väitteet ovat todennettavissa — tämä on
halvin tapa tuottaa se todiste.

**"Mitkä ovat suurimmat riskit tuotannossa?"**
(a) Datan laatu: jos pesuladata on epätäydellistä, luottamus laskee — siksi jokaisella
luvulla on luottamustaso (mitattu / arvioitu / toimialaproxy). (b) Väärä kausaliteetti —
siksi portti. (c) Mallin kieli lipsuu ylisanoihin — siksi superlatiivikielto ilman
vertailudataa.

**"Mitkä ovat suurimmat riskit tuotannossa?"** → katso yllä.

## Mitä emme tarkoituksella tee

- Emme rakenna yleistä dashboardia. Sitä tulee kymmenen.
- Emme anna AI:n vastata vapaasti mihin tahansa kysymykseen.
- Emme näytä lukua jolla ei ole lähdettä — edes demossa, edes kiireessä.
- Emme lupaa ennustemallia. Ennuste ilman dataa on arvaus, ja arvaus on se mitä
  vastustamme.

## Yksi asia jonka tuomari muistaa

> **"Se sanoi itse, että se selittää vain 53 %."**

Se on koko pitch. Luotettavuus syntyy siitä että järjestelmä myöntää
epävarmuutensa näkyvästi — ei siitä että se näyttää varmalta.
