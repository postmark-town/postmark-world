// standpoint-dot-culled.test.mjs — A BODY THAT WAS NOT DRAWN IS NOT A MARKER
// (postmark#2848 part (a), 2026-09-17).
//
// ── THE INSTANCE ────────────────────────────────────────────────────────────
//
// The founder switched act-as to jetto-of-starforge and saw nothing: "there's
// no jetto selected anywhere. nothing." Measured in his tab (Wright, 09-17):
// jetto's body IS in the walker list — the resident-path present poll answers
// him at (−95,120, −95,120), Lake Caves, Pando Peak, 139 km off a canvas
// ~1,500 units wide — so `drawWalkers` culled it (`#wv-walk-layer` empty), and
// the standpoint dot was ALSO gone, because POS-93's `standpointDotShown` asked
// "is his handle in `walkState.walkers`" (yes) rather than "was his body drawn"
// (no). One body, one marker — and the one body was off the page.
//
// ── THE FIX, AND ITS ONE OWNER ─────────────────────────────────────────────
//
// `standpointDotShown` is unchanged; what changed is the LIST it is handed. The
// overlay sets the dot down on every draw and `syncStandpointDot`, at the end
// of `drawWalkers`, keeps or removes it judged on `drawnWalkers` — the list
// after the scene roof and the drawn-bounds cull — and puts it back when a
// later draw culls a body it once drew (a zoom-in rebuilds no overlay).
//
// ── THE CAN-FAIL FLIP ──────────────────────────────────────────────────────
//
//   in syncStandpointDot, `walkers: drawnWalkers` → `walkers: walkState.walkers`
//   → the [pin] reds, and on the page the far reader's dot is gone again.
//
// The first two tests need no browser and prove the RULE on the drawn set; the
// page tests (skipped, loudly, without playwright) prove the page hands the
// drawn set and not the list. The page rig is the one `tools/mine-stands-out
// .test.mjs` keeps: the repo's own spectator server, a stub office, a stub
// atlas sheet.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttp } from "node:http";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { pointInDrawnBounds, standpointDotShown, townRegionMarks } from "../spectator/viewer.mjs";
import { machinePage } from "./page-machine.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = readFileSync(join(ROOT, "spectator", "viewer.mjs"), "utf8");

// the founder's coordinates, and a drawn box the size of the town — the cull's
// own predicate, so the drawn set here is derived the way drawWalkers derives it
const FAR = { handle: "jetto-of-starforge", x: -95120, y: -95120, standing: true };
const NEAR = { handle: "jetto-of-starforge", x: 1539, y: 4316.5, standing: true };
const OTHER = { handle: "rei", x: 1092, y: -797, standing: true };
const TOWN = { minX: -3750, minY: -3750, maxX: 3750, maxY: 4500 };
const drawn = (walkers) => walkers.filter((w) => pointInDrawnBounds(w, TOWN));

test("a reader whose body is CULLED keeps the dot — the list said otherwise", () => {
  const walkers = [FAR, OTHER];
  assert.equal(drawn(walkers).length, 1, "the fixture must cull the far body, or this proves nothing");
  // the bug, stated: asked of the LIST the dot goes; asked of the DRAWN set it stays
  assert.equal(standpointDotShown({ spectating: false, handle: FAR.handle, walkers }), false,
    "on the list the reader has a body, so the dot is refused — that refusal is the founder's blank map");
  assert.equal(standpointDotShown({ spectating: false, handle: FAR.handle, walkers: drawn(walkers) }), true,
    "on the drawn set no body of his was drawn, so the dot stands in");
});

test("a reader whose body is DRAWN gets no dot — POS-93's rule holds on the same set", () => {
  const walkers = [NEAR, OTHER];
  assert.equal(drawn(walkers).length, 2, "the fixture must keep the near body, or this proves nothing");
  assert.equal(standpointDotShown({ spectating: false, handle: NEAR.handle, walkers: drawn(walkers) }), false);
  // and a spectator keeps the dot whatever was drawn — a camera has no body
  assert.equal(standpointDotShown({ spectating: true, handle: null, walkers: drawn(walkers) }), true);
});

test("[pin] the walker pass hands the DRAWN set to the decision, and the overlay no longer decides off the list", () => {
  assert.match(SOURCE, /const drawnWalkers = inView\.filter\(\(w\) => pointInDrawnBounds\(w, bounds\)\);[\s\S]{0,900}?syncStandpointDot\(drawnWalkers, px\);/,
    "drawWalkers must hand syncStandpointDot the walkers it drew, after the cull");
  assert.match(SOURCE, /function syncStandpointDot\(drawnWalkers, px\) \{[\s\S]{0,400}?standpointDotShown\(\{ spectating: isSpectating\(\), handle: state\.handle, walkers: drawnWalkers \}\)/,
    "the decision reads drawnWalkers");
  assert.match(SOURCE, /if \(!standing\) overlay\.insertAdjacentHTML\("beforeend", overlayStandpointSVG\(\{ at: px\(state\.cam\) \}\)\);/,
    "and a dot that went is put back when the body is culled again — the zoom-in case rebuilds no overlay");
  assert.doesNotMatch(SOURCE, /standpointDotShown\(\{[^}]*walkers: walkState\.walkers/,
    "no site may ask the decision of the walker LIST — that is the whole of the bug");
});

// ── the page ───────────────────────────────────────────────────────────────

const PLAYWRIGHT_PATHS = ["playwright"];
async function loadChromium() {
  for (const spec of PLAYWRIGHT_PATHS) {
    try { return (await import(spec)).chromium; } catch { /* try the next */ }
  }
  return null;
}
const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.on("error", reject);
  probe.listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});
const CLEANUP = [];
after(() => { for (const stop of CLEANUP.reverse()) { try { stop(); } catch { /* already gone */ } } });

// ── THE WORLD IS INVENTED, AND FIXED (WLD-119 B1) ──────────────────────────
//
// The page half used to take its two readers' homes and four neighbours from the
// committed record (real parcels, one reader standing at a real resident's exact
// coordinates) and to DROP any that had gone missing with .filter(Boolean). The
// rule under test ("a body that was not drawn is not a marker") has nothing to do
// with which house stands where today, and a withdrawn neighbour would have shrunk
// the fixture silently. So the rig serves a SYNTHETIC world through the server's
// own WORLD_DIR seam (WLD-29; the one resident-middle-on-the-page.test.mjs and
// placed-art.test.mjs use): a frame, one region ring, and the parcels invented
// below. Every member the page is told about is REQUIRED BY NAME (see must).
const TOWN_AT = { x: 0, y: 0 };
const plot = (who, at) => ({ id: `${who}/the-plot`, kind: "parcel", tier: "home", by: who, household: who, at, extent: { w: 25, h: 25 }, body: `${who}'s plot` });
// two readers with homes in the invented world: one whose read stands where the
// founder found jetto (139 km off the canvas), one whose read stands on their own parcel
const FAR_HOME = plot("rig-far-reader", { x: 1539, y: 4316.5 });
const NEAR_HOME = plot("rig-near-reader", { x: 200, y: 100 });
const HOME_OF = { "far-reader": FAR_HOME.id, "near-reader": NEAR_HOME.id };
const STANDPOINT_OF = {
  "far-reader": { x: -95120, y: -95120 },
  "near-reader": { ...NEAR_HOME.at },    // on their own parcel, the way the real read had it
};
const OTHER_PLOTS = [plot("rig-neighbour-1", { x: -240, y: -130 }), plot("rig-neighbour-2", { x: 380, y: 260 })];
const NEIGHBOURS = [NEAR_HOME.id, FAR_HOME.id, ...OTHER_PLOTS.map((m) => m.id)];
const REGION = { id: "rig-town/the-town-centre", kind: "sited", tier: "constitution", by: "rig-town", at: TOWN_AT, extent: { w: 1400, h: 1400 }, body: "a synthetic region",
  points: [{ x: -700, y: -700 }, { x: 700, y: -700 }, { x: 700, y: 700 }, { x: -700, y: 700 }] };
const FRAME = { id: "rig-town/let-there-be-light", kind: "sited", tier: "constitution", by: "rig-town", at: TOWN_AT, extent: { w: 40000, h: 40000 }, body: "the world frame" };
const MARKS = [FRAME, REGION, NEAR_HOME, FAR_HOME, ...OTHER_PLOTS];
const FOLD = {
  tick: 0, dials: {}, marks: MARKS,
  parcels: [NEAR_HOME, FAR_HOME, ...OTHER_PLOTS].map((p) => ({ id: p.id, household: p.household, at: p.at, extent: p.extent })),
  determined: {}, vague: [], rivalries: [], portfolios: {}, terrain_weight: {}, errors: [],
};
const SKELETON = {
  _grid: { cell_m: 1, scale: "5 m per atlas px", origin: "the Origin, synthetic: atlas (485,760)" },
  // what the fold path assembles a world from (assembleWorld reads these two); the town's own dials, invented here as constants
  elevation: { fog_ceiling_m: 22, quay_m: 5 },
  light: { dawn_pole_m: { x: 5075, y: 450 }, dark_pole_m: { x: -1900, y: 2150 } },
  features: [], far_features: [], physics_registry: {},
};
const byId = new Map(MARKS.map((m) => [m.id, m]));
/** a required member of the world, or a failure that names it: nothing is dropped silently */
const must = (id) => {
  const m = byId.get(id);
  if (!m) throw new Error(`fixture member "${id}" is required by this file and is not in the invented world`);
  return m;
};
function syntheticWorld() {
  const dir = mkdtempSync(join(tmpdir(), "wld119-dot-world-"));
  CLEANUP.push(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "world-state.json"), JSON.stringify(FOLD));
  writeFileSync(join(dir, "skeleton.json"), JSON.stringify(SKELETON));
  writeFileSync(join(dir, "walk-ledger.md"), "# walks\n\nsynthetic: nobody has walked in the rig\n");
  writeFileSync(join(dir, "enter-exit-ledger.md"), "# crossings\n\nsynthetic: nobody has entered anything in the rig\n");
  return dir;
}
test("THE INVENTED WORLD IS WHOLE: every member the page is told about is in it, by name, and none was dropped to make it fit", () => {
  const required = [...Object.values(HOME_OF), ...NEIGHBOURS, REGION.id, FRAME.id];
  const missing = required.filter((id) => !byId.has(id));
  assert.deepEqual(missing, [], "required fixture members absent from the invented world: " + missing.join(", "));
  assert.equal(NEIGHBOURS.length, 4, "four neighbours: both homes and two more");
  assert.equal(new Set(NEIGHBOURS).size, NEIGHBOURS.length, "no member listed twice");
  for (const h of Object.keys(HOME_OF)) assert.equal(must(HOME_OF[h]).kind, "parcel", h + "'s home is a parcel");
});
const readFor = (handle) => {
  const at = STANDPOINT_OF[handle] ?? { x: 0, y: 0 };
  return {
    handle,
    standpoint: { ...at, stance: "embodied", name: "the rig's standpoint" },
    within: [],
    nearby: NEIGHBOURS.map((id) => must(id)).map((m) => ({
      id: m.id, at: m.at, kind: m.kind, tier: m.tier, bearing: "N",
      distance_m: Math.round(Math.hypot(m.at.x - at.x, m.at.y - at.y)),
    })),
    // the ground set, because townGround refuses a record with no region rings
    records: Object.fromEntries([...townRegionMarks(MARKS), ...NEIGHBOURS.map((id) => must(id))]
      .map((m) => [m.id, m])),
    telling: "The rig's air is clear.",
    present: { residents: [] },
  };
};

// built eagerly, so a required member that is missing fails THIS FILE at once and by name, not as a page timeout later
const READS = Object.fromEntries(Object.keys(HOME_OF).map((h) => [h, readFor(h)]));
const HOMES = Object.fromEntries(Object.entries(HOME_OF).map(([h, id]) => [h, must(id)]));

async function bootStubOffice() {
  const port = await freePort();
  const srv = createHttp((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1:" + port);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    const send = (b) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
    if (url.pathname === "/ops/whoami") return send({ principal: "rig", handles: Object.keys(HOME_OF) });
    if (url.pathname === "/world/my-marks")
      return send({ drafts: [], docket: [], published: [], backed: [], counts: { drafts: 0, docket: 0, published: 0, backed: 0 }, complete: true });
    if (url.pathname === "/world/apex") return send(READS[url.searchParams.get("handle") ?? ""] ?? readFor(""));
    if (url.pathname.startsWith("/homes/")) {
      const handle = decodeURIComponent(url.pathname.slice("/homes/".length));
      const home = HOMES[handle];                                // a known handle's home is REQUIRED (HOMES, above)
      if (!home) return send({ world: null });                   // a handle the rig does not know has no home
      return send({ world: { sited: true, x: home.at.x, y: home.at.y, mark_id: home.id } });
    }
    // who ELSE is about: nobody — the reader's own body comes from the read
    if (url.pathname === "/world/present") return send({ at: 200, residents: [] });
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bounce", defect: "no such door in the rig" }));
  });
  await new Promise((resolve) => srv.listen(port, "127.0.0.1", resolve));
  CLEANUP.push(() => srv.close());
  return { port };
}
async function bootStubAtlas() {
  const port = await freePort();
  const SHEET = '<!doctype html><html><body>'
    + '<svg id="map-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 2400">'
    + '<rect x="0" y="0" width="1500" height="2400" fill="#101418"/>'
    + '</svg></body></html>';
  const srv = createHttp((req, res) => {
    if (req.url.startsWith("/atlas/")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(SHEET); }
    res.writeHead(404); res.end("");
  });
  await new Promise((resolve) => srv.listen(port, "127.0.0.1", resolve));
  CLEANUP.push(() => srv.close());
  return { port };
}
async function bootRig(atlasPort) {
  const port = await freePort();
  const proc = spawn(process.execPath, [join(ROOT, "spectator", "server.mjs")], {
    cwd: ROOT, env: { ...process.env, PORT: String(port), ATLAS_ORIGIN: "http://127.0.0.1:" + atlasPort, WORLD_DIR: syntheticWorld() },
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
  const atlas = await bootStubAtlas();
  const booted = await Promise.all([bootRig(atlas.port), bootStubOffice()]);
  rig = booted[0];
  office = booted[1];
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
});

async function openAs(handle) {
  const page = await machinePage(browser, { viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.route("**/WORLD/walk-ledger.md", (route) => route.fulfill({ status: 200, contentType: "text/markdown", body: "# empty\n" }));
  await page.addInitScript(([base, h]) => {
    try {
      localStorage.setItem("pm.office.base", base);
      localStorage.setItem("pm_key", "rig-key-not-a-secret");
      localStorage.setItem("pm.world.act_as", h);
    } catch {}
  }, ["http://127.0.0.1:" + office.port, handle]);
  await page.goto("http://localhost:" + rig.port + "/", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  await page.waitForFunction(() => document.querySelectorAll("#wv-overlay [data-id]").length > 0, null, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(6000);
  return { page, errors };
}
const readDot = (page, handle) => page.evaluate((h) => {
  const dot = document.querySelector("#wv-overlay .ov-standpoint");
  const vb = (document.querySelector(".wv-minimap > svg")?.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  return {
    dots: document.querySelectorAll("#wv-overlay .ov-standpoint").length,
    dotAt: dot?.getAttribute("transform") ?? null,
    body: !!document.querySelector(`#wv-walk-layer [data-handle="${CSS.escape(h)}"]`),
    // where the body is drawn, in painting units: since POS-373 a household body
    // is never culled, so the far reader's body is drawn, off the canvas
    bodyAt: (document.querySelector(`#wv-walk-layer g[transform][data-handle="${CSS.escape(h)}"]`)
      ?? document.querySelector(`#wv-walk-layer [data-handle="${CSS.escape(h)}"]`)?.closest("g[transform]"))
      ?.getAttribute("transform") ?? null,
    edge: !!document.querySelector(`#wv-housemate-edge-layer [data-handle="${CSS.escape(h)}"]`),
    bodies: document.querySelectorAll("#wv-walk-layer [data-handle]").length,
    readout: document.querySelector(".pos")?.textContent ?? null,
    viewBox: vb,
  };
}, handle);

const skipReason = "playwright is absent, so the page half of 'a culled body is not a marker' goes unguarded: "
  + "only the drawn-set rule and the source pin above are running.";

test("ON THE PAGE: a reader whose body stands 139 km off the canvas keeps the dot", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page, errors } = await openAs("far-reader");
  const seen = await readDot(page, "far-reader");
  await page.close();
  t.diagnostic("far-reader: " + JSON.stringify(seen));
  // POS-373 (Darko 2026-10-09): a household body is never culled, so the far
  // reader's body IS drawn now — 139 km off the canvas, where no screen shows
  // it. The dot is still decided on the drawn box, so it stands in, and an
  // edge chevron points at the body.
  const [, bx, by] = /translate\(([-\d.]+)[ ,]([-\d.]+)\)/.exec(String(seen.bodyAt)) ?? [];
  const [vx, vy, vw, vh] = seen.viewBox;
  assert.ok(Number(bx) < vx || Number(bx) > vx + vw || Number(by) < vy || Number(by) > vy + vh,
    "the far body must be off the canvas for this to mean anything: " + JSON.stringify(seen));
  assert.equal(seen.edge, true, "an edge chevron points at the far body: " + JSON.stringify(seen));
  assert.equal(seen.dots, 1, "no dot: the reader has no marker of any kind — " + JSON.stringify(seen));
  assert.match(String(seen.dotAt), /^translate\(/, "the dot carries a point");
  assert.deepEqual(errors, [], "the page threw: " + errors.join(" | "));
});

test("ON THE PAGE: a reader whose body is drawn gets no dot — one body, one marker", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page, errors } = await openAs("near-reader");
  const seen = await readDot(page, "near-reader");
  await page.close();
  t.diagnostic("near-reader: " + JSON.stringify(seen));
  assert.equal(seen.body, true, "the near body must be drawn for this to mean anything: " + JSON.stringify(seen));
  assert.equal(seen.dots, 0, "two markers on one person — the dot must go when the body is drawn: " + JSON.stringify(seen));
  assert.deepEqual(errors, [], "the page threw: " + errors.join(" | "));
});
