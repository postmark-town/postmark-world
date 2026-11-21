#!/usr/bin/env node
// capture.mjs — WLD-227's ONE bounded attribution profile. A task artifact, not a feature: one run, one CPU profile, no second benchmark.
//
//   node tools/perf/wld227-oneoff/capture.mjs --check --go <sha>     no browser: the pin, the clock, the pinned Playwright, the output place
//   node tools/perf/wld227-oneoff/capture.mjs --go <sha> [--out DIR]  THE RUN (only on the lead's go that names the reviewed commit <sha>)
//
// Run it as LANE-DISCIPLINE.md:41 and the brief say: through run-heavy, inside the native 2 GiB / no-swap scope, with a finite total bound
// (570 s, then a 15 s kill grace: 585 s, inside the ten minutes):
//   XDG_RUNTIME_DIR=/run/user/$(id -u) run-heavy systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 \
//     timeout -k 15 570 node tools/perf/wld227-oneoff/capture.mjs --go <sha>
// The scope is the memory bound. The script's own RSS_LIMIT_MIB tripwire (the browser tree's summed VmRSS, once a second) sits beneath it and is not a
// substitute for it; its own wall timer (WALL_BOUND_S, 555 s) ends the run before `timeout` would: it kills the browser, exits 3 / 4 naming which, and
// writes what it had.
//
// WHAT THE NUMBERS ARE NOT: the page carries this run's own instrumentation (a long-task PerformanceObserver and a requestAnimationFrame camera tracker,
// the audit's own, named `wld227-harness.js` so its frames are their own bucket), and the V8 CPU sampler (1 ms) is on for the whole window, under the 4x
// throttle. So the attribution says where the page's time goes; its frame timings are NOT the unprofiled audit's p95 and are never reported as that.
//
// WHAT IT DOES (the WLD-222 audit's own run, World #420 pin 9e7f0964, tools/perf/world-page-audit.mjs, reduced to ONE sample at ONE place):
//   real, signed-out https://postmark.town/world/ in a FRESH context; unmodified prod; no cookie or profile reuse, no response rewriting, no clock
//   shift, no Mists wrapper, no backend write; Playwright 1.62.0's own headless Chromium; 1366x768; CPU slowed 4x (CDP Emulation.setCPUThrottlingRate).
//   Inputs are the page's own: the tour's "skip", the wheel over bare painting, the search box, and one mouse drag.
//   PREPARATION (outside the profile): load; map shown; a BOUNDED rest; wheel to the audit's camera scale (BASELINE_SCALE); search "town centre"; check
//   the place is genuinely near the centre (the pill's own metres AND the shape under the middle of the map: "of TC" alone is on every pill); take
//   hold of bare painting. A data failure, a legacy-export fallback, a wrong place or a wrong scale STOPS the run before the profiler starts. Nothing is repeated.
//   THE PROFILE: ONE continuous CDP CPU profile (Profiler.start ... Profiler.stop) covering IDLE_MS of nothing touched, then PAN_MS of one real drag
//   (the audit's slow ellipse, ~60 moves a second). The phase boundaries are node-side wall-clock instants, recorded.
//   AFTER: the raw profile, the evidence, and the attribution (top 10 by function and by file, per phase) are written to the output folder.
//
// It writes ONLY to its output folder. It reads prod with GETs and an ordinary page load. It never writes to the repo, so the script commit stays the
// one that was reviewed; it checks that HEAD is that commit and the tree is clean before it does anything.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROD, WORLD_PATH, PINNED_PLAYWRIGHT, VIEWPORT, CPU_THROTTLE, IDLE_MS, PAN_MS, BASELINE_SCALE, MAP_WAIT_MS, SETTLE_CAP_MS, RSS_LIMIT_MIB, WALL_BOUND_S, TOTAL_BOUND_S, TIMEOUT_S, KILL_GRACE_S, NEAR_CENTRE_M,
  pinProblems, clearOfCrossings, minutesToNearestBoundary, nearCentre, centredWithin, sameScale, dragMoved, rssMiB, attribute, phaseWindows,
} from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..", "..", "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name, dflt = null) => { const i = process.argv.indexOf(name); return i < 0 ? dflt : process.argv[i + 1] ?? dflt; };
const has = (name) => process.argv.includes(name);
const PLACE = { id: "the-town/the-town-centre", query: "town centre" };
const git = (...a) => execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

// ── preflight: no browser, so --check can say whether the run would be allowed ─────────────────────────────────────────────────────────────────────
function preflight() {
  const problems = [];
  const head = (() => { try { return git("rev-parse", "HEAD"); } catch { return null; } })();
  const porcelain = (() => { try { return git("status", "--porcelain"); } catch { return "unreadable"; } })();
  problems.push(...pinProblems({ go: arg("--go"), head, porcelain }));
  const require = createRequire(join(REPO, "package.json"));
  let pwVersion = null, executable = null, pw = null;
  try {
    pw = require("playwright");
    pwVersion = JSON.parse(readFileSync(join(dirname(require.resolve("playwright/package.json")), "package.json"), "utf8")).version;
    executable = pw.chromium.executablePath();
  } catch (e) { problems.push(`Playwright could not be loaded: ${String(e?.message ?? e).split("\n")[0]}`); }
  if (pwVersion !== PINNED_PLAYWRIGHT) problems.push(`Playwright is ${pwVersion}, not the pinned ${PINNED_PLAYWRIGHT}`);
  if (executable && !existsSync(executable)) problems.push(`the pinned Chromium is not installed at ${executable} (this script installs nothing)`);
  const now = Date.now();
  if (!clearOfCrossings(now)) problems.push(`the clock is not clear: the ${TOTAL_BOUND_S}-s bounded run would lie within 20 minutes of a 00/06/12/18 Z crossing or settlement (${Math.round(minutesToNearestBoundary(now))} min to the nearest now)`);
  return { problems, head, pw, pwVersion, executable, now };
}

// ── the browser tree's memory, summed from /proc (a watchdog, because no OS scope is available to the seat) ───────────────────────────────────────
function treeRss(rootPid) {
  const ppid = new Map();
  for (const d of readdirSync("/proc")) {
    if (!/^\d+$/.test(d)) continue;
    try { const s = readFileSync(`/proc/${d}/stat`, "utf8"); ppid.set(Number(d), Number(s.slice(s.lastIndexOf(")") + 2).split(" ")[1])); } catch { /* gone */ }
  }
  const members = new Set([rootPid]);
  for (let grew = true; grew;) { grew = false; for (const [p, pp] of ppid) if (members.has(pp) && !members.has(p)) { members.add(p); grew = true; } }
  let mib = 0;
  for (const p of members) { try { mib += rssMiB(readFileSync(`/proc/${p}/status`, "utf8")); } catch { /* gone */ } }
  return { mib, pids: [...members] };
}

async function fetchJson(url) {
  try { const r = await fetch(url, { headers: { "cache-control": "no-cache" } }); return r.ok ? await r.json() : null; } catch { return null; }
}
/** the served frame and data identity, read outside the throttled page, by GETs only (the audit's readTown). */
async function readTown() {
  const build = await fetchJson(`${PROD}/build.json`);
  const state = await fetchJson(`${PROD}/api/world/state`);
  return {
    build, data_source: "/api/world/state", data_observed_at: new Date().toISOString(),
    data_as_of: state?.meta?.source === "settlement" ? state.meta.as_of : (state?.meta ?? null),
    marks: Array.isArray(state?.marks) ? state.marks.length : null,
    parcels: Array.isArray(state?.parcels) ? state.parcels.length : (state?.parcels ? Object.keys(state.parcels).length : null),
  };
}

// installed from the first byte of the page, passive only (the audit's own): long tasks, frames, visibility, the map-shown moment, camera writes
function pageInit() {
  const W = (globalThis.__wpa = { lt: [], frames: [], vis: [document.visibilityState], mapShownAt: null, writes: 0, track: false });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) W.lt.push([e.startTime, e.duration]); }).observe({ type: "longtask", buffered: true }); } catch {}
  document.addEventListener("visibilitychange", () => W.vis.push(document.visibilityState));
  let last = null;
  const tick = (t) => {
    W.frames.push(t);
    if (W.mapShownAt === null && document.visibilityState === "visible" && document.querySelector("svg#map-svg") && document.querySelector("#wv-overlay [data-id]")) W.mapShownAt = t;
    if (W.track) {
      const s = document.querySelector("svg#map-svg");
      const v = s ? s.getAttribute("viewBox") + "|" + s.style.transform : null;
      if (v !== last) {
        W.writes++; last = v;
        const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(s?.style.transform ?? "");
        if (m) { const [x, y] = [Number(m[1]), Number(m[2])]; W.tx = [Math.min(W.tx?.[0] ?? x, x), Math.max(W.tx?.[1] ?? x, x)]; W.ty = [Math.min(W.ty?.[0] ?? y, y), Math.max(W.ty?.[1] ?? y, y)]; }
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
const nowMs = (page) => page.evaluate(() => performance.now());
const camera = (page) => page.evaluate(() => {
  const svg = document.querySelector("svg#map-svg"); if (!svg) return null;
  const [x, y, w, h] = svg.getAttribute("viewBox").split(/\s+/).map(Number); const r = svg.getBoundingClientRect();
  return { x, y, w, h, cssW: r.width, cssH: r.height, left: r.left, top: r.top, scale: r.width / w };
});
const placeRect = (page, id) => page.evaluate((id) => {
  const els = [...document.querySelectorAll(`[data-id="${CSS.escape(id)}"]`)].filter((e) => /^(polygon|circle)$/i.test(e.tagName));
  const el = els.find((e) => /polygon/i.test(e.tagName)) ?? els[0];
  const r = el?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
}, id);
const paneRect = (page) => page.evaluate(() => { const r = document.querySelector("svg#map-svg").getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
const pill = (page) => page.evaluate(() => document.querySelector(".wv-spectator-coordinate")?.textContent?.trim() ?? "");
/** the nearest point to the middle of the map where a pointer meets bare painting, away from the page's own panels, cards, links and buttons (the audit's). */
const bareGrab = (page) => page.evaluate(() => {
  const svg = document.querySelector("svg#map-svg"); if (!svg) return null;
  const r = svg.getBoundingClientRect(), cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const mm = document.querySelector(".wv-minimap");
  const uiSel = "a, button, input, textarea, .wv-card, .wv-homecol, .wv-tour, .wv-search-results, .wv-mapctl-tools, [role=dialog]";
  const inUi = (e) => { for (let n = e; n && n !== mm; n = n.parentElement) if (n.matches(uiSel)) return true; return false; };
  for (const [mx, my, offMarks] of [[140, 100, true], [140, 100, false], [60, 40, false]]) {
    const pts = [];
    for (let x = r.x + mx; x <= r.x + r.width - mx; x += 24) for (let y = r.y + my; y <= r.y + r.height - my; y += 24) pts.push([x, y]);
    pts.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
    for (const [x, y] of pts) {
      const e = document.elementFromPoint(x, y);
      if (e && mm?.contains(e) && !inUi(e) && !(offMarks && e.closest("[data-id]"))) return { x, y, under: e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + ((e.getAttribute("class") || "").trim() ? "." + e.getAttribute("class").trim().split(/\s+/)[0] : "") };
    }
  }
  return null;
});
/** wait until no long task has ended in the last `ms`, for at most `cap`; returns whether the page did rest (recorded, never assumed). */
async function settle(page, ms, cap = SETTLE_CAP_MS) {
  const end = Date.now() + cap;
  while (Date.now() < end) {
    const since = await page.evaluate("(() => { const W = globalThis.__wpa; let e = 0; for (const [s, d] of W.lt) e = Math.max(e, s + d); return performance.now() - e; })()");
    if (since >= ms) return true;
    await sleep(250);
  }
  return false;
}

class Stop extends Error { constructor(msg) { super(msg); this.stop = true; } }

async function run(pre) {
  const OUT = arg("--out", `/var/tmp/wld227-capture-${new Date(pre.now).toISOString().replace(/[:.]/g, "-")}`);
  mkdirSync(OUT, { recursive: true });
  const evidence = {
    kind: "wld-227-attribution-capture", schema: 1, started_at: new Date(pre.now).toISOString(), valid: false, stopped: null, notes: [],
    script: { commit: pre.head, path: "tools/perf/wld227-oneoff/capture.mjs" },
    env: { origin: PROD, world_path: WORLD_PATH, cpu_throttle: CPU_THROTTLE, viewport: VIEWPORT, signed_in: false, idle_ms: IDLE_MS, pan_ms: PAN_MS, baseline_scale: BASELINE_SCALE,
      playwright: pre.pwVersion, playwright_pinned: PINNED_PLAYWRIGHT, node: process.version, rss_limit_mib: RSS_LIMIT_MIB, wall_bound_s: WALL_BOUND_S, timeout_s: TIMEOUT_S, kill_grace_s: KILL_GRACE_S, total_bound_s: TOTAL_BOUND_S, memory_scope: "systemd-run --user --scope MemoryMax=2G MemorySwapMax=0 (applied by the caller)", out: OUT },
    instrumentation: {
      page_observers: ["PerformanceObserver longtask", "requestAnimationFrame frame/camera tracker (tracking switched on at the drag)"],
      harness_script_name: "wld227-harness.js", cpu_sampler: { interval_us: 1000, over: "the whole window, idle and pan, under the 4x throttle" },
      caveat: "instrumentation and the sampler were present: timings in this run are not the unprofiled audit p95, and are not comparable to it",
    },
    phases: {}, marks: {}, requests: [], rss: { peak_mib: 0, samples: 0 },
  };
  const save = () => writeFileSync(join(OUT, "capture.json"), JSON.stringify(evidence, null, 1) + "\n");
  let browser = null, killedBy = null;
  const killTree = (why) => {
    killedBy ??= why;
    try { const { pids } = treeRss(browser.process().pid); for (const p of pids) { try { process.kill(p, "SIGKILL"); } catch {} } } catch {}
  };
  const wall = setTimeout(() => { killTree("wall"); }, WALL_BOUND_S * 1000);
  let dog = null;
  try {
    evidence.town_before = await readTown();
    browser = await pre.pw.chromium.launch({ headless: true, args: ["--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows"] });
    evidence.env.chromium = browser.version();
    const rootPid = browser.process().pid;
    dog = setInterval(() => {
      const { mib } = treeRss(rootPid);
      evidence.rss.samples++; evidence.rss.peak_mib = Math.max(evidence.rss.peak_mib, Math.round(mib));
      if (mib > RSS_LIMIT_MIB) killTree("rss");
    }, 1000);

    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    await ctx.addInitScript({ content: `(${pageInit.toString()})();\n//# sourceURL=wld227-harness.js` });
    const page = await ctx.newPage();
    await page.goto(`${PROD}/build.json`);                       // same-site first, so the throttle is on the process the World page then runs in
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });
    await cdp.send("Network.enable");
    const reqs = new Map();
    cdp.on("Network.requestWillBeSent", (e) => { if (!reqs.has(e.requestId)) reqs.set(e.requestId, { url: e.request.url, type: e.type }); });
    cdp.on("Network.responseReceived", (e) => { const r = reqs.get(e.requestId); if (r) { r.status = e.response.status; r.type = e.type; } });
    cdp.on("Network.loadingFailed", (e) => { const r = reqs.get(e.requestId); if (r && !e.canceled) r.failed = e.errorText; });

    // ── PREPARATION (outside the profile) ─────────────────────────────────────────────────────────────────────────────────────────────────
    await page.goto(`${PROD}${WORLD_PATH}`, { waitUntil: "load" });
    evidence.visibility = await page.evaluate(() => document.visibilityState);
    let mapAt = null;
    for (const w0 = Date.now(); mapAt === null && Date.now() - w0 < MAP_WAIT_MS;) { mapAt = await page.evaluate("globalThis.__wpa.mapShownAt"); if (mapAt === null) await sleep(250); }
    if (mapAt === null) throw new Stop(`svg#map-svg with drawn marks did not appear within ${MAP_WAIT_MS / 1000} s`);
    evidence.phases.map_shown_ms = mapAt;
    // what the page read: the API snapshot, or a legacy export, or a failure. A fallback or a failed own request is a stop, not a reason to repeat.
    const own = (r) => r.type === "Document" || /\/(WORLD\/(world-state|skeleton)\.json|world-engine\/.*\.mjs|_astro\/.*\.js)(\?|$)/.test(r.url);
    const seen = [...reqs.values()];
    evidence.requests = seen.filter((r) => /\/api\/|\/WORLD\/|build\.json|\/world-engine\//.test(r.url)).map((r) => ({ path: (() => { try { return new URL(r.url).pathname; } catch { return r.url; } })(), type: r.type, status: r.status ?? null, failed: r.failed ?? null }));
    evidence.legacy_export_requested = seen.some((r) => /\/WORLD\/world-state\.json(\?|$)/.test(r.url));
    evidence.api_state_requested = seen.some((r) => /\/api\/world\/state(\?|$)/.test(r.url));
    const badOwn = seen.filter((r) => own(r) && (r.failed || r.status >= 400));
    if (badOwn.length) throw new Stop(`a request for the page's own document, data or code failed: ${badOwn.slice(0, 3).map((r) => `${r.failed ?? r.status} ${r.url}`).join(", ")}`);
    if (evidence.legacy_export_requested) throw new Stop("the page fell back to the legacy /WORLD/world-state.json export, not /api/world/state");
    // the tour holds the roll-in; a returning visitor skips it
    const tour = await page.locator(".wv-tour:not([hidden])").count();
    if (tour) {
      await page.click(".wv-tour-skip", { timeout: 30000 });
      await page.waitForSelector(".wv-tour:not([hidden])", { state: "detached", timeout: 15000 }).catch(() => { throw new Stop("the tour did not close after skip"); });
    }
    await page.mouse.move(4, 4);
    evidence.phases.settled_after_skip = await settle(page, 1500);
    // the audit's camera scale, wheeled to over bare painting (a picked place opens a column over the map, and a wheel there scrolls the column)
    let grab = await bareGrab(page);
    if (!grab) throw new Stop("no bare map point to wheel over");
    await page.mouse.move(grab.x, grab.y);
    let cam = await camera(page);
    evidence.camera_open = cam;
    let notches = 0;
    for (; notches < 14 && !sameScale(cam.scale, BASELINE_SCALE); notches++) { await page.mouse.wheel(0, cam.scale < BASELINE_SCALE ? -300 : 300); await sleep(1500); cam = await camera(page); }
    evidence.wheel_notches = notches;
    if (!sameScale(cam.scale, BASELINE_SCALE)) throw new Stop(`the camera could not be brought to the audit's scale ${BASELINE_SCALE} (it is ${cam.scale})`);
    await page.mouse.move(4, 4);
    await page.fill(".wv-search-input", PLACE.query);
    await page.waitForSelector(`.wv-search-hit[data-hit="${PLACE.id}"]`, { timeout: 15000 });
    await page.click(`.wv-search-hit[data-hit="${PLACE.id}"]`, { timeout: 90000 });
    await sleep(1500);
    cam = await camera(page);
    evidence.camera_at_place = cam;
    if (!sameScale(cam.scale, BASELINE_SCALE)) throw new Stop(`the search changed the camera scale to ${cam.scale}`);
    evidence.phases.settled_after_pick = await settle(page, 1500);
    const rect = await placeRect(page, PLACE.id), pane = await paneRect(page);
    evidence.place = { id: PLACE.id, pill: await pill(page), rect, pane };
    const near = nearCentre(evidence.place.pill, { centred: centredWithin(rect, pane) });
    evidence.place.near_centre = near;       // the pill's metres gate; `shape_centred` (the polygon under the middle of the map) is evidence only
    if (!near.ok) throw new Stop(`not genuinely at the Town Centre: the page's own pill "${evidence.place.pill}" is ${near.metres ?? "unparsed"} m from it (the bound is ${NEAR_CENTRE_M} m)`);
    grab = await bareGrab(page);
    if (!grab) throw new Stop("no bare map point to take hold of");
    evidence.grab = { x: Math.round(grab.x), y: Math.round(grab.y), under: grab.under };
    await page.mouse.move(grab.x, grab.y);                      // the hand is on bare painting, not pressed: the idle window is the page untouched
    await sleep(500);
    evidence.phases.settled_before_profile = await settle(page, 1500);
    evidence.camera_before = await camera(page);
    evidence.drawn_marks = await page.evaluate(() => new Set([...document.querySelectorAll("#wv-overlay [data-id]")].map((e) => e.getAttribute("data-id"))).size);
    save();

    // ── THE PROFILE: ONE continuous CPU profile over IDLE_MS untouched, then PAN_MS of one real drag ─────────────────────────────────────────
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
    const marks = {};
    const at = (k) => { marks[k] = { wall: Date.now() / 1000 }; };
    at("start_sent");
    await cdp.send("Profiler.start");
    at("start_ack");
    await sleep(IDLE_MS);                                          // nothing touched
    at("idle_end");
    await page.evaluate(() => { const W = globalThis.__wpa; W.track = true; W.writes = 0; W.tx = null; W.ty = null; });
    await page.mouse.down();
    at("pan_start");                                               // after the press returned; idle_end to here is in neither phase (transition_ms)
    const w0 = Date.now(); let moves = 0;
    while (Date.now() - w0 < PAN_MS) {
      const t = (Date.now() - w0) / 1000;
      await page.mouse.move(grab.x - 120 + 120 * Math.cos((2 * Math.PI * t) / 2.5), grab.y + 90 * Math.sin((2 * Math.PI * t) / 3.7));
      moves++; await sleep(16);
    }
    at("pan_end");                                                 // the drag's last move; the release and the stop call are outside the pan window
    await page.mouse.up();
    at("stop_sent");
    const { profile } = await cdp.send("Profiler.stop");
    at("stop_ack");
    // ── AFTER (outside the profile) ──────────────────────────────────────────────────────────────────────────────────────────────────────
    writeFileSync(join(OUT, "profile.cpuprofile"), JSON.stringify(profile));
    evidence.marks = marks;
    const R = await page.evaluate(() => { const W = globalThis.__wpa; return { writes: W.writes, tx: W.tx ?? null, ty: W.ty ?? null, vis: W.vis, lt: W.lt.length }; });
    await page.evaluate(() => { globalThis.__wpa.track = false; });
    evidence.camera_after = await camera(page);
    evidence.pill_after = await pill(page);
    const travel = R.tx && R.ty ? Math.hypot(R.tx[1] - R.tx[0], R.ty[1] - R.ty[0]) : 0;
    evidence.pan = { moves, camera_writes: R.writes, travel_px: Math.round(travel), moved_bare_painting: dragMoved({ writes: R.writes, travelPx: travel }), translate_x: R.tx, translate_y: R.ty };
    evidence.long_tasks_total = R.lt;
    evidence.visibility = R.vis.every((v) => v === "visible") ? "visible" : R.vis.join(",");
    evidence.town_after = await readTown();
    const before = evidence.town_before?.build, after = evidence.town_after?.build;
    evidence.frame_unchanged = !!before && !!after && ["code_sha", "world_sha"].every((k) => before[k] === after[k]);
    const reasons = [];
    if (!evidence.pan.moved_bare_painting) reasons.push(`the drag did not move the camera (${R.writes} writes, ${Math.round(travel)} px)`);
    if (evidence.visibility !== "visible") reasons.push(`tab was ${evidence.visibility}`);
    if (!evidence.frame_unchanged) reasons.push("the served code/World frame changed during the run");
    const win = phaseWindows({ profile, marks });
    evidence.profile_clock = { basis: win.basis, start_call_ms: win.start_call_ms, stop_call_ms: win.stop_call_ms, edge_uncertainty_ms: win.edge_uncertainty_ms, profile_ms: win.profile_ms, wall_bounds_ms: win.wall_bounds_ms, length_within_bounds: win.length_within_bounds, transition_ms: win.transition_ms };
    evidence.notes.push(`every phase edge carries ±${win.edge_uncertainty_ms} ms (half the Profiler.start round trip); idle_end to the press returning (transition) is ${win.transition_ms} ms and is in neither phase`);
    if (!win.length_within_bounds) evidence.notes.push(`the profile's length (${win.profile_ms} ms) lies outside the wall bounds the start/stop round trips allow (${win.wall_bounds_ms.join(" to ")} ms): the phase edges cannot be trusted`);
    const attributed = Object.fromEntries(["idle", "pan", "all"].map((k) => [k, attribute(profile, win[k])]));
    writeFileSync(join(OUT, "attribution.json"), JSON.stringify({ definition: attributed.all.definition, caveat: evidence.instrumentation.caveat, harness_note: "frames from this run's own init script (wld227-harness.js) and Playwright's evaluation scripts are the 'harness' bucket, never ranked with the town's code", phases: attributed, windows_us: win }, null, 1) + "\n");
    evidence.valid = reasons.length === 0;
    evidence.invalid = reasons;
    evidence.top10 = { idle: attributed.idle.top_functions.slice(0, 10), pan: attributed.pan.top_functions.slice(0, 10) };
    await ctx.close();
  } catch (e) {
    evidence.stopped = killedBy ? `${killedBy === "rss" ? `memory bound ${RSS_LIMIT_MIB} MiB exceeded` : `wall bound ${WALL_BOUND_S} s exceeded`} (browser killed)` : String(e?.message ?? e).split("\n").slice(0, 4).join(" | ").slice(0, 500);
    evidence.stop_kind = killedBy ?? (e?.stop ? "stop" : "error");
  } finally {
    clearTimeout(wall); if (dog) clearInterval(dog);
    try { await browser?.close(); } catch {}
    evidence.finished_at = new Date().toISOString();
    save();
  }
  console.log(JSON.stringify({ out: OUT, valid: evidence.valid, stopped: evidence.stopped, invalid: evidence.invalid ?? null, rss_peak_mib: evidence.rss.peak_mib, top10_pan: evidence.top10?.pan?.slice(0, 3) ?? null }));
  return evidence.valid ? 0 : (evidence.stop_kind === "rss" ? 3 : evidence.stop_kind === "wall" ? 4 : 2);
}

const pre = preflight();
if (has("--check")) {
  console.log(JSON.stringify({ ok: pre.problems.length === 0, problems: pre.problems, head: pre.head, playwright: pre.pwVersion, chromium_executable: pre.executable ? existsSync(pre.executable) : null, minutes_to_nearest_boundary: Math.round(minutesToNearestBoundary(pre.now)) }, null, 1));
  process.exit(pre.problems.length ? 2 : 0);
}
if (pre.problems.length) { console.error(`REFUSED — the run did not start:\n  ${pre.problems.join("\n  ")}`); process.exit(2); }
process.exit(await run(pre));
