// lib.mjs — the pure half of WLD-227's one-off attribution capture. No browser, no network, no file writes: everything here is a
// function of its arguments, and tools/perf/wld227-oneoff/lib.test.mjs exercises it offline.
//
// This is a TASK ARTIFACT, not a feature: one bounded information run (Wright, 2026-11-21 02:17Z: "a CPU profile over the idle window
// plus one pan, attributed by function and file, top 10. No optimisation, no second benchmark"). It is never imported by the page, a
// test suite or a schedule, and nothing here is meant to be kept once the numbers are read.

// ── the run's fixed shape (the WLD-222 audit's own, World #420 pin 9e7f0964: tools/perf/world-page-audit.mjs, PERF/world-page.jsonl row 1) ──
export const PROD = "https://postmark.town";
export const WORLD_PATH = "/world/";
export const PINNED_PLAYWRIGHT = "1.62.0";
export const VIEWPORT = { width: 1366, height: 768 };
export const CPU_THROTTLE = 4;
export const IDLE_MS = 10000;
export const PAN_MS = 10000;
/** The camera scale (CSS px per viewBox unit) every place was panned at in the audit's row 1: samples[0].scale_ref, the same in all three. */
export const BASELINE_SCALE = 0.65428831315286;
export const SCALE_TOLERANCE = 0.06;
export const MAP_WAIT_MS = 120000;     // the map may take this long to show; past it the run STOPS (it is not retried)
export const SETTLE_CAP_MS = 20000;    // every "let the page rest" wait is capped; whether it rested is recorded, never assumed
export const MIN_CAMERA_WRITES = 5;    // a drag that moved the camera fewer times than this was inert
export const MIN_TRAVEL_PX = 60;       // …or less far than this (CSS px)
/** How near the origin the camera must be for "at the Town Centre": the page's own coordinate pill reads metres from TC. */
export const NEAR_CENTRE_M = 250;
export const RSS_LIMIT_MIB = 2048;     // the finite memory bound the brief names (2 GiB), enforced by the script's own watchdog (no OS scope is available to the seat)
export const WALL_BOUND_S = 600;       // the whole run, preparation and teardown included (the brief's ten minutes)
export const CLEAR_MIN = 20;           // minutes clear of the 00/06/12/18 Z crossings and settlements

// ── the commit pin: the run must be the reviewed script at the reviewed commit, on a clean tree ──────────────────────────────────────────────
/** Is this the commit the go named? `head` and `go` are full 40-hex shas; anything shorter or different is a refusal, never a prefix match. */
export const isFullSha = (s) => typeof s === "string" && /^[0-9a-f]{40}$/.test(s);
export function pinProblems({ go, head, porcelain }) {
  const bad = [];
  if (!isFullSha(go)) bad.push("--go must be the full 40-hex sha of the reviewed script commit");
  if (!isFullSha(head)) bad.push("the tree's HEAD could not be read");
  if (isFullSha(go) && isFullSha(head) && go !== head) bad.push(`HEAD ${head} is not the reviewed commit ${go}`);
  if (String(porcelain ?? "x").trim() !== "") bad.push("the working tree is not clean, so the running script is not the committed one");
  return bad;
}

// ── the clock: twenty minutes clear of every crossing and settlement, for the whole bounded run ─────────────────────────────────────────────────
/** Minutes from `t` (ms) to the nearest 00/06/12/18 Z boundary, before or after. */
export function minutesToNearestBoundary(t) {
  const d = new Date(t);
  const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  let best = Infinity;
  for (let k = -1; k <= 5; k++) { const b = dayStart + k * 6 * 3600e3; best = Math.min(best, Math.abs(t - b) / 60e3); }
  return best;
}
/** No boundary within CLEAR_MIN of any moment of [start, start + wallS]: the run, with its bound, lies wholly in the clear. */
export function clearOfCrossings(startMs, wallS = WALL_BOUND_S, clearMin = CLEAR_MIN) {
  for (let t = startMs; t <= startMs + wallS * 1000; t += 60e3) if (minutesToNearestBoundary(t) < clearMin) return false;
  return minutesToNearestBoundary(startMs + wallS * 1000) >= clearMin;
}

// ── the place: "of TC" is on EVERY pill, so the pill is parsed, never matched ────────────────────────────────────────────────────────────────────
/** The page's coordinate pill ("79 m N · 54 m W of TC · elevation +5 m", or "at TC") as metres east and south of the Town Centre; null if it is not that shape. */
export function parsePill(text) {
  const t = String(text ?? "");
  if (/^\s*at TC\b/.test(t)) return { x: 0, y: 0 };
  const m = /^\s*(?:([\d,]+)\s*m\s*([NS]))?\s*(?:·\s*)?(?:([\d,]+)\s*m\s*([EW]))?\s*of TC\b/.exec(t);
  if (!m || (!m[1] && !m[3])) return null;
  const n = (s) => Number(String(s).replace(/,/g, ""));
  const y = m[1] ? (m[2] === "N" ? -1 : 1) * n(m[1]) : 0;       // the page's y grows southward: "N" is negative (formatCardinalPosition)
  const x = m[3] ? (m[4] === "W" ? -1 : 1) * n(m[3]) : 0;
  return { x, y };
}
/** The camera is at the Town Centre only if the pill's own metres are near the origin AND the place's shape is under the middle of the map: the words "of TC" alone prove nothing. */
export function nearCentre(pillText, { centred }) {
  const p = parsePill(pillText);
  return { ok: !!p && Math.hypot(p.x, p.y) <= NEAR_CENTRE_M && !!centred, metres: p ? Math.round(Math.hypot(p.x, p.y)) : null, parsed: p };
}
export function centredWithin(rect, pane, frac = 0.12) {
  if (!rect || !pane) return false;
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  return Math.abs(cx - (pane.x + pane.width / 2)) <= pane.width * frac && Math.abs(cy - (pane.y + pane.height / 2)) <= pane.height * frac;
}
export const sameScale = (a, b, tol = SCALE_TOLERANCE) => Number.isFinite(a) && Number.isFinite(b) && b > 0 && Math.abs(a / b - 1) <= tol;
export const dragMoved = ({ writes, travelPx }) => writes >= MIN_CAMERA_WRITES && travelPx >= MIN_TRAVEL_PX;

// ── memory: the watchdog's arithmetic ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** VmRSS in MiB from a /proc/<pid>/status text, or 0. */
export function rssMiB(statusText) {
  const m = /^VmRSS:\s+(\d+)\s*kB/m.exec(String(statusText ?? ""));
  return m ? Number(m[1]) / 1024 : 0;
}

// ── the profile: self time by function, file and line, and the idle/GC/native/unattributed buckets, over a window ────────────────────────────
// A V8 CPU profile (CDP Profiler.stop): `nodes` (id, callFrame{functionName,url,lineNumber,columnNumber}, children), `samples` (a node id per
// sample), `timeDeltas` (µs since the previous sample; the first is since startTime), `startTime`, `endTime` (µs). Sample i stood on its node
// from its own time to the next sample's (the last until endTime): that interval is its SELF time.
const SPECIAL = { "(idle)": "idle", "(program)": "program", "(garbage collector)": "gc", "(root)": "root" };
/** What a frame is: a named bucket, native (a name, no file: a V8 builtin or a browser native), unattributed (no name, no file), or js (has a file). */
export function frameKind(cf) {
  const name = cf?.functionName ?? "", url = cf?.url ?? "";
  if (SPECIAL[name]) return SPECIAL[name];
  if (!url) return name ? "native" : "unattributed";
  return "js";
}
/** The key a frame is counted under: function, file, 1-based line, column (a minified file's names are what the file says; none is invented). */
export const frameKey = (cf) => `${cf.functionName || "(anonymous)"} @ ${cf.url || "(no file)"}:${(cf.lineNumber ?? -1) + 1}:${(cf.columnNumber ?? -1) + 1}`;

/** Every sample's [t0, t1) in µs on the profile's own clock, with its node id. */
export function sampleSpans(profile) {
  const { samples = [], timeDeltas = [], startTime = 0, endTime = null } = profile ?? {};
  const spans = []; let t = startTime;
  const starts = samples.map((_, i) => (t += timeDeltas[i] ?? 0));
  for (let i = 0; i < samples.length; i++) spans.push({ id: samples[i], t0: starts[i], t1: i + 1 < samples.length ? starts[i + 1] : (endTime ?? starts[i]) });
  return spans;
}
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Attribute the window [fromUs, toUs) of a profile. `self` time of each sample is clipped to the window. Fractions are of the window's total
 * sampled time (idle included) and of its busy time (idle excluded); both definitions are returned with the numbers.
 */
export function attribute(profile, { fromUs = -Infinity, toUs = Infinity, top = 10 } = {}) {
  const nodes = new Map((profile?.nodes ?? []).map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of nodes.values()) for (const c of n.children ?? []) parent.set(c, n.id);
  const byKey = new Map(), byFile = new Map(), buckets = { idle: 0, program: 0, gc: 0, native: 0, unattributed: 0, js: 0, root: 0 };
  const inclusive = new Map();
  let total = 0;
  for (const s of sampleSpans(profile)) {
    const node = nodes.get(s.id); if (!node) continue;
    const dur = Math.min(s.t1, toUs) - Math.max(s.t0, fromUs);
    if (!(dur > 0)) continue;
    total += dur;
    const kind = frameKind(node.callFrame);
    buckets[kind] += dur;
    if (kind === "js") {
      const k = frameKey(node.callFrame), f = node.callFrame.url;
      byKey.set(k, (byKey.get(k) ?? 0) + dur);
      byFile.set(f, (byFile.get(f) ?? 0) + dur);
    }
    // inclusive: every distinct JS frame on this sample's stack, once each (a recursive function is counted once per sample)
    const seen = new Set();
    for (let id = s.id; id != null; id = parent.get(id)) {
      const n = nodes.get(id); if (!n || frameKind(n.callFrame) !== "js") continue;
      const k = frameKey(n.callFrame); if (seen.has(k)) continue; seen.add(k);
      inclusive.set(k, (inclusive.get(k) ?? 0) + dur);
    }
  }
  const busy = total - buckets.idle;
  const row = (key, us) => ({ key, self_ms: round1(us / 1000), pct_of_window: total ? round1((us / total) * 100) : null, pct_of_busy: busy > 0 ? round1((us / busy) * 100) : null });
  const rank = (m) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, top);
  return {
    window_ms: round1(total / 1000), busy_ms: round1(busy / 1000),
    definition: "self time: each profile sample counts for the µs until the next sample, clipped to the window; pct_of_window is of all sampled time including (idle); pct_of_busy excludes (idle)",
    buckets_ms: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, round1(v / 1000)])),
    buckets_pct_of_window: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, total ? round1((v / total) * 100) : null])),
    top_functions: rank(byKey).map(([k, us]) => ({ ...row(k, us), inclusive_ms: round1((inclusive.get(k) ?? 0) / 1000) })),
    top_files: rank(byFile).map(([k, us]) => row(k, us)),
  };
}

// ── mapping the run's phase boundaries onto the profile's clock ──────────────────────────────────────────────────────────────────────────────────
/**
 * The boundaries are taken on the NODE side, by the wall clock, at the moment the script acts (the page's main thread is ~99 % busy under the
 * slowed CPU, so asking the page for the time at a boundary could itself stall and move it). `marks` carries { profile_start, idle_end, pan_start,
 * pan_end, profile_stop }, each { wall } in seconds. The window of each phase on the profile's clock (µs) is its wall offset from the profiler start
 * added to the profile's startTime. The check that the two clocks agree is the profile's own length against the wall time between start and stop:
 * the difference is returned, and a difference over `tolMs` is named so the reader knows the offsets are only that good.
 */
export function phaseWindows({ profile, marks, tolMs = 250 }) {
  const at = (k) => Math.round((marks[k].wall - marks.profile_start.wall) * 1e6 + profile.startTime);
  const profileMs = (profile.endTime - profile.startTime) / 1000;
  const wallMs = (marks.profile_stop.wall - marks.profile_start.wall) * 1000;
  const skew = round1(Math.abs(profileMs - wallMs));
  return {
    basis: "node-side wall-clock offsets from the profiler start, added to the profile's startTime",
    profile_ms: round1(profileMs), wall_ms: round1(wallMs), skew_ms: skew, within_tolerance: skew <= tolMs,
    idle: { fromUs: at("profile_start"), toUs: at("idle_end") },
    pan: { fromUs: at("pan_start"), toUs: at("pan_end") },
    all: { fromUs: profile.startTime, toUs: profile.endTime },
  };
}
