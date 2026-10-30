// resident-middle-on-the-page.test.mjs — WLD-29, on the RENDERED resident page.
//
// THE POINTER MODEL (Wright, AUTHORITY 2026-10-13T19:16:02.257Z): no default
// read carries a dial table or the town's activity. The walk desk prices a leg
// by the stride in GET /world/dials, and the porch lights are GET /world/lights
// — the lit household keys, joined by each parcel's own `declared_household`
// (Darko, 2026-10-08; Wright, 2026-10-13T11:04Z) — both read off the page a
// signed-in resident actually sees, in a real browser, against a stub office
// and a SYNTHETIC world (WORLD_DIR), never the record.
//
// ── THE GUARD, AND WHAT IT OBSERVES ─────────────────────────────────────────
// The class of bug: a resident pane sourcing a record or dial from the full
// spectator fold, which the resident read does not carry (the stride did this
// for a month and showed every resident a "?" and an ETA four times too long).
// So the fold this page is served is POISONED: every mark in it that is not
// one of the town's houses (parcels — the one approved public layer the
// resident path takes from the fold, POS-373) carries the token POISON in its
// id, body and dials, and the stride class there walks at 999 km/crossing. The
// read's own records carry a CONFLICTING stride class (5) — as an older office's
// read would — and /world/dials says 77. The guard then observes:
//   1. the whole rendered document (markup, text, attributes) carries no POISON
//      token — no pane drew anything from the fold beyond the houses;
//   2. the desk's ETA is the one 77 gives, and not 999's, 5's, 60's or 15's —
//      the dials door won over both the fold and the conflicting record;
//   3. the requests the page made: the read, my-marks, whoami, the fold
//      (for the houses), /world/dials and /world/lights — and never the old
//      activity-through-the-eyes request — recorded, not assumed.
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
import { machinePage } from "./page-machine.mjs";

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
const TARGET = "rig-resident/the-far-gate";
const FROM = { x: 10, y: 10 };
const TARGET_AT = { x: 10, y: 7710 };                // 7.7 km due north

// ── THE SYNTHETIC, POISONED FOLD ─────────────────────────────────────────────
// each parcel carries the fold's own household key, as the fold publishes it
const plot = (who, at, key) => ({ id: `${who}/the-plot`, kind: "parcel", tier: "home", by: who, household: who, ...(key ? { declared_household: key } : {}), at, extent: { w: 25, h: 25 }, body: `${who}'s plot` });
const PLOTS = {
  lit: plot("rig-lit", { x: 60, y: 10 }, "hh:lit"),           // in the lit list → lit
  dark: plot("rig-dark", { x: 10, y: 70 }, "hh:dark"),        // not listed, and a walker RESTS inside → dark
  far: plot("rig-far", { x: 160, y: 10 }, "solo:rig-far"),    // a house of one, by its own solo key, nobody in earshot → lit
  unknown: plot("rig-unknown", { x: 10, y: -60 }),            // no declared key on the parcel → unknown, never guessed
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
    // THE GENERAL GUARD'S PAIR (first review R1): the fold's version of a mark the
    // read ALSO carries, and a predicate on it the read does NOT carry. A resident
    // pane that took either from the fold would draw POISON.
    { id: TARGET, kind: "sited", tier: "market", by: "rig-resident", household: "rig-resident", at: TARGET_AT, extent: { w: 1, h: 1 },
      body: "POISON-FOLD-GATE-BODY", date: TODAY + "T12:00:01.000Z" },
    { id: "poison/the-gate-colour", kind: "predicated", tier: "market", by: "poison", parent: TARGET, slot: "colour", value: "POISON-RED",
      body: "POISON-FOLD-PREDICATE: the gate is red" },
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
  // THE LEDGERS ARE SYNTHETIC TOO (first review R1): the server serves them from
  // WORLD_DIR now, so no real walk or crossing reaches this page
  writeFileSync(join(dir, "walk-ledger.md"), "# walks\n\nsynthetic: nobody has walked in the rig\n");
  writeFileSync(join(dir, "enter-exit-ledger.md"), "# crossings\n\nsynthetic: nobody has entered anything in the rig\n");
  return dir;
}

// ── WHAT THE STUB OFFICE HANDS BACK ──────────────────────────────────────────
const C = 500;                                       // the office's crossing — NOT the browser's
const LIGHTS = { crossing: C, window: 1, lit: ["hh:lit", "solo:rig-far"] };
const DIGEST_PACE = 77;
const DIALS = { settlement: "S9", sha: "9".repeat(40), dials: { "the-town/resident": { pace_km_per_crossing: DIGEST_PACE }, "rig-resident/a-dialled-marker": { glow: 3 } },
  means: "the rig's dial table" };
const READ = {
  handle: "rei",
  standpoint: { ...FROM, name: "the rig's standpoint" },
  within: [{ id: "rig-resident/the-near-stone" }],
  nearby: [{ id: TARGET, at: TARGET_AT, bearing: "N", distance_m: 7700, kind: "sited", tier: "market" }],
  records: {
    "rig-resident/the-near-stone": { id: "rig-resident/the-near-stone", kind: "sited", by: "rig-resident", household: "rig-resident", tier: "market",
      at: FROM, extent: { w: 4, h: 4 }, body: "a stone by the standpoint", date: TODAY + "T12:00:00.000Z" },
    [TARGET]: { id: TARGET, kind: "sited", by: "rig-resident", household: "rig-resident", tier: "market",
      at: TARGET_AT, extent: { w: 1, h: 1 }, body: "READ-GATE-BODY: a gate far to the north", date: TODAY + "T12:00:01.000Z" },
    // the read's own predicate on the gate: the bubble DOES draw predicates, so
    // the guard below is looking at a pane that renders record content
    "rig-resident/the-gate-sign": { id: "rig-resident/the-gate-sign", kind: "predicated", by: "rig-resident", tier: "market",
      parent: TARGET, slot: "sign", value: "READ-SIGN", body: "READ-SIGN: the gate's own sign" },
    // the town's GROUND SET rides every read (office § markRecords): one
    // synthetic region ring, so the generated ground has a floor to draw
    "rig-town/the-town-centre": { id: "rig-town/the-town-centre", kind: "sited", by: "rig-town", tier: "constitution",
      at: { x: 0, y: 0 }, extent: { w: 1200, h: 1200 }, body: "a synthetic region",
      points: [{ x: -600, y: -600 }, { x: 600, y: -600 }, { x: 600, y: 600 }, { x: -600, y: 600 }] },
    // a CONFLICTING stride, in the read's own records (an older office's read):
    // the /world/dials table must win over it
    "the-town/resident": { id: "the-town/resident", kind: "class", by: "the-town", tier: "constitution", dials: { pace_km_per_crossing: 5 } },
  },
  telling: "The rig's air is clear.",
  present: { residents: [{ handle: "rig-neighbour", at: { x: 40, y: 40 }, standing: true }] },
};

async function bootStubOffice() {
  const port = await freePort();
  const asked = [];
  const live = { lights: LIGHTS, historical: false };
  const srv = createHttp((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1:" + port);
    if (req.method !== "OPTIONS") asked.push(url.pathname + url.search);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    const send = (body) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    const lights = () => (live.historical
      ? { crossing: C - 3, window: 1, lit: null, historical: true, note: "activity isn't kept per crossing — RIG-HISTORICAL-NOTE" }
      : live.lights);
    if (url.pathname === "/ops/whoami") return send({ principal: "rig", handles: ["rei"] });
    if (url.pathname === "/world/my-marks") return send({ drafts: [], docket: [], published: [], backed: [], counts: { drafts: 0, docket: 0, published: 0, backed: 0 }, complete: true });
    if (url.pathname === "/world/apex") return send(READ);
    // the close look's own door (world.mjs § worldInvestigate), answering from what the read carries:
    // the column (play fix 34 in #240) draws a mark's predicates from it, where the pinned bubble read the records
    if (url.pathname === "/world/investigate") {
      const id = url.searchParams.get("mark"), rec = READ.records[id];
      return rec ? send({ id, body: rec.body, predicates: Object.values(READ.records).filter((r) => r.parent === id && /^predicat/.test(r.kind)), parents: [], children: [] })
        : send({ error: "bounce", defect: "no such mark in the rig" });
    }
    if (url.pathname === "/world/lights") return send(lights());
    if (url.pathname === "/world/dials") return send(DIALS);
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
  const page = await machinePage(browser, { viewport: { width: 1500, height: 950 } });
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
  + "the porch lights from GET /world/lights, and the guard that no resident pane draws from the fold — none of it is proven by unit tests alone.";

test("THE RESIDENT PAGE: the read was asked as the selected resident; the lights are GET /world/lights by each parcel's own household key — lit, dark (a resident resting at home is not a light), a solo house lit off-earshot, unknown — and an update lands without a reload", async (t) => {
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
    office.live.lights = { ...LIGHTS, lit: [...LIGHTS.lit, "hh:dark"] };
    const updated = await until(page, (id) => document.querySelector(`.ov-home[data-id="${id}"]`)?.classList.contains("lit"), PLOTS.dark.id, 20_000);
    assert.ok(updated, `the light did not update without a reload: ${JSON.stringify(await lights(page))}`);
    assert.ok(office.asked.includes("/world/lights"), "the refresh is the lights door, bare on a live page: the office's clock decides today");
    assert.ok(!office.asked.some((p) => p.startsWith("/world/eyes")), "no read is asked for activity any more");
    assert.deepEqual(errors, []);
  } finally { office.live.lights = LIGHTS; await page.close(); }
});

test("THE DESK AND THE GUARD: the ETA is /world/dials' stride (77), not the fold's (999), the conflicting record's (5), 60 or the legacy 15 — no '?' — and nothing the poisoned fold carries is drawn", async (t) => {
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
    assert.equal(desk.guess, false, "no '?' chip: the stride came from the dials door");
    assert.ok(desk.metas.includes(want), `the desk's ETA is /world/dials' (${want}); it shows ${JSON.stringify(desk.metas)}`);
    for (const p of [999, 5, 60, 15]) assert.ok(etaAt(p) !== want && !desk.metas.includes(etaAt(p)), `not the ${p} km stride's ETA (${etaAt(p)})`);
    // THE GUARD: nothing of the poisoned fold beyond the houses is drawn anywhere
    const drawnIds = await page.evaluate(() => ({
      overlay: [...document.querySelectorAll("#wv-overlay [data-id]")].map((e) => e.getAttribute("data-id")),
      lately: [...document.querySelectorAll(".wv-acts .wv-act-line [data-id]")].map((e) => e.getAttribute("data-id")),
      tier: document.querySelector("#wv-overlay")?.getAttribute("data-tier") ?? null,
    }));
    console.log(`    GUARD RECEIPT · tier ${drawnIds.tier} · overlay ids ${JSON.stringify([...new Set(drawnIds.overlay)])} · lately ids ${JSON.stringify([...new Set(drawnIds.lately)])}`);
    // the token check can see a drawn mark: the read's own dated marks ARE in Lately
    assert.ok(drawnIds.lately.includes(TARGET), "the check is looking at a pane that draws records");
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    // case-blind: the poisoned mark's id is lowercase (`poison/…`), its body and dials upper
    const hits = [...html.matchAll(/.{0,60}poison.{0,60}/gi)].map((m) => m[0]).slice(0, 5);
    assert.deepEqual(hits, [], "a resident pane drew something only the spectator fold carries");
    // provenance: what the page asked, recorded
    const paths = new Set(office.asked.map((p) => p.split("?")[0]));
    for (const p of ["/ops/whoami", "/world/my-marks", "/world/apex", "/world/dials", "/world/lights"]) assert.ok(paths.has(p), `the page never asked ${p}`);
    assert.ok(!paths.has("/world/eyes"), "the old activity-through-the-eyes request is gone");
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
      assert.match(v.note ?? "", /RIG-HISTORICAL-NOTE/, `${id} carries the lights door's own explanation`);
    }
    assert.deepEqual(errors, []);
  } finally { office.live.historical = false; await page.close(); }
});

// ── THE GENERAL RESIDENT-PAGE GUARD (first review R1) ────────────────────────
//
// THE BOUNDARY: the pinned bubble of a selected mark — the pane that draws a
// record's CONTENT and its predicate children by id. The read carries the gate
// and one predicate; the poisoned fold carries ITS version of the same gate and
// a second predicate on it. The permitted sources, named: the read's records
// and the ids it names (within, nearby), the resident's own marks (none here),
// the page's two approved sources — GET /world/dials (ids → dials, never drawn
// as records) and GET /world/lights (household keys, never drawn as records) —
// and the town's houses (the approved public layer). No fallback to the fold
// for anything else. Observed: the bubble's text and every data-id the
// resident panes draw.
test("THE GENERAL PAGE GUARD: the selected mark's bubble draws the READ's record and predicate, never the fold's; every id the resident panes draw is from a permitted source", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page, errors } = await openSignedIn();
  try {
    const housesIn = await until(page, (id) => !!document.querySelector(`.ov-home[data-id="${id}"]`), PLOTS.lit.id, 45_000);
    assert.ok(housesIn, `precondition: the fold has landed (its houses are drawn) before the guard looks: ${await diag(page, errors)}`);
    const listed = await until(page, (id) => !!document.querySelector(`.wv-act-line .what[data-id="${id}"]`), TARGET, 45_000);
    assert.ok(listed, `precondition: the read's gate is in Lately: ${await diag(page, errors)}`);
    await page.evaluate((id) => document.querySelector(`.wv-act-line .what[data-id="${id}"]`).click(), TARGET);
    // THE PANE IS THE COLUMN NOW (play fix 34, column-always, in #240): a selected
    // mark opens its column in either view; the pinned bubble stands only in
    // painting-only mode. Either is the pane under guard, whichever opened.
    const opened = await until(page, (id) => !!document.querySelector(`.wv-bubbles .wv-bubble.is-pinned .wv-card[data-id="${id}"]`)
      || !!document.querySelector(`.wv-homecol:not([hidden]) [data-homecol-copy="${id}"]`), TARGET, 20_000);
    assert.ok(opened, `selecting the gate opened no bubble or column for it: ${await diag(page, errors)}`);
    await page.waitForTimeout(1500);
    const seen = await page.evaluate(() => {
      const col = document.querySelector(".wv-homecol:not([hidden]) [data-homecol-copy]")?.closest(".wv-homecol") ?? null;
      // the pinned bubble only when it holds a card (an empty one stays mounted in the split view)
      const b = document.querySelector(".wv-bubbles .wv-bubble.is-pinned .wv-card")?.closest(".wv-bubble") ?? col;
      const ids = (sel) => [...document.querySelectorAll(`${sel} [data-id]`)].map((e) => e.getAttribute("data-id"));
      const goes = [...document.querySelectorAll(".wv-homecol [data-homecol-go]")].map((e) => e.getAttribute("data-homecol-go"));
      return { bubble: (b?.innerText || b?.textContent) ?? "", bubbleHtml: b?.innerHTML ?? "", ids: { bubble: ids(".wv-bubbles"), column: goes, lately: ids(".wv-acts"), desk: ids(".wv-walkdesk"), overlay: ids("#wv-overlay") } };
    });
    console.log(`    PAGE GUARD RECEIPT · bubble ${JSON.stringify(seen.bubble.slice(0, 240))} · ids ${JSON.stringify(seen.ids)}`);
    // the pane renders record content and predicates — so it CAN show a bad source
    assert.match(seen.bubble, /READ-GATE-BODY/, "the bubble draws the read's own body for the gate");
    assert.match(seen.bubble + seen.bubbleHtml, /READ-SIGN/, "the bubble draws the read's own predicate on the gate");
    // …and draws nothing of the fold's
    assert.doesNotMatch(seen.bubble + seen.bubbleHtml, /poison/i, "the bubble drew the fold's version of a record, or a predicate only the fold carries");
    // provenance: every id a resident pane draws is from a permitted source
    const ALLOWED = new Set([...Object.keys(READ.records), ...READ.within.map((m) => m.id), ...READ.nearby.map((m) => m.id), ...Object.values(PLOTS).map((p) => p.id)]);
    for (const [pane, list] of Object.entries(seen.ids)) {
      const outside = [...new Set(list)].filter((id) => id.includes("/") && !ALLOWED.has(id));
      assert.deepEqual(outside, [], `the ${pane} drew ids no permitted source carries`);
    }
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    assert.deepEqual([...html.matchAll(/.{0,60}poison.{0,60}/gi)].map((m) => m[0]).slice(0, 5), [], "fold-only content drawn anywhere on the resident page");
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
