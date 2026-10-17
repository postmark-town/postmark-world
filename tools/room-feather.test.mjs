// room-feather.test.mjs — a room scene never gets the Mists' sheet feather (WLD-21).
//
// The feather is the town's: the painted sheet's straight edge, faded into the open
// country (viewer.mjs § paintSheetFeather). paintMists lays it in a task of its own,
// and a room could mount before that task ran; the task then painted the town's
// feather into the ROOM's scene, over its floor, so a room past the sheet's edge
// read as a slate floor with its markers on it and its picture hidden.
//
// The page is driven the way a resident meets it: signed in, the Mists on (crossing
// 247), standing inside a room by the enter ledger, and the page asked to read the
// record again (the handle every host page uses), so the room mounts while the
// town's Mists are being painted. Taking the guard out of paintSheetFeather reds it.
//
// THE ORDER IS SET, NOT RACED (S112, 2026-10-16). The page first opens in the town
// (the ledger it is served holds no enter yet), so the town's Mists wall is drawn;
// only then does the ledger carry ann's enter, and the reload mounts the room. Served
// the enter from the start, a loaded machine could mount the room before the town
// ever drew its Mists. That is correct (a room has no border), but the wait for the
// wall then never ended: the keeper's full run held S112 on it (120 s, not-ok 887).

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatEnterExit } from "./enter-exit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
const LEDGER = readFileSync(join(ROOT, "WORLD/enter-exit-ledger.md"), "utf8");
// a room on the record: a sited mark with no class and no entry law of its own
const ROOM = STATE.marks.find((m) => m.kind === "sited" && m.at && m.extent && !m.class && !m.entry
  && m.extent.w >= 15 && m.extent.w <= 60 && m.extent.h >= 15 && m.extent.h <= 60);

async function loadChromium() { try { return (await import("playwright")).chromium; } catch { return null; } }
const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
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

test("the fixture has a room to stand in", () => assert.ok(ROOM, "a sited mark 15–60 m across, with no class and no entry law"));

test("THE PAGE: a resident standing in a room while the Mists are on sees the room's scene with no sheet feather in it", async (t) => {
  if (!chromium) { t.skip("Playwright is not installed: the room's feather went UNGUARDED"); return; }
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: "no-preference" });
  await ctx.addInitScript(() => {
    // crossing 247, five hours in: the Mists stand; an able machine, so not lite
    const RealDate = Date, realNow = RealDate.now.bind(RealDate);
    const off = (Date.UTC(2026, 5, 12) + 247 * 12 * 3600e3 + 5 * 3600e3) - realNow();
    globalThis.Date = class extends RealDate { constructor(...a) { if (a.length === 0) super(realNow() + off); else super(...a); } static now() { return realNow() + off; } };
    Object.defineProperty(Navigator.prototype, "hardwareConcurrency", { get: () => 16, configurable: true });
    Object.defineProperty(Navigator.prototype, "deviceMemory", { get: () => 8, configurable: true });
    try { localStorage.setItem("pm_key", "room-feather-test"); } catch { /* the page reads a key or none */ }
  });
  // signed in as ann, who entered the room at crossing 240 (before the Mists, so
  // every clock on the page holds it)
  let ledger = LEDGER;   // the town first: the enter is served only once the wall is drawn
  const entered = LEDGER.replace(/\s*$/, "\n") + formatEnterExit({ handle: "ann", act: "enters", mark: ROOM.id, at: 240, word: "neutral", iso: "2026-10-09T12:00:00.000Z" }) + "\n";
  await ctx.route("**/ops/whoami*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ handles: ["ann"], handle: "ann", household: "ann", principal: false }) }));
  await ctx.route("**/world/enter-exit-ledger*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ledger }) }));
  await ctx.route("**/WORLD/enter-exit-ledger.md*", (r) => r.fulfill({ status: 200, contentType: "text/markdown", body: ledger }));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
  await page.goto(`http://localhost:${port}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  await page.waitForSelector("#wv-mists-layer .wv-mists-wall", { state: "attached", timeout: 120_000 });
  await page.waitForFunction(() => !!window.__pmViewer, null, { timeout: 60_000 });
  assert.equal(await page.locator(".wv-minimap.is-scene-mark").count(), 0, "the page opened in the town, not the room");
  ledger = entered;   // now the record says ann stands in the room
  await page.evaluate(() => window.__pmViewer.reload());
  await page.waitForSelector(".wv-minimap.is-scene-mark .wv-scene-ground", { state: "attached", timeout: 60_000 });
  await page.waitForTimeout(3000);   // every task the Mists' paint schedules has run
  const r = await page.evaluate(() => {
    const scene = document.querySelector(".wv-minimap.is-scene-mark > svg");
    return { inRoom: !!scene, feather: !!scene?.querySelector(".wv-sheet-feather"), unfeather: !!scene?.querySelector(".wv-sheet-unfeather") };
  });
  assert.equal(r.inRoom, true, `standing in ${ROOM.id}`);
  assert.equal(r.feather, false, "the town's sheet feather is never laid over a room's floor");
  assert.equal(r.unfeather, false, "nor its mask");
  assert.deepEqual(errors, []);
  await ctx.close();
});
