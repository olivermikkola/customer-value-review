/**
 * The only place prose is allowed to exist.
 *
 * Note what a sentence may NOT contain: a digit. Every number is a slot that
 * the renderer fills from a claim. The model's job is to choose which claims
 * matter and in what order — not to know or type any value.
 */

export const OPENING = "Katsaus Q3 2025 — kolme asiaa, jotka kannattaa käydä läpi.";

/** Accepted narrative. Order is also the argument. */
export const SAMPLE_NARRATIVE: string[] = [
  "Veden ominaiskulutus nousi [[clm:water-intensity-up]] vuoden takaiseen verrattuna.",
  "Kokonaiskulutus kasvoi [[clm:water-volume-up]], samalla kun pesty pyykki kasvoi [[clm:linen-up]].",
  "Mattotiheyden nosto kahdella toimipisteellä selittää noin [[clm:water-attribution:0]] noususta.",
  "Loput [[clm:water-unattributed]] ajoittuu Espoon pesulan vajaiden kuormien jaksoon; syytä ei ole vahvistettu.",
  "Katoamisen kustannus nousi [[clm:loss-cost-up]], ja nousu keskittyy Tapiolaan.",
  "Korjaussuhde parani [[clm:repair-rate-up]], eli vaatteita korvattiin uusilla aiempaa vähemmän.",
];

/** Rejected on purpose. The demo shows one of these getting stopped. */
export const SAMPLE_REJECTIONS: string[] = [
  "Vedenkulutus nousi 21,3 prosenttia.",
  "Pyykki lisääntyi koska mattoja pestiin enemmän [[clm:linen-up]].",
  "Vedenkulutus on merkittävästi parempi kuin muilla toimijoilla [[clm:water-intensity-up]].",
  "Vesi nousi [[clm:does-not-exist]].",
];
