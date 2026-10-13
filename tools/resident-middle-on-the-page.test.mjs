// resident-middle-on-the-page.test.mjs — WLD-29, on the RENDERED resident page.
//
// "The resident read carries its middle": the walk desk prices a leg by the
// stride in the read's own dials digest, and the porch lights are the
// household activity digest (Darko, 2026-10-08; Wright, 2026-10-13T11:04Z) —
// both read off the page a signed-in resident actually sees, in a real browser,
// against a stub office and a SYNTHETIC world (WORLD_DIR), never the record.
//
// ── THE GUARD, AND WHAT IT OBSERVES ─────────────────────────────────────────
// The class of bug: a resident pane sourcing a record or dial from the full
// spectator fold, which the resident read does not carry (the stride did this
// for a month and showed every resident a "?" and an ETA four times too long).
// So the fold this page is served is POISONED: every mark in it that is not
// one of the town's houses (parcels — the one approved public layer the
// resident path takes from the fold, POS-373) carries the token POISON in its
// id, body and dials, and the stride class there walks at 999 km/crossing. The
// read's own records carry a CONFLICTING stride class (5), and the digest says
// 77. The guard then observes:
//   1. the whole rendered document (markup, text, attributes) carries no POISON
//      token — no pane drew anything from the fold beyond the houses;
//   2. the desk's ETA is the one 77 gives, and not 999's, 5's, 60's or 15's —
//      the digest won over both the fold and the conflicting record;
//   3. the requests the page made: the read, my-marks, whoami, the fold
//      (for the houses), and the activity refresh — recorded, not assumed.
// Its LIMITS, said: (1) sees only what was rendered while the test looked —
// a pane not opened is not inspected; (2) is about the stride's one consumer
// on the desk; a token check cannot prove a CONTENT was consumed, only that
// fold content was not drawn. A consumer that reads the fold without drawing
// it is not caught by (1); (2) is the check that one does.
//
// Playwright is a devDependency (POS-372): CI installs the browser; absent, this
// SKIPS and says what goes unguarded. A skip is not a pass.

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttp } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { previewWalkLeg, walkLegParts } from "../spectator/viewer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

async function loadChromium() {
  try { return (await import("playwright")).chromium; } catch { return null; }
}
const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.on("error", reject);
  probe.listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});
const CLEANUP = [];
after(() => { for (const stop of CLEANUP.reverse()) { try { stop(); } catch { /* already gone */ } } });

const TODAY = new Date().toISOString().slice(0, 10);

// ── THE SYNTHETIC, POISONED FOLD ─────────────────────────────────────────────
const plot = (who, at) => ({ id: `${who}/the-plot`, kind: "parcel", tier: "home", by: who, household: who, at, extent: { w: 25, h: 25 }, body: `${who}'s plot` });
const PLOTS = {
  lit: plot("rig-lit", { x: 60, y: 10 }),            // its house acted at C-1 → lit
  dark: plot("rig-dark", { x: 10, y: 70 }),          // acted at C-5, and a walker RESTS inside → dark
  far: plot("rig-far", { x: 160, y: 10 }),           // acted at C, nobody of it in earshot → lit
  unknown: plot("rig-unknown", { x: 10, y: -60 }),   // the digest does not name it → unknown
};
const FOLD = {
  tick: 0, dials: {},
  marks: [
    { id: "the-town/let-there-be-light", kind: "sited", tier: "constitution", by: "the-town", at: { x: 0, y: 0 }, extent: { w: 40000, h: 40000 }, body: "the world frame" },
    { id: "the-town/resident", kind: "class", tier: "constitution", by: "the-town", body: "POISON-FOLD-CLASS", dials: { pace_km_per_crossing: 999, POISON: 1 } },
    // the poison is something a resident pane WOULD draw if it took it: dated
    // today (Lately lists the newest marks), with a real footprint by the
    // standpoint (the map draws it) — so a widening cannot hide by being dull.
    { id: "poison/the-fold-only-lamp", kind: "sited", tier: "market", by: "poison", household: "poison", at: { x: 20, y: 20 }, extent: { w: 30, h: 30 },
      body: "POISON-FOLD-BODY", dials: { POISON: 1 }, date: TODAY + "T12:00:02.000Z" },
    ...Object.values(PLOTS),
  ],
  parcels: Object.values(PLOTS).map((p) => ({ id: p.id, household: p.household, at: p.at, extent: p.extent })),
  determined: {}, vague: [], rivalries: [], portfolios: {}, terrain_weight: {}, errors: [],
};
// The registration the map mounts on (`_grid`, the skeleton's own two sentences,
// in the record's format) and nothing else: no terrain, no regions, no Mists.
const SKELETON = {
  _grid: { cell_m: 1, scale: "5 m per atlas px", origin: "the Origin, synthetic: atlas (485,760)" },
  features: [], far_features: [], physics_registry: {},
};
function syntheticWorld() {
  const dir = mkdtempSync(join(tmpdir(), "wld29-world-"));
  CLEANUP.push(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "world-state.json"), JSON.stringify(FOLD));
  writeFileSync(join(dir, "skeleton.json"), JSON.stringify(SKELETON));
  return dir;
}

// ── THE READ THE STUB OFFICE HANDS BACK ──────────────────────────────────────
const TARGET = "rig-resident/the-far-gate";
const FROM = { x: 10, y: 10 };
const TARGET_AT = { x: 10, y: 7710 };                // 7.7 km due north
const C = 500;                                       // the read's activity clock — NOT the browser's crossing
const ACTIVITY = { clock: C, window: 1,
  households: { "hh:lit": C - 1, "hh:dark": C - 5, "hh:far": C },
  house_of: { "rig-lit": "hh:lit", "rig-dark": "hh:dark", "rig-far": "hh:far" } };
const DIGEST_PACE = 77;
const READ = {
  handle: "rei",
  standpoint: { ...FROM, name: "the rig's standpoint" },
  within: [{ id: "rig-resident/the-near-stone" }],
  nearby: [{ id: TARGET, at: TARGET_AT, bearing: "N", distance_m: 7700, kind: "sited", tier: "market" }],
  records: {
    "rig-resident/the-near-stone": { id: "rig-resident/the-near-stone", kind: "sited", by: "rig-resident", household: "rig-resident", tier: "market",
      at: FROM, extent: { w: 4, h: 4 }, body: "a stone by the standpoint", date: TODAY + "T12:00:00.000Z" },
    [TARGET]: { id: TARGET, kind: "sited", by: "rig-resident", household: "rig-resident", tier: "market",
      at: TARGET_AT, extent: { w: 1, h: 1 }, body: "a gate far to the north", date: TODAY + "T12:00:01.000Z" },
    // the town's GROUND SET rides every read (office § markRecords): one
    // synthetic region ring, so the generated ground has a floor to draw
    "rig-town/the-town-centre": { id: "rig-town/the-town-centre", kind: "sited", by: "rig-town", tier: "constitution",
      at: { x: 0, y: 0 }, extent: { w: 1200, h: 1200 }, body: "a synthetic region",
      points: [{ x: -600, y: -600 }, { x: 600, y: -600 }, { x: 600, y: 600 }, { x: -600, y: 600 }] },
    // a CONFLICTING stride, in the read's own records: the digest must win over it
    "the-town/resident": { id: "the-town/resident", kind: "class", by: "the-town", tier: "constitution", dials: { pace_km_per_crossing: 5 } },
  },
  dials: { "the-town/resident": { pace_km_per_crossing: DIGEST_PACE }, "rig-resident/a-dialled-marker": { glow: 3 } },
  activity: ACTIVITY,
  telling: "The rig's air is clear.",
  present: { residents: [{ handle: "rig-neighbour", at: { x: 40, y: 40 }, standing: true }] },
};

async function bootStubOffice() {
  const port = await freePort();
  const asked = [];
  const live = { activity: ACTIVITY, historical: false };
  const srv = createHttp((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1:" + port);
    if (req.method !== "OPTIONS") asked.push(url.pathname + url.search);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    const send = (body) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    const activity = () => (live.historical
      ? { clock: null, households: null, house_of: null, historical: true, note: "activity isn't kept per crossing — RIG-HISTORICAL-NOTE" }
      : live.activity);
    if (url.pathname === "/ops/whoami") return send({ principal: "rig", handles: ["rei"] });
    if (url.pathname === "/world/my-marks") return send({ drafts: [], docket: [], published: [], backed: [], counts: { drafts: 0, docket: 0, published: 0, backed: 0 }, complete: true });
    if (url.pathname === "/world/apex") return send({ ...READ, activity: activity() });
    if (url.pathname === "/world/eyes") return send({ stance: "spectator", telling: "", objects: [], records: {}, dials: READ.dials, activity: activity() });
    // a resident of the DARK house RESTING inside it: presence is not a light
    if (url.pathname === "/world/walkers") return send({ walkers: [], standing: [{ handle: "rig-dark", x: 10, y: 70, standing: true }] });
    if (url.pathname === "/world/present") return send(READ.present);
    // where the selected resident lives: the walk desk's origin
    if (url.pathname === "/homes/rei") return send({ world: { sited: true, x: FROM.x, y: FROM.y, mark_id: null } });
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bounce", defect: "no such door in the rig" }));
  });
  await new Promise((resolve) => srv.listen(port, "127.0.0.1", resolve));
  CLEANUP.push(() => srv.close());
  return { port, asked, live };
}

async function bootRig(worldDir) {
  const port = await freePort();
  const proc = spawn(process.execPath, [join(ROOT, "spectator", "server.mjs")], {
    cwd: ROOT, env: { ...process.env, PORT: String(port), ATLAS_ORIGIN: "http://127.0.0.1:1", WORLD_DIR: worldDir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  CLEANUP.push(() => proc.kill());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the rig did not announce itself in 30s")), 30_000);
    proc.stdout.on("data", (b) => { if (String(b).includes("localhost:" + port)) { clearTimeout(timer); resolve(); } });
    proc.on("exit", (code) => { clearTimeout(timer); reject(new Error("the rig exited " + code + " before serving")); });
  });
  return { port };
}

let chromium = null, rig = null, office = null, browser = null;
before(async () => {
  chromium = await loadChromium();
  if (!chromium) return;
  [rig, office] = await Promise.all([bootRig(syntheticWorld()), bootStubOffice()]);
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
});

async function openSignedIn() {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  page.__logs = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") page.__logs.push(m.text().slice(0, 200)); });
  await page.addInitScript((base) => {
    try {
      localStorage.setItem("pm.office.base", base);
      localStorage.setItem("pm_key", "rig-key-not-a-secret");
      localStorage.setItem("pm.world.act_as", "rei");
      localStorage.setItem("pm.world.activity_ms", "1500");
    } catch { /* no storage */ }
  }, "http://127.0.0.1:" + office.port);
  await page.goto("http://localhost:" + rig.port + "/", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  return { page, errors };
}
const until = async (page, fn, arg, ms = 30_000) => {
  for (let waited = 0; waited < ms; waited += 150) {
    if (await page.evaluate(fn, arg)) return true;
    await page.waitForTimeout(150);
  }
  return false;
};
const lights = (page) => page.evaluate((ids) => Object.fromEntries(ids.map((id) => {
  const g = document.querySelector(`.ov-home[data-id="${id}"]`);
  return [id, g ? { light: g.getAttribute("data-light"), lit: g.classList.contains("lit"), note: g.querySelector("title.ov-light-note")?.textContent ?? null } : null];
})), Object.values(PLOTS).map((p) => p.id));
const diag = async (page, errors) => JSON.stringify({
  errors, asked: office.asked.slice(-30),
  homes: await page.evaluate(() => [...document.querySelectorAll(".ov-home[data-id]")].map((g) => g.getAttribute("data-id"))),
  tier: await page.evaluate(() => document.querySelector("#wv-overlay")?.getAttribute("data-tier") ?? null),
  minimap: await page.evaluate(() => { const b = document.querySelector(".wv-minimap"); return b ? { svg: !!b.querySelector(":scope > svg"), text: b.innerText.slice(0, 200), ground: b.querySelector("svg")?.getAttribute("data-ground") ?? null } : null; }),
  console: (page.__logs ?? []).slice(-12),
  desk: await page.evaluate(() => document.querySelector(".wv-walkdesk")?.innerText?.slice(0, 300) ?? null),
}).slice(0, 2000);

const skipReason = "playwright is absent, so the RESIDENT PAGE'S MIDDLE goes unguarded: the desk's stride from the dials digest, "
  + "the porch lights from the activity digest, and the guard that no resident pane draws from the fold — none of it is proven by unit tests alone.";

test("THE RESIDENT PAGE: the read was asked as the selected resident; the lights are household ACTIVITY at the read's clock — lit, dark (a resident resting at home is not a light), lit off-earshot, unknown — and an update lands without a reload", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page, errors } = await openSignedIn();
  try {
    // the precondition: the resident path, and the read asked for the selected actor
    for (let i = 0; i < 300 && !office.asked.some((p) => p.startsWith("/world/apex?handle=rei")); i++) await page.waitForTimeout(150);
    assert.ok(office.asked.some((p) => p.startsWith("/world/apex?handle=rei")), `the resident read was never asked: ${await diag(page, errors)}`);
    assert.ok(!office.asked.some((p) => /\/world\/apex\?.*handle=(?!rei)/.test(p)), "no other actor's read");
    const drawn = await until(page, (id) => !!document.querySelector(`.ov-home[data-id="${id}"]`), PLOTS.lit.id, 45_000);
    assert.ok(drawn, `the house cards never mounted on the resident path — a precondition, not a light verdict: ${await diag(page, errors)}`);
    // the walker poll has run (the dark house's resident is drawn resting at home)
    for (let i = 0; i < 200 && !office.asked.some((p) => p.startsWith("/world/walkers")); i++) await page.waitForTimeout(150);
    await until(page, (id) => document.querySelector(`.ov-home[data-id="${id}"]`)?.getAttribute("data-light") === "lit", PLOTS.lit.id, 20_000);
    const first = await lights(page);
    assert.deepEqual(Object.fromEntries(Object.entries(first).map(([k, v]) => [k, v && [v.light, v.lit]])), {
      [PLOTS.lit.id]: ["lit", true],
      [PLOTS.dark.id]: ["dark", false],
      [PLOTS.far.id]: ["lit", true],
      [PLOTS.unknown.id]: ["unknown", false],
    }, `lights at first paint: ${JSON.stringify(first)} · ${await diag(page, errors)}`);
    assert.ok(first[PLOTS.unknown.id].note, "an unknown house says so, rather than reading as a dark one");
    // AN UPDATE, on the page's own refresh: the dark house acts now
    office.live.activity = { ...ACTIVITY, households: { ...ACTIVITY.households, "hh:dark": C } };
    const updated = await until(page, (id) => document.querySelector(`.ov-home[data-id="${id}"]`)?.classList.contains("lit"), PLOTS.dark.id, 20_000);
    assert.ok(updated, `the light did not update without a reload: ${JSON.stringify(await lights(page))}`);
    assert.ok(office.asked.some((p) => p.startsWith("/world/eyes?x=0&y=0&crossing=")), "the refresh is the activity read, at the page's crossing");
    assert.deepEqual(errors, []);
  } finally { office.live.activity = ACTIVITY; await page.close(); }
});

test("THE DESK AND THE GUARD: the ETA is the digest's stride (77), not the fold's (999), the conflicting record's (5), 60 or the legacy 15 — no '?' — and nothing the poisoned fold carries is drawn", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page, errors } = await openSignedIn();
  try {
    const listed = await until(page, (id) => !!document.querySelector(`.wv-act-line .what[data-id="${id}"]`), TARGET, 45_000);
    assert.ok(listed, `the read's target never reached the Lately pane — precondition: ${await diag(page, errors)}`);
    await page.evaluate((id) => document.querySelector(`.wv-act-line .what[data-id="${id}"]`).click(), TARGET);
    const armed = await until(page, () => !!document.querySelector(".wv-walkdesk .wv-walk-legline"), null, 20_000);
    assert.ok(armed, `selecting the target armed no walk preview: ${await diag(page, errors)}`);
    const desk = await page.evaluate(() => {
      const line = document.querySelector(".wv-walkdesk .wv-walk-legline");
      return { metas: [...line.querySelectorAll(".wv-walk-meta")].map((e) => e.textContent), guess: !!line.querySelector(".is-guess") };
    });
    const etaAt = (paceKm) => walkLegParts(previewWalkLeg({ from: FROM, toward: TARGET_AT, targetExtent: { w: 1, h: 1 }, paceKm, at: 0 }))?.eta;
    const want = etaAt(DIGEST_PACE);
    assert.equal(desk.guess, false, "no '?' chip: the stride came from the record's digest");
    assert.ok(desk.metas.includes(want), `the desk's ETA is the digest's (${want}); it shows ${JSON.stringify(desk.metas)}`);
    for (const p of [999, 5, 60, 15]) assert.ok(etaAt(p) !== want && !desk.metas.includes(etaAt(p)), `not the ${p} km stride's ETA (${etaAt(p)})`);
    // THE GUARD: nothing of the poisoned fold beyond the houses is drawn anywhere
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    // case-blind: the poisoned mark's id is lowercase (`poison/…`), its body and dials upper
    const hits = [...html.matchAll(/.{0,60}poison.{0,60}/gi)].map((m) => m[0]).slice(0, 5);
    assert.deepEqual(hits, [], "a resident pane drew something only the spectator fold carries");
    // provenance: what the page asked, recorded
    const paths = new Set(office.asked.map((p) => p.split("?")[0]));
    for (const p of ["/ops/whoami", "/world/my-marks", "/world/apex"]) assert.ok(paths.has(p), `the page never asked ${p}`);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("A HISTORICAL READ: no house is lit, each says activity isn't kept per crossing", async (t) => {
  if (!chromium) return t.skip(skipReason);
  office.live.historical = true;
  const { page, errors } = await openSignedIn();
  try {
    const drawn = await until(page, (id) => !!document.querySelector(`.ov-home[data-id="${id}"]`), PLOTS.lit.id, 45_000);
    assert.ok(drawn, `the house cards never mounted — precondition: ${await diag(page, errors)}`);
    await until(page, (id) => document.querySelector(`.ov-home[data-id="${id}"]`)?.getAttribute("data-light") === "historical", PLOTS.lit.id, 20_000);
    const seen = await lights(page);
    for (const [id, v] of Object.entries(seen)) {
      assert.equal(v?.light, "historical", `${id}: ${JSON.stringify(v)}`);
      assert.equal(v.lit, false, `${id} is not painted with a light it cannot have had`);
      assert.match(v.note ?? "", /RIG-HISTORICAL-NOTE/, `${id} carries the read's own explanation`);
    }
    assert.deepEqual(errors, []);
  } finally { office.live.historical = false; await page.close(); }
});
