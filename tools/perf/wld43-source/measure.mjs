// WLD-43 measure: one run of prod's public World page under a CPU throttle.
// usage: node measure.mjs <case> <throttle> <run> [--profile]
//   case: now      the live crossing (the Mists on)
//         now-rm   the live crossing with prefers-reduced-motion (drift and creatures held still)
//         c243     the browser's clock shifted so the live crossing reads 243 (before the Mists)
// Read-only: it loads a public page. --profile runs uninstrumented and takes CPU profiles.
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire("G:/Wright-HQ/package.json");
const { chromium } = require("playwright");

const [CASE, THR, RUN] = [process.argv[2], Number(process.argv[3]), process.argv[4]];
const PROFILE = process.argv.includes("--profile");
const NOGPU = process.argv.includes("--nogpu");
const DIR = "G:/temp/claude/G--Wright-HQ/80359049-1e77-4fcb-92bb-19363501e34d/scratchpad/wld43/results";
fs.mkdirSync(DIR, { recursive: true });
const tag = `${CASE}${NOGPU ? "-nogpu" : ""}-x${THR}-${PROFILE ? "prof" : "r"}${RUN}`;
const URL_WORLD = "https://postmark.town/world/";
const EPOCH = Date.UTC(2026, 5, 12), HALF_DAY = 12 * 3600 * 1000;

// in the page, from the first byte: long tasks, every frame, visibility, the crossing clock
const pageInit = ({ shiftTo }) => {
  if (shiftTo != null) {
    const RealDate = Date, realNow = RealDate.now.bind(RealDate);
    const EP = Date.UTC(2026, 5, 12), H = 12 * 3600 * 1000;
    const off = (EP + shiftTo * H + ((realNow() - EP) % H)) - realNow();
    class ShiftedDate extends RealDate {
      constructor(...a) { if (a.length === 0) super(realNow() + off); else super(...a); }
      static now() { return realNow() + off; }
    }
    globalThis.Date = ShiftedDate;
  }
  const W = (globalThis.__wld43 ??= { bake: [], raster: [], calls: {} });
  W.lt = []; W.frames = []; W.vis = [document.visibilityState]; W.vb = 0;
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) W.lt.push([e.startTime, e.duration]); }).observe({ type: "longtask", buffered: true }); } catch {}
  document.addEventListener("visibilitychange", () => W.vis.push(document.visibilityState + "@" + performance.now().toFixed(0)));
  let lastVB = null;
  const tick = (t) => {
    W.frames.push(t);
    if (W.trackVB) { const s = document.getElementById("map-svg"); const v = s ? s.getAttribute("viewBox") + "|" + s.style.transform : null; if (v !== lastVB) { W.vb++; lastVB = v; } }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const timeIt = (proto, name, label) => {
    const f = proto[name];
    proto[name] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { const c = (W.calls[label] ??= { n: 0, ms: 0, max: 0 }); const d = performance.now() - t; c.n++; c.ms += d; c.max = Math.max(c.max, d); } };
  };
  if (!W.noWrap) {
    timeIt(HTMLCanvasElement.prototype, "toDataURL", "canvas.toDataURL (sync PNG encode)");
    const tb = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb, ...a) {
      const t = performance.now(), w = this.width, h = this.height;
      return tb.call(this, (b) => { (W.toBlob ??= []).push({ w, h, ms: performance.now() - t }); cb(b); }, ...a);
    };
  }
};

// the instrumented mists-render.mjs: prod's bytes plus timing wrappers on what the viewer imports
const WRAP = `
;const __W = (globalThis.__wld43 ??= { bake: [], raster: [], calls: {} });
function __time(name, f) { return function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { const c = (__W.calls[name] ??= { n: 0, ms: 0, max: 0 }); const d = performance.now() - t; c.n++; c.ms += d; c.max = Math.max(c.max, d); } }; }
function __job(list, rec, job) {
  const next = job.next.bind(job);
  job.next = (n) => { const t = performance.now(); const more = next(n); const d = performance.now() - t; rec.cpuMs += d; rec.slices++; rec.maxSliceMs = Math.max(rec.maxSliceMs, d); if (!more) rec.tEnd = performance.now(); return more; };
  list.push(rec); return job;
}
{ const o = mistsBaker; mistsBaker = function (m, layer, box, opts = {}) { const t0 = performance.now(); const b = o(m, layer, box, opts); const s = performance.now() - t0;
    return __job(__W.bake, { layer, crossing: m.crossing, box: [box.minX, box.minY, box.maxX, box.maxY].map(Math.round).join(","), pxM: opts.pxM, w: b.width, h: b.height, setupMs: s, cpuMs: s, slices: 0, maxSliceMs: s, t0, tEnd: null }, b); }; }
{ const o = mistsKeepRasterBuilder; mistsKeepRasterBuilder = function (rects, box, pxM) { const t0 = performance.now(); const j = o(rects, box, pxM); const s = performance.now() - t0;
    return __job(__W.raster, { rects: rects?.length, box: [box.minX, box.minY, box.maxX, box.maxY].map(Math.round).join(","), pxM, setupMs: s, cpuMs: s, slices: 0, maxSliceMs: s, t0, tEnd: null }, j); }; }
bakeSheetFeather = __time("bakeSheetFeather", bakeSheetFeather);
mistsBakePlan = __time("mistsBakePlan", mistsBakePlan);
mistsKeepRects = __time("mistsKeepRects", mistsKeepRects);
mistsCreatures = __time("mistsCreatures", mistsCreatures);
mistsCreatureSVG = __time("mistsCreatureSVG", mistsCreatureSVG);
mistsCoreHex = __time("mistsCoreHex", mistsCoreHex);
`;

const browser = await chromium.launch({ channel: "chromium", headless: true,
  args: ["--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", ...(NOGPU ? ["--disable-gpu"] : [])] });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, reducedMotion: CASE.endsWith("-rm") ? "reduce" : "no-preference" });
if (PROFILE) await ctx.addInitScript(() => { globalThis.__wld43 = { bake: [], raster: [], calls: {}, noWrap: true }; });
await ctx.addInitScript(pageInit, { shiftTo: CASE.startsWith("c243") ? 243 : null });
if (!PROFILE) await ctx.route(/\/world-engine\/spectator\/mists-render\.mjs(\?.*)?$/, async (route) => {
  const res = await route.fetch();
  await route.fulfill({ response: res, body: (await res.text()) + WRAP });
});
const page = await ctx.newPage();
// same-site first, so the throttle and the profiler are on the process the World page runs in
await page.goto("https://postmark.town/build.json");
const cdp = await ctx.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: THR });
await cdp.send("Performance.enable");
const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
const profiles = {};
if (PROFILE) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 500 }); await cdp.send("Profiler.start"); }

const now = () => page.evaluate(() => performance.now());
const assertVisible = async (where) => { const v = await page.evaluate(() => document.visibilityState); if (v !== "visible") throw new Error(`visibilityState ${v} at ${where}`); return v; };
const quietFor = async (ms, cap) => {   // wait until no long task has ended in the last `ms`
  const end = Date.now() + cap;
  while (Date.now() < end) {
    const q = await page.evaluate((ms) => { const W = globalThis.__wld43, t = performance.now(); const last = W.lt.reduce((a, [s, d]) => Math.max(a, s + d), 0); return t - last >= ms; }, ms);
    if (q) return true;
    await page.waitForTimeout(250);
  }
  return false;
};

const out = { tag, case: CASE, throttle: THR, run: RUN, profile: PROFILE, nogpu: NOGPU, at: new Date().toISOString(), phases: {}, metrics: {} };
const m0 = await metrics();
const wall0 = Date.now();
await page.goto(URL_WORLD, { waitUntil: "load" });
out.visibleAtLoad = await assertVisible("load");
out.loadEventMs = Date.now() - wall0;
await page.waitForSelector("#map-svg", { timeout: 120000 });
out.mapAtMs = await now();
if (!CASE.startsWith("c243")) { await page.waitForSelector(".wv-mists-paint", { state: "attached", timeout: 240000 }); out.mistsPaintAtMs = await now(); }
out.settledQuiet = await quietFor(2000, 60000);
out.phases.load = [0, await now()];
out.crossing = await page.evaluate(() => document.body.innerText.match(/crossing\s+(\d+)/)?.[1] ?? null);
out.metrics.load = await metrics();
if (PROFILE) { profiles.load = (await cdp.send("Profiler.stop")).profile; await cdp.send("Profiler.start"); }

// the spectator's tour holds the roll-in; skip it, as a returning spectator does
await assertVisible("skip");
const s0 = await now();
await page.click(".wv-tour-card button:has-text('skip')", { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(5000);
out.phases.rollin = [s0, await now()];
out.metrics.rollin = await metrics();

// idle: nothing touched for 10 s
await assertVisible("idle");
const i0 = await now();
await page.waitForTimeout(10000);
out.phases.idle = [i0, await now()];
out.metrics.idle = await metrics();

// pan near the wall: drag the painting so the east bank sweeps through the view, 10 s
await assertVisible("pan");
const box = await page.evaluate(() => { const r = document.getElementById("map-svg").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const cx = box.x + box.w * 0.8, cy = box.y + box.h * 0.5;
await page.mouse.move(cx, cy);
// one wheel tick in, centred on the east bank: the fit view is the zoom-out limit, where the pan is clamped
await page.mouse.wheel(0, -300);
await page.waitForTimeout(2500);
await quietFor(1500, 30000);
out.panViewBox = await page.evaluate(() => document.getElementById("map-svg").getAttribute("viewBox"));
await page.evaluate(() => { globalThis.__wld43.trackVB = true; globalThis.__wld43.vb = 0; });
const p0 = await now();
await page.mouse.down();
const pw0 = Date.now(); let moves = 0;
while (Date.now() - pw0 < 10000) {
  const t = (Date.now() - pw0) / 1000;
  await page.mouse.move(cx - 120 + 120 * Math.cos(2 * Math.PI * t / 2.5), cy + 90 * Math.sin(2 * Math.PI * t / 3.7));
  moves++;
}
await page.mouse.up();
out.phases.pan = [p0, await now()];
out.panMoves = moves;
if (RUN === "smoke") await page.screenshot({ path: DIR + "/" + tag + ".pan.png" });
out.metrics.pan = await metrics();
await assertVisible("after pan");
if (PROFILE) profiles.steady = (await cdp.send("Profiler.stop")).profile;

const W = await page.evaluate(() => { const W = globalThis.__wld43; return { lt: W.lt, frames: W.frames, vis: W.vis, vb: W.vb, bake: W.bake, raster: W.raster, calls: W.calls, toBlob: W.toBlob ?? [] }; });
Object.assign(out, W);
out.dom = await page.evaluate(() => ({ nodes: document.querySelectorAll("*").length, mapNodes: document.querySelectorAll("#map-svg *").length, mistsImages: document.querySelectorAll(".wv-mists-paint image").length, creatures: document.querySelectorAll(".wv-mists-creatures > *").length }));
// the throttle, proved: a fixed loop's time
out.calibrationMs = await page.evaluate(() => { const t = performance.now(); let x = 0; for (let i = 0; i < 2e7; i++) x = (x + i * 7) % 1000003; return performance.now() - t + (x < 0 ? 1 : 0); });
await cdp.send("HeapProfiler.enable");
await cdp.send("HeapProfiler.collectGarbage");
out.metrics.afterGC = await metrics();
out.metrics.start = m0;
fs.writeFileSync(`${DIR}/${tag}.json`, JSON.stringify(out));
if (PROFILE) for (const [k, p] of Object.entries(profiles)) fs.writeFileSync(`${DIR}/${tag}.${k}.cpuprofile`, JSON.stringify(p));
console.log(tag, "crossing", out.crossing, "mists at", out.mistsPaintAtMs?.toFixed(0), "load", out.phases.load[1].toFixed(0), "lt", out.lt.length, "moves", moves, "vb", out.vb, "cal", out.calibrationMs.toFixed(0), "vis", out.vis.join(","));
await browser.close();
