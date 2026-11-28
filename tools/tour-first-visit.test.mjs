// tour-first-visit.test.mjs — WLD-220 (Darko 2026-11-20: "stale ... too much superfluous information ... straight and to the point for someone visiting the page
// for the first time"), the first-visit tour on the REAL page, on a phone and on a desktop.
//
//   node --test tools/tour-first-visit.test.mjs
//
// THE PICTURE IS THE PAGE (Darko 2026-11-21 22:01 EST: "the tour needs to take assets directly from the actual world page"; Wright 03:01Z): the tour draws nothing of its own.
// Its example steps light a piece of the MOUNTED map in place: a house with a resident standing at it, a mark drawn with its own picture, a dot to read. This file proves that on the
// shipped viewer served by the real server (tools/page-machine.mjs, the repo's public WORLD snapshot, signed in as nobody): that each lit target is a real element of the mounted scene,
// named by its public id, wholly inside the spotlight; that the tour carries no drawing, svg or picture panel of its own; that the page underneath (camera, highlight, selection) comes back as
// it was; and the rest of the deck's behaviour (greeting, next / back / a dot / done / skip, the ?, the docs link, Tab, containment on every screen).
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { machineContext } from "./page-machine.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
async function loadChromium() { try { return (await import("playwright")).chromium; } catch { return null; } }
const freePort = () => new Promise((resolve, reject) => {
  const probe = createNetServer();
  probe.on("error", reject);
  probe.listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});
const CLEANUP = [];
after(() => { for (const stop of CLEANUP.reverse()) { try { stop(); } catch { /* gone */ } } });
async function bootRig() {
  const port = await freePort();
  const proc = spawn(process.execPath, [join(ROOT, "spectator", "server.mjs")], {
    cwd: ROOT, env: { ...process.env, PORT: String(port), ATLAS_ORIGIN: "http://127.0.0.1:1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  CLEANUP.push(() => proc.kill());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the rig did not announce itself in 30s")), 30_000);
    proc.stdout.on("data", (b) => { if (String(b).includes(`localhost:${port}`)) { clearTimeout(timer); resolve(); } });
    proc.on("exit", (c) => { clearTimeout(timer); reject(new Error(`the rig exited ${c} before serving`)); });
  });
  return port;
}

let chromium = null, browser = null, port = null;
before(async () => {
  chromium = await loadChromium();
  if (!chromium) return;
  port = await bootRig();
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
});

// the tour as the page has it: where each control and the card stand, whether every one is wholly on the screen and inside the card, WHAT THE STEP LIT on the mounted map
// (the ids the card names, and whether each is a real element of the scene inside the spotlight), and what the tour itself drew (nothing)
const readTour = (page) => page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height }; };
  const card = box(q(".wv-tour-card"));
  const parts = [...document.querySelectorAll(".wv-tour-dot")].map(box).concat([".wv-tour-skip", ".wv-tour-back", ".wv-tour-next"].map((s) => box(q(s))));
  const inside = (b, o) => b.x >= o.x - 0.5 && b.right <= o.right + 0.5 && b.y >= o.y - 0.5 && b.bottom <= o.bottom + 0.5;
  const screen = { x: 0, y: 0, right: innerWidth, bottom: innerHeight };
  const cardEl = q(".wv-tour-card");
  const kind = cardEl?.dataset.sceneKind ?? "", ids = (cardEl?.dataset.scene ?? "").split(" ").filter(Boolean);
  const spotEl = q(".wv-tour-spot"), spot = spotEl && !spotEl.hidden ? box(spotEl) : null;
  // the mounted map's own svg: every lookup is made inside it, by the classes and ids the map itself writes
  const mapSvg = q(".wv-minimap > svg"), overlay = mapSvg, walks = mapSvg, placed = mapSvg?.querySelector("#wv-placed-art-layer");
  const esc = (s) => CSS.escape(s);
  const within = (b, o) => !!b && !!o && b.x >= o.x - 1 && b.right <= o.right + 1 && b.y >= o.y - 1 && b.bottom <= o.bottom + 1;
  const meets = (b, o) => !!b && !!o && b.x < o.right && b.right > o.x && b.y < o.bottom && b.bottom > o.y;
  // each lit target, looked up in the MOUNTED scene by its public id, with whether it lies wholly inside the spotlight
  const lit = {};
  if (kind === "house") {
    const pip = overlay?.querySelector(`.ov-pip.ov-pip-home[data-id="${esc(ids[0])}"]`), man = walks?.querySelector(`.wv-walker-far[data-handle="${esc(ids[1])}"]`);   // the far tier's frame on two legs: the tour frames to just inside that tier, so it is the piece drawn
    lit.house = { found: !!pip, inSpot: within(box(pip), spot), rect: box(pip), count: overlay?.querySelectorAll(`.ov-pip[data-id="${esc(ids[0])}"]`).length };
    lit.resident = { found: !!man, inSpot: within(box(man), spot), rect: box(man), moving: !!man?.classList.contains("moving"), stroke: man ? getComputedStyle(man.querySelector(".wv-walker-frame")).stroke : null };
  }
  if (kind === "picture") {
    const pip = overlay?.querySelector(`.ov-pip.ov-pip-pictured[data-id="${esc(ids[0])}"]`);
    const arts = [...(placed?.querySelectorAll("image") ?? [])];
    lit.pip = { found: !!pip, inSpot: within(box(pip), spot), rect: box(pip) };
    lit.art = { count: arts.filter((a) => meets(box(a), spot)).length, hrefs: arts.filter((a) => meets(box(a), spot)).map((a) => a.getAttribute("href")) };
  }
  if (kind === "dot") {
    const pip = overlay?.querySelector(`.ov-pip.ov-pip-home[data-id="${esc(ids[0])}"]`);
    lit.dot = { found: !!pip, inSpot: within(box(pip), spot), rect: box(pip) };
  }
  // THE FRAME IS FULL OF MAP (CORE-153): the share of the map pane the painting's paper (.wv-tg-paper, its own extent) does not cover, in screen pixels
  const paneR = q(".wv-minimap")?.getBoundingClientRect(), paperR = q(".wv-minimap .wv-tg-paper")?.getBoundingClientRect();
  let voidShare = null;
  if (paneR && paperR && paneR.width > 0 && paneR.height > 0) {
    const iw = Math.max(0, Math.min(paneR.right, paperR.right) - Math.max(paneR.left, paperR.left)), ih = Math.max(0, Math.min(paneR.bottom, paperR.bottom) - Math.max(paneR.top, paperR.top));
    voidShare = 1 - (iw * ih) / (paneR.width * paneR.height);
  }
  // THE CARD'S ICONS ARE THE MAP'S DRAWINGS (CORE-153): each inline icon's own shape, read next to the real element the step lights
  const icons = {};
  for (const ic of card ? document.querySelectorAll(".wv-tour-body svg.tour-ic") : []) {
    const kind = ic.getAttribute("data-tour-icon"), r = ic.getBoundingClientRect();
    if (kind === "house") { const mine = ic.querySelector("path.ov-glyph"), real = overlay?.querySelector('.ov-glyph[data-id="' + esc(ids[0] ?? "") + '"]'); icons.house = { d: mine?.getAttribute("d") ?? null, realD: real?.getAttribute("d") ?? null, fill: mine ? getComputedStyle(mine).fill : null, realFill: real ? getComputedStyle(real).fill : null, w: r.width, mineW: mine?.getBoundingClientRect().width ?? 0, realW: real?.getBoundingClientRect().width ?? 0, face: ic.querySelectorAll(".ov-home-envelope, .ov-home-flap").length, realFace: real?.parentNode?.querySelectorAll(".ov-home-envelope, .ov-home-flap").length ?? 0 }; }
    if (kind === "resident") { const mine = ic.querySelector(".wv-walker-far > .wv-walker-frame"), real = walks?.querySelector('.wv-walker-far[data-handle="' + esc(ids[1] ?? "") + '"] > .wv-walker-frame'); icons.resident = { r: mine?.getAttribute("r") ?? null, realR: real?.getAttribute("r") ?? null, fill: mine ? getComputedStyle(mine).fill : null, realFill: real ? getComputedStyle(real).fill : null, stroke: mine ? getComputedStyle(mine).stroke : null, realStroke: real ? getComputedStyle(real).stroke : null, legs: ic.querySelectorAll(".wv-walker-leg").length, w: r.width, mineW: mine?.getBoundingClientRect().width ?? 0, realW: real?.getBoundingClientRect().width ?? 0 }; }
    if (kind === "walk") { const ln = ic.querySelector("line.wv-walk-leg"), cs = ln ? getComputedStyle(ln) : null; icons.walk = { stroke: cs?.stroke ?? null, width: cs?.strokeWidth ?? null, dash: cs?.strokeDasharray ?? null, opacity: cs?.opacity ?? null, vector: cs?.vectorEffect ?? null }; }
  }
  const s = q(".wv-tour-scroll");
  return {
    voidShare, icons,
    open: !q(".wv-tour")?.hidden && !!card && card.w > 0,
    kicker: q(".wv-tour-kicker")?.textContent ?? null,
    title: q(".wv-tour-title")?.textContent ?? null,
    text: q(".wv-tour-body")?.textContent ?? "",
    dots: document.querySelectorAll(".wv-tour-dot").length,
    onDot: [...document.querySelectorAll(".wv-tour-dot")].findIndex((d) => d.classList.contains("on")),
    next: q(".wv-tour-next")?.textContent ?? null,
    backDisabled: q(".wv-tour-back")?.disabled ?? null,
    cardOnScreen: !!card && inside(card, screen),
    controlsInCard: parts.every((b) => b && b.w > 0 && inside(b, card)),
    controlsOnScreen: parts.every((b) => b && inside(b, screen)),
    phone: matchMedia("(max-width:720px)").matches,
    // CONTAINMENT: the card's scrolling area really scrolls (or has nothing to scroll), its words' end can be brought to view inside it, and the title and foot never leave the screen
    reach: (() => {
      if (!s) return null;
      const scrolls = s.scrollHeight > s.clientHeight + 1, overflowY = getComputedStyle(s).overflowY;
      s.scrollTop = s.scrollHeight;
      const sr = s.getBoundingClientRect(), b = q(".wv-tour-body").getBoundingClientRect(), bottomOk = b.bottom <= sr.bottom + 1;
      s.scrollTop = 0;
      const title = q(".wv-tour-title").getBoundingClientRect(), foot = q(".wv-tour-foot").getBoundingClientRect();
      return { overflowY, scrolls, bottomOk, titleOnScreen: title.top >= 0 && title.bottom <= innerHeight, footOnScreen: foot.top >= 0 && foot.bottom <= innerHeight };
    })(),
    type: { title: parseFloat(getComputedStyle(q(".wv-tour-title")).fontSize), body: parseFloat(getComputedStyle(q(".wv-tour-body")).fontSize), titleColor: getComputedStyle(q(".wv-tour-title")).color },
    // WHAT THE STEP LIT: the kind, the public ids, the spotlight, each target looked up in the scene; and what the TOUR drew: no svg, no picture panel, nothing of its own
    scene: { kind, ids, spot, lit, cameraW: parseFloat((mapSvg?.getAttribute("viewBox") ?? "").split(/\s+/)[2]) },
    drew: { svgs: document.querySelectorAll(".wv-tour-card svg").length, panels: document.querySelectorAll(".wv-tour-visual, [class^='tv-'], [class*=' tv-']").length, images: document.querySelectorAll(".wv-tour-card image, .wv-tour-card img").length, icons: document.querySelectorAll(".wv-tour-card svg.tour-ic").length },
    // for a failure message: where the screen, the card and every part stood
    geometry: { screen: [innerWidth, innerHeight], card, parts: parts.map((b) => b && [b.x, b.y, b.right, b.bottom].map(Math.round)) },
  };
});

// what the reader had before the tour and must have after it: the camera, the viewer's highlight layer, what is selected
const readPage = (page) => page.evaluate(() => ({
  viewBox: document.querySelector(".wv-minimap > svg")?.getAttribute("viewBox") ?? null,
  highlight: document.querySelector(".wv-hl-layer")?.innerHTML ?? null,
  selected: document.querySelectorAll(".is-selected, .wv-selected").length,
}));

// a step is CONTAINED when the card, its title and every control are on the screen and its words can be brought to view in the scrolling area
function contained(s, what) {
  assert.ok(s.cardOnScreen && s.controlsInCard && s.controlsOnScreen, `${what}: the card and every control are whole on the screen ${JSON.stringify({ card: s.cardOnScreen, inCard: s.controlsInCard, onScreen: s.controlsOnScreen, geometry: s.geometry })}`);
  assert.ok(s.reach && s.reach.bottomOk && s.reach.titleOnScreen && s.reach.footOnScreen, `${what}: the words' end is reachable, the title and foot stay on the screen ${JSON.stringify(s.reach)}`);
  assert.ok(!s.reach.scrolls || /auto|scroll/.test(s.reach.overflowY), `${what}: whatever overflows scrolls inside the card`);
  // the tour draws no picture of its own: the only svgs in its card are the step-2 icons, which are the map's own drawings (checked against the real elements in step 2)
  assert.deepEqual({ ...s.drew, svgs: s.drew.svgs - s.drew.icons }, { svgs: 0, panels: 0, images: 0, icons: s.drew.icons }, `${what}: the tour drew nothing of its own (no svg but the map's icons, no picture panel, no image)`);
}

// the page with no picture on any mark: every JSON answer the page reads has its `image` fields taken out before the page sees them, and the shelf is refused
async function withoutPictures(page) {
  await page.route("**/shelf/**", (route) => route.abort());
  await page.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname !== "localhost" || u.pathname.startsWith("/shelf/") || !["fetch", "xhr"].includes(route.request().resourceType())) return route.continue();
    const res = await route.fetch();
    if (!/json/.test(res.headers()["content-type"] ?? "")) return route.fulfill({ response: res });
    const strip = (v) => Array.isArray(v) ? v.map(strip) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== "image").map(([k, x]) => [k, strip(x)])) : v;
    let body = await res.text();
    try { body = JSON.stringify(strip(JSON.parse(body))); } catch { /* not whole JSON: left as it came */ }
    return route.fulfill({ response: res, body });
  });
}

async function openPage(t, { viewport, phone, pictures = true }) {
  if (!chromium) { t.skip("NO PLAYWRIGHT — the first-visit tour went UNGUARDED"); return null; }
  const ctx = await machineContext(browser, { viewport, ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : {}) });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
  if (!pictures) await withoutPictures(page);
  await page.goto(`http://localhost:${port}/?lite=0`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  // a spectator is greeted on every visit (Keemin 2026-08-12), with no key and no click
  await page.waitForSelector(".wv-tour-card", { state: "visible", timeout: 90_000 });
  // the card glides to each step's place (transform .22 s, slower on a throttled or busy machine): a read is taken once it has ARRIVED. Arrived means the card has NO
  // transition or animation still running AND two reads 150 ms apart are alike, the deck has stopped growing (the map draws after the greeting), and the spotlight has stopped moving.
  const settle = async () => {
    let before = null;
    for (let i = 0; i < 160; i++) {
      const r = await readTour(page);
      const running = await page.evaluate(() => (document.querySelector(".wv-tour-card")?.getAnimations?.() ?? []).filter((a) => a.playState !== "finished" && a.playState !== "idle").length);
      const key = JSON.stringify([r.kicker, r.dots, r.cardOnScreen, running, r.scene.ids]) + JSON.stringify(await page.evaluate(() => [document.querySelector(".wv-tour-card")?.getBoundingClientRect().toJSON(), document.querySelector(".wv-tour-spot")?.getBoundingClientRect().toJSON()]));
      if (running === 0 && key === before) return;
      before = key;
      await page.waitForTimeout(150);
    }
    assert.fail("the tour card never came to rest");
  };
  const press = async (sel) => { await (phone ? page.tap(sel) : page.click(sel)); await settle(); };
  // the map draws after the greeting: wait until the deck has all it will have (the example steps stand on the drawn page)
  const deckReady = async (want) => { await page.waitForFunction((n) => document.querySelectorAll(".wv-tour-dot").length === n, want, { timeout: 30_000 }); await settle(); };
  return { ctx, page, errors, settle, press, deckReady };
}

// a lit target is a real element of the mounted scene, wholly inside the spotlight; the spotlight is on screen
function assertLit(s, what, phone) {
  const { kind, ids, spot, lit } = s.scene;
  assert.ok(spot && spot.w > 0, `${what}: the spotlight is up, over the page`);
  // THE LIT TARGET IS VISIBLE, NOT UNDER THE CARD (CORE-153, Truey's review of c7833d9b1: at 844 x 390 the card lay over the dot it taught): the opaque card's box meets neither the
  // spotlight nor any lit element, read after the card and camera have come to rest, on every size this file runs
  const c = s.geometry.card;
  const meetsCard = (b) => !!b && b.x < c.right && b.right > c.x && b.y < c.bottom && b.bottom > c.y;
  assert.ok(!meetsCard(spot), `${what}: the card does not cover the spotlight ${JSON.stringify({ card: [c.x, c.y, c.right, c.bottom].map(Math.round), spot: [spot.x, spot.y, spot.right, spot.bottom].map(Math.round) })}`);
  for (const [name, b] of [["house", lit.house?.rect], ["resident", lit.resident?.rect], ["mark", lit.pip?.rect], ["dot", lit.dot?.rect]]) {
    if (b) assert.ok(!meetsCard(b), `${what}: the lit ${name} is not under the card ${JSON.stringify({ card: [c.x, c.y, c.right, c.bottom].map(Math.round), [name]: [b.x, b.y, b.right, b.bottom].map(Math.round) })}`);
  }
  // THE CLASS FIX (CORE-153): a step the tour frames (the house, the dot) never shows a frame that is more than a small share void beyond the map, so a near-edge target cannot pass again
  if (kind === "house" || kind === "dot") assert.ok(s.voidShare !== null && s.voidShare <= 0.08, `${what}: the frame is full of map (void share ${s.voidShare})`);
  if (kind === "house") {
    assert.equal(ids.length, 2, `${what}: a house id and a resident handle`);
    assert.ok(lit.house.found && lit.house.inSpot, `${what}: the house ${ids[0]} is the map's own home pip, inside the spotlight ${JSON.stringify({ spot, house: lit.house })}`);
    assert.ok(lit.resident.found && lit.resident.inSpot, `${what}: the resident ${ids[1]} is the map's own walker frame, inside the spotlight ${JSON.stringify({ spot, resident: lit.resident })}`);
    assert.equal(lit.resident.moving, false, `${what}: a standing resident (no walking claim is made)`);
    assert.equal(lit.resident.stroke, "rgb(132, 201, 143)", `${what}: the standing resident is the map's own green`);
  } else if (kind === "picture") {
    assert.equal(ids.length, 1);
    assert.ok(lit.pip.found && lit.pip.inSpot, `${what}: the mark ${ids[0]} is the map's own pictured mark, its pip inside the spotlight`);
    assert.ok(lit.art.count >= 1, `${what}: the map's own placed picture lies in the spotlight (${JSON.stringify(lit.art.hrefs)})`);
    assert.ok(lit.art.hrefs.every((h) => /^\/shelf\//.test(h)), `${what}: every picture is the shelf's, by the map's own route`);
  } else if (kind === "dot") {
    assert.equal(ids.length, 1);
    assert.ok(lit.dot.found && lit.dot.inSpot, `${what}: the dot ${ids[0]} is the map's own home pip, inside the spotlight`);
  } else assert.fail(`${what}: a lit target of kind ${JSON.stringify(kind)}`);
}

async function onThePage(t, { viewport, phone }) {
  const o = await openPage(t, { viewport, phone });
  if (!o) return;
  const { ctx, page, errors, settle, press, deckReady } = o;
  const out = {};
  await settle();
  await deckReady(5);
  const before = await readPage(page);

  // ── step 1 of 5: the greeting, whole on the screen ─────────────────────────
  const s1 = await readTour(page);
  assert.equal(s1.phone, !!phone);
  assert.equal(s1.kicker, "The World · 1 / 5");
  assert.equal(s1.title, "Welcome to the world");
  assert.equal(s1.dots, 5, "one dot a step");
  assert.equal(s1.onDot, 0);
  assert.equal(s1.next, "next");
  assert.equal(s1.backDisabled, true, "nothing before the first step");
  contained(s1, "step 1");
  assert.match(s1.text, /^The people and agents who live here build this world together\.$/, "the welcome: exactly one line (Darko 2026-11-22 10:27 EST, CORE-153: 'agreed with your rec on 153'; the people, humans included, and the agents), nothing more");
  assert.doesNotMatch(s1.text, /write the world in words|made by a resident/i, "the two earlier lines stay replaced");
  assert.doesNotMatch(s1.text, /told, not drawn/i, "the cut line stays cut");
  // the join flow's big type (a large gold headline, a large soft caption)
  assert.ok(s1.type.title >= 27 && s1.type.body >= 17, `large type: headline ${s1.type.title}px, caption ${s1.type.body}px`);
  assert.equal(s1.type.titleColor, "rgb(246, 220, 174)", "the join flow's gold");
  assert.equal(s1.scene.kind, "", "the welcome lights nothing");
  out.s1 = s1;

  // ── next: a house and a resident, on the live map ──────────────────────────
  await press(".wv-tour-next");
  const sp = await readTour(page);
  assert.equal(sp.kicker, "The World · 2 / 5");
  assert.equal(sp.title, "Houses and residents");
  assert.equal(sp.onDot, 1);
  assert.equal(sp.backDisabled, false);
  contained(sp, "step 2");
  assert.match(sp.text, /^A house is a parcel\.Green figures are residents\.A dotted line is a resident walking right now\.$/, "a few large words: a house is a parcel, green figures are residents, a dotted line is a resident walking right now (Darko 2026-11-22 00:32)");
  assert.doesNotMatch(sp.text, /click|tap|drag|scroll|zoom|hover|wheel/i, "no input is named: a phone reads the same words");
  // THE FRAME IS FULL OF MAP (CORE-153, Darko 2026-11-22 00:31): a house at the world's edge left a third of the frame void; the framed house is chosen where the framed window stays on the paper
  assert.ok(sp.voidShare !== null && sp.voidShare <= 0.08, `step 2: the frame is full of map, not void beyond it (void share ${sp.voidShare})`);
  // THE CARD'S ICONS ARE THE MAP'S OWN DRAWINGS (Darko 2026-11-22 00:31: "exact replicas of the assets for house and resident ... in the tutorial card"): the same path, face, frame and legs, in the
  // colours the lit house and resident are drawn in, at the map's width (or the icon's natural floor), never a redraw
  const ic = sp.icons;
  assert.ok(ic.house?.d && ic.house.d === ic.house.realD, `the card's house is the map's own glyph path ${JSON.stringify(ic.house)}`);
  assert.equal(ic.house.fill, ic.house.realFill, "in the map's house colour");
  assert.equal(ic.house.face, ic.house.realFace, "with the map's envelope face");
  assert.ok(ic.house.mineW >= ic.house.realW - 0.6, `and at least the map's size (${ic.house.mineW} against ${ic.house.realW})`);
  assert.ok(ic.resident?.r && ic.resident.r === ic.resident.realR, `the card's resident is the map's own frame ${JSON.stringify(ic.resident)}`);
  assert.equal(ic.resident.fill, ic.resident.realFill, "in the map's resident fill");
  assert.equal(ic.resident.stroke, ic.resident.realStroke, "and its green");
  assert.equal(ic.resident.legs, 2, "on its two legs");
  assert.ok(ic.resident.mineW >= ic.resident.realW - 0.6, `and at least the map's size (${ic.resident.mineW} against ${ic.resident.realW})`);
  assert.deepEqual(ic.walk, { stroke: "rgb(224, 80, 122)", width: "2px", dash: "5px, 4px", opacity: "0.75", vector: "non-scaling-stroke" }, "the walking line is the map's own stroke, colour and dash (.wv-walk-leg); no walk is faked on the map");
  assert.equal(sp.scene.kind, "house");
  assertLit(sp, "step 2", phone);
  const cam0 = parseFloat(before.viewBox.split(/\s+/)[2]);
  assert.ok(sp.scene.cameraW < cam0 * 0.8, `step 2: the camera is framed in on the house and resident by the map's own setView (view ${Math.round(sp.scene.cameraW)} wide against the reader's ${Math.round(cam0)})`);
  out.sp = sp;

  // ── next: a mark with its own picture, on the live map ─────────────────────
  await press(".wv-tour-next");
  const sm = await readTour(page);
  assert.equal(sm.kicker, "The World · 3 / 5");
  assert.equal(sm.title, "Everything is a mark");
  assert.equal(sm.onDot, 2);
  contained(sm, "step 3");
  assert.match(sm.text, /^Every picture and shape on the map is a mark, made by an agent\.$/);
  assert.equal(sm.scene.kind, "picture");
  assertLit(sm, "step 3", phone);
  assert.equal(sm.scene.cameraW, cam0, "step 3 lights the picture where it stands: the reader's own view is back, not the previous step's framing");
  out.sm = sm;

  // ── next: the look-around step, in this screen's words, on a real dot ──────
  await press(".wv-tour-next");
  const s2 = await readTour(page);
  assert.equal(s2.kicker, "The World · 4 / 5");
  assert.equal(s2.title, "Look around");
  assert.equal(s2.onDot, 3);
  assert.equal(s2.backDisabled, false);
  contained(s2, "step 4");
  if (phone) {
    assert.match(s2.text, /^Drag to move\.Tap a dot to read it\.$/);
    assert.doesNotMatch(s2.text, /scroll|zoom|click|hover/i, "a phone is not told a wheel or a cursor");
  } else {
    assert.match(s2.text, /^Drag to move\.Scroll to zoom\.Click a dot to read it\.$/);
  }
  assert.equal(s2.scene.kind, "dot");
  assertLit(s2, "step 4", phone);
  assert.ok(s2.scene.cameraW < cam0 * 0.8, `step 4: the camera is framed in on the dot (view ${Math.round(s2.scene.cameraW)} wide against ${Math.round(cam0)})`);
  out.s2 = s2;

  // ── back (to the marks card), then a dot to the last step, which says done ─
  await press(".wv-tour-back");
  assert.equal((await readTour(page)).kicker, "The World · 3 / 5", "back returns one step");
  await press('.wv-tour-dot[data-tour-to="4"]');
  const s3 = await readTour(page);
  assert.equal(s3.kicker, "The World · 5 / 5", "a dot jumps");
  assert.equal(s3.title, "Where to go next");
  assert.equal(s3.next, "done", "the last step finishes");
  contained(s3, "step 5");
  assert.match(s3.text, /^Filters shows or hides speech bubbles, where the town is talking\.\? brings this tour back\.Read the docs$/);
  assert.equal(s3.scene.kind, "", "the last step lights the page's own ?, by anchor, and stages nothing");
  assert.equal(s3.scene.cameraW, cam0, "and the reader's own view is back on the last step (back, and a jump by a dot, leave no framing behind)");
  assert.ok(s3.scene.spot && s3.scene.spot.w > 0, "the spotlight is on the real ? button");
  out.s3 = s3;

  // ── the last step's one link, /docs/ (Wright 2026-11-21 06:17): whole on the screen, reachable by the real Tab, and the tour's own click handling does not swallow it ──
  assert.match(s3.text, /Read the docs$/);
  const link = await page.evaluate(() => {
    const a = document.querySelector('.wv-tour-body a'); if (!a) return null;
    const card = document.querySelector(".wv-tour-card").getBoundingClientRect(), r = a.getBoundingClientRect();
    const all = [...document.querySelectorAll(".wv-tour-body a")];
    return { count: all.length, href: a.getAttribute("href"), text: a.textContent, whole: r.width > 0 && r.x >= card.x && r.right <= card.right && r.y >= card.y && r.bottom <= card.bottom && r.x >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      underline: getComputedStyle(a).textDecorationLine, color: getComputedStyle(a).color, body: getComputedStyle(document.querySelector(".wv-tour-body")).color };
  });
  assert.ok(link, "the last step has a link");
  assert.equal(link.count, 1, "one link, and no other in the tour");
  assert.equal(link.href, "/docs/");
  assert.equal(link.text, "Read the docs");
  assert.ok(link.whole, "the link lies wholly on the screen and inside the card");
  // the keyboard reaches it with the REAL Tab, from the focus the tour ships (the card puts it on "next"), and the trap carries it round the card's stops, link included, both ways
  const focusedNow = () => page.evaluate(() => { const a = document.activeElement; return a ? (a.matches(".wv-tour-body a") ? "link" : a.matches(".wv-tour-dot") ? `dot${a.dataset.tourTo}` : a.matches(".wv-tour-skip,.wv-tour-back,.wv-tour-next") ? a.className.replace("wv-tour-", "") : `other:${a.tagName}.${a.className}`) : "none"; });
  assert.equal(await focusedNow(), "next", "the tour ships its focus on next");
  await page.keyboard.press("Tab");
  assert.equal(await focusedNow(), "link", "Tab from the last stop wraps forward to the card's first stop, the docs link");
  await page.keyboard.press("Tab");
  assert.equal(await focusedNow(), "dot0", "Tab on from the link goes to the first step dot");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await focusedNow(), "link", "Shift+Tab goes back through the link");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await focusedNow(), "next", "and Shift+Tab from the link wraps to the card's last stop: focus never leaves the card");
  for (let i = 0; i < 12; i++) { await page.keyboard.press("Tab"); assert.ok(await page.evaluate(() => !!document.activeElement?.closest(".wv-tour-card")), "twelve Tabs never leave the card"); }
  assert.ok(link.underline.includes("underline") || link.color !== link.body, `the link reads as a link (underline ${link.underline}, colour ${link.color} against the body's ${link.body})`);
  // a real press on it: nothing in the page's click handling cancels the navigation. A listener AFTER the page's own delegate records whether it was cancelled, then cancels it
  // itself so the test page stays put (this fixture does not serve the Site's /docs/, and is not asked to).
  await page.evaluate(() => { window.__docsClick = null; document.addEventListener("click", (e) => { if (e.target.closest?.('.wv-tour-body a')) { window.__docsClick = { cancelledByPage: e.defaultPrevented }; e.preventDefault(); } }); });
  await (phone ? page.tap('.wv-tour-body a') : page.click('.wv-tour-body a'));
  assert.deepEqual(await page.evaluate(() => window.__docsClick), { cancelledByPage: false }, "the tour's handler leaves the link's navigation alone");
  assert.equal((await readTour(page)).open, true, "following it is the visitor's choice; the tour is not closed under them by the press");

  // ── done closes it, and the page underneath is exactly as the visitor had it; the ? brings it back ─
  await press(".wv-tour-next");
  await page.waitForSelector(".wv-tour", { state: "hidden", timeout: 10_000 });
  assert.equal((await readTour(page)).open, false, "done closes the tour");
  assert.ok(await page.evaluate(() => !!document.querySelector(".wv-minimap > svg") && !!document.querySelector(".wv-mapctl")), "the map and its controls are there after the tour");
  assert.deepEqual(await readPage(page), before, "the camera, the viewer's highlight and the selection are exactly as the visitor had them: the tour moved nothing");
  await press(".wv-tour-open");
  await page.waitForSelector(".wv-tour-card", { state: "visible", timeout: 10_000 });
  const again = await readTour(page);
  assert.equal(again.kicker, "The World · 1 / 5", "the ? reopens the tour at its first step");
  assert.ok(again.cardOnScreen && again.controlsInCard && again.controlsOnScreen);

  // ── skip closes it too, and the same page is there ─────────────────────────
  await press(".wv-tour-skip");
  await page.waitForSelector(".wv-tour", { state: "hidden", timeout: 10_000 });
  assert.ok(await page.evaluate(() => !!document.querySelector(".wv-minimap > svg")), "skip leaves the page as it was");
  assert.deepEqual(await readPage(page), before, "and the page is as the visitor had it after skip too, having been through every lit step");
  assert.deepEqual(errors, [], "no page error across the tour");
  await ctx.close();
  return out;
}

// every step contained on a screen that is short, or short and narrow, with its buttons still working; the lit steps still lit
async function onAShortScreen(t, { viewport, phone }) {
  const o = await openPage(t, { viewport, phone });
  if (!o) return;
  const { ctx, page, errors, settle, press, deckReady } = o;
  await settle();
  await deckReady(5);
  let welcomeW = 0;
  for (let i = 0; i < 5; i++) {
    const s = await readTour(page);
    assert.equal(s.kicker, `The World · ${i + 1} / 5`);
    contained(s, `step ${i + 1} at ${viewport.width} x ${viewport.height}`);
    assert.ok(s.type.title >= 22 && s.type.body >= 17, `step ${i + 1}: the words stay large (${s.type.title}px / ${s.type.body}px)`);
    if (viewport.width < 640) assert.ok(s.geometry.card.w <= viewport.width - 10 + 0.5, `step ${i + 1}: the card is the phone column (${Math.round(s.geometry.card.w)}px of ${viewport.width})`);
    if (i >= 1 && i <= 3) assertLit(s, `step ${i + 1} at ${viewport.width} x ${viewport.height}`, phone);
    // THE TOUR'S INPUT MODE, in words, whatever the width: a touch screen is told drag and tap (844 x 390 and 360 x 560), a mouse its wheel (1440 x 480)
    if (i === 3) {
      if (phone) {
        assert.match(s.text, /^Drag to move\.Tap a dot to read it\.$/, "a touch screen is told drag and tap");
        assert.doesNotMatch(s.text, /scroll|zoom|click|hover/i);
      } else assert.match(s.text, /^Drag to move\.Scroll to zoom\.Click a dot to read it\.$/, "a cursor keeps its wheel and click");
    }
    if (i === 0) welcomeW = s.geometry.card.w;
    if (i < 4) await press(".wv-tour-next");
  }
  await press(".wv-tour-back");
  assert.equal((await readTour(page)).kicker, "The World · 4 / 5", "back works at this size");
  // BACK TO THE WELCOME after steps whose card was narrowed or shortened to leave the target visible: the centred card starts from its natural size again, not the staged one
  await press(".wv-tour-back"); await press(".wv-tour-back"); await press(".wv-tour-back");
  const welcomeAgain = await readTour(page);
  assert.equal(welcomeAgain.kicker, "The World · 1 / 5", "back reaches the welcome");
  assert.equal(await page.evaluate(() => { const s = document.querySelector(".wv-tour-card").style; return `${s.width}|${s.maxHeight}`; }), "|", "no width or max-height left over from a staged step on the centred welcome");
  assert.ok(Math.abs(welcomeAgain.geometry.card.w - welcomeW) < 1, `the welcome card is its natural width again (${Math.round(welcomeAgain.geometry.card.w)} against ${Math.round(welcomeW)})`);
  contained(welcomeAgain, "the welcome again");
  for (let k = 0; k < 4; k++) await press(".wv-tour-next");
  await press(".wv-tour-next");
  await page.waitForSelector(".wv-tour", { state: "hidden", timeout: 10_000 });
  assert.equal((await readTour(page)).open, false, "done closes it at this size");
  assert.deepEqual(errors, [], "no page error");
  await ctx.close();
}

test("the page, on a phone (390 x 844, touch): five steps, the examples lit on the live map, each control whole on the screen, drag and tap, done / ? / skip", async (t) => {
  await onThePage(t, { viewport: { width: 390, height: 844 }, phone: true });
});

test("the page, on a desktop (1440 x 900): the same five steps in the cursor's words", async (t) => {
  await onThePage(t, { viewport: { width: 1440, height: 900 }, phone: false });
});

test("the page, on a phone on its side (844 x 390, touch): every step contained and reachable, the examples still lit, told drag and tap", async (t) => {
  await onAShortScreen(t, { viewport: { width: 844, height: 390 }, phone: true });
});

test("the page, on a NARROW short phone (360 x 560, touch): every step reachable and legible, the examples still lit, told drag and tap", async (t) => {
  await onAShortScreen(t, { viewport: { width: 360, height: 560 }, phone: true });
});

test("the page, on a short desktop window (1440 x 480): every step contained and reachable, the examples still lit", async (t) => {
  await onAShortScreen(t, { viewport: { width: 1440, height: 480 }, phone: false });
});

// A STEP THE PAGE CANNOT SHOW IS LEFT OUT, never replaced by a stand-in: with no picture on any mark there is no pictured mark to light, so the deck is four steps and the
// marks step is not in it, and nothing the tour draws stands in for it
test("with no picture on any mark the marks step is OMITTED (no stand-in): four steps, the others still lit", async (t) => {
  const o = await openPage(t, { viewport: { width: 1440, height: 900 }, phone: false, pictures: false });
  if (!o) return;
  const { ctx, page, errors, settle, press, deckReady } = o;
  await settle();
  await deckReady(4);
  const seen = [];
  for (let i = 0; i < 4; i++) {
    const s = await readTour(page);
    seen.push(s.title);
    assert.equal(s.kicker, `The World · ${i + 1} / 4`);
    contained(s, `step ${i + 1} of the four`);
    if (s.scene.kind) assertLit(s, `step ${i + 1}`, false);
    if (i < 3) await press(".wv-tour-next");
  }
  assert.deepEqual(seen, ["Welcome to the world", "Houses and residents", "Look around", "Where to go next"], "the marks step is not in the deck, and no stand-in took its place");
  assert.deepEqual(errors, [], "no page error");
  await ctx.close();
});
