/**
 * What each askable claim and cause is about, in the words a customer would
 * use. The browser embeds these once and compares a question's meaning with
 * them (`web/semantic.js`); the code still decides what is true.
 *
 * Only claims a person would ask about directly are here. Supporting claims
 * (attribution, the unexplained remainder) come in through their causes.
 */
export interface Topic {
  id: string;
  text: string;
}

export const TOPICS: Topic[] = [
  {
    id: "clm:water-intensity-up",
    text: "Veden ominaiskulutus: paljonko vettä kuluu yhden pyykkikilon pesemiseen. Pesun vesitehokkuus.",
  },
  {
    id: "clm:water-volume-up",
    text: "Veden kokonaiskulutus: kuinka paljon vettä pesuihin kului yhteensä. Vedenkulutus ja vesimäärä.",
  },
  {
    id: "clm:linen-up",
    text: "Pesty pyykki: kuinka monta kiloa työvaatteita ja tekstiilejä pestiin. Pyykin ja pesun määrä.",
  },
  {
    id: "clm:mat-up",
    text: "Mattopyykki: pestyjen lattiamattojen ja ovimattojen määrä.",
  },
  {
    id: "clm:cost-up",
    text: "Palvelulaskutus: mitä asiakas maksaa palvelusta. Lasku, hinta ja palvelun kustannukset.",
  },
  {
    id: "clm:loss-cost-up",
    text: "Katoamisen kustannus: kadonneiden ja palauttamatta jääneiden työvaatteiden korvauskustannus. Hävikki.",
  },
  {
    id: "clm:repair-rate-up",
    text: "Korjaussuhde: kuinka suuri osa rikkinäisistä vaatteista korjataan uusien sijaan. Kiertotalous ja vaatteiden käyttöikä.",
  },
  {
    id: "clm:co2-up",
    text: "Päästöt: hiilidioksidipäästöt, hiilijalanjälki ja ilmastovaikutus.",
  },
  {
    id: "clm:water-avoided",
    text: "Vältetty vesi: paljonko vettä säästyi, kun pyykki pestään teollisessa pesulassa eikä omassa. Ulkoistamisen hyöty.",
  },
  {
    id: "clm:water-q4",
    text: "Vedenkulutus vuoden viimeisellä neljänneksellä: loka-, marras- ja joulukuu.",
  },
  { id: "drv:mat-frequency", text: "Mattojen vaihtotiheyden nosto Espoon ja Vantaan toimipisteissä." },
  { id: "drv:partial-loads", text: "Espoon pesulan vajaat pesukuormat elokuussa." },
  { id: "drv:tapiola-loss", text: "Tapiolan toimipisteen kadonneet vaatteet." },
];
