/* Lets the dashboard run with no server: /api/* requests are answered by engine.js in this page
   (the same code the server runs, built by scripts/build-static.ts). Loaded before dashboard.js. */
window.__static = true;
// A variable, so the single-file bundler leaves this import alone.
const ENGINE_URL = "./engine.js";
const realFetch = window.fetch.bind(window);

// Single-file build: the pack and the engine are already in the page (window.__PACK, window.__ENGINE).
const ready = (async () => {
  const [pack, eng] = await Promise.all([
    window.__PACK ?? realFetch(new URL("./pack.json", import.meta.url)).then((r) => r.json()),
    window.__ENGINE ?? import(ENGINE_URL),
  ]);
  eng.init(pack);
  return eng;
})();

const reply = (status, json) => new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });

window.fetch = async (input, init) => {
  const u = new URL(typeof input === "string" ? input : input.url, location.href);
  if (u.pathname === "/local") return reply(200, {});
  if (!u.pathname.startsWith("/api/")) return realFetch(input, init);
  const eng = await ready;
  // Yield once so the page can paint "loading" before a heavy build blocks it.
  await new Promise((r) => setTimeout(r));
  const out = eng.handle((init?.method ?? "GET").toUpperCase(), u.pathname, u.search, init?.body);
  return reply(out.status, out.json);
};

// The .pptx download is built here too.
document.addEventListener("click", async (e) => {
  const a = e.target.closest?.("#exportBtn");
  if (!a) return;
  e.preventDefault();
  const eng = await ready;
  const d = await eng.exportDeck(new URL(a.href, location.href).search);
  if (!d) return;
  const url = URL.createObjectURL(new Blob([d.body], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }));
  Object.assign(document.createElement("a"), { href: url, download: d.name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}, true);
