/**
 * Small multilingual embedding models that run in the browser (transformers.js,
 * ONNX). The dashboard uses bge-small; scripts/answer-eval.ts compares the
 * available models on the English question fixtures.
 */
export const DEFAULT_EMBEDDER = "embeddinggemma";
export interface EmbedderSpec {
  repo: string;
  dtype: string;
  /** ONNX file stem when not "model"; the browser's CPU runtime lacks the op in EmbeddingGemma's default q4 file. */
  file?: string;
  /** Approximate download, for the UI. */
  mb: number;
  query: string;
  doc: string;
}

export const EMBEDDERS: Record<string, EmbedderSpec> = {
  "minilm": {
    repo: "Xenova/all-MiniLM-L6-v2",
    dtype: "q8",
    mb: 23,
    query: "",
    doc: "",
  },
  "bge-small": {
    repo: "Xenova/bge-small-en-v1.5",
    dtype: "q8",
    mb: 34,
    query: "Represent this sentence for searching relevant passages: ",
    doc: "",
  },
  "e5-small": {
    repo: "Xenova/multilingual-e5-small",
    dtype: "q8",
    mb: 118,
    query: "query: ",
    doc: "passage: ",
  },
  "embeddinggemma": {
    repo: "onnx-community/embeddinggemma-300m-ONNX",
    dtype: "q4",
    file: "model_no_gather",
    mb: 195,
    query: "task: search result | query: ",
    doc: "title: none | text: ",
  },
};

type Extractor = (texts: string[], opts: { pooling: "mean"; normalize: boolean }) => Promise<{ tolist(): number[][] }>;

/** Unit vectors, so a dot product is the cosine similarity. */
export async function embedText(
  extract: unknown,
  spec: EmbedderSpec,
  texts: string[],
  kind: "query" | "doc",
): Promise<number[][]> {
  const prefix = kind === "query" ? spec.query : spec.doc;
  const out = await (extract as Extractor)(texts.map((t) => prefix + t), { pooling: "mean", normalize: true });
  return out.tolist();
}
