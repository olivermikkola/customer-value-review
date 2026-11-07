/* Entry of the single-file build: engine, pack, shim and dashboard in one page. */
import * as engine from "./entry.ts";

window.__ENGINE = engine;
window.__PACK = JSON.parse(document.getElementById("pack").textContent);
await import("./shim.js");
await import("../../web/dashboard.js");
