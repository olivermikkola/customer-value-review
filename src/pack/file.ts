import { fileURLToPath } from "node:url";

/** The supplied synthetic data pack. Swap this path to point at an approved export. */
export const PACK_FILE =
  (typeof process === "undefined" ? undefined : process.env.LANKA_PACK) ??
  fileURLToPath(new URL("../../data/pack/Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx", import.meta.url));
