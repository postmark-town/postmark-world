// conversation-pages.test.mjs — POS-779: the MOUNTED World map draws one badge per thread (the real viewer in a browser, an invented office).
//
// conversation-badges.test.mjs pins the viewer's source; this drives the viewer itself. The office is a stub that answers
// `GET /world/conversations` in the door's own shape (`live` and `closed` threads, newest first); every thread, place and speaker is invented.
//
//   1. default ON: one badge per thread, each at its own thread id, wearing the conversation glyph in the map's gray-white
//   2. the days: a live thread quiet for hours is still live (a settlement is the only edge), an earlier settlement's thread is the
//      dotted cooling badge for a day, then it leaves
//   4. THE EXTENT WASH AND THE COLUMN (Darko 2026-11-06), on the real pointer path: at rest nothing is washed; hovering a badge washes the
//      thread's `extent` grown by half an earshot; a click opens the thread in the right-hand column (no new tab) with its place,
//      speakers, statements, times and live state and an "all conversations" link, and keeps the wash after the pointer leaves;
//      closing the column takes the wash away; what a resident said is literal text, never markup
//   3. the reader's own choice: the 💬 toggle hides the badges and the choice is remembered; stored OFF draws nothing and asks the
//      office nothing; a storage that throws leaves the default
//
// The browser is CI's (suite.yml installs playwright); a box without it skips by name.

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttp } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { machinePage } from "./page-machine.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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


// the stub office's state, set per test: how the list answers
const OFFICE = { mode: "plain", now: () => Date.now(), asked: [] };
/** n live threads laid on a line in the Town Centre, newest first (the office's order) */
const liveThreads = (n, { latestAgo = 120_000 } = {}) => Array.from({ length: n }, (_, i) => ({
  id: `live-${i}`, place: `the quay ${i}`, at: { x: 150 + i * 2, y: 95 }, voice_count: 4, participants: ["rig-ash", "rig-cleo"],
  latest: new Date(OFFICE.now() - latestAgo - i * 1000).toISOString(), aboard: false, live: true, voices: [],
}));
const closedThread = (id, agoMs) => ({ id, place: `the old quay ${id}`, at: { x: 190, y: 120 }, voice_count: 2, participants: ["rig-ash"], latest: new Date(OFFICE.now() - agoMs).toISOString(), aboard: false, live: false, voices: [] });
// three threads far enough apart to point at one by one, each with the `extent` the office ships; the first carries hostile words
const HOSTILE = "# not a heading [click](javascript:alert(1)) <img src=x onerror=\"window.__pwned=1\"> <b>bold?</b>";
const columnThreads = () => ({
  live: [
    { id: "live-a", place: "the Far-Bank Porch", at: { x: 1000, y: -100 }, extent: { x0: 990, y0: -105, x1: 1020, y1: -95 }, aboard: false, live: true, voice_count: 3,
      participants: ["rig-ash", "rig-cleo"], started: "2026-11-06T14:00:00.000Z", latest: new Date(OFFICE.now() - 120_000).toISOString(),
      voices: [{ handle: "rig-ash", said: "good evening from the porch", at: "2026-11-06T14:00:00.000Z" }, { handle: "rig-cleo", said: HOSTILE, at: "2026-11-06T14:05:00.000Z" }, { handle: "rig-ash", said: "the last word", at: "2026-11-06T14:30:00.000Z" }] },
    { id: "live-b", place: "the seed gardens", at: { x: 1000, y: 300 }, extent: { x0: 990, y0: 290, x1: 1010, y1: 310 }, aboard: false, live: true, voice_count: 1,
      participants: ["rig-dov"], started: "2026-11-06T15:00:00.000Z", latest: new Date(OFFICE.now() - 300_000).toISOString(), voices: [{ handle: "rig-dov", said: "alone here", at: "2026-11-06T15:00:00.000Z" }] },
    // in the crowded Town Centre, where the existing chooser offers every clickable under the point
    { id: "live-c", place: "the Town Centre steps", at: { x: 200, y: -500 }, extent: { x0: 190, y0: -505, x1: 210, y1: -495 }, aboard: false, live: true, voice_count: 1,
      participants: ["rig-fen"], started: "2026-11-06T15:30:00.000Z", latest: new Date(OFFICE.now() - 200_000).toISOString(), voices: [{ handle: "rig-fen", said: "by the steps", at: "2026-11-06T15:30:00.000Z" }] },
  ],
  closed: [{ ...closedThread("closed-a", 3 * 3600_000), at: { x: 1400, y: 300 }, extent: { x0: 1390, y0: 290, x1: 1410, y1: 310 } }],
});
function conversationsBody() {
  const base = { now: new Date(OFFICE.now()).toISOString(), earshot_m: 45, fade_minutes: 20, hearable_since: "2026-11-04T10:00:00.000Z", close_minutes: null };
  if (OFFICE.mode === "column") return { ...base, ...columnThreads() };
  if (OFFICE.mode === "days") return { ...base, live: liveThreads(1, { latestAgo: 6 * 3600_000 }), closed: [closedThread("closed-recent", 3 * 3600_000), closedThread("closed-old", 30 * 3600_000)] };
  return { ...base, live: liveThreads(12), closed: [] };
}

async function bootStubOffice() {
  const port = await freePort();
  const srv = createHttp((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1:" + port);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    const send = (code, b) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
    if (url.pathname === "/world/conversations") { OFFICE.asked.push(url.search); return send(200, conversationsBody()); }
    if (url.pathname === "/ops/whoami") return send(200, { principal: false, household: null, handles: [] });
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bounce", defect: "no such door in the rig" }));
  });
  await new Promise((resolve) => srv.listen(port, "127.0.0.1", resolve));
  CLEANUP.push(() => srv.close());
  return { port };
}
async function bootRig() {
  const port = await freePort();
  const proc = spawn(process.execPath, [join(ROOT, "spectator", "server.mjs")], { cwd: ROOT, env: { ...process.env, PORT: String(port), ATLAS_ORIGIN: "http://127.0.0.1:1" }, stdio: ["ignore", "pipe", "pipe"] });
  CLEANUP.push(() => proc.kill());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the rig did not announce itself in 30s")), 30_000);
    proc.stdout.on("data", (b) => { if (String(b).includes("localhost:" + port)) { clearTimeout(timer); resolve(); } });
    proc.on("exit", (code) => { clearTimeout(timer); reject(new Error("the rig exited " + code + " before serving")); });
  });
  return { port };
}

let chromium = null, rig = null, browser = null, office = null;
const errors = [];
before(async () => {
  chromium = await loadChromium();
  if (!chromium) return;
  [rig, office] = await Promise.all([bootRig(), bootStubOffice()]);
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
});
const skipReason = "playwright is absent, so the mounted conversation badges go unguarded: run npm ci here (playwright is this package's devDependency)";

/** a fresh page on the real viewer, the stub office as its office; `storage` runs before the viewer does */
async function openViewer({ mode, storage = null, wait = true } = {}) {
  OFFICE.mode = mode; OFFICE.asked.length = 0;
  const page = await machinePage(browser, { viewport: { width: 1400, height: 900 } });
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.addInitScript((base) => { try { localStorage.setItem("pm.office.base", base); } catch {} }, "http://127.0.0.1:" + office.port);
  // the old click opened a new tab: spy on it, and on any popup, so "no new tab" is measured and not assumed
  await page.addInitScript(() => { window.__opened = []; const open = window.open; window.open = function (...a) { window.__opened.push(String(a[0])); return open.apply(this, a); }; });
  page.__popups = 0; page.on("popup", () => { page.__popups += 1; });
  if (storage === "off") await page.addInitScript(() => { try { localStorage.setItem("pm.world.conversations", "off"); } catch {} });
  // a storage that throws on the reader's choice (private windows, blocked data): the page's other reads are not this test's subject
  if (storage === "throws") await page.addInitScript(() => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (k) { if (k === "pm.world.conversations") throw new Error("storage blocked"); return get.apply(this, arguments); };
    Storage.prototype.setItem = function (k, v) { if (k === "pm.world.conversations") throw new Error("storage blocked"); return set.apply(this, arguments); };
  });
  await page.goto("http://localhost:" + rig.port + "/", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  await page.waitForFunction(() => !!window.__pmViewer, null, { timeout: 60_000 });
  if (wait) await page.waitForFunction(() => !!document.querySelector(".wv-map-convo"), null, { timeout: 60_000 }).catch(() => {});
  return page;
}
const badgeIds = (page) => page.evaluate(() => [...document.querySelectorAll("[data-convo]")].map((g) => ({ id: g.getAttribute("data-convo"), cls: g.getAttribute("class") })));
const ctl = (page) => page.evaluate(() => { const b = document.querySelector(".wv-map-convo"); return b ? { on: b.classList.contains("on") } : null; });
async function waitBadges(page, n, ms = 30_000) {
  await page.waitForFunction((want) => document.querySelectorAll("[data-convo]").length >= want, n, { timeout: ms }).catch(() => {});
  return badgeIds(page);
}

test("1. default ON: one badge per thread, each once, wearing the conversation glyph in the map's gray-white", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const page = await openViewer({ mode: "plain" });
  const badges = await waitBadges(page, 12);
  assert.equal(badges.length, 12, "twelve threads, twelve badges: " + badges.length);
  assert.equal(new Set(badges.map((b) => b.id)).size, 12, "each thread once");
  assert.equal((await ctl(page))?.on, true, "on by default");
  const look = await page.evaluate(() => {
    const g = document.querySelector("[data-convo]");
    const disc = g.querySelector(".wv-convo-disc");
    return { disc: getComputedStyle(disc).fill, glyph: g.querySelectorAll("svg, path, g[class*='ov-ic'], .ov-ic").length, ring: getComputedStyle(g.querySelector("circle.wv-convo")).stroke };
  });
  assert.equal(look.disc, "rgb(207, 214, 221)", "the disc is the map's gray-white: " + look.disc);
  assert.ok(look.glyph > 0, "the conversation glyph is cut into the disc");
  assert.ok(OFFICE.asked.length >= 1, "the list was asked for on load, without a first click");
  await page.close();
});

test("2. the days: a live thread quiet for six hours is still live (a settlement never expires a conversation), an earlier settlement's thread is a dotted cooling badge for a day, then it leaves", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const page = await openViewer({ mode: "days" });
  const badges = await waitBadges(page, 2);
  const byId = Object.fromEntries(badges.map((b) => [b.id, b.cls]));
  assert.match(byId["live-0"] ?? "", /is-live/, "six quiet hours inside the settlement: still solid: " + JSON.stringify(byId));
  assert.match(byId["closed-recent"] ?? "", /is-cooling/, "an earlier settlement's thread, three hours old: the dotted cooling badge");
  assert.ok(!("closed-old" in byId), "past the day it is not drawn");
  const dash = await page.evaluate(() => getComputedStyle(document.querySelector("[data-convo='closed-recent'] circle.wv-convo")).strokeDasharray);
  assert.notEqual(dash, "none", "the cooling ring is dotted: " + dash);
  assert.ok(/3/.test(dash) && /4/.test(dash), "the shared dotted line, 3 4: " + dash);
  await page.close();
});

test("3. the reader's own choice: the toggle hides the badges and is remembered; stored OFF draws nothing and asks the office nothing; a storage that throws leaves the default", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const on = await openViewer({ mode: "plain" });
  assert.equal((await ctl(on))?.on, true, "on by default");
  assert.ok((await waitBadges(on, 12)).length >= 12);
  await on.evaluate(() => document.querySelector(".wv-map-convo").click());
  await on.waitForFunction(() => !document.querySelector(".wv-map-convo").classList.contains("on"), null, { timeout: 10_000 });
  assert.equal(await on.evaluate(() => getComputedStyle(document.querySelector("#wv-convo-layer")).display), "none", "hiding via the toggle hides the layer");
  assert.equal(await on.evaluate(() => localStorage.getItem("pm.world.conversations")), "off");
  await on.close();

  const off = await openViewer({ mode: "plain", storage: "off" });
  await off.waitForTimeout(2500);
  assert.equal((await ctl(off))?.on, false, "stored off stays off");
  assert.equal((await badgeIds(off)).length, 0, "draws nothing");
  assert.equal(OFFICE.asked.length, 0, "and a hidden layer costs the office nothing: " + JSON.stringify(OFFICE.asked));
  await off.close();

  const blocked = await openViewer({ mode: "plain", storage: "throws" });
  assert.equal((await ctl(blocked))?.on, true, "a storage that throws leaves the default, on");
  assert.ok((await waitBadges(blocked, 12)).length >= 12);
  await blocked.close();
});

/** the centre of a badge's disc on screen, for a real pointer */
const discOf = (page, id) => page.evaluate((tid) => { const r = document.querySelector(`[data-convo="${tid}"] .wv-convo-disc`)?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; }, id);
const washes = (page) => page.evaluate(() => [...document.querySelectorAll("#wv-convo-wash-layer ellipse")].map((e) => ({ id: e.getAttribute("data-wash"), hover: e.hasAttribute("data-hover"), selected: e.hasAttribute("data-selected"),
  rx: Number(e.getAttribute("rx")), ry: Number(e.getAttribute("ry")), dashed: e.hasAttribute("stroke-dasharray") })));
const columnOf = (page) => page.evaluate(() => { const c = document.querySelector(".wv-homecol"); if (!c || c.hidden) return null; return {
  kicker: c.querySelector(".wv-homecol-kicker")?.textContent, title: c.querySelector(".wv-homecol-title")?.textContent, text: c.textContent,
  link: c.querySelector("a.wv-homecol-all") ? { href: c.querySelector("a.wv-homecol-all").getAttribute("href"), target: c.querySelector("a.wv-homecol-all").getAttribute("target"), rel: c.querySelector("a.wv-homecol-all").getAttribute("rel"), text: c.querySelector("a.wv-homecol-all").textContent } : null,
  markup: c.querySelectorAll("h1,h3,h4,h5,h6,img,script,b,a[href^='javascript']").length, pwned: !!window.__pwned }; });

test("4. at rest nothing is washed; hovering a badge washes its extent grown by half an earshot, and leaving takes it away", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const page = await openViewer({ mode: "column" });
  await waitBadges(page, 4);
  assert.deepEqual(await washes(page), [], "nothing draws it by default");
  const at = await discOf(page, "live-a");
  assert.ok(at, "the badge is on screen");
  await page.mouse.move(at.x, at.y);
  await page.waitForFunction(() => document.querySelectorAll("#wv-convo-wash-layer ellipse").length > 0, null, { timeout: 5000 }).catch(() => {});
  const on = await washes(page);
  assert.equal(on.length, 1, JSON.stringify(on));
  assert.equal(on[0].id, "live-a");
  assert.equal(on[0].hover, true);
  assert.equal(on[0].selected, false);
  // the extent is 30 x 10 m; the stub office's earshot is 45 m, so half an earshot is 22.5 m a side: (15+22.5) by (5+22.5)
  assert.ok(Math.abs(on[0].rx / on[0].ry - (15 + 22.5) / (5 + 22.5)) < 1e-6, "the ellipse is the extent's box grown by half an earshot: " + JSON.stringify(on[0]));
  assert.equal(on[0].dashed, false, "a live thread's wash is solid");
  await page.mouse.move(at.x + 400, at.y + 300);
  await page.waitForFunction(() => document.querySelectorAll("#wv-convo-wash-layer ellipse").length === 0, null, { timeout: 5000 }).catch(() => {});
  assert.deepEqual(await washes(page), [], "off the badge, with nothing selected, the wash is gone");
  await page.close();
});

test("5. a click opens the conversation in the right-hand column, in no new tab, and selecting keeps the wash after the pointer leaves", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const page = await openViewer({ mode: "column" });
  await waitBadges(page, 4);
  assert.equal(await columnOf(page), null, "no column at rest");
  const at = await discOf(page, "live-a");
  await page.mouse.move(at.x, at.y);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForFunction(() => { const c = document.querySelector(".wv-homecol"); return c && !c.hidden && /Far-Bank Porch/.test(c.textContent); }, null, { timeout: 10_000 }).catch(() => {});
  const col = await columnOf(page);
  assert.ok(col, "the column opened");
  assert.equal(col.title, "the Far-Bank Porch");
  assert.match(col.kicker, /a conversation · live/, "and says it is live");
  for (const want of ["rig-ash", "rig-cleo", "good evening from the porch", "the last word", "2026-11-06 14:05Z", "3 statements", "2 speakers"])
    assert.ok(col.text.includes(want), `the column shows ${want}: ${col.text.slice(0, 400)}`);
  assert.deepEqual(col.link, { href: "/conversations/#live-a", target: "_blank", rel: "noopener noreferrer", text: "all conversations →" }, "the archive link at the foot");
  assert.equal(await page.evaluate(() => window.__opened.length), 0, "window.open was not called: no new tab");
  assert.equal(page.__popups, 0, "and no popup opened");
  assert.equal((await page.context().pages()).length, 1);
  // the pointer leaves: the SELECTED thread keeps its wash
  await page.mouse.move(at.x + 400, at.y + 300);
  await page.waitForTimeout(300);
  const kept = await washes(page);
  assert.equal(kept.length, 1, "selecting keeps it drawn: " + JSON.stringify(kept));
  assert.deepEqual([kept[0].id, kept[0].selected, kept[0].hover], ["live-a", true, false]);
  // changing the selection replaces it: the other badge
  const other = await discOf(page, "live-b");
  await page.mouse.move(other.x, other.y);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForFunction(() => /seed gardens/.test(document.querySelector(".wv-homecol")?.textContent ?? ""), null, { timeout: 10_000 }).catch(() => {});
  await page.mouse.move(other.x + 300, other.y + 200);
  await page.waitForTimeout(300);
  const replaced = await washes(page);
  assert.deepEqual(replaced.map((w) => [w.id, w.selected]), [["live-b", true]], "the first wash was replaced by the second: " + JSON.stringify(replaced));
  // closing the column clears the selection and the wash
  await page.click(".wv-homecol-close");
  await page.waitForFunction(() => document.querySelectorAll("#wv-convo-wash-layer ellipse").length === 0, null, { timeout: 5000 }).catch(() => {});
  assert.deepEqual(await washes(page), [], "clearing the selection takes the wash away");
  assert.equal(await columnOf(page), null, "and the column closes");
  await page.close();
});

test("6. what residents said is content: markup and links in a statement stay literal text in the column", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const page = await openViewer({ mode: "column" });
  await waitBadges(page, 4);
  const at = await discOf(page, "live-a");
  await page.mouse.move(at.x, at.y);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForFunction(() => /Far-Bank Porch/.test(document.querySelector(".wv-homecol")?.textContent ?? ""), null, { timeout: 10_000 }).catch(() => {});
  const col = await columnOf(page);
  assert.ok(col.text.includes("# not a heading"), "a speaker's # is not a heading");
  assert.ok(col.text.includes("[click](javascript:alert(1))"), "a speaker's link syntax is not a link");
  assert.ok(col.text.includes("<img src=x"), "a speaker's tag is text");
  assert.equal(col.markup, 0, "no heading, image, script, bold or javascript: link was made from a statement");
  assert.equal(col.pwned, false, "and nothing ran");
  await page.close();
});

test("7. the stack's route is the same route: choosing the conversation from the chooser opens the same column, in no new tab, and keeps the wash", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const page = await openViewer({ mode: "column" });
  await waitBadges(page, 4);
  const at = await discOf(page, "live-c");
  await page.mouse.move(at.x, at.y);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForSelector('[data-choose="convo:live-c"]', { timeout: 10_000 });
  assert.equal(await columnOf(page), null, "the point is contested, so the existing chooser stands first, as for any mark");
  await page.click('[data-choose="convo:live-c"]');
  await page.waitForFunction(() => /Town Centre steps/.test(document.querySelector(".wv-homecol")?.textContent ?? ""), null, { timeout: 10_000 }).catch(() => {});
  const col = await columnOf(page);
  assert.ok(col, "the column opened from the chooser row");
  assert.equal(col.title, "the Town Centre steps");
  assert.deepEqual(col.link, { href: "/conversations/#live-c", target: "_blank", rel: "noopener noreferrer", text: "all conversations →" });
  assert.equal(await page.evaluate(() => window.__opened.length), 0, "window.open was not called");
  assert.equal(page.__popups, 0, "no new tab");
  await page.mouse.move(at.x + 300, at.y + 400);
  await page.waitForTimeout(300);
  assert.deepEqual((await washes(page)).map((w) => [w.id, w.selected]), [["live-c", true]], "and the chosen thread keeps its wash");
  await page.close();
});

test("8. a cooling thread's wash is the dotted one, and its column says it has gone quiet", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const page = await openViewer({ mode: "column" });
  await waitBadges(page, 4);
  const at = await discOf(page, "closed-a");
  await page.mouse.move(at.x, at.y);
  await page.waitForFunction(() => document.querySelectorAll("#wv-convo-wash-layer ellipse").length > 0, null, { timeout: 5000 }).catch(() => {});
  const w = await washes(page);
  assert.deepEqual(w.map((x) => [x.id, x.dashed]), [["closed-a", true]], JSON.stringify(w));
  await page.mouse.down(); await page.mouse.up();
  await page.waitForFunction(() => /gone quiet/.test(document.querySelector(".wv-homecol-kicker")?.textContent ?? ""), null, { timeout: 10_000 }).catch(() => {});
  assert.match((await columnOf(page))?.kicker ?? "", /a conversation · gone quiet/);
  await page.close();
});

test("9. no page exception across the page tests", (t) => {
  if (!chromium) return t.skip(skipReason);
  assert.deepEqual(errors, []);
});
