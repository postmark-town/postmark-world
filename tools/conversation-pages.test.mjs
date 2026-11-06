// conversation-pages.test.mjs — POS-779: the MOUNTED World map draws one badge per thread (the real viewer in a browser, an invented office).
//
// conversation-badges.test.mjs pins the viewer's source; this drives the viewer itself. The office is a stub that answers
// `GET /world/conversations` in the door's own shape (`live` and `closed` threads, newest first); every thread, place and speaker is invented.
//
//   1. default ON: one badge per thread, each at its own thread id, wearing the conversation glyph in the map's gray-white
//   2. the days: a live thread quiet for hours is still live (a settlement is the only edge), an earlier settlement's thread is the
//      dotted cooling badge for a day, then it leaves
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
function conversationsBody() {
  const base = { now: new Date(OFFICE.now()).toISOString(), earshot_m: 45, fade_minutes: 20, hearable_since: "2026-11-04T10:00:00.000Z", close_minutes: null };
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

test("4. no page exception across the page tests", (t) => {
  if (!chromium) return t.skip(skipReason);
  assert.deepEqual(errors, []);
});
