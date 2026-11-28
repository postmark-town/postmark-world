// viewer-walk-hover.test.mjs — THE SELECTED WALK CARD KEEPS ITS HOVER WHILE THE POINTER RESTS ON IT (CORE-119, postmark#4774).
//
// Darko's words, 2026-11-17 17:38 EST: "While the pointer rests on that card, its hover state flashes on and off repeatedly instead of staying on."
// Only a still frame was kept, and the timer/redraw explanation was a guess. So this file RECORDS it: on the real local spectator, with an INVENTED
// resident (the rig below, not the town), a destination is chosen, the green "walk there (Enter)" card appears, the pointer is parked on it, and the
// page's own redraw (window.__pmViewer.rerender(), the call every walk update ends in) is run at animation cadence.
//
// WHAT WAS OBSERVED (before the fix, on main 777276be): `drawWalkPreview` rebuilt the preview layer's innerHTML on EVERY redraw. A stationary pointer then
// sits over a brand-new element, and Chromium gives a replaced element its :hover only on the NEXT frame (measured: 0 of 673 replaced cards were :hover
// in the task that replaced them; 673 of 673 had it a frame later at a 3 Hz redraw, so there it dropped for one frame at each redraw). A redraw inside every
// animation frame, which is when a body's walk animation redraws (animateWalks' rAF tick calls drawWalkers, which ends in renderWalkDestination), therefore
// painted the card unhovered in 71 of 72 captured frames. The repair is the simplest one: the card's markup is a function of the preview alone, so a redraw
// whose markup is the string already drawn writes nothing, and the standing elements keep their :hover.
//
// WHAT THIS FILE HOLDS. Two flips were run, each restored (receipts in the PR): FLIP A, delete the `if (markup === mapCtx.walkPreviewMarkup) return;` line
// (the old behaviour) → (1), (2), (4) and (5) go red and (3) stays green; FLIP B, make that line always return → (3) goes red (and the others, for want of a card).
//   (1) FRAME CADENCE REDRAWS WRITE NOTHING: 120 redraws, one per animation frame, leave the preview layer untouched (no childList mutation) and the SAME
//       card node standing, still :hover;
//   (2) PAINTED, NOT ASSUMED: of the frames the compositor actually presented while that ran, none after the first hovered one shows the resting card;
//   (3) A REAL CHANGE STILL REDRAWS: another destination replaces the card; Escape clears the layer; choosing again draws it; leaving and re-entering the
//       card un-hovers and re-hovers it;
//   (4) THE PHONE keeps the card (no pointer to rest, the same preview, the same single standing node);
//   (5) the source: the comparison sits before the one write, and the cleared state resets it.
// NOTHING IS CONFIRMED: no click on the card, no Enter, no walk; the rig's office has no walk door at all.

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttp } from "node:http";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { townRegionMarks } from "../spectator/viewer.mjs";
import { machinePage } from "./page-machine.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VIEWER = readFileSync(join(ROOT, "spectator", "viewer.mjs"), "utf8");

// ── THE WORLD AND THE RESIDENT ARE INVENTED ─────────────────────────────────
// A frame, one region ring, a parcel for the invented resident `rig-walker` and eight neighbours; the resident stands at the parcel. LOCAL FIXTURE: the live town
// is never read, and the stub office answers only the doors the page asks to draw.
const TOWN = { x: 0, y: 0 };
const plot = (who, at) => ({ id: `${who}/the-plot`, kind: "parcel", tier: "home", by: who, household: who, at, extent: { w: 25, h: 25 }, body: `${who}'s plot` });
const STANDPOINT = { x: 200, y: 100 };
const OWNED = plot("rig-walker", STANDPOINT);
const OTHERS = [[-300, -200], [-150, 260], [40, -340], [380, 220], [520, -60], [-460, 80], [90, 330], [-80, -90]]
  .map(([x, y], i) => plot(`rig-neighbour-${i + 1}`, { x: TOWN.x + x, y: TOWN.y + y }));
const NEIGHBOURS = [OWNED, ...OTHERS];
const REGION = { id: "rig-town/the-town-centre", kind: "sited", tier: "constitution", by: "rig-town", at: TOWN, extent: { w: 1400, h: 1400 }, body: "a synthetic region",
  points: [{ x: -700, y: -700 }, { x: 700, y: -700 }, { x: 700, y: 700 }, { x: -700, y: 700 }] };
const FRAME = { id: "rig-town/let-there-be-light", kind: "sited", tier: "constitution", by: "rig-town", at: TOWN, extent: { w: 40000, h: 40000 }, body: "the world frame" };
const MARKS = [FRAME, REGION, ...NEIGHBOURS];
const FOLD = {
  tick: 0, dials: {}, marks: MARKS,
  parcels: NEIGHBOURS.map((p) => ({ id: p.id, household: p.household, at: p.at, extent: p.extent })),
  determined: {}, vague: [], rivalries: [], portfolios: {}, terrain_weight: {}, errors: [],
};
const SKELETON = {
  _grid: { cell_m: 1, scale: "5 m per atlas px", origin: "the Origin, synthetic: atlas (485,760)" },
  elevation: { fog_ceiling_m: 22, quay_m: 5 },
  light: { dawn_pole_m: { x: 5075, y: 450 }, dark_pole_m: { x: -1900, y: 2150 } },
  features: [], far_features: [], physics_registry: {},
};
const READ = {
  handle: "rig-walker",
  standpoint: { ...STANDPOINT, name: "the rig's standpoint" },
  within: [],
  nearby: NEIGHBOURS.map((m) => ({ id: m.id, at: m.at, kind: m.kind, tier: m.tier, distance_m: Math.round(Math.hypot(m.at.x - STANDPOINT.x, m.at.y - STANDPOINT.y)), bearing: "N" })),
  records: Object.fromEntries([...townRegionMarks(MARKS), ...NEIGHBOURS].map((m) => [m.id, m])),
  telling: "The rig's air is clear.",
  present: { residents: [] },
};

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

async function bootStubOffice() {
  const port = await freePort();
  const srv = createHttp((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1:" + port);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    const send = (b) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
    if (url.pathname === "/ops/whoami") return send({ principal: "rig", handles: ["rig-walker"] });
    if (url.pathname === "/world/my-marks") return send({ drafts: [], docket: [], published: [OWNED], backed: [], counts: { drafts: 0, docket: 0, published: 1, backed: 0 }, complete: true });
    if (url.pathname === "/world/apex") return send(READ);
    // the invented resident stands at their parcel: the origin the walk preview needs
    if (url.pathname === "/world/walkers") return send({ walkers: [], standing: [{ handle: "rig-walker", x: STANDPOINT.x, y: STANDPOINT.y, standing: true }] });
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bounce", defect: "no such door in the rig" }));
  });
  await new Promise((resolve) => srv.listen(port, "127.0.0.1", resolve));
  CLEANUP.push(() => srv.close());
  return { port };
}
async function bootStubAtlas() {
  const port = await freePort();
  const SHEET = '<!doctype html><html><body><svg id="map-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 2400"><rect x="0" y="0" width="1500" height="2400" fill="#101418"/></svg></body></html>';
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
  const dir = mkdtempSync(join(tmpdir(), "core119-world-"));
  CLEANUP.push(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "world-state.json"), JSON.stringify(FOLD));
  writeFileSync(join(dir, "skeleton.json"), JSON.stringify(SKELETON));
  writeFileSync(join(dir, "walk-ledger.md"), "# walks\n\nsynthetic: nobody has walked in the rig\n");
  writeFileSync(join(dir, "enter-exit-ledger.md"), "# crossings\n\nsynthetic: nobody has entered anything in the rig\n");
  const proc = spawn(process.execPath, [join(ROOT, "spectator", "server.mjs")], {
    cwd: ROOT, env: { ...process.env, PORT: String(port), ATLAS_ORIGIN: "http://127.0.0.1:" + atlasPort, WORLD_DIR: dir }, stdio: ["ignore", "pipe", "pipe"],
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
  rig = booted[0]; office = booted[1];
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
});
const skipReason = "playwright is absent, so the whole of 'the walk card keeps its hover' goes unguarded: no source pin can tell a card that stays hovered from one rebuilt under the pointer.";

async function openRig({ width, height }) {
  const page = await machinePage(browser, { viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.addInitScript((base) => { try { localStorage.setItem("pm.office.base", base); localStorage.setItem("pm_key", "rig-key-not-a-secret"); localStorage.setItem("pm.world.act_as", "rig-walker"); } catch {} },
    "http://127.0.0.1:" + office.port);
  await page.goto("http://localhost:" + rig.port + "/", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  await page.waitForFunction(() => !!document.getElementById("wv-walk-preview-layer") && document.querySelectorAll("#wv-overlay [data-id]").length > 0, null, { timeout: 60_000 });
  // the stub's standing row is read on the page's first poll: wait until the resident has an origin (the desk stops saying it has none)
  await page.waitForFunction(() => window.__pmViewer?.walkDraws?.().actorReads > 0, null, { timeout: 30_000 });
  await page.waitForTimeout(2500);
  return { page, errors };
}
const mapBox = (page) => page.evaluate(() => { const r = document.getElementById("wv-walk-preview-layer").closest("svg").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const chipBox = (page) => page.evaluate(() => {
  const g = document.querySelector('[data-walk-chip="go"]'); if (!g) return null;
  const r = g.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, left: r.x, w: r.width, h: r.height };
});
async function chooseDestination(page, fx, fy) {
  const b = await mapBox(page);
  await page.mouse.click(b.x + b.w * fx, b.y + b.h * fy);
  await page.waitForFunction(() => !!document.querySelector('[data-walk-chip="go"]'), null, { timeout: 15_000 });
}

test("(1) REDRAWS AT ANIMATION CADENCE WRITE NOTHING: the card the pointer rests on is the same node, untouched, and still hovered", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page, errors } = await openRig({ width: 1500, height: 950 });
  try {
    await chooseDestination(page, 0.35, 0.55);
    const chip = await chipBox(page);
    assert.ok(chip, "choosing a destination drew no green card: a precondition, not a verdict");
    await page.mouse.move(chip.x, chip.y);
    await page.waitForFunction(() => document.querySelector('[data-walk-chip="go"]')?.matches(":hover"), null, { timeout: 10_000 });
    const seen = await page.evaluate(() => new Promise((resolve) => {
      const layer = document.getElementById("wv-walk-preview-layer");
      const card = document.querySelector('[data-walk-chip="go"]');
      let writes = 0;
      new MutationObserver((m) => { writes += m.filter((x) => x.type === "childList").length; }).observe(layer, { childList: true });
      let n = 0;
      const frame = () => {
        window.__pmViewer.rerender();                       // the page's own redraw, one per animation frame
        if (++n < 120) return requestAnimationFrame(frame);
        requestAnimationFrame(() => requestAnimationFrame(() => resolve({ redraws: n, writes, sameNode: document.querySelector('[data-walk-chip="go"]') === card, hovered: document.querySelector('[data-walk-chip="go"]')?.matches(":hover") === true })));
      };
      requestAnimationFrame(frame);
    }));
    assert.equal(seen.redraws, 120);
    assert.equal(seen.writes, 0, "the preview layer was rebuilt " + seen.writes + " times by redraws that changed nothing: the card under a resting pointer is a new element each time");
    assert.ok(seen.sameNode, "the card the pointer rests on is no longer the card that was there");
    assert.ok(seen.hovered, "the card is not hovered after the redraws");
    assert.deepEqual(errors, [], "the page threw: " + errors.join(" | "));
  } finally { await page.close(); }
});

// the painted truth: every frame the compositor presented is decoded and its pixel inside the card read (hovered = the green fill; resting = the dark one)
test("(2) PAINTED, NOT ASSUMED: after the first hovered frame, no presented frame shows the resting card while redraws run at animation cadence", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page, errors } = await openRig({ width: 1500, height: 950 });
  try {
    await chooseDestination(page, 0.35, 0.55);
    const chip = await chipBox(page);
    assert.ok(chip, "no green card: a precondition");
    const frames = [];
    const cdp = await page.context().newCDPSession(page);
    cdp.on("Page.screencastFrame", (f) => { frames.push(f.data); cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}); });
    await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
    await page.mouse.move(chip.x, chip.y);
    await page.evaluate(() => { let n = 0; const frame = () => { window.__pmViewer.rerender(); if (++n < 240) requestAnimationFrame(frame); }; requestAnimationFrame(frame); });
    await page.waitForTimeout(4500);
    await cdp.send("Page.stopScreencast");
    const px = { x: Math.round(chip.left + 5), y: Math.round(chip.y - chip.h * 0.25) };
    const reader = await page.context().newPage();
    await reader.goto("about:blank");
    const kinds = await reader.evaluate(async ({ frames, px }) => {
      const out = [];
      for (const data of frames) {
        const img = await createImageBitmap(await (await fetch("data:image/png;base64," + data)).blob());
        const c = new OffscreenCanvas(img.width, img.height); const g = c.getContext("2d"); g.drawImage(img, 0, 0);
        const [r, gr, b] = g.getImageData(px.x, px.y, 1, 1).data;
        out.push(gr > 130 && gr > r + 30 ? "G" : r + gr + b < 150 ? "D" : "?");
      }
      return out.join("");
    }, { frames, px });
    await reader.close();
    const afterFirst = kinds.slice(kinds.indexOf("G") + 1);
    assert.ok(kinds.includes("G"), "no frame ever painted the hovered card (pixel " + JSON.stringify(px) + "): " + kinds);
    assert.ok(afterFirst.length >= 10, "too few presented frames to say anything: " + kinds);
    assert.equal(afterFirst.includes("D"), false, "the resting card was painted after the hover had shown (G=hovered, D=resting): " + kinds);
    assert.deepEqual(errors, [], "the page threw: " + errors.join(" | "));
  } finally { await page.close(); }
});

test("(3) A REAL CHANGE STILL REDRAWS: another destination replaces the card, Escape clears it, choosing again draws it, and leaving and re-entering it un-hovers and re-hovers it", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page, errors } = await openRig({ width: 1500, height: 950 });
  try {
    await chooseDestination(page, 0.35, 0.55);
    const first = await page.evaluate(() => { const g = document.querySelector('[data-walk-chip="go"]'); window.__first = g; return g.closest("g.wv-walk-chip").textContent.trim(); });
    // another destination: a different preview, so a different card, drawn
    await chooseDestination(page, 0.62, 0.35);
    const second = await page.evaluate(() => ({ replaced: document.querySelector('[data-walk-chip="go"]') !== window.__first, text: document.querySelector('[data-walk-chip="go"]').closest("g.wv-walk-chip").textContent.trim() }));
    assert.ok(second.replaced, "a different destination left the old card standing");
    assert.notEqual(second.text, first, "the card's words did not follow the new destination");
    // leaving and re-entering
    const chip = await chipBox(page);
    await page.mouse.move(chip.x, chip.y);
    await page.waitForFunction(() => document.querySelector('[data-walk-chip="go"]')?.matches(":hover"), null, { timeout: 10_000 });
    await page.mouse.move(20, 20);
    await page.waitForFunction(() => document.querySelector('[data-walk-chip="go"]')?.matches(":hover") === false, null, { timeout: 10_000 });
    await page.mouse.move(chip.x, chip.y);
    await page.waitForFunction(() => document.querySelector('[data-walk-chip="go"]')?.matches(":hover"), null, { timeout: 10_000 });
    // Escape cancels the selection (never Enter: nothing is confirmed here); the layer is cleared and choosing again draws a card
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector('[data-walk-chip="go"]'), null, { timeout: 10_000 });
    assert.equal(await page.evaluate(() => document.getElementById("wv-walk-preview-layer").childElementCount), 0, "Escape left the preview layer drawn");
    await chooseDestination(page, 0.35, 0.55);
    assert.deepEqual(errors, [], "the page threw: " + errors.join(" | "));
  } finally { await page.close(); }
});

test("(4) THE PHONE keeps the card, drawn once and left standing through the same redraws", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page, errors } = await openRig({ width: 390, height: 844 });
  try {
    await chooseDestination(page, 0.5, 0.45);
    const seen = await page.evaluate(() => new Promise((resolve) => {
      const layer = document.getElementById("wv-walk-preview-layer");
      const card = document.querySelector('[data-walk-chip="go"]');
      let writes = 0;
      new MutationObserver((m) => { writes += m.filter((x) => x.type === "childList").length; }).observe(layer, { childList: true });
      let n = 0;
      const frame = () => { window.__pmViewer.rerender(); if (++n < 60) return requestAnimationFrame(frame); requestAnimationFrame(() => resolve({ writes, same: document.querySelector('[data-walk-chip="go"]') === card, drawn: !!card })); };
      requestAnimationFrame(frame);
    }));
    assert.ok(seen.drawn, "no card on the phone viewport: a precondition");
    assert.equal(seen.writes, 0);
    assert.ok(seen.same);
    assert.deepEqual(errors, [], "the page threw: " + errors.join(" | "));
  } finally { await page.close(); }
});

test("(5) THE SOURCE: the card's markup is compared with what is drawn before the one write, and the cleared state forgets it", () => {
  const draw = VIEWER.slice(VIEWER.indexOf("function drawWalkPreview()"), VIEWER.indexOf("// ONE DRAW PER ANSWER THAT MOVED SOMEBODY"));
  assert.ok(draw.length > 500, "drawWalkPreview was not found");
  assert.equal((draw.match(/layer\.innerHTML = markup;/g) ?? []).length, 1, "one write of the card");
  assert.ok(draw.indexOf("if (markup === mapCtx.walkPreviewMarkup) return;") > 0 && draw.indexOf("if (markup === mapCtx.walkPreviewMarkup) return;") < draw.indexOf("layer.innerHTML = markup;"),
    "the comparison must come before the write");
  assert.match(draw, /layer\.innerHTML = "";\s*mapCtx\.walkPreviewMarkup = "";/, "clearing the preview forgets what was drawn, or the same card could never be drawn again");
  assert.doesNotMatch(VIEWER.replace(draw, ""), /walkPreviewLayer\.innerHTML|walkPreviewLayer\.replaceChildren/, "nothing else writes the layer behind the comparison's back");
});
