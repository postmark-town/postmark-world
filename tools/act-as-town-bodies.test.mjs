// act-as-town-bodies.test.mjs — act-as sees the town's people, and your
// housemates are always on the map (POS-373, 2026-10-09).
//
// Darko, 09-18: "Act As resident is actually quite limiting in terms of seeing
// where other residents are." The resident path drew only `/world/present`'s
// earshot rows, so acting as a resident showed a handful of people where the
// Spectator showed everyone. POS-452's 10-07 ruling, "presence stays on the
// walkers", is the later word over 09-13's "presence stays earshot".
//
// Darko, 10-09 13:35, the scope added: "the residents of your signed-in
// household are always highlighted, visible with their full profile art, so at
// a glance on the World page it's always obvious where your residents are, even
// if you don't have them selected as your act-as."
//
// ── THE CLAIMS ─────────────────────────────────────────────────────────────
//
//   1. acting as a resident draws the same bodies the Spectator draws, though
//      the earshot answer names only one of them
//   2. a housemate who is not the act-as is drawn with their face and a ring
//      in their own colour at the default zoom; so is a signed-in Spectator's
//   3. panned away, the housemate is still drawn (never culled) and an edge
//      chevron points toward them; the town's other bodies ARE culled there
//
// ── THE CAN-FAIL FLIPS ─────────────────────────────────────────────────────
//
//   resident branch `takeWalkers(withTownBodies(rows, …))` → `takeWalkers(rows)`  → claim 1 reds
//   `const ringOf = () => null;` and the far tier's face for the actor only        → claim 2 reds
//   drop `isOwnHandle(w.handle) ||` from drawWalkers' cull                         → claim 3 reds
//   `return [];` at the top of housemateEdges                                       → claim 3's chevron reds
//
// Run receipts in the lane report (docs/2026-10-09/rail/plumb-act-as-walkers/).

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttp } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { housemateEdges, townRegionMarks } from "../spectator/viewer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVED = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));

// ── the pure part ──────────────────────────────────────────────────────────

test("housemateEdges points at a housemate off the viewport, and at nobody else", () => {
  const viewport = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  const walkers = [
    { handle: "mate", x: 500, y: 50 },      // east, off screen
    { handle: "home", x: 50, y: 50 },       // a housemate on screen
    { handle: "stranger", x: -500, y: 50 }, // off screen, not of the house
    { handle: "nowhere" },                  // a housemate with no position
  ];
  const edges = housemateEdges({ walkers, handles: ["mate", "home", "nowhere"], viewport, inset: 10 });
  assert.deepEqual(edges.map((e) => e.handle), ["mate"]);
  assert.equal(edges[0].x, 90, "on the east edge, inset");
  assert.equal(edges[0].y, 50);
  assert.equal(edges[0].bearingDeg, 90, "and bearing east");
  assert.deepEqual(housemateEdges({ walkers, handles: [], viewport }), [], "no household, no chevrons");
});

// ── the page ───────────────────────────────────────────────────────────────

const PLAYWRIGHT_PATHS = ["playwright", "file:///G:/Wright-HQ/node_modules/playwright/index.mjs"];
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

// The reader stands on a placed parcel the record chose (derived, never pinned:
// the record is rewritten by every crossing). Everyone else stands at an offset
// from it, inside the painting.
const PLACED = SERVED.marks.filter((m) => m?.kind === "parcel" && m.at && Number.isFinite(m.at.x));
const HOUSE = PLACED.find((m) => m.at.x > -1500 && m.at.x < 4000 && m.at.y > -2800 && m.at.y < 7000) ?? null;
const STAND = { x: HOUSE?.at?.x ?? 0, y: HOUSE?.at?.y ?? 0 };
const off = (dx, dy) => ({ x: STAND.x + dx, y: STAND.y + dy });

const ACTOR = "rig-actor", MATE = "rig-mate", NEAR = "rig-near", TOWNIE = "rig-townie";
const MATE_COLOUR = "#3fa7d6";
const AT = { [ACTOR]: off(0, 0), [NEAR]: off(40, 30), [TOWNIE]: off(260, -180), [MATE]: off(-240, 160) };

const READ = {
  handle: ACTOR,
  standpoint: { ...STAND, name: "the rig's standpoint", stance: "embodied" },
  within: [],
  nearby: [],
  records: Object.fromEntries(townRegionMarks(SERVED.marks).map((m) => [m.id, m])),
  telling: "The rig's air is clear.",
  // earshot names ONE other person: the bodies layer must not stop there
  present: { residents: [{ handle: NEAR, at: AT[NEAR], standing: true }] },
};
const TOWN = {
  at: 187.5,
  walkers: [],
  standing: [ACTOR, NEAR, TOWNIE, MATE].map((h) => ({ handle: h, x: AT[h].x, y: AT[h].y, standing: true })),
};
const META = {
  generated: "2026-10-09T00:00:00Z",
  residents: {
    [MATE]: { name: "Rig Mate", avatar: "/media/rig-mate-avatar-card.png", color: MATE_COLOUR, household: "Rig House" },
    [ACTOR]: { name: "Rig Actor", color: "#d65f3f", household: "Rig House" },
  },
};
// a 1×1 png, so the face has bytes to show
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function bootStubOffice() {
  const port = await freePort();
  const srv = createHttp((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1:" + port);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    const send = (b) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
    if (url.pathname === "/ops/whoami") return send({ principal: false, household: "rig-house", handles: [ACTOR, MATE] });
    if (url.pathname === "/world/my-marks") {
      return send({ drafts: [], docket: [], published: [], backed: [],
        counts: { drafts: 0, docket: 0, published: 0, backed: 0 }, complete: true });
    }
    if (url.pathname === "/world/apex") return send(READ);
    if (url.pathname === "/world/present") return send({ at: 187.5, residents: READ.present.residents });
    if (url.pathname === "/world/walkers") return send(TOWN);
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
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), ATLAS_ORIGIN: "http://127.0.0.1:" + atlasPort },
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

// signedIn: a key and an act-as ("actor" or "spectator"); signed out: neither
async function openPage({ signedIn = false, actAs = ACTOR } = {}) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.route("**/world-engine/residents-meta.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(META) }));
  await page.route("**/media/rig-mate-avatar-card.png", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await page.addInitScript((base) => { try { localStorage.setItem("pm.office.base", base); } catch {} },
    "http://127.0.0.1:" + office.port);
  if (signedIn) {
    await page.addInitScript(() => { try { localStorage.setItem("pm_key", "rig-key-not-a-secret"); } catch {} });
    await page.addInitScript((h) => { try { localStorage.setItem("pm.world.act_as", h); } catch {} }, actAs);
  }
  await page.goto("http://localhost:" + rig.port + "/", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  await page.waitForFunction(() => document.querySelectorAll("#wv-walk-layer [data-handle]").length > 0,
    null, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(4000);
  return { page, errors };
}

const readBodies = (page, mate) => page.evaluate((mateHandle) => {
  const layer = document.querySelector("#wv-walk-layer");
  const glyph = layer?.querySelector(`g[data-handle="${mateHandle}"]`) ?? null;
  const frame = glyph?.querySelector(".wv-walker-frame") ?? null;
  const vb = (document.querySelector(".wv-minimap > svg")?.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  return {
    drawn: [...(layer?.querySelectorAll("g[data-handle]") ?? [])].map((g) => g.getAttribute("data-handle")).sort(),
    mate: glyph ? {
      cls: glyph.getAttribute("class"),
      image: glyph.querySelector("image.wv-walker-face")?.getAttribute("href") ?? null,
      ringVar: frame?.style.getPropertyValue("--wv-ring").trim() ?? null,
      stroke: frame ? getComputedStyle(frame).stroke : null,
    } : null,
    tier: document.querySelector("#wv-overlay")?.getAttribute("data-tier") ?? null,
    classes: Object.fromEntries([...(layer?.querySelectorAll("g[data-handle]") ?? [])]
      .map((g) => [g.getAttribute("data-handle"), g.getAttribute("class")])),
    edge: [...document.querySelectorAll("#wv-housemate-edge-layer [data-handle]")].map((g) => ({
      handle: g.getAttribute("data-handle"), text: g.textContent, color: g.style.color })),
    viewBox: vb,
  };
}, mate);

const skipReason = "playwright is absent, so the page's bodies go unguarded: "
  + "npm i in G:/Wright-HQ or install playwright here";

test("1. acting as a resident draws the same bodies the Spectator draws", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const spectator = await openPage();
  const seen = await readBodies(spectator.page, MATE);
  await spectator.page.close();
  const acting = await openPage({ signedIn: true });
  const asActor = await readBodies(acting.page, MATE);
  await acting.page.close();
  assert.deepEqual(seen.drawn, [ACTOR, MATE, NEAR, TOWNIE].sort(),
    "the Spectator draws the town's four bodies: " + JSON.stringify(seen));
  assert.deepEqual(asActor.drawn, seen.drawn,
    "act-as draws the bodies the Spectator draws, not only earshot's: " + JSON.stringify(asActor));
  assert.deepEqual(acting.errors, [], "no page errors");
});

test("2. a housemate who is not the act-as wears their face and their own ring at the default zoom", async (t) => {
  if (!chromium) return t.skip(skipReason);
  for (const actAs of [ACTOR, "__spectator__"]) {
    const { page, errors } = await openPage({ signedIn: true, actAs });
    const r = await readBodies(page, MATE);
    await page.close();
    assert.ok(r.mate, `${actAs}: the housemate is drawn: ` + JSON.stringify(r));
    // the default zoom is town width, where a neighbour is the empty frame
    assert.equal(r.tier, "far", `${actAs}: the default zoom is the far tier`);
    assert.match(r.classes[TOWNIE] ?? "", /wv-walker-far/, `${actAs}: a neighbour is the empty frame there`);
    assert.match(r.mate.cls, /wv-walker-near/, `${actAs}: the housemate is filled there`);
    assert.match(r.mate.cls, /is-mine/, `${actAs}: as the household's`);
    assert.doesNotMatch(r.mate.cls, /is-actor/, `${actAs}: and not as the act-as`);
    assert.equal(r.mate.image, META.residents[MATE].avatar, `${actAs}: with their profile picture: ` + JSON.stringify(r.mate));
    assert.equal(r.mate.ringVar, MATE_COLOUR, `${actAs}: ringed in their own colour`);
    assert.equal(r.mate.stroke, "rgb(63, 167, 214)", `${actAs}: and the ring is what the frame paints`);
    assert.deepEqual(errors, [], `${actAs}: no page errors`);
  }
});

// the skeleton's own registration, the same numbers the viewer parses
const ORIGIN_PX = { x: 485, y: 760 }, M_PER_PX = 5;
const worldCentre = (vb) => ({
  x: (vb[0] + vb[2] / 2 - ORIGIN_PX.x) * M_PER_PX,
  y: (vb[1] + vb[3] / 2 - ORIGIN_PX.y) * M_PER_PX,
  w: vb[2] * M_PER_PX,
});

// Zoom in over the act-as, then drag the camera away from the household until
// the housemate is off the screen and outside the drawn box. A real wheel and a
// real drag, because the cull and the chevron are both the camera's.
async function panAway(page) {
  const svg = await page.$(".wv-minimap > svg");
  const box = await svg.boundingBox();
  const at = await page.evaluate((h) => {
    const r = document.querySelector(`#wv-walk-layer g[data-handle="${h}"]`)?.getBoundingClientRect();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  }, ACTOR);
  await page.mouse.move(at?.x ?? box.x + box.width / 2, at?.y ?? box.y + box.height / 2);
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -240); await page.waitForTimeout(60); }
  await page.waitForTimeout(800);
  // drag toward the painting's wider side, a few strokes, until the camera is
  // far enough: the housemate beyond the viewport plus its cull margin
  const east = STAND.x < 1300;
  for (let i = 0; i < 8; i++) {
    const r = await readBodies(page, MATE);
    const c = worldCentre(r.viewBox);
    if (Math.abs(c.x - AT[MATE].x) > c.w * 2.2 && Math.abs(c.x - AT[TOWNIE].x) > c.w * 2.2) break;
    const y = box.y + box.height / 2;
    const from = east ? box.x + box.width * 0.85 : box.x + box.width * 0.15;
    const to = east ? box.x + box.width * 0.15 : box.x + box.width * 0.85;
    await page.mouse.move(from, y);
    await page.mouse.down();
    for (let s = 1; s <= 12; s++) await page.mouse.move(from + (to - from) * s / 12, y);
    await page.mouse.up();
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1500);
}

test("3. panned away, the housemate stays drawn and an edge chevron points at them", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page, errors } = await openPage({ signedIn: true });
  const before = await readBodies(page, MATE);
  assert.ok(before.drawn.includes(MATE) && before.edge.length === 0,
    "at the default zoom the housemate is on screen and needs no chevron: " + JSON.stringify(before));
  await panAway(page);
  const r = await readBodies(page, MATE);
  await page.close();
  const c = worldCentre(r.viewBox);
  const offBy = Math.abs(c.x - AT[MATE].x) / c.w;
  assert.ok(offBy > 2.2, `the camera left the housemate behind (${offBy.toFixed(2)} viewports): ` + JSON.stringify(r.viewBox));
  // the anti-vacuity half: the cull ran, so a body that is not the household's is gone
  assert.ok(!r.drawn.includes(TOWNIE), "the town's other bodies are culled out here: " + JSON.stringify(r.drawn));
  assert.ok(r.drawn.includes(MATE), "the housemate is never culled: " + JSON.stringify(r.drawn));
  assert.ok(r.mate?.image, "and still wears their face");
  const edge = r.edge.find((e) => e.handle === MATE);
  assert.ok(edge, "an edge chevron points at the housemate: " + JSON.stringify(r.edge));
  assert.match(edge.text, /Rig Mate/, "naming them");
  assert.equal(edge.color, "rgb(63, 167, 214)", "in their own colour");
  assert.ok(!r.edge.some((e) => e.handle === TOWNIE || e.handle === NEAR), "and nobody else gets one");
  assert.deepEqual(errors, [], "no page errors");
});
