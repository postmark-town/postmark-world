// chest-on-the-map.test.mjs — WLD-27: a chest on the map says what it holds,
// in the office's words, and a carried chest is not a free pip.
//
// "Map chest rendering shows its top class/kind and live count (e.g. `Pocket
// Comets: 18`). Held stacks appear on the holder's card and doorstep, NOT as
// free map pips. Supply World viewer and site rendering from the authoritative
// reads, not generated JSON edits or a second stored display count."
//
// The viewer reads the office's GET /world/chests (the fold of the record's
// acts at that read) and draws `.ov-chest-label` under the chest's pip; it keeps
// no count of its own. Two halves:
//
//   · PURE — the helpers the overlay calls, run anywhere.
//   · THE PAGE — the real viewer, served by spectator/server.mjs, its office a
//     stub that serves the chests read. Playwright and its Chromium are needed;
//     without them the page half SKIPS LOUDLY (it runs in the world suite's CI,
//     which installs Chromium). The rig is mine-stands-out.test.mjs's own.
//
// CAN-FAIL FLIPS: drop the `chestLabelSVG` call in drawOverlay → the label
// assertion reds; drop the `chestIsCarried` skip → the carried-pip assertion
// reds; serve no chests read → the control has no label (absence, made
// non-vacuous by asserting the chest's pip IS drawn).

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttp } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chestFacesOf, chestLabelText, chestIsCarried, chestLabelSVG, townRegionMarks } from "../spectator/viewer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVED = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));

// ── the pure part ──────────────────────────────────────────────────────────

test("the chests read becomes faces by id; the label is the office's own sentence", () => {
  const faces = chestFacesOf({ chests: [{ chest: "sbx-ana/the-bowl", shows: "Pocket Comets: 18", count: 18 }, { nope: 1 }, null] });
  assert.deepEqual([...faces.keys()], ["sbx-ana/the-bowl"]);
  assert.equal(chestLabelText(faces.get("sbx-ana/the-bowl")), "Pocket Comets: 18");
  assert.equal(chestLabelText({ shows: "" }), null);
  assert.equal(chestFacesOf(null).size, 0, "an office that did not answer is no chests, never a guess");
  assert.equal(chestIsCarried({ held_by: "sbx-cy" }), true);
  assert.equal(chestIsCarried({}), false);
});

test("the label markup is escaped, counter-scaled, and absent without a place or a sentence", () => {
  const svg = chestLabelSVG({ at: { x: 10, y: 20 }, id: "a/b", text: "<b>101 candies</b>" });
  assert.match(svg, /class="ov-chest-label" data-chest="a\/b"/);
  assert.match(svg, /&lt;b&gt;101 candies&lt;\/b&gt;/);
  assert.match(svg, /<g class="ov-s">/);
  assert.equal(chestLabelSVG({ at: { x: NaN, y: 0 }, id: "a/b", text: "x" }), "");
  assert.equal(chestLabelSVG({ at: { x: 1, y: 2 }, id: "a/b", text: null }), "");
});

// ── the page ───────────────────────────────────────────────────────────────

async function loadChromium() { try { return (await import("playwright")).chromium; } catch { return null; } }
const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.on("error", reject);
  probe.listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});
const CLEANUP = [];
after(() => { for (const stop of CLEANUP.reverse()) { try { stop(); } catch { /* already gone */ } } });

// Two SYNTHETIC chests beside the standpoint: one on the ground with a live
// count, one carried. They exist only in this rig's read — never in the record.
const STANDPOINT = { x: 221, y: 95.5 };
const GROUND = { id: "sbx-ana/the-bowl", by: "sbx-ana", kind: "sited", class: "chest", tier: "commons", at: { x: 230, y: 100 }, extent: { w: 2, h: 2 }, body: "A bowl of sweets." };
const CARRIED = { id: "sbx-bo/the-tin", by: "sbx-bo", kind: "sited", class: "chest", tier: "commons", at: { x: 212, y: 90 }, extent: { w: 1, h: 1 }, body: "A tin." };
const CHESTS = { chests: [
  { chest: GROUND.id, shows: "Pocket Comets: 18", count: 18, class: "candy", edges: [{ label: "pocket-comets", count: 18 }] },
  { chest: CARRIED.id, shows: "empty", count: 0, held_by: "sbx-cy" },
] };
const row = (m) => ({ id: m.id, at: m.at, kind: m.kind, tier: m.tier, distance_m: Math.round(Math.hypot(m.at.x - STANDPOINT.x, m.at.y - STANDPOINT.y)), bearing: "N" });
// SIGNED IN, as mine-stands-out.test.mjs is: the synthetic chests exist only in
// this rig's RESIDENT read (/world/apex), which only a signed-in page asks for —
// a spectator page draws WORLD/world-state.json, where they are not. (The first
// CI run of this file was a spectator page, and found no chest pip at all.)
const READ = {
  handle: "berthillon",
  standpoint: { ...STANDPOINT, name: "the rig's standpoint" }, within: [],
  nearby: [row(GROUND), row(CARRIED)],
  records: Object.fromEntries([...townRegionMarks(SERVED.marks), GROUND, CARRIED].map((m) => [m.id, m])),
  telling: "The rig's air is clear.", present: { residents: [] },
};

async function bootStubOffice({ chests }) {
  const port = await freePort();
  const srv = createHttp((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1:" + port);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    const send = (b) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
    if (url.pathname === "/ops/whoami") return send({ principal: "rig", handles: ["berthillon"] });
    if (url.pathname === "/world/my-marks") return send({ drafts: [], docket: [], published: [], backed: [], counts: { drafts: 0, docket: 0, published: 0, backed: 0 }, complete: true });
    if (url.pathname === "/world/apex") return send(READ);
    if (url.pathname === "/world/chests" && chests) return send(chests);
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bounce", defect: "no such door in the rig" }));
  });
  await new Promise((resolve) => srv.listen(port, "127.0.0.1", resolve));
  CLEANUP.push(() => srv.close());
  return { port };
}
async function bootStubAtlas() {
  const port = await freePort();
  const SHEET = '<!doctype html><html><body><svg id="map-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 2400">'
    + '<rect x="0" y="0" width="1500" height="2400" fill="#101418"/></svg></body></html>';
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
    cwd: ROOT, env: { ...process.env, PORT: String(port), ATLAS_ORIGIN: "http://127.0.0.1:" + atlasPort }, stdio: ["ignore", "pipe", "pipe"],
  });
  CLEANUP.push(() => proc.kill());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the rig did not announce itself in 30s")), 30_000);
    proc.stdout.on("data", (b) => { if (String(b).includes("localhost:" + port)) { clearTimeout(timer); resolve(); } });
    proc.on("exit", (code) => { clearTimeout(timer); reject(new Error("the rig exited " + code + " before serving")); });
  });
  return { port };
}

let chromium = null, rig = null, withChests = null, without = null, browser = null;
before(async () => {
  chromium = await loadChromium();
  if (!chromium) return;
  try { browser = await chromium.launch(); } catch { chromium = null; return; }
  CLEANUP.push(() => browser.close());
  const atlas = await bootStubAtlas();
  [rig, withChests, without] = await Promise.all([bootRig(atlas.port), bootStubOffice({ chests: CHESTS }), bootStubOffice({ chests: null })]);
});

async function look(office, { zoomToMid = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.addInitScript((base) => { try { localStorage.setItem("pm.office.base", base); } catch {} }, "http://127.0.0.1:" + office.port);
  await page.addInitScript(() => { try { localStorage.setItem("pm_key", "rig-key-not-a-secret"); localStorage.setItem("pm.world.act_as", "berthillon"); } catch {} });
  await page.goto("http://localhost:" + rig.port + "/", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  await page.waitForFunction((id) => !!document.querySelector(`#wv-overlay [data-id="${CSS.escape(id)}"]`), GROUND.id, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(4000);
  // ZOOM ONTO THE GROUND CHEST UNTIL THE MID TIER, where the furnishing pass
  // draws every art-less embodied mark as its tinted extent — the layer a
  // carried chest must ALSO leave (Bevel's review, finding 8). Small notches,
  // stopping at the tier, as placed-art.test.mjs learned to.
  if (zoomToMid) {
    for (let i = 0; i < 40; i++) {
      const at = await page.evaluate((id) => {
        const b = document.querySelector(`#wv-overlay [data-id="${CSS.escape(id)}"]`)?.getBoundingClientRect();
        return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : { x: 750, y: 475 };
      }, GROUND.id);
      await page.mouse.move(at.x, at.y);
      await page.mouse.wheel(0, -80);
      await page.waitForTimeout(160);
      if (await page.evaluate(() => document.getElementById("wv-overlay")?.getAttribute("data-tier")) !== "far") break;
    }
    await page.waitForTimeout(1500);
  }
  const seen = await page.evaluate(([g, c]) => ({
    tier: document.getElementById("wv-overlay")?.getAttribute("data-tier") ?? "-",
    groundExtent: !!document.querySelector(`#wv-overlay .wv-ph-extent[data-id="${CSS.escape(g)}"]`),
    // THE MAP'S LAYERS: the overlay (pips, furniture extents, art drawn over
    // extents, hit geometry) and the placed-art layer. The telling pane's cards
    // list what the office's read names nearby; that is the read's sentence,
    // not ground, and is not asserted here.
    carriedAnywhere: [...document.querySelectorAll(`#wv-overlay [data-id="${CSS.escape(c)}"], #wv-placed-art-layer [data-id="${CSS.escape(c)}"]`)].map((e) => e.getAttribute("class") ?? e.tagName),
    carriedArt: [...document.querySelectorAll("#wv-placed-art-layer .wv-far-art")].filter((a) => (a.getAttribute("aria-label") ?? "").includes("tin")).length,
    groundPip: !!document.querySelector(`#wv-overlay .ov-pip[data-id="${CSS.escape(g)}"]`),
    carriedPip: !!document.querySelector(`#wv-overlay [data-id="${CSS.escape(c)}"]`),
    label: document.querySelector(`#wv-overlay .ov-chest-label[data-chest="${CSS.escape(g)}"]`)?.textContent ?? null,
    labels: document.querySelectorAll("#wv-overlay .ov-chest-label").length,
  }), [GROUND.id, CARRIED.id]);
  await page.close();
  return { seen, errors };
}

const skipReason = "playwright is absent (or its Chromium will not launch) here, so the chest's drawn label and the carried chest's missing pip go unguarded on this machine (the world suite's CI runs them)";

test("THE CHEST ON THE GROUND SAYS WHAT IT HOLDS, IN THE OFFICE'S WORDS; THE CARRIED ONE IS NO PIP", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { seen, errors } = await look(withChests);
  assert.ok(seen.groundPip, "the chest on the ground drew no pip at all, so nothing below means anything");
  assert.equal(seen.label, "Pocket Comets: 18");
  assert.equal(seen.carriedPip, false, "a carried chest is drawn on its holder, never as a free pip");
  assert.deepEqual(errors, [], "the page threw: " + errors.join(" | "));
});

test("CONTROL: no chests read, no label — the map never invents a count", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { seen, errors } = await look(without);
  assert.ok(seen.groundPip, "the control drew no chest pip, so its absent label would be vacuous");
  assert.equal(seen.labels, 0);
  assert.ok(seen.carriedPip, "without the office's word that it is carried, the tin stays where the record puts it");
  assert.deepEqual(errors, [], "the page threw: " + errors.join(" | "));
});

test("THE CARRIED CHEST LEAVES EVERY LAYER: at mid its furniture extent is gone too, while the ground chest's is drawn", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { seen, errors } = await look(withChests, { zoomToMid: true });
  assert.notEqual(seen.tier, "far", "the page never left the far tier, so the furnishing pass was never asked");
  assert.ok(seen.groundExtent, "the ground chest drew no furniture extent at " + seen.tier + ", so the carried one's absence would be vacuous");
  assert.deepEqual(seen.carriedAnywhere, [], "a carried chest left something on its old ground: " + seen.carriedAnywhere.join(", "));
  assert.equal(seen.carriedArt, 0);
  assert.deepEqual(errors, [], "the page threw: " + errors.join(" | "));
});

test("CONTROL at mid: without the office's word that it is carried, the tin's extent IS on the ground", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { seen, errors } = await look(without, { zoomToMid: true });
  assert.notEqual(seen.tier, "far");
  assert.ok(seen.carriedAnywhere.length > 0, "the control drew nothing for the tin, so the carried test's absence proves nothing");
  assert.deepEqual(errors, [], "the page threw: " + errors.join(" | "));
});
