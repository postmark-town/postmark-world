// lite-mode.test.mjs — the World page's lite mode (WLD-43 part 2, Darko
// 2026-10-13: "yes to the fix for everyone, then light mode").
//
//   node --test tools/lite-mode.test.mjs
//
// For a machine the Mists are heavy on: their motion held still as
// prefers-reduced-motion holds it, no roll-in, and the site's bat still, by one
// class on <html> (`wv-lite`) that the viewer's CSS and the site's motif read.
// Who decides (viewer.mjs § LITE): a link (?lite=1 / ?lite=0), then the
// visitor's own choice from the toggle beside the bell (auto, on, off, kept on
// the device), then auto: few cores, little memory, or a slow first bake.
//
// The rule is read directly; the page is DRIVEN for everything a reader would
// see. When Playwright is absent the page half SKIPS AND SAYS SO.

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LITE, LITE_NEXT, liteModeFor, liteCarryOld } from "../spectator/viewer.mjs";
import { machineContext } from "./page-machine.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("who decides: a link, then the visitor's choice, then the machine", () => {
  const big = { cores: 16, memory: 8 };
  assert.deepEqual(liteModeFor(big), { on: false, why: "auto" }, "an able machine, nobody asked: off");
  assert.deepEqual(liteModeFor({ ...big, query: "?lite=1" }), { on: true, why: "link" });
  assert.deepEqual(liteModeFor({ cores: 2, query: "?a=b&lite=0", choice: "on" }), { on: false, why: "link" }, "a link outranks the choice and the machine");
  assert.deepEqual(liteModeFor({ ...big, choice: "on" }), { on: true, why: "chosen" });
  assert.deepEqual(liteModeFor({ cores: 2, memory: 2, slow: true, choice: "off" }), { on: false, why: "chosen" }, "the visitor's own word outranks every auto reason");
  assert.deepEqual(liteModeFor({ ...big, slow: true }), { on: true, why: "slow" }, "a slow first bake, kept from before");
  assert.deepEqual(liteModeFor({ cores: 4, memory: 8 }), { on: true, why: "cores" }, "four cores or fewer");
  assert.deepEqual(liteModeFor({ cores: 5, memory: 8 }), { on: false, why: "auto" });
  assert.deepEqual(liteModeFor({ cores: 8, memory: 4 }), { on: true, why: "memory" }, "4 GB or less (Chromium's deviceMemory)");
  assert.deepEqual(liteModeFor({ cores: 0, memory: 0 }), { on: false, why: "auto" }, "a browser that says nothing is not called small");
  assert.deepEqual(liteModeFor({ ...big, query: "?lite=yes" }), { on: false, why: "auto" }, "only 1 and 0 are a link's words");
  assert.deepEqual(LITE_NEXT, { auto: "on", on: "off", off: "auto" }, "the toggle goes round");
  assert.equal(LITE.bakeMsPerKpx, 3, "the bake's threshold, ms per 1,000 px of its first layer");
});

// Darko 2026-10-15: "it should be https://postmark.town/world/?lite=1". The
// build's first name is ignored the way POS-285 ignored ?lite=.
test("the name is lite: ?lite=1 turns it on, ?lite=0 forces it off, and the stale ?light= is ignored", () => {
  const big = { cores: 16, memory: 8 }, small = { cores: 2, memory: 2 };
  assert.deepEqual(liteModeFor({ ...big, query: "?lite=1" }), { on: true, why: "link" }, "?lite=1 on an able machine");
  assert.deepEqual(liteModeFor({ ...small, query: "?lite=0" }), { on: false, why: "link" }, "?lite=0 on a small one");
  assert.deepEqual(liteModeFor({ ...big, query: "?light=1" }), { on: false, why: "auto" }, "?light=1 turns nothing on");
  assert.deepEqual(liteModeFor({ ...small, query: "?light=0" }), { on: true, why: "cores" }, "and ?light=0 forces nothing off");
  assert.deepEqual([LITE.choiceKey, LITE.slowKey], ["pm_world_lite", "pm_world_lite_slow"], "one word runs through, the keys included");
});

test("a choice kept under the build's first keys carries over once, and the old keys go", () => {
  const storeOf = (init) => {
    const m = new Map(Object.entries(init));
    return { m, get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => { if (v == null) m.delete(k); else m.set(k, v); } };
  };
  let s = storeOf({ pm_world_light: "on", pm_world_light_slow: "1" });
  liteCarryOld(s);
  assert.deepEqual(Object.fromEntries(s.m), { pm_world_lite: "on", pm_world_lite_slow: "1" }, "carried, and the old keys dropped");
  s = storeOf({ pm_world_light: "on", pm_world_lite: "off" });
  liteCarryOld(s);
  assert.deepEqual(Object.fromEntries(s.m), { pm_world_lite: "off" }, "a choice under the new key outranks the old one");
  s = storeOf({ pm_world_light: "off", pm_world_lite: "1" });
  liteCarryOld(s);
  assert.deepEqual(Object.fromEntries(s.m), { pm_world_lite: "off" }, "POS-228's '1' is not a choice here, so the old choice fills it");
  s = storeOf({ pm_world_lite: "1" });
  liteCarryOld(s);
  assert.deepEqual(Object.fromEntries(s.m), { pm_world_lite: "1" }, "with nothing old, nothing is written");
});

// ── the page ────────────────────────────────────────────────────────────────
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

// THE MACHINE'S SPEED IS SET, NOT MEASURED (WLD-60). The bake times its first
// layer with performance.now() and calls the machine slow past 3 ms per 1,000 px,
// so on a busy host an "able machine" page read slow and lite came on. The
// context holds the page's clock still within one task (page-machine.mjs §
// holdClockWithinATask, first written here), so the bake reads instant. ONLY THE
// SLOW MACHINE keeps the real clock, at the CPU throttle it names: its subject is
// the measurement, so it opts out of the held clock, by name.

// crossing 247, five hours in (the Mists on, whatever today's crossing is), and
// the machine the page is told it runs on
async function open({ query = "", cores = 16, memory = 8, throttle = 0 } = {}) {
  const ctx = await machineContext(browser, {
    viewport: { width: 1366, height: 768 }, reducedMotion: "no-preference", machine: { cores, memory },
    ...(throttle ? { clock: "real", throttle } : {}),
  });
  await ctx.addInitScript(() => {
    const RealDate = Date, realNow = RealDate.now.bind(RealDate);
    const off = (Date.UTC(2026, 5, 12) + 247 * 12 * 3600e3 + 5 * 3600e3) - realNow();
    globalThis.Date = class extends RealDate { constructor(...a) { if (a.length === 0) super(realNow() + off); else super(...a); } static now() { return realNow() + off; } };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
  await page.goto(`http://localhost:${port}/${query}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  await page.waitForSelector(".wv-lite-toggle", { state: "attached", timeout: 180_000 });
  return { ctx, page, errors };
}
const read = (page) => page.evaluate(() => {
  const btn = document.querySelector(".wv-lite-toggle"), bell = document.querySelector(".wv-bell");
  const running = document.getAnimations().filter((a) => a.playState === "running");
  return {
    lite: document.documentElement.classList.contains("wv-lite"),
    besideBell: !!btn && bell?.nextElementSibling === btn,
    pressed: btn?.getAttribute("aria-pressed"), label: btn?.getAttribute("aria-label"), on: btn?.classList.contains("on"), title: btn?.title,
    mistsMotion: running.filter((a) => a.effect?.target?.closest?.(".wv-mists-stage")).map((a) => a.animationName ?? "waapi"),
    stored: localStorage.getItem("pm_world_lite"), slow: localStorage.getItem("pm_world_lite_slow"),
  };
});

// what the Mists look like on the page: the wall, the paint, the feather
const mists = (page) => page.evaluate(() => ({
  wall: !!document.querySelector("#wv-mists-layer .wv-mists-wall"),
  paint: !!document.querySelector(".wv-mists-paint"),
  feather: !!document.querySelector(".wv-sheet-feather"),
}));

// ── WHAT THE PAGE SHOWED, SAID IN THE TAP (WLD-150 D1; a diagnostic, not a fix) ──
//
// The slow-bake case below waits up to 180 s for html.wv-lite, and when that wait has failed in CI the failure
// said only "Timeout 180000ms exceeded": nothing about what the page looked like. This reads the page's own
// existing state, in ONE page task so the fields agree with each other, and prints it as one t.diagnostic JSON line
// on the case's success and on its timeout, and at the already-painted point of the toggle case as a control.
//
// WHAT IT IS NOT. It does not measure the bake (no layer time, no host speed, no throttle check), and `waited_ms`
// is this process's own elapsed time around the wait, NOT bake time. It decides nothing: no assertion reads it, no
// wait, timeout or threshold depends on it, and the original failure is re-thrown unchanged. Read it as a
// description of the page at that moment: a painted page with no slow flag is a bake that FINISHED without
// turning auto-lite on (it does not say how fast); an unpainted page is ambiguous between work still running,
// aborted, or starved, and this line cannot tell which. A state read that does not answer within 3 s is
// reported as unknown, never as a cause. It holds booleans, the stored keys' values and the toggle's static
// words only: no mark, id, URL, credential or error text.
const STATE_READ_MS = 3000;
const pageState = (page) => page.evaluate(() => {
  const btn = document.querySelector(".wv-lite-toggle");
  return {
    lite: document.documentElement.classList.contains("wv-lite"),
    slowKey: localStorage.getItem("pm_world_lite_slow"),
    storedChoice: localStorage.getItem("pm_world_lite"),
    toggleLabel: btn?.getAttribute("aria-label") ?? null,
    toggleTitle: btn?.title ?? null,
    wall: !!document.querySelector("#wv-mists-layer .wv-mists-wall"),
    paint: !!document.querySelector(".wv-mists-paint"),
    feather: !!document.querySelector(".wv-sheet-feather"),
  };
});
async function stateLine(page, errors, label, waitedMs) {
  let state, timer;
  try {
    state = await Promise.race([pageState(page), new Promise((_, no) => { timer = setTimeout(() => no(new Error("no answer")), STATE_READ_MS); })]);
  } catch {
    // a fixed word, never the exception's text: the read may have failed at once or run out its 3 s, and either is just "unknown"
    state = { unknown: "the page's state could not be read (no answer within the bound, or the read failed)" };
  } finally { clearTimeout(timer); }
  return JSON.stringify({ lite_state: label, waited_ms: waitedMs, waited_ms_is: "this process's elapsed time around the wait, not bake time", page_errors: errors.length, ...state });
}

test("the page: ?lite=1 draws the wall alone (no bake, no feather, nothing moving); the toggle beside the bell says so", async (t) => {
  if (!chromium) { t.skip("NO PLAYWRIGHT — lite mode went UNGUARDED"); return; }
  const { ctx, page, errors } = await open({ query: "?lite=1" });
  await page.waitForSelector("#wv-mists-layer .wv-mists-wall", { state: "attached", timeout: 120_000 });
  await page.waitForTimeout(4000);   // longer than this rig's whole bake at full speed
  const r = await read(page), m = await mists(page);
  assert.equal(r.lite, true, "html.wv-lite");
  assert.deepEqual(m, { wall: true, paint: false, feather: false }, "RULED (Darko 2026-10-13 21:11): the hard-edged wall stands alone, no bake and no feather");
  assert.deepEqual(r.mistsMotion, [], "nothing on the Mists' stage moves");
  assert.ok(r.besideBell, "the toggle sits right after the bell");
  assert.equal(r.pressed, "true"); assert.equal(r.on, true, "lit while lite mode is in effect");
  assert.equal(r.label, "lite mode: auto, on");
  assert.match(r.title, /set by the link/);
  assert.equal(r.stored, null, "a link is never stored");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("the page: the toggle goes auto → on → off → auto, kept on the device, outranks the link, and the paint comes and goes with it", async (t) => {
  if (!chromium) { t.skip("NO PLAYWRIGHT — lite mode went UNGUARDED"); return; }
  const { ctx, page, errors } = await open({ query: "?lite=1" });
  await page.waitForSelector("#wv-mists-layer .wv-mists-wall", { state: "attached", timeout: 120_000 });
  const click = async () => { await page.click(".wv-lite-toggle"); await page.waitForTimeout(400); return read(page); };
  let r = await click();
  assert.equal(r.stored, "on"); assert.equal(r.lite, true); assert.equal(r.label, "lite mode: on");
  r = await click();
  assert.equal(r.stored, "off"); assert.equal(r.lite, false, "off outranks the ?lite=1 the page was opened with");
  const paintStart = Date.now();
  await page.waitForSelector(".wv-mists-paint img", { state: "attached", timeout: 120_000 });
  await page.waitForTimeout(500);
  r = await read(page);
  t.diagnostic(await stateLine(page, errors, "toggle case (able page, held clock): painted, the control observation", Date.now() - paintStart));
  assert.ok(r.mistsMotion.length >= 2, `out of lite mode the Mists are baked and drift again (${r.mistsMotion.join(",")})`);
  assert.equal((await mists(page)).feather, true, "and the sheet's feather is back");
  r = await click();
  assert.equal(r.stored, null, "back to auto: the choice is forgotten");
  assert.equal(r.lite, false, "auto on an able machine (the link is spent once the visitor chose)");
  assert.equal(r.label, "lite mode: auto, off");
  await page.click(".wv-lite-toggle");   // on: the paint goes at once
  await page.waitForTimeout(400);
  assert.deepEqual(await mists(page), { wall: true, paint: false, feather: false }, "turned on, the paint and the feather go");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".wv-lite-toggle", { state: "attached", timeout: 180_000 });
  r = await read(page);
  assert.equal(r.lite, true, "kept on the device across a reload"); assert.equal(r.label, "lite mode: on");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("the page: auto turns lite mode on for a small machine, and for a slow first bake, which stops (kept for the next visit)", async (t) => {
  if (!chromium) { t.skip("NO PLAYWRIGHT — lite mode went UNGUARDED"); return; }
  for (const [machine, why] of [[{ cores: 4, memory: 8 }, /few cores/], [{ cores: 16, memory: 4 }, /little memory/]]) {
    const { ctx, page } = await open(machine);
    const r = await read(page);
    assert.equal(r.lite, true, `${JSON.stringify(machine)}: lite`);
    assert.match(r.title, why);
    await ctx.close();
  }
  // a slow machine: the first layer of the bake, timed under a 6× CPU throttle
  // (at full speed here it reads about 1.3 ms per 1,000 px; the line is 3)
  const { ctx, page, errors } = await open({ throttle: 6 });
  const waitStart = Date.now();
  try {
    await page.waitForFunction(() => document.documentElement.classList.contains("wv-lite"), null, { timeout: 180_000 });
  } catch (e) {
    // the page's state, bounded, then the ORIGINAL failure, unchanged: this case still fails exactly as it did
    t.diagnostic(await stateLine(page, errors, "slow case: the 180 s wait for wv-lite TIMED OUT", Date.now() - waitStart));
    await ctx.close().catch(() => {});
    throw e;
  }
  t.diagnostic(await stateLine(page, errors, "slow case: wv-lite came on", Date.now() - waitStart));
  await page.waitForTimeout(6000);   // what was left of the bake would have finished and painted by now
  const r = await read(page);
  assert.equal(r.slow, "1", "the verdict is kept on the device");
  assert.match(r.title, /painted slowly here/);
  assert.equal((await mists(page)).paint, false, "the bake stopped at its verdict: no paint");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("the page on a phone: no seventh circle; the bell opens a menu holding the bell and lite mode", async (t) => {
  if (!chromium) { t.skip("NO PLAYWRIGHT — lite mode went UNGUARDED"); return; }
  // an able phone (the set machine, page-machine.mjs): its row reads "auto (off)"
  const ctx = await machineContext(browser, { viewport: { width: 390, height: 844 }, hasTouch: true });
  await ctx.addInitScript(() => {
    const RealDate = Date, realNow = RealDate.now.bind(RealDate);
    const off = (Date.UTC(2026, 5, 12) + 247 * 12 * 3600e3 + 5 * 3600e3) - realNow();
    globalThis.Date = class extends RealDate { constructor(...a) { if (a.length === 0) super(realNow() + off); else super(...a); } static now() { return realNow() + off; } };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
  await page.goto(`http://localhost:${port}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-bell", { state: "visible", timeout: 180_000 });
  // the tour greets a first visit and its scrim takes the taps: skip it once it is up
  await page.waitForSelector(".wv-tour-skip", { state: "visible", timeout: 15_000 }).then(() => page.click(".wv-tour-skip")).catch(() => {});
  await page.waitForSelector(".wv-tour-scrim", { state: "hidden", timeout: 15_000 }).catch(() => {});
  assert.equal(await page.isVisible(".wv-lite-toggle"), false, "the lite toggle's circle stands down on a phone");
  const bellBefore = await page.evaluate(() => localStorage.getItem("pm_world_bell"));
  await page.click(".wv-bell");
  await page.waitForSelector(".wv-bell-menu", { state: "visible" });
  const rows = () => page.evaluate(() => [...document.querySelectorAll(".wv-bell-menu-row")].map((b) => b.textContent));
  assert.deepEqual(await rows(), ["🔔 the bell: on", "🍃 lite mode: auto (off)"], "two rows: the bell and lite mode");
  assert.equal(await page.evaluate(() => localStorage.getItem("pm_world_bell")), bellBefore, "opening the menu is not ringing the change");
  await page.click('.wv-bell-menu-row[data-act="lite"]');
  assert.deepEqual((await rows())[1], "🍃 lite mode: on", "the lite row goes round as the desktop toggle does");
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("wv-lite")), true);
  await page.click('.wv-bell-menu-row[data-act="bell"]');
  assert.deepEqual((await rows())[0], "🔕 the bell: off", "and the bell row is the bell's own act");
  await page.keyboard.press("Escape");
  assert.equal(await page.isVisible(".wv-bell-menu"), false, "Escape closes it");
  assert.deepEqual(errors, []);
  await ctx.close();
});
