// art-window.test.mjs — a mark's picture shows while its SIZE ON SCREEN is in a window (WLD-205).
//
//   node --test tools/art-window.test.mjs
//
// Darko, 2026-11-18 19:34 EST, on the fixed 200 m: "the size of the mark should have like a certain
// zoom range, in which the image shows, and like if you zoom in like the larger marks images go away
// while smaller marks images form." Ruled "Go, as proposed": a picture shows while the mark's longest
// projected side is 24–192 CSS px, one eligible picture deep, picture and outline crossing over 8 px
// at each edge; the three numbers are dials. WLD-214 (Darko, 2026-11-19: "double the size threshold … so
// that you can be twice as close before images are no longer drawn") moved the upper edge to 384 and
// nothing else: 24 / 384 / 8.
//
// THE PURE HALF is the window itself (artWindowAlpha) and its dials. THE PAGE HALF drives a mounted
// page on a fixture world of INVENTED marks (this repo's WORLD copy, every live picture stripped, a few
// planted marks of known size), zooms across the window and reads what the two ground passes drew:
// the same unchanged mark wearing its outline, then its picture, then its outline again, and a
// large mark handing its picture down to the smaller one inside it. When Playwright is absent the
// page half SKIPS AND SAYS what went unguarded; a skip is not a pass.

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SPECTATOR_DRAW_DEFAULTS, artWindowAlpha, quantizeArtAlpha, ART_FADE_STEPS } from "../spectator/viewer.mjs";
import { machinePage } from "./page-machine.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = readFileSync(join(ROOT, "spectator/viewer.mjs"), "utf8");

// ── the window, pure ────────────────────────────────────────────────────────

test("the starting numbers are the ruled ones: 24 to 384 CSS px (the upper edge doubled, WLD-214), faded over 8", () => {
  assert.equal(SPECTATOR_DRAW_DEFAULTS.art_window_min_px, 24);
  assert.equal(SPECTATOR_DRAW_DEFAULTS.art_window_max_px, 384);
  assert.equal(SPECTATOR_DRAW_DEFAULTS.art_window_fade_px, 8);
});

test("the fixed 200 m is gone as a gate: no dial, no row, no reader of it in the town's pass", () => {
  assert.equal("placed_art_min_m" in SPECTATOR_DRAW_DEFAULTS, false, "the metre dial is not a default any more");
  assert.doesNotMatch(SOURCE, /state\.drawDials\.placed_art_min_m/, "nothing reads it");
  assert.doesNotMatch(SOURCE, /key: "placed_art_min_m"/, "and the panel does not offer it");
});

test("the window: nothing outside it, the whole picture across its middle, a straight ramp at each edge", () => {
  const a = (px) => artWindowAlpha(px);
  assert.equal(a(0), 0); assert.equal(a(10), 0); assert.equal(a(24), 0, "at the lower edge it has not come up yet");
  assert.equal(a(28), 0.5, "half up halfway through the 8 px");
  assert.equal(a(32), 1, "whole at 24 + 8");
  assert.equal(a(100), 1); assert.equal(a(184), 1, "whole where the old default began to fade");
  // THE DOUBLED EDGE (WLD-214): what 192 used to take away stays whole, and the same 8 px ramp now ends at 384
  assert.equal(a(188), 1, "the old halfway point of the ramp is now whole");
  assert.equal(a(192), 1, "the old upper edge is inside the window — the old default (192) fails here");
  assert.equal(a(300), 1);
  assert.equal(a(376), 1, "whole until 384 - 8");
  assert.equal(a(380), 0.5, "half gone halfway through the upper ramp");
  assert.equal(a(384), 0, "gone at the upper edge");
  assert.equal(a(500), 0); assert.equal(a(5000), 0);
  // an unreadable size is no picture: the outline is the safe answer
  for (const bad of [NaN, undefined, null, -3, Infinity]) assert.equal(a(bad), 0, `unreadable ${String(bad)} shows nothing`);
});

test("the window is dials: a non-default window, and a fade that cannot overlap itself", () => {
  const d = { art_window_min_px: 40, art_window_max_px: 100, art_window_fade_px: 10 };
  assert.equal(artWindowAlpha(40, d), 0); assert.equal(artWindowAlpha(45, d), 0.5); assert.equal(artWindowAlpha(50, d), 1);
  assert.equal(artWindowAlpha(95, d), 0.5); assert.equal(artWindowAlpha(100, d), 0);
  assert.equal(artWindowAlpha(30, d), 0, "below the moved edge — which the default 24 / 384 would have shown");
  assert.equal(artWindowAlpha(250, d), 0, "and over the moved upper edge — which the default would have shown whole");
  // no fade: a hard window, all or nothing
  const hard = { ...d, art_window_fade_px: 0 };
  assert.equal(artWindowAlpha(41, hard), 1); assert.equal(artWindowAlpha(99, hard), 1); assert.equal(artWindowAlpha(40, hard), 0);
  // a fade wider than half the window is held to half: the two edges meet, never cross
  const wide = { art_window_min_px: 40, art_window_max_px: 60, art_window_fade_px: 50 };
  assert.equal(artWindowAlpha(50, wide), 1, "the peak of the tent is whole");
  assert.equal(artWindowAlpha(45, wide), 0.5);
  // a backwards window shows nothing rather than everything
  assert.equal(artWindowAlpha(50, { art_window_min_px: 80, art_window_max_px: 40, art_window_fade_px: 8 }), 0);
  // the outline is the complement, so a crossfade is never short of one: the two shares add to 1
  for (const px of [25, 27, 30, 100, 190, 378, 382]) assert.equal(artWindowAlpha(px) + (1 - artWindowAlpha(px)), 1);
});

test("a fade is drawn and tracked in quarter steps — a zoom is a rebuild only when a picture has really moved", () => {
  assert.equal(ART_FADE_STEPS, 4);
  assert.deepEqual([0, 0.1, 0.13, 0.4, 0.5, 0.6, 0.88, 1].map(quantizeArtAlpha), [0, 0, 0.25, 0.5, 0.5, 0.5, 1, 1]);
  assert.equal(quantizeArtAlpha(NaN), 0);
  assert.equal(quantizeArtAlpha(7), 1, "clamped");
});

test("the three dials have rows beside the others, in the panel that re-draws", () => {
  for (const key of ["art_window_min_px", "art_window_max_px", "art_window_fade_px"])
    assert.match(SOURCE, new RegExp(`\\{ key: "${key}", label: "[^"]+", min: \\d+, max: \\d+, step: \\d+ \\}`), `${key} has a row`);
  // each default is reachable by its row's step, or the panel could never sit on the ruled number
  const rows = Object.fromEntries([...SOURCE.matchAll(/\{ key: "(art_window_\w+)", label: "[^"]+", min: (\d+), max: (\d+), step: (\d+) \}/g)]
    .map((m) => [m[1], { min: +m[2], max: +m[3], step: +m[4] }]));
  for (const [key, r] of Object.entries(rows)) {
    const v = SPECTATOR_DRAW_DEFAULTS[key];
    assert.ok(v >= r.min && v <= r.max && (v - r.min) % r.step === 0, `${key} = ${v} sits on its slider`);
  }
});

test("[pin] one window for both ground passes, a shared signature for the camera, and no second painting", () => {
  const fn = SOURCE.slice(SOURCE.indexOf("function drawPlacedArt("));
  const body = fn.slice(0, fn.indexOf("\n  }\n"));
  assert.doesNotMatch(body, /if \(tier === "near"\) \{ mapCtx\.placedArtLayer\.innerHTML = ""/, "near no longer clears the town's pictures");
  assert.match(SOURCE, /if \(sceneRoomId && tier === "near"\) \{ mapCtx\.placedArtLayer\.innerHTML = ""; return \{ shown: new Map\(\), subjects: \[\], spans: \[\] \}; \}/,
    "only a room's own scene keeps the old near behaviour");
  // a room keeps its old rule WHOLE: the region-at-mid exclusion and the painting-width ceiling are the room's
  assert.match(body, /if \(sceneRoomId\) \{[\s\S]*?if \(tier === "mid" && isRegionMark\(m\)\) return false;/, "a room still stands a region down at mid");
  assert.match(SOURCE, /if \(Number\.isFinite\(ceiling\) && span > ceiling\) return 0;/, "…and still refuses a mark wider than the whole painting");
  // F1: only an admitted ancestor covers
  assert.match(body, /free \*= 1 - \(sceneRoomId \|\| admit\(up\) \? ownAlpha\(up\) : 0\);/, "a pictured ancestor nobody is shown covers nothing");
  // F2: the outline is owed to every admitted picture subject, laid where the furnishing pass did not
  assert.match(SOURCE, /const owed = pictureSubjects\s*\.filter\(\(m\) => !outlined\.has\(m\.id\)/, "the subjects the furnishing pass did not outline get theirs");
  // N2: the camera watches the candidates the last draw retained, not the record
  assert.match(SOURCE, /mapCtx\.artSpans = artSpans;/, "the signature's spans are the draw's own retained candidates");
  assert.doesNotMatch(SOURCE, /artSpansNow/, "no walk of the whole record for pictures");
  assert.match(SOURCE, /quantizeArtAlpha\(artWindowAlpha\(placedArtSpanM\(m\) \* ppm, state\.drawDials\)\)/,
    "the longest side of the whole extent, times px per metre of the camera — never a clipped fragment, never a DPR px");
  assert.match(SOURCE, /\|\| artSignature\(\) !== drawnAt\.art/, "a crossing inside one tier is stale: the camera redraws");
  // the furnishing pass lays outlines only in the town; the picture is painted once, by the ground pass
  const furnish = SOURCE.slice(SOURCE.indexOf("THE TOWN'S WINDOW (WLD-205): the picture is the ground pass's"));
  const town = furnish.slice(0, furnish.indexOf("if (tier === \"mid\") { s += placeholderExtentSVG"))
    .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  assert.doesNotMatch(town, /sceneArtSVG/, "the town's branch never paints a picture itself");
  assert.match(town, /1 - a/, "its outline is the complement of the picture");
});

// ── the page ────────────────────────────────────────────────────────────────

async function loadChromium() { try { return (await import("playwright")).chromium; } catch { return null; } }
const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.on("error", reject);
  probe.listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

// invented marks, at the town centre (so a camera on it has them in frame), every live picture stripped
const SMALL = "fixture/the-small-yard";        //   30 x  24 m, planted in front of the reader and heavy enough (`weight`) that the engine's budget always shows it: a picture only when zoomed right in
const SMALL_SPAN = 30;                         // its longest side
const MEDIUM = "fixture/the-medium-garden";    //  400 x 300 m
const COVER = "fixture/the-covering-district"; // 1700 x 1200 m, pictured, with a pictured child inside it
const CHILD = "fixture/the-covered-child";     //  800 x  600 m
const BARE = "fixture/the-bare-parent";        // 1700 x 1200 m, NO picture
const BARE_CHILD = "fixture/the-bare-child";   //  900 x  700 m, pictured: nothing is above it
const REGION = "caelum/evermoon";              // a real region, a real ring: 1528 x 2353 m on the record
const ANNEX = "fixture/the-hidden-annex";      //  150 x 150 m, pictured, NOT a place and in nobody's drawn set: a pictured ancestor the reader is not shown
const ANNEX_CHILD = "fixture/the-annex-child"; //  300 x 300 m, a pictured place inside it by the record's placementParent
const FARMARK = "fixture/the-far-mark";        // 1,500 m, pictured, 40 km east: nowhere near any view (the refresh witness's world only)
function fixtureWorld({ variant = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "art-window-"));
  cpSync(join(ROOT, "WORLD"), dir, { recursive: true });
  const w = JSON.parse(readFileSync(join(dir, "world-state.json"), "utf8"));
  const image = w.marks.find((m) => m.id === "vermillion/the-pando-peak").image;
  for (const m of w.marks) delete m.image;            // the fixture owns its pictures
  const at = w.marks.find((m) => m.id === "the-town/the-town-centre")?.at ?? { x: 0, y: 0 };
  const root = "the-town/let-there-be-light";
  if (variant === "far-only") {
    // THE REFRESH WITNESS'S WORLD: the only picture on the record is one 40 km from any view the test takes
    // 215 m: 34 px at the opening view (whole) and 27 px two ticks out, across a quarter-step of the LOWER edge
    w.marks.push({ id: FARMARK, kind: "sited", tier: "market", by: "fixture", at: { x: at.x + 40000, y: at.y }, extent: { w: 215, h: 150 }, image, placementParent: root });
    writeFileSync(join(dir, "world-state.json"), JSON.stringify(w));
    return dir;
  }
  w.marks.push(
    // a pictured ANCESTOR nobody is shown (a 150 m thing in nobody's drawn set) over a pictured PLACE that is admitted
    { id: ANNEX, kind: "sited", tier: "market", by: "fixture", at: { x: at.x - 900, y: at.y + 500 }, extent: { w: 150, h: 150 }, image, placementParent: root },
    { id: ANNEX_CHILD, kind: "sited", tier: "market", by: "fixture", at: { x: at.x - 900, y: at.y + 500 }, extent: { w: 300, h: 300 }, image, placementParent: ANNEX },
    { id: MEDIUM, kind: "sited", tier: "market", by: "fixture", at: { x: at.x + 300, y: at.y }, extent: { w: 400, h: 300 }, image },
    { id: COVER, kind: "sited", tier: "market", by: "fixture", at: { x: at.x - 1800, y: at.y }, extent: { w: 1700, h: 1200 }, image, placementParent: root },
    { id: CHILD, kind: "sited", tier: "market", by: "fixture", at: { x: at.x - 1800, y: at.y }, extent: { w: 800, h: 600 }, image, placementParent: COVER },
    { id: BARE, kind: "sited", tier: "market", by: "fixture", at: { x: at.x + 1800, y: at.y }, extent: { w: 1700, h: 1200 }, placementParent: root },
    { id: BARE_CHILD, kind: "sited", tier: "market", by: "fixture", at: { x: at.x + 1800, y: at.y }, extent: { w: 900, h: 700 }, image, placementParent: BARE },
  );
  // THE SMALL SUBJECT IS PLANTED, NOT BORROWED: the field of view ranks what it shows by angular size and
  // `weight` under a budget, so a real small mark (the Post Office was used before) drops out of it whenever the
  // record grows marks near the centre. A heavy one planted at the reader's feet cannot.
  w.marks.push({ id: SMALL, kind: "sited", tier: "market", by: "fixture", at: { x: at.x + 60, y: at.y - 30 }, extent: { w: 30, h: 24 }, weight: 1000, image, placementParent: root });
  const region = w.marks.find((m) => m.id === REGION);
  if (region) region.image = image;
  writeFileSync(join(dir, "world-state.json"), JSON.stringify(w));
  return dir;
}

const CLEANUP = [];
after(() => { for (const stop of CLEANUP.reverse()) { try { stop(); } catch { /* already gone */ } } });
let chromium = null, port = null, farPort = null, browser = null;
async function bootRig(variant) {
  const p = await freePort();
  const proc = spawn(process.execPath, [join(ROOT, "spectator", "server.mjs")], {
    cwd: ROOT, env: { ...process.env, PORT: String(p), WORLD_DIR: fixtureWorld({ variant }) }, stdio: ["ignore", "pipe", "pipe"],
  });
  CLEANUP.push(() => proc.kill());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the rig did not announce itself in 30s")), 30_000);
    proc.stdout.on("data", (b) => { if (String(b).includes(`localhost:${p}`)) { clearTimeout(timer); resolve(); } });
    proc.on("exit", (c) => { clearTimeout(timer); reject(new Error(`the rig exited ${c} before serving`)); });
  });
  return p;
}
before(async () => {
  chromium = await loadChromium();
  if (!chromium) return;
  port = await bootRig(null);
  farPort = await bootRig("far-only");
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
});

const NO_PW = "NO PLAYWRIGHT — the window on a real page went UNGUARDED; the pure tests above prove the rule, not the picture.";

/** a mounted page with the camera's two readings: px per metre on the glass, and what is drawn */
async function openPage(viewport = { width: 1400, height: 900 }) {
  const page = await machinePage(browser, { viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://localhost:${port}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  await page.waitForFunction(() => document.querySelectorAll("#wv-overlay [data-id]").length > 0, null, { timeout: 60_000 }).catch(() => {});
  const readNow = () => page.evaluate(({ MEDIUM, IDS }) => {
    const byClip = new Map(IDS.map((id) => [id.replace(/[^a-z0-9-]/gi, ""), id]));
    const ov = document.getElementById("wv-overlay");
    const svg = document.querySelector(".wv-minimap > svg");
    const vb = svg.getAttribute("viewBox").split(" ").map(Number);
    const centre = (id) => { const e = ov.querySelector(`[data-id="${id}"]`); const b = e?.getBoundingClientRect(); return b ? [b.x + b.width / 2, b.y + b.height / 2] : null; };
    const arts = {};
    let medW = null;
    for (const g of document.querySelectorAll("#wv-placed-art-layer .wv-far-art")) {
      const clip = g.querySelector("clipPath")?.id?.replace(/^wv-art-clip-/, "") ?? "";
      const id = byClip.get(clip) ?? clip;
      if (id === MEDIUM) medW = Number(g.querySelector("image")?.getAttribute("width"));
      const wrap = g.parentElement?.classList.contains("wv-art-fade") ? Number(g.parentElement.getAttribute("opacity")) : 1;
      (arts[id] ??= []).push(wrap);
    }
    const outlines = {};
    for (const e of ov.querySelectorAll(".wv-ph-extent[data-id]")) {
      const wrap = e.parentElement?.classList.contains("wv-art-fade") ? Number(e.parentElement.getAttribute("opacity")) : 1;
      (outlines[e.dataset.id] ??= []).push(wrap);
    }
    return {
      tier: ov.getAttribute("data-tier"), vbw: vb[2], cw: svg.getBoundingClientRect().width,
      medW, arts, outlines,
      hits: [...document.querySelectorAll("#wv-placed-art-layer .wv-far-art-hit[data-id]")].map((e) => e.getAttribute("data-id")),
      pictured: [...ov.querySelectorAll(".ov-pip-pictured[data-id]")].map((e) => e.getAttribute("data-id")),
      sceneArt: ov.querySelectorAll(".wv-scene-mark-art").length,
      children: ov.childElementCount,
    };
  }, { MEDIUM, IDS: [SMALL, MEDIUM, COVER, CHILD, BARE, BARE_CHILD, REGION, ANNEX, ANNEX_CHILD] });
  // units per metre is the world's constant (mPerPx): read it once, off the width of MEDIUM's picture
  // (painting units for a 400 m extent), which is hung at the opening view
  let first = await readNow();
  for (let i = 0; i < 100 && !(first.medW > 0); i++) { await page.waitForTimeout(200); first = await readNow(); }
  const unitsPerMetre = first.medW / 400;
  assert.ok(Number.isFinite(unitsPerMetre) && unitsPerMetre > 0, `the camera can be read off a hung picture of known size (${JSON.stringify({ medW: first.medW, vbw: first.vbw, cw: first.cw, tier: first.tier })})`);
  const ppm = (r) => (r.cw / r.vbw) * unitsPerMetre;
  const signature = (r) => JSON.stringify([r.tier, r.vbw.toFixed(3), r.arts, r.outlines, r.children]);
  const settle = async () => {
    let last = signature(await readNow()), held = 0, waited = 0;
    while (held < 600 && waited < 30_000) {
      await page.waitForTimeout(150); waited += 150;
      const now = signature(await readNow());
      held = now === last ? held + 150 : 0; last = now;
    }
    return readNow();
  };
  // where MEDIUM stands on the screen at the opening view: the opening camera is the same every load, and
  // its dot is the one thing at far that is always there (it is inside the reader's field of view)
  const mediumDot = await page.evaluate((id) => { const b = document.querySelector(`#wv-overlay [data-id="${id}"]`)?.getBoundingClientRect(); return b ? [b.x + b.width / 2, b.y + b.height / 2] : null; }, MEDIUM);
  return { page, errors, readNow, settle, ppm, unitsPerMetre, first, mediumX: mediumDot?.[0] ?? 635, mediumY: mediumDot?.[1] ?? 90 };
}

// where each planted mark stands, in metres east of MEDIUM (they share a latitude)
const EAST_OF_MEDIUM = { [SMALL]: -240, [MEDIUM]: 0, [COVER]: -2100, [CHILD]: -2100, [BARE]: 1500, [BARE_CHILD]: 1500, [ANNEX]: -1200, [ANNEX_CHILD]: -1200 };
const SOUTH_OF_MEDIUM = { [SMALL]: -30, [ANNEX]: 500, [ANNEX_CHILD]: 500 };

/** wheel the camera in (-) or out (+) one notch at a time, the cursor held on `anchorId`'s centre
 *  (a wheel zooms about the cursor, so that point stays put), and hand each SETTLED reading to
 *  `visit`; stops when `visit` returns true or after `max` notches */
async function sweep(h, anchorId, dy, max, visit, { centre = false } = {}) {
  let r = await h.settle();
  const p0 = { x: h.mediumX + (EAST_OF_MEDIUM[anchorId] ?? 0) * h.ppm(h.first), y: h.mediumY + (SOUTH_OF_MEDIUM[anchorId] ?? 0) * h.ppm(h.first) };
  let p = { x: Math.min(1150, Math.max(150, p0.x)), y: Math.min(780, Math.max(120, p0.y)) };
  if (centre) {
    // THE SPECTATOR STANDS AT THE CENTRE OF ITS VIEW (viewCentreM): the field of view the engine ranks, and so
    // which small marks are shown at all, is taken from there. Zooming about a point off the centre walks the
    // standpoint away from a small subject, which then leaves the drawn set. So the subject is dragged to the
    // middle of the map first, and the wheel then zooms about the middle.
    const box = await h.page.evaluate(() => { const b = document.querySelector(".wv-minimap > svg").getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
    await h.page.mouse.move(p.x, p.y); await h.page.mouse.down();
    await h.page.mouse.move((p.x + box.x) / 2, (p.y + box.y) / 2, { steps: 8 });
    await h.page.mouse.move(box.x, box.y, { steps: 8 }); await h.page.mouse.up();
    p = box;
    r = await h.settle();
  }
  if (visit(r, h.ppm(r))) return r;
  for (let i = 0; i < max; i++) {
    // RE-AIM ON THE SUBJECT whenever it has a dot or an outline on the page: the first aim is read off a dot
    // 100 m away at far, an error that grows with the zoom until the subject has drifted out of the box
    const at = await h.page.evaluate((id) => { const b = document.querySelector(`#wv-overlay [data-id="${id}"]`)?.getBoundingClientRect(); return b && b.width > 0 ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; }, anchorId);
    if (at) p = { x: Math.min(1150, Math.max(150, at.x)), y: Math.min(780, Math.max(120, at.y)) };
    // the wheel goes to the svg itself, about the aim: a hover bubble under the pointer takes a mouse wheel
    await h.page.evaluate(({ x, y, dy: d }) => {
      document.querySelector(".wv-minimap > svg").dispatchEvent(new WheelEvent("wheel", { deltaY: d, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    }, { x: p.x, y: p.y, dy });
    r = await h.settle();
    if (visit(r, h.ppm(r))) return r;
  }
  return r;
}

const WIN = (px) => artWindowAlpha(px);   // the rule, as the test knows it

test("THE PAGE — one unchanged mark wears its outline, then its picture, then its outline again", async (t) => {
  if (!chromium) { t.skip(NO_PW); return; }
  const h = await openPage();
  const seen = [];
  // THE 400 m GARDEN, not the small yard: the doubled window (WLD-214) ends at 384 px, which a 30 m mark cannot reach
  // on any screen (the page zooms to 9.5 px per metre = 285 px), while the garden crosses 24 px at far and 384 px at mid.
  // The same unchanged mark, out to under 20 px and then in past 430.
  const visit = (r, ppm) => {
    const px = 400 * ppm;
    seen.push({ px, tier: r.tier, pic: r.arts[MEDIUM]?.[0] ?? 0, outline: r.outlines[MEDIUM]?.[0] ?? 0, pictured: r.pictured.includes(MEDIUM), ppm });
    return false;
  };
  await sweep(h, MEDIUM, +80, 14, (r, ppm) => { visit(r, ppm); return 400 * ppm < 14; });
  await sweep(h, MEDIUM, -80, 60, (r, ppm) => { visit(r, ppm); return 400 * ppm > 430; });
  assert.deepEqual(h.errors, [], "the page survived the zoom");
  assert.ok(seen.length > 8, `enough readings to cross the window (${seen.length})`);
  const above = seen.filter((s) => s.px > 392), below = seen.filter((s) => s.px < 20), inside = seen.filter((s) => s.px >= 33 && s.px <= 367);
  assert.ok(below.length && inside.length && above.length, `the sweep crossed both edges (below ${below.length}, in ${inside.length}, above ${above.length})`);
  // THE BAND THE DOUBLING KEEPS: between the old edge and the new one the picture is still whole
  const kept = seen.filter((s) => s.px >= 200 && s.px <= 367);
  assert.ok(kept.length >= 1, "a reading between the old 192 px edge and the new 384 px one was reached");
  for (const s of kept) assert.equal(s.pic, 1, `the picture is still whole at ${s.px.toFixed(1)} px (it was gone above 192 before WLD-214)`);
  // the same record the whole way: only the zoom moved
  for (const s of below) assert.equal(s.pic, 0, `no picture at ${s.px.toFixed(1)} px, under the window`);
  for (const s of above) assert.equal(s.pic, 0, `no picture at ${s.px.toFixed(1)} px, over the window`);
  for (const s of inside) assert.equal(s.pic, 1, `the whole picture at ${s.px.toFixed(1)} px, inside it`);
  for (const s of inside) assert.ok(!(s.outline > 0), `…and no outline laid over a whole picture at ${s.px.toFixed(1)} px`);
  // outside the window it is its outline, whole
  for (const s of [...below, ...above].filter((s) => s.tier !== "far")) assert.equal(s.outline, 1, `the outline stands at ${s.px.toFixed(1)} px`);
  // the crossing the camera must notice is INSIDE a tier: the mark's picture came up with the tier unchanged
  const edges = seen.slice(1).map((s, i) => [seen[i], s]).filter(([a, b]) => (a.pic === 0) !== (b.pic === 0) && a.tier === b.tier);
  assert.ok(edges.length >= 1, "a picture came up or went within one tier — the settle pass saw the window, not just the tier");
});

test("THE PAGE — the fade is a crossfade: picture and outline are complements, never both full, never both gone", async (t) => {
  if (!chromium) { t.skip(NO_PW); return; }
  const h = await openPage();
  const seen = [];
  await sweep(h, SMALL, -50, 120, (r, ppm) => {
    const px = SMALL_SPAN * ppm;
    seen.push({ px, pic: r.arts[SMALL]?.[0] ?? 0, outline: r.outlines[SMALL]?.[0], tier: r.tier });
    return px > 230;
  }, { centre: true });
  const ramp = seen.filter((s) => s.pic > 0 && s.pic < 1);
  assert.ok(ramp.length >= 1, `a notch landed inside an 8 px edge at least once (${seen.length} readings)`);
  for (const s of ramp) {
    assert.equal(s.pic, Math.round(WIN(s.px) * 4) / 4, `its share is the window's, in quarter steps (${s.px.toFixed(1)} px)`);
    assert.ok(Math.abs((s.outline ?? 1) + s.pic - 1) < 1e-9, `outline + picture = 1 at ${s.px.toFixed(1)} px (outline ${s.outline}, picture ${s.pic})`);
  }
  for (const s of seen.filter((s) => s.tier !== "far")) assert.ok(s.pic > 0 || (s.outline ?? 0) > 0, `never neither at ${s.px.toFixed(1)} px`);
});

test("THE PAGE — a large mark hands its picture down: a smaller one comes up as its large ancestor leaves the window", async (t) => {
  if (!chromium) { t.skip(NO_PW); return; }
  const h = await openPage();
  const seen = [];
  // the district is 1,700 m and the child 800 m inside it. With the window to 384 px the opening view (0.158 px/m:
  // the district 268 px, the child 126) has the district WEARING its picture over the child; zooming IN carries the
  // district past its upper edge (384 px = 0.226 px/m) while the child is still inside its window, and it comes up.
  await sweep(h, COVER, -80, 40, (r, ppm) => {
    seen.push({ cover: 1700 * ppm, child: 800 * ppm, c: r.arts[COVER]?.[0] ?? 0, k: r.arts[CHILD]?.[0] ?? 0, tier: r.tier });
    return 1700 * ppm > 440;
  });
  assert.deepEqual(h.errors, [], "no throw");
  // while the district is in the middle of its window, the child under it is down (one picture deep)
  const covered = seen.filter((s) => s.cover >= 40 && s.cover <= 367 && s.child >= 30);
  assert.ok(covered.length >= 1, "a view where both are in their windows was reached");
  for (const s of covered) { assert.equal(s.c, 1, "the district wears its picture"); assert.equal(s.k, 0, "and the smaller one inside it does not: one picture deep"); }
  // once the district has left, the child comes up on its own
  const handed = seen.filter((s) => s.cover > 392 && s.child >= 33 && s.child <= 367);
  assert.ok(handed.length >= 1, "a view where the district is gone and the child is in its window was reached");
  for (const s of handed) { assert.equal(s.c, 0, "the large picture is gone"); assert.equal(s.k, 1, "the smaller one has come up"); }
  // …and across the hand-off the two shares never stack beyond one picture
  for (const s of seen) assert.ok(s.c + s.k <= 1.0001, `at most one picture's worth on that ground (${s.c} + ${s.k} at ${s.cover.toFixed(0)}/${s.child.toFixed(0)} px)`);
});

test("THE PAGE — a large mark with no picture (or none showing) covers nothing: its pictured child comes up regardless", async (t) => {
  if (!chromium) { t.skip(NO_PW); return; }
  const h = await openPage();
  const seen = [];
  await sweep(h, BARE_CHILD, -80, 70, (r, ppm) => {
    seen.push({ child: 900 * ppm, k: r.arts[BARE_CHILD]?.[0] ?? 0, bare: r.arts[BARE] ?? [] });
    return 900 * ppm > 440;
  });
  const inWindow = seen.filter((s) => s.child >= 33 && s.child <= 367);
  assert.ok(inWindow.length >= 1, "the child was brought into its window");
  for (const s of inWindow) assert.equal(s.k, 1, "the picture-less parent above it blocks nothing");
  for (const s of seen) assert.deepEqual(s.bare, [], "and the parent, having no picture, hangs none");
});

test("THE PAGE — a mark's picture is painted once: no second copy in the furnishing pass, none under another id", async (t) => {
  if (!chromium) { t.skip(NO_PW); return; }
  const h = await openPage();
  const bad = [];
  await sweep(h, MEDIUM, -80, 50, (r, ppm) => {
    for (const [id, shares] of Object.entries(r.arts)) if (shares.length > 1) bad.push(`${id} x${shares.length} at ${ppm.toFixed(3)} ppm`);
    // the dot stands down under a picture that is mostly up, and is back when it is not
    const up = (r.arts[MEDIUM]?.[0] ?? 0) >= 0.5;
    if (r.pictured.includes(MEDIUM) !== up) bad.push(`the dot is ${r.pictured.includes(MEDIUM) ? "down" : "up"} with the picture ${up ? "up" : "down"} at ${(400 * ppm).toFixed(0)} px`);
    if (r.sceneArt) bad.push(`${r.sceneArt} scene pictures in the overlay at ${ppm.toFixed(3)} ppm (${r.tier})`);
    return 400 * ppm > 440;
  });
  assert.deepEqual(bad, [], "one picture per mark, from one pass");
});

test("THE PAGE — a region's hanging obeys the same window, at far; the region's floor paint is not the picture", async (t) => {
  if (!chromium) { t.skip(NO_PW); return; }
  const h = await openPage();
  const seen = [];
  // the region is 2,353 m on its longest side: 24 px needs ppm 0.0102, 384 px needs 0.163 — the opening view (0.158) is
  // INSIDE its window now, so a few notches in carry it over the upper edge, and the long way out takes it under the lower
  const regionRead = (r, ppm) => {
    const px = 2353 * ppm;
    seen.push({ px, tier: r.tier, pic: (r.arts["Evermoon"] ?? r.arts["evermoon"] ?? Object.entries(r.arts).find(([k]) => /evermoon/i.test(k))?.[1] ?? [0])[0], hits: r.hits.filter((x) => x === REGION).length });
  };
  await sweep(h, SMALL, -80, 6, (r, ppm) => { regionRead(r, ppm); return 2353 * ppm > 470; });
  await sweep(h, SMALL, +80, 40, (r, ppm) => { regionRead(r, ppm); return 2353 * ppm < 20; });
  const inside = seen.filter((s) => s.px >= 33 && s.px <= 367);
  const over = seen.filter((s) => s.px > 392);
  assert.ok(inside.length >= 1 && over.length >= 1, `the sweep crossed the region's window (${inside.length} in, ${over.length} over)`);
  for (const s of inside) assert.equal(s.pic, 1, `the region's picture hangs at ${s.px.toFixed(0)} px (${s.tier})`);
  for (const s of over) assert.equal(s.pic ?? 0, 0, `…and is gone at ${s.px.toFixed(0)} px, whatever the tier (${s.tier})`);
  // it is a door only while it is mostly up: no invisible hit layer
  for (const s of inside) assert.equal(s.hits, 1, "its hit target stands with the picture");
  for (const s of over) assert.equal(s.hits, 0, "and leaves with it");
});

test("THE PAGE — a non-default window moves the edges, with no reload", async (t) => {
  if (!chromium) { t.skip(NO_PW); return; }
  const h = await openPage();
  // MEDIUM, 400 m, at the opening zoom is ~63 px — inside 24–384
  let r = await h.settle();
  assert.ok((r.arts[MEDIUM] ?? [0])[0] === 1, `the medium garden wears its picture at the default window (px ${(400 * h.ppm(r)).toFixed(0)})`);
  // the panel's own input, as a hand would move it: open the dev pane, then the window goes 120..384 across
  await h.page.evaluate(() => { if (!document.querySelector('[data-draw-dial="art_window_min_px"]')) document.querySelector(".wv-dev-toggle")?.click(); });
  await h.page.waitForSelector('[data-draw-dial="art_window_min_px"]', { state: "attached", timeout: 10_000 });
  await h.page.evaluate(() => {
    const el = document.querySelector('[data-draw-dial="art_window_min_px"]');
    el.value = "120"; el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  r = await h.settle();
  assert.equal((r.arts[MEDIUM] ?? [0])[0], 0, "a picture under the moved lower edge is gone");
  assert.ok((r.outlines[MEDIUM] ?? [1])[0] > 0 || r.tier === "far", "…and the mark is its outline instead");
  await h.page.evaluate(() => {
    const el = document.querySelector('[data-draw-dial="art_window_min_px"]');
    el.value = "24"; el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  r = await h.settle();
  assert.equal((r.arts[MEDIUM] ?? [0])[0], 1, "put back, it is back");
  // …and a window crossing driven by a dial is stale-checked the same way a zoom is: the fade dial, too
  await h.page.evaluate(() => {
    const el = document.querySelector('[data-draw-dial="art_window_fade_px"]');
    el.value = "0"; el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  r = await h.settle();
  assert.equal((r.arts[MEDIUM] ?? [0])[0], 1, "a hard window still shows a picture that is inside it");
  assert.deepEqual(h.errors, []);
});

test("THE PAGE — a pan inside the margin rebuilds nothing; the window does not turn a drag into a redraw loop", async (t) => {
  if (!chromium) { t.skip(NO_PW); return; }
  const h = await openPage();
  await h.settle();
  await h.page.evaluate(() => {
    window.__rebuilds = 0;
    new MutationObserver((m) => { window.__rebuilds += m.filter((x) => x.type === "childList").length; })
      .observe(document.getElementById("wv-overlay"), { childList: true });
    new MutationObserver((m) => { window.__rebuilds += m.length; })
      .observe(document.getElementById("wv-placed-art-layer"), { childList: true });
  });
  // a small drag: well inside the half-viewport of margin the draw carries
  await h.page.mouse.move(600, 450); await h.page.mouse.down();
  await h.page.mouse.move(640, 460, { steps: 6 }); await h.page.mouse.move(660, 470, { steps: 6 });
  await h.page.mouse.up();
  await h.page.waitForTimeout(900);
  const n = await h.page.evaluate(() => window.__rebuilds);
  assert.equal(n, 0, "no overlay or picture-layer rebuild for a pan inside the margin");
});

// ── the review's batch (WLD-205 FIX): F1, F2, N2 ────────────────────────────

test("THE PAGE — F1: a pictured ancestor nobody is shown covers nothing: the admitted child under it keeps its picture", async (t) => {
  if (!chromium) { t.skip(NO_PW); return; }
  const h = await openPage();
  const seen = [];
  // the annex is 150 m and in nobody's drawn set; its child is a 300 m place by placementParent. At ppm 0.21-1.25 both are inside their windows.
  await sweep(h, ANNEX_CHILD, -80, 40, (r, ppm) => {
    seen.push({ ppm, annex: r.arts[ANNEX]?.[0] ?? 0, child: r.arts[ANNEX_CHILD]?.[0] ?? 0 });
    return ppm > 0.58;
  });
  const both = seen.filter((s) => s.ppm >= 0.26 && s.ppm <= 0.56);   // annex 39-84 px, child 78-168 px: both whole
  assert.ok(both.length >= 2, `readings where both are in their windows (${both.length})`);
  for (const s of seen) assert.equal(s.annex, 0, `the annex draws no picture of its own at ${s.ppm.toFixed(2)} ppm (it is not admitted)`);
  for (const s of both) assert.equal(s.child, 1, `…so it hides none of its child's at ${s.ppm.toFixed(2)} ppm`);
  assert.deepEqual(h.errors, []);
});

test("THE PAGE — F2: the outline is the picture's complement through BOTH edges and at EVERY tier, for a place outside the drawn set as much as a thing in it", async (t) => {
  if (!chromium) { t.skip(NO_PW); return; }
  const h = await openPage();
  const bad = [], tiers = new Set(), seen = { MEDIUM: 0, COVER: 0 };
  const check = (id, key, r, px) => {
    const a = r.arts[id]?.[0] ?? 0, o = r.outlines[id]?.[0];
    tiers.add(r.tier); seen[key] += 1;
    if (a >= 1) { if (o !== undefined) bad.push(`${key}: an outline lies under a whole picture at ${px.toFixed(0)} px (${r.tier})`); return; }
    if (o === undefined) bad.push(`${key}: NO outline at ${px.toFixed(0)} px, picture ${a} (${r.tier})`);
    else if (Math.abs(o + a - 1) > 1e-9) bad.push(`${key}: outline ${o} + picture ${a} is not 1 at ${px.toFixed(0)} px (${r.tier})`);
  };
  // out to the far lower edge of the 400 m garden (24 px = ppm 0.06), then all the way in past its upper edge (384 px = 0.96)
  // (the district is 2,100 m west of the garden, so it is only a candidate — in the drawn box — while it is no more than a
  // few hundred px away: its checks stop at 800 px across, where the zoom has carried it out of the box and it is rightly culled)
  const both = (r, ppm) => { check(MEDIUM, "MEDIUM", r, 400 * ppm); if (1700 * ppm <= 800) check(COVER, "COVER", r, 1700 * ppm); };
  await sweep(h, MEDIUM, +80, 14, (r, ppm) => { both(r, ppm); return 400 * ppm < 14; });
  await sweep(h, MEDIUM, -80, 60, (r, ppm) => { both(r, ppm); return 400 * ppm > 440; });
  assert.ok(seen.MEDIUM > 20 && seen.COVER > 20, `enough readings (${JSON.stringify(seen)})`);
  assert.ok(tiers.has("far") && tiers.has("mid"), `the sweep covered far and mid (${[...tiers]})`);
  assert.deepEqual(bad, [], "never a picture leaving its window for nothing");
});

test("THE PAGE — N2: a pictured mark nobody is shown crossing an edge of its window rebuilds nothing", async (t) => {
  if (!chromium) { t.skip(NO_PW); return; }
  // the only picture on this record is 40 km from any view: a 215 m mark, 34 px at the opening view and 27 px two ticks out
  const page = await machinePage(browser, { viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://localhost:${farPort}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  await page.waitForFunction(() => document.querySelectorAll("#wv-overlay [data-id]").length > 0, null, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(3500);
  const cam = () => page.evaluate(() => {
    const svg = document.querySelector(".wv-minimap > svg");
    return { vbw: Number(svg.getAttribute("viewBox").split(" ")[2]), cw: svg.getBoundingClientRect().width, tier: document.getElementById("wv-overlay")?.getAttribute("data-tier") };
  });
  const c0 = await cam();
  const ppm0 = (c0.cw / c0.vbw) * 0.2;                     // 5 m per painting unit on this world
  await page.evaluate(() => {
    window.__rebuilds = 0;
    new MutationObserver((m) => { window.__rebuilds += m.filter((x) => x.type === "childList").length; })
      .observe(document.getElementById("wv-overlay"), { childList: true });
    new MutationObserver((m) => { window.__rebuilds += m.length; })
      .observe(document.getElementById("wv-placed-art-layer"), { childList: true });
  });
  for (let i = 0; i < 2; i++) { await page.mouse.move(700, 450); await page.mouse.wheel(0, 80); await page.waitForTimeout(700); }
  await page.waitForTimeout(900);
  const c1 = await cam();
  const ppm1 = (c1.cw / c1.vbw) * 0.2;
  assert.equal(c1.tier, c0.tier, "the two ticks stay inside one tier");
  assert.ok(ppm1 < ppm0 * 0.85, `the camera really moved (${ppm0.toFixed(3)} -> ${ppm1.toFixed(3)} px/m)`);
  assert.notEqual(quantizeArtAlpha(artWindowAlpha(215 * ppm0)), quantizeArtAlpha(artWindowAlpha(215 * ppm1)), "…and it carried the far mark across a step of its window");
  assert.equal(await page.evaluate(() => window.__rebuilds), 0, "yet nothing was rebuilt: an unrelated picture is not a candidate");
  assert.deepEqual(errors, []);
  await page.close();
});
