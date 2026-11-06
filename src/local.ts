import { join } from "node:path";

/** Model weights for an offline demo, filled by `npm run models`. Not in git. */
export const MODELS = join(import.meta.dirname, "..", "models");

/** Where each model lives under models/. */
export const LOCAL = {
  bonsai: "bonsai/Ternary-Bonsai-2-4B-PTQ1_0.gguf",
  hf: "hf",
  ort: "ort",
};
