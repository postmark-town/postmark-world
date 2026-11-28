#!/usr/bin/env node
// world-page-audit.mjs — the World page's standing performance audit (WLD-222; ported from the WLD-43 harness).
//
// MANUAL ONLY. It is not a test, not a CI step and not a scheduled job: nothing imports it but its own focused
// offline check (tools/world-page-audit.test.mjs, pure functions only — it never opens a browser or the network).
//
//   node tools/perf/world-page-audit.mjs                        one audit of real, signed-out prod: ONE JSON line on stdout
//   node tools/perf/world-page-audit.mjs --backfill-bytes       the repo-served bytes at each settlement tag, from git only
//   options: --origin URL (default https://postmark.town; any other origin is an UNOFFICIAL run, never a baseline row)
//            --samples N (default 3; the audit's median is over these)   --cpu N (default 4: CPU slowed 4x)
//            --world-path P (default /world/; the offline check against the repo's own spectator server uses /)
//            --interactive-bound-s N (default 180; any other value is an UNOFFICIAL run)
//
// What it does, per sample (a FRESH, signed-out browser context each time; unmodified prod; no resident act, no
// cookie or session set up, no response rewriting, no wrapped page functions, no clock shift — passive observers
// and CDP reads only; a "skip" click on the tour card and the page's own search box and wheel/drag are the only inputs):
//   1. loads <origin>/world/ with the CPU slowed, and measures the COLD LOAD (bytes) and the two load times;
//   2. holds still 10 s for idle CPU, then reads heap after a forced GC;
//   3. at EACH of two named places — the Town Centre and the Starforge Spire — picks the place from the page's search
//      box, checks the place really is under the middle of the map, brings the camera to the same scale, and drags the
//      map for 10 s the way a hand would, then reads the pan frames and the longest task.
//
// Definitions (units are in every key's name; every time is ms since the page's navigation began, performance.now()):
//   bytes_cold_load_encoded   bytes on the wire (CDP encodedDataLength: headers + compressed body) of every request that
//                             FINISHED by the CUTOFF, all origins; a fresh context, so an empty cache. The cutoff is interactive_ms when
//                             it was reached (bytes_basis "interactive"), and the END OF THE OBSERVATION WINDOW when it was not
//                             (bytes_basis "observation_end"): the row names the basis per sample and says "mixed" when they differ.
//   map_shown_ms              the first moment svg#map-svg exists AND at least one drawn mark (#wv-overlay [data-id]) is in
//                             it, in a visible tab — the map is on screen with its marks, not merely attached.
//   interactive_ms            C. The earliest moment at or after map_shown_ms from which NO long task (>= 50 ms, the Long Tasks
//                             API) starts for the next 2000 ms. "Answers without stutter." The page may be watched for up to a BUDGET of
//                             INTERACTIVE_BOUND_MS (180 s) of its clock after the map is shown, and a quiet window must END inside that
//                             budget, so the 2 s lookahead is inside it: the latest start tried is budget - 2 s. If no such window exists
//                             the sample is CENSORED, not failed: interactive_ms is null and interactive_censored carries gt_ms (C is more
//                             than this), the reason, and the counts, rendered as `>N s (never quiet: K long tasks, L ms total in the window)`.
//                             interactive_observation separates the BUDGET (budget_ms, budget_until_ms) from the window ACTUALLY OBSERVED
//                             (observed_to_ms, observed_ms): an exact C stops the watching at the end of its own 2 s window (C + 2 s), a
//                             censored one has used the whole budget; the long-task count/total/max/five longest are those of the window
//                             actually observed. A censored sample is a sample: bytes, both pans, idle and heap still run.
//                             ACROSS SAMPLES, C is not a rank of numbers but of INTERVALS: each censoring bound is relative to its own sample's
//                             map-shown time while C is navigation-relative, so a censored `>182 s` is not known to exceed an exact 184 s.
//                             Exact: [ms, ms]; censored: (gt, unbounded). The min, median and max each lie between the k-th smallest lower bound
//                             and the k-th smallest upper bound; the value is exact only when those meet, and otherwise the row keeps the interval
//                             (X_lower_ms, X_lower_strict, X_upper_ms with null = unbounded) and invents no number — never the median of the
//                             exact subset. [10 s, 184 s, >182 s] has a median in (182 s, 184 s].
//   COMPARABILITY             rows compare on the rendered FRAME: the Site release's code_sha and the World snapshot (world_sha, world_settlement,
//                             world_digest). The release tags (code_ref, world_ref) are labels the Site stamps as `ref || null`: provenance only
//                             (row.tags), may be null or renamed, never required or compared. The town's freshness (town_sha, town_data_sha,
//                             crossing, town_index_as_of) moves without changing what is rendered, so it rides as per-sample provenance
//                             (version_before/after, freshness_moved) and never invalidates a sample. A frame change during or between samples does.
//   idle_busy_pct             10 s with nothing touched: renderer main-thread task time / wall time (CDP TaskDuration), %.
//   heap_after_gc_mib         JS heap in use after a forced garbage collection, at the end of the sample.
//   pan_frame_p95_ms          95th percentile of the gaps between animation frames over the 10 s drag, at a place.
//   pan_longest_task_ms       the longest long task that overlaps the drag; 0 means none reached 50 ms.
//   drawn_marks               distinct drawn marks (#wv-overlay [data-id]) at the start of the drag at that place.
// A sample is VALID only if every phase ran: no phase's selector missing, no failed request for the page's own
// document or data, the place under the middle of the map, the camera at the same scale at both places, the camera
// actually moved during the drag (>= MIN_CAMERA_WRITES writes, >= MIN_TRAVEL_PX of travel; or a SLOW PAN: >= MIN_TRAVEL_PX but fewer writes, with p95 >= PAN_P95_BAR_MS or longest task > PAN_TASK_BAR_MS, recorded in pan_stalled), the place still on screen after,
// and the served FRAME (build.json) the same before and after. (C censored is not a failure: see above.) Any invalid sample makes the row invalid
// (valid: false, with the reasons) and the exit code 2: an invalid row is never a baseline. A medians-of-zero cannot occur:
// a missing number is null and invalidates the row.
//
// Bytes per settlement from git (--backfill-bytes) are NOT a browser timing replay and NOT a cold load: they are the raw and
// gzip sizes of selected engine sources and retained WORLD exports at each settlement/S* tag, not the live /api/world/state
// payload. The basis says so on every line; files absent at a tag are listed, never zero-filled.

import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

export const PROD = "https://postmark.town";
export const PINNED_PLAYWRIGHT = "1.62.0";
export const VIEWPORT = { width: 1366, height: 768 };
export const IDLE_MS = 10000;
export const PAN_MS = 10000;
export const QUIET_MS = 2000;            // the stutter-free window that makes the page "interactive"
// THE OBSERVATION BOUND for interactive_ms (WLD-222 fit): the page is watched for this long AFTER the map is shown, by the page's own
// clock (not a count of polls). A quiet window must lie wholly inside it, so the 2 s lookahead is inside the bound: the latest start tried
// is bound - 2 s. No such window = a CENSORED observation (interactive_ms is "more than" that), which still counts as a sample.
export const INTERACTIVE_BOUND_MS = 180000;
export const MAP_WAIT_MS = 120000;       // how long the map may take to show before the phase has failed (a real failure, not a censoring)
export const NEAR_CENTRE_M = 500;        // the Town Centre's pill test: the camera within this many metres of TC (a stated radius; the region itself is ~2 km across)
export const SETTLE_CAP_MS = 20000;     // each "let the page rest" wait between inputs is capped; whether it rested is recorded, never assumed
export const MIN_CAMERA_WRITES = 5;      // a drag that moved the camera fewer times than this was inert (a slowed page may write it rarely, never not at all)
export const MIN_TRAVEL_PX = 60;         // …or moved it less far than this (CSS px of the map)
export const PAN_P95_BAR_MS = 100;       // the routine's bars: a pan whose frame p95 reaches this …
export const PAN_TASK_BAR_MS = 200;      // … or whose longest task is over this has crossed one
export const SCALE_TOLERANCE = 0.06;     // both places are panned within 6 % of the same map scale

/** the two named places: what the page's search box finds them by, and the record that says where each is. */
export const PLACES = {
  // `near`: the Town Centre is a region two kilometres across, drawn differently at each zoom, so the page's own coordinate pill is its evidence
  // as well as its shape. The pill reads "at TC" only at exactly (0, 0) and "<dy> m N|S · <dx> m E|W of TC" everywhere else, so it names a place ONLY through
  // the distances it prints: the camera is "at the Town Centre" when it is within `near.radius_m` of the centre, and nowhere else.
  town_centre: { id: "the-town/the-town-centre", query: "town centre", near: { radius_m: NEAR_CENTRE_M } },
  spire: { id: "wright/the-starforge-spire", query: "starforge spire", near: null },
};
/** the camera's offset from the Town Centre in metres {x: east+, y: south+}, read off the page's coordinate pill, or null if the text is not a position. */
export function pillOffsetM(text) {
  const s = String(text ?? "");
  if (/^at TC\b/.test(s)) return { x: 0, y: 0 };
  if (!/\bof TC\b/.test(s)) return null;
  let x = 0, y = 0, axes = 0;
  for (const m of s.matchAll(/([\d,]+(?:\.\d+)?)\s*m\s+([NSEW])\b/g)) {
    const d = Number(m[1].replace(/,/g, "")); if (!Number.isFinite(d)) return null;
    if (m[2] === "N") y -= d; else if (m[2] === "S") y += d; else if (m[2] === "W") x -= d; else x += d;
    axes++;
  }
  return axes ? { x, y } : null;
}
/** is the page's own pill, for this place, within the stated radius of its centre? Only places that declare `near` can be located this way. */
export function standingNear(place, text) {
  const o = place?.near ? pillOffsetM(text) : null;
  return !!o && Math.hypot(o.x, o.y) <= place.near.radius_m;
}

// ── pure helpers (the focused offline check exercises these) ────────────────────────────────────────────────
export const quantile = (xs, p) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
};
export const median = (xs) => quantile(xs, 0.5);
/** {median,min,max,samples} — or null when any sample is missing: a gap is never a zero or a shorter median. */
export const spread = (xs) => (xs.length && xs.every((x) => Number.isFinite(x)) ? { median: median(xs), min: Math.min(...xs), max: Math.max(...xs), samples: xs } : null);

/** the earliest t >= from with no long task starting in [t, t+windowMs), or null while that window is not yet over (`now`). */
export function quietFrom(longTasks, from, windowMs, now) {
  let t = from;
  for (const [start, dur] of [...longTasks].sort((a, b) => a[0] - b[0])) {
    if (start + dur <= t) continue;               // finished before t
    if (start >= t + windowMs) break;             // the window is clear of it
    t = Math.max(t, start + dur);                 // it overlaps or lands inside: the quiet starts after it
  }
  return now - t >= windowMs ? t : null;
}
/** frame gaps (ms) between consecutive animation frames inside [a,b]. */
export const frameGaps = (frames, a, b) => { const f = frames.filter((t) => t >= a && t <= b); return f.slice(1).map((t, i) => t - f[i]); };
/** the longest long task overlapping [a,b], as {ms, count}; ms 0 = none (the API reports tasks of 50 ms and over). */
export function longestTask(longTasks, a, b) {
  const lt = longTasks.filter(([s, d]) => s + d >= a && s <= b);
  return { ms: lt.reduce((m, [, d]) => Math.max(m, d), 0), count: lt.length };
}
/** the long tasks inside [from,until]: how many touch it, how much task time lies inside it (clipped to the window), the longest, and the five longest as [start,ms]. */
export function windowTasks(longTasks, from, until) {
  const inside = longTasks.filter(([s, d]) => s < until && s + d > from);
  const clipped = inside.map(([s, d]) => Math.min(s + d, until) - Math.max(s, from));
  return {
    count: inside.length, total_ms: Math.round(clipped.reduce((a, x) => a + x, 0)), max_ms: inside.reduce((m, [, d]) => Math.max(m, d), 0),
    longest: [...inside].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s, d]) => [Math.round(s), Math.round(d)]),
  };
}
/** what a sample records about C, from the long tasks it saw: exact (the first quiet window) or censored (none inside the budget).
 *  The BUDGET (boundMs after the map is shown) is how long the page may be watched; the window ACTUALLY OBSERVED is what the answer rested on:
 *  an exact C stops the watching at the end of its own 2 s window (observed_to_ms = C + 2 s), a censored one has used the whole budget. The long-task
 *  count, total, maximum and longest five are those of the window actually observed, never of the unspent budget. */
export function observeInteractive(longTasks, mapAt, { boundMs = INTERACTIVE_BOUND_MS, windowMs = QUIET_MS } = {}) {
  const budgetUntil = mapAt + boundMs;
  const t = quietFrom(longTasks, mapAt, windowMs, budgetUntil);      // the budget's end as "now": a window must END inside it
  const base = { from_ms: mapAt, budget_ms: boundMs, budget_until_ms: budgetUntil, quiet_window_ms: windowMs };
  if (t !== null) {
    const observedTo = t + windowMs;
    return { interactive_ms: t, interactive_censored: null, interactive_observation: { ...base, observed_to_ms: observedTo, observed_ms: observedTo - mapAt, first_quiet_start_ms: t, ...windowTasks(longTasks, mapAt, observedTo) } };
  }
  const gt = budgetUntil - windowMs;
  const obs = { ...base, observed_to_ms: budgetUntil, observed_ms: boundMs, last_start_tried_ms: gt, ...windowTasks(longTasks, mapAt, budgetUntil) };
  return {
    interactive_ms: null, interactive_observation: obs,
    interactive_censored: {
      gt_ms: gt, reason: `no ${windowMs / 1000} s window without a long task began between map shown (${Math.round(mapAt)} ms) and ${Math.round(gt)} ms, inside the ${boundMs / 1000} s observation budget (all of it was used)`,
      long_tasks: obs.count, long_task_ms: obs.total_ms,
      text: `>${(gt / 1000).toFixed(1)} s (never quiet: ${obs.count} long tasks, ${obs.total_ms} ms total in the window)`,
    },
  };
}
const censoredOk = (c) => !!c && Number.isFinite(c.gt_ms) && Number.isFinite(c.long_tasks) && Number.isFinite(c.long_task_ms);
/** C across the samples, by what each sample's interval actually establishes. C is navigation-relative while each censoring bound is relative to that
 *  sample's own map-shown time, so a censored sample is NOT known to exceed every exact one: an exact C of 184 s beats a censored `>182 s` only if the latter is
 *  really bigger. Each sample is an interval — exact: [ms, ms]; censored: (gt, unbounded) — and the k-th order statistic (min, median, max) lies between the
 *  k-th smallest lower bound and the k-th smallest upper bound. It is `exact` only when those meet; otherwise the interval is kept (lower bound, whether strict,
 *  upper bound or null for unbounded) and no number is invented. Never the median of the finite subset. null when any sample has neither an exact C nor a
 *  well-formed censoring. */
export function interactiveSummary(samples) {
  const items = samples.map((s) => (Number.isFinite(s.interactive_ms) ? { lo: s.interactive_ms, strict: false, hi: s.interactive_ms } : censoredOk(s.interactive_censored) ? { lo: s.interactive_censored.gt_ms, strict: true, hi: Infinity, c: s.interactive_censored } : null));
  if (!items.length || items.some((i) => i === null)) return null;
  const lows = [...items].sort((a, b) => a.lo - b.lo || Number(a.strict) - Number(b.strict));        // ties: an exact value before a censored bound
  const highs = items.map((i) => i.hi).sort((a, b) => a - b);
  const stat = (k) => {
    const lo = lows[k], hi = highs[k];
    const exact = Number.isFinite(hi) && lo.lo === hi && !lo.strict;
    return { ms: exact ? hi : null, lower_ms: lo.lo, lower_strict: lo.strict, upper_ms: Number.isFinite(hi) ? hi : null };
  };
  const show = (s) => (s.ms !== null ? `${Math.round(s.ms)} ms` : s.upper_ms === null ? `${s.lower_strict ? ">" : "≥"}${Math.round(s.lower_ms)} ms` : `${s.lower_strict ? "(" : "["}${Math.round(s.lower_ms)}, ${Math.round(s.upper_ms)}] ms`);
  const k = Math.min(items.length - 1, Math.floor(0.5 * (items.length - 1) + 0.5));
  const mn = stat(0), md = stat(k), mx = stat(items.length - 1);
  const nCens = items.filter((i) => i.c).length;
  return {
    median: md.ms, median_censored: md.ms === null, median_lower_ms: md.lower_ms, median_lower_strict: md.lower_strict, median_upper_ms: md.upper_ms,
    min: mn.ms, min_lower_ms: mn.lower_ms, min_lower_strict: mn.lower_strict, min_upper_ms: mn.upper_ms,
    max: mx.ms, max_lower_ms: mx.lower_ms, max_lower_strict: mx.lower_strict, max_upper_ms: mx.upper_ms,
    n_censored: nCens, n: items.length,
    samples: items.map((i) => (i.c ? { censored: true, gt_ms: i.lo, long_tasks: i.c.long_tasks, long_task_ms: i.c.long_task_ms, text: i.c.text } : { ms: i.lo })),
    text: `median ${show(md)}${nCens ? `; ${nCens} of ${items.length} samples censored` : ""}`,
  };
}
/** the cold-load byte cutoff for a sample: the moment C was reached, or — C censored — the end of the observation (the whole budget, all of it used). */
export const bytesCutoff = (s) => (Number.isFinite(s.interactive_ms) ? { at_ms: s.interactive_ms, basis: "interactive" } : s.interactive_observation ? { at_ms: s.interactive_observation.observed_to_ms, basis: "observation_end" } : null);
/** is the rect's centre within `frac` of the pane's middle, each way (fractions of the pane's width and height)? */
export function centredWithin(rect, pane, frac = 0.12) {
  if (!rect || !pane) return false;
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  return Math.abs(cx - (pane.x + pane.width / 2)) <= pane.width * frac && Math.abs(cy - (pane.y + pane.height / 2)) <= pane.height * frac;
}
export const sameScale = (a, b, tol = SCALE_TOLERANCE) => Number.isFinite(a) && Number.isFinite(b) && b > 0 && Math.abs(a / b - 1) <= tol;
/** an inert drag: the camera was written too few times or went too short a way. */
export const dragMoved = ({ writes, travelPx }) => writes >= MIN_CAMERA_WRITES && travelPx >= MIN_TRAVEL_PX;
/** WLD-226 (Wright 2026-11-22 21:09Z): a real drag (>= MIN_TRAVEL_PX) that the page was too slow to write MIN_CAMERA_WRITES times is a SLOW PAN, not an inert drag, when
 *  its own pan p95 or longest task crossed the bar. Read from the phase's own fields; nothing a caller passes can set it. */
export const panStalled = (p) => !!p && Number.isFinite(p.camera_writes) && p.travel_px >= MIN_TRAVEL_PX && p.camera_writes < MIN_CAMERA_WRITES
  && Number.isFinite(p.frame_p95_ms) && Number.isFinite(p.longest_task_ms) && (p.frame_p95_ms >= PAN_P95_BAR_MS || p.longest_task_ms > PAN_TASK_BAR_MS);
// WHAT THE PAGE RENDERED vs HOW FRESH THE TOWN IS (WLD-222 fit, Wright 2026-11-21). The frame a sample was measured on is the
// World code/snapshot and the Site release: the Site's release tag and code, the World sha and its settlement and digest. The town's
// freshness — the town and its mail moving with town_sha and the crossing — changes between samples without changing what the page renders,
// so it is kept as per-sample provenance and never decides whether samples may be combined. A change in the FRAME during a sample, or
// between samples, is a change in the thing measured: it still cannot be silently combined.
// The release tags (code_ref, world_ref) are LABELS the Site's build stamp emits as `ref || null`: null means the lane named no tag, not that the
// code or the World snapshot is unknown. The shas (and the settlement and digest) are the identity; the tags are recorded as provenance, may be
// null or renamed, and are neither required nor compared.
export const FRAME_KEYS = ["code_sha", "world_sha", "world_settlement", "world_digest"];
export const TAG_KEYS = ["code_ref", "world_ref"];
export const FRESHNESS_KEYS = ["town_sha", "town_data_sha", "crossing", "town_index_as_of"];
export const VERSION_KEYS = [...FRAME_KEYS, ...TAG_KEYS, ...FRESHNESS_KEYS];
export const versionOf = (build) => (build ? Object.fromEntries(VERSION_KEYS.map((k) => [k, build[k] ?? null])) : null);
/** the same rendered frame: every FRAME key equal (freshness is not compared). Null on either side is never the same. */
export const sameFrame = (a, b) => !!a && !!b && FRAME_KEYS.every((k) => a[k] === b[k]);
export const sameVersion = sameFrame;
/** which freshness keys moved between two reads (provenance only). */
export const freshnessMoved = (a, b) => (a && b ? FRESHNESS_KEYS.filter((k) => a[k] !== b[k]) : []);
const completeFrame = (v) => !!v && FRAME_KEYS.every((k) => v[k] !== null && v[k] !== undefined && v[k] !== "");

/** one sample's own verdict: the reasons it is not valid (empty = valid). `s` is what measureSample returns. */
export function sampleProblems(s, { official }) {
  const bad = [];
  if (s.error) bad.push(`phase failed: ${s.error}`);
  if (s.visibility !== "visible") bad.push(`tab was ${s.visibility}, not visible`);
  if (!Number.isFinite(s.map_shown_ms)) bad.push("the map was never shown");
  // C is exact, or CENSORED with its bound and counts (a sample that never had a quiet window is a finding, not a failure); neither = a failed phase
  if (!Number.isFinite(s.interactive_ms) && !censoredOk(s.interactive_censored)) bad.push("interactive time is neither measured nor censored with its bound");
  if (!(s.bytes_cold_load_encoded > 0)) bad.push("no cold-load bytes were read");
  if (!s.bytes_basis) bad.push("the cold-load byte cutoff is unstated");
  if (s.failed_requests?.length) bad.push(`failed requests: ${s.failed_requests.slice(0, 3).join(", ")}`);
  // on the official origin the page's data is the /api/world/* snapshot; a read of the legacy WORLD export is the viewer's fallback after the API failed, i.e. a
  // different (smaller) population than the one the row names — a mixed population, never a baseline
  if (official && s.legacy_data_requests?.length) bad.push(`the page fell back to the legacy WORLD export (mixed population): ${s.legacy_data_requests.slice(0, 2).join(", ")}`);
  if (official && s.api_data && !(s.api_data.state_ok > 0 && s.api_data.skeleton_ok > 0)) bad.push(`the page never read /api/world/state and /api/world/skeleton successfully (${s.api_data.state_ok}, ${s.api_data.skeleton_ok})`);
  // the FRAME (World code/snapshot + Site release) may not move during a sample; the town's freshness (town_sha, crossing…) may, and is recorded
  if (official && !sameFrame(s.version_before, s.version_after)) bad.push("the rendered World/Site frame changed during the sample (mixed frame)");
  if (official && !s.version_before) bad.push("build.json was unavailable, so the served version is unknown");
  for (const [k, p] of Object.entries(s.places ?? {})) {
    if (!p.located) bad.push(`${k}: the place was not under the middle of the map`);
    if (!p.scale_ok) bad.push(`${k}: the camera was not at the common scale (${p.scale} vs ${s.scale_ref})`);
    if (!dragMoved({ writes: p.camera_writes, travelPx: p.travel_px }) && !panStalled(p)) bad.push(`${k}: the drag did not move the camera (${p.camera_writes} writes, ${Math.round(p.travel_px)} px)`);
    if (!p.still_in_view) bad.push(`${k}: the place had left the screen after the drag`);
    if (!Number.isFinite(p.frame_p95_ms)) bad.push(`${k}: no animation frames in the drag`);
    if (!(p.drawn_marks > 0)) bad.push(`${k}: no drawn marks`);
  }
  for (const k of Object.keys(PLACES)) if (!s.places?.[k]) bad.push(`${k}: not measured`);
  return bad;
}

/** the audit row from the samples. `town` is the served town's size; `env` the tool/browser provenance. */
export function auditRow({ samples, town, env, official, at }) {
  const invalid = samples.flatMap((s, i) => sampleProblems(s, { official }).map((m) => `sample ${i + 1}: ${m}`));
  if (official) {
    const version = versionOf(town ? { ...town, world_settlement: town.settlement } : null);
    if (!completeFrame(version)) invalid.push("the audit town version is incomplete (the World/Site frame)");
    if (![town?.marks, town?.parcels].every((n) => Number.isInteger(n) && n >= 0)) invalid.push("the audit town size is unavailable");
    if (samples.some((s) => !sameFrame(version, s.version_before) || !sameFrame(version, s.version_after))) invalid.push("mixed frame across the audit town and samples");
  }
  const pick = (f) => spread(samples.map(f));
  const place = (k, f) => pick((s) => s.places?.[k] ? f(s.places[k]) : NaN);
  const places = Object.fromEntries(Object.keys(PLACES).map((k) => [k, {
    pan_frame_p95_ms: place(k, (p) => p.frame_p95_ms),
    pan_longest_task_ms: place(k, (p) => p.longest_task_ms),
    pan_long_tasks: place(k, (p) => p.long_tasks),
    drawn_marks: place(k, (p) => p.drawn_marks),
  }]));
  const bytes = pick((s) => s.bytes_cold_load_encoded);
  const bases = [...new Set(samples.map((s) => s.bytes_basis))];
  const metrics = {
    bytes_cold_load_encoded: bytes && { ...bytes, basis: bases.length === 1 ? bases[0] : "mixed", cutoffs: samples.map((s) => ({ basis: s.bytes_basis, at_ms: s.bytes_cutoff_ms ?? null })) },
    map_shown_ms: pick((s) => s.map_shown_ms),
    interactive_ms: interactiveSummary(samples),
    idle_busy_pct: pick((s) => s.idle_busy_pct),
    heap_after_gc_mib: pick((s) => s.heap_after_gc_mib),
    places,
  };
  const gaps = [];
  const walk = (o, path) => { if (o === null) gaps.push(path); else if (o && typeof o === "object" && !("median" in o)) for (const [k, v] of Object.entries(o)) walk(v, path ? `${path}.${k}` : k); };
  walk(metrics, "");
  for (const g of gaps) invalid.push(`no value for ${g}`);
  const fresh = new Set(samples.flatMap((s) => [s.version_before, s.version_after]).filter(Boolean).map((v) => JSON.stringify(FRESHNESS_KEYS.map((k) => v[k]))));
  return {
    kind: "world-page-audit", schema: 1, at, valid: invalid.length === 0, official, invalid,
    // the comparator: the rendered frame is what rows are compared on; freshness rides along per sample and never decides comparability
    frame: Object.fromEntries(FRAME_KEYS.map((k) => [k, (k === "world_settlement" ? town?.settlement : town?.[k]) ?? null])),
    tags: Object.fromEntries(TAG_KEYS.map((k) => [k, town?.[k] ?? null])),     // provenance labels; null = no tag named, not an unknown snapshot
    freshness_varied: fresh.size > 1,
    censored: metrics.interactive_ms ? metrics.interactive_ms.n_censored > 0 : null,
    // slow pans: drags that travelled but that the page could not write 5 times, with their raw numbers; a finding, not an invalidity (see panStalled)
    pan_stalled: samples.flatMap((s, i) => Object.entries(s.places ?? {}).filter(([, p]) => panStalled(p)).map(([k, p]) => ({
      sample: i + 1, place: k, camera_writes: p.camera_writes, travel_px: p.travel_px, frame_p95_ms: p.frame_p95_ms, longest_task_ms: p.longest_task_ms, frames: p.frames, long_tasks: p.long_tasks,
    }))),
    town, env, metrics,
    samples: samples.map(({ places: pl, ...rest }) => ({ ...rest, places: pl })),
  };
}

// ── the browser run ──────────────────────────────────────────────────────────────────────────────────────────
const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..", "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  try { const r = await fetch(url, { headers: { "cache-control": "no-cache" } }); return r.ok ? await r.json() : null; } catch { return null; }
}
/** the served town's size and versions, read outside the throttled page. Prod's viewer reads the public API, not the legacy export. */
export async function readTown(origin) {
  const build = await fetchJson(`${origin}/build.json`);
  const source = origin === PROD ? "/api/world/state" : "/WORLD/world-state.json";
  const state = await fetchJson(`${origin}${source}`);
  const asOf = state?.meta?.source === "settlement" ? state.meta.as_of : null;
  const served = build ? { ...build,
    world_settlement: origin === PROD ? asOf?.settlement ?? null : build.world_settlement,
    world_digest: origin === PROD ? asOf?.digest ?? null : build.world_digest,
  } : null;
  const marks = Array.isArray(state?.marks) ? state.marks : null;
  return {
    build, version: versionOf(served),
    town: {
      marks: marks?.length ?? null,
      parcels: Array.isArray(state?.parcels) ? state.parcels.length : (state?.parcels ? Object.keys(state.parcels).length : null),
      data_source: source, data_observed_at: new Date().toISOString(), data_as_of: asOf,
      settlement: served?.world_settlement ?? null, crossing: build?.crossing ?? null,
      code_sha: build?.code_sha ?? null, town_data_sha: build?.town_data_sha ?? null, town_sha: build?.town_sha ?? null, world_sha: build?.world_sha ?? null,
      world_digest: served?.world_digest ?? null, code_ref: build?.code_ref ?? null, world_ref: build?.world_ref ?? null, town_index_as_of: build?.town_index_as_of ?? null,
    },
  };
}

// installed from the first byte of the page, passive only: long tasks, every animation frame, visibility, the map-shown moment, camera writes
function pageInit() {
  const W = (globalThis.__wpa = { lt: [], frames: [], vis: [document.visibilityState], mapShownAt: null, writes: 0, track: false });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) W.lt.push([e.startTime, e.duration]); }).observe({ type: "longtask", buffered: true }); } catch {}
  document.addEventListener("visibilitychange", () => W.vis.push(document.visibilityState));
  let last = null;
  const tick = (t) => {
    W.frames.push(t);
    if (W.mapShownAt === null && document.visibilityState === "visible" && document.querySelector("svg#map-svg") && document.querySelector("#wv-overlay [data-id]")) W.mapShownAt = t;
    // a drag moves the painting by the svg's own transform and commits the viewBox when it lets go, so BOTH are the camera
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
const readPage = (page) => page.evaluate(() => { const W = globalThis.__wpa; return { lt: W.lt, frames: W.frames, vis: W.vis, mapShownAt: W.mapShownAt, writes: W.writes, tx: W.tx ?? null, ty: W.ty ?? null }; });
const nowMs = (page) => page.evaluate(() => performance.now());

/** the camera as the page draws it: viewBox x/y/w and the map's CSS size, so scale = CSS px per viewBox unit. */
const camera = (page) => page.evaluate(() => {
  const svg = document.querySelector("svg#map-svg"); if (!svg) return null;
  const [x, y, w, h] = svg.getAttribute("viewBox").split(/\s+/).map(Number); const r = svg.getBoundingClientRect();
  return { x, y, w, h, cssW: r.width, cssH: r.height, left: r.left, top: r.top, scale: r.width / w };
});
const placeRect = (page, id) => page.evaluate((id) => {
  // the place's own shape on the painting (its extent polygon, or its far-picture hit area), not its card in the list
  const els = [...document.querySelectorAll(`[data-id="${CSS.escape(id)}"]`)].filter((e) => /^(polygon|circle)$/i.test(e.tagName));
  const el = els.find((e) => /polygon/i.test(e.tagName)) ?? els[0];
  const r = el?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
}, id);
const paneRect = (page) => page.evaluate(() => { const r = document.querySelector("svg#map-svg").getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
/** the nearest point to the middle of the map where the pointer would meet bare painting (the svg itself, or something drawn in it that is
 *  no mark, link, button, card or column), with room around it for the drag's ellipse; null if there is none. `under` names what is there. */
const bareGrab = (page) => page.evaluate(() => {
  const svg = document.querySelector("svg#map-svg"); if (!svg) return null;
  const r = svg.getBoundingClientRect(), cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  // what a hand cannot pan through: the page's own panels, cards, links and buttons. A mark's shape in the painting is not one
  // (the painting is the pan surface), but a point off every mark is taken first, and `under` says which it was.
  // (asked of what lies BETWEEN the element and the map's container, never beyond it: the map sits inside the page's own aside)
  const mm = document.querySelector(".wv-minimap");
  const uiSel = "a, button, input, textarea, .wv-card, .wv-homecol, .wv-tour, .wv-search-results, .wv-mapctl-tools, [role=dialog]";
  const inUi = (e) => { for (let n = e; n && n !== mm; n = n.parentElement) if (n.matches(uiSel)) return true; return false; };
  for (const [mx, my, offMarks] of [[140, 100, true], [140, 100, false], [60, 40, false]]) {
    const pts = [];
    for (let x = r.x + mx; x <= r.x + r.width - mx; x += 24) for (let y = r.y + my; y <= r.y + r.height - my; y += 24) pts.push([x, y]);
    pts.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
    for (const [x, y] of pts) {
      const e = document.elementFromPoint(x, y);
      // the pan surface is the map's container (.wv-minimap): the svg and the marks layered over it
      if (e && mm?.contains(e) && !inUi(e) &&!(offMarks && e.closest("[data-id]"))) return { x, y, under: e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + ((e.getAttribute("class") || "").trim() ? "." + e.getAttribute("class").trim().split(/\s+/).join(".") : "") };
    }
  }
  return null;
});
const drawnMarks = (page) => page.evaluate(() => new Set([...document.querySelectorAll("#wv-overlay [data-id]")].map((e) => e.getAttribute("data-id"))).size);

/** What the page asked for over the WHOLE sample (every measured phase, not only the cold load), sorted into: failures of its own document, code and data
 *  (which invalidate), failures of anything else (recorded), the legacy WORLD export requested at all (on the official origin that is the viewer's FALLBACK
 *  when /api/world/state or /api/world/skeleton did not answer: a different population from the one the row names, so it invalidates), and whether the two
 *  API reads that carry the town's population and skeleton succeeded. `prod`: the official origin, whose data is the /api/world/* snapshot. */
export function classifyRequests(requests, { prod = false } = {}) {
  const failed = requests.filter((r) => r.failed || r.status >= 400);
  const api = (r) => /\/api\/world\/(state|skeleton)(\?|$)/.test(r.url);
  const legacy = (r) => /\/WORLD\/(world-state|skeleton)\.json(\?|$)/.test(r.url);
  const own = (r) => r.type === "Document" || /\/(WORLD\/(world-state|skeleton)\.json|world-engine\/.*\.mjs|_astro\/.*\.js)(\?|$)/.test(r.url) || (prod && api(r));
  const fmt = (r) => `${r.failed ?? r.status} ${r.url}`;
  const ok = (name) => requests.filter((r) => new RegExp(`/api/world/${name}(\\?|$)`).test(r.url) && !r.failed && r.status >= 200 && r.status < 300).length;
  return {
    failed_requests: failed.filter(own).map(fmt),
    other_failed_requests: failed.filter((r) => !own(r)).map(fmt),
    legacy_data_requests: prod ? requests.filter(legacy).map((r) => `${r.failed ?? r.status ?? "?"} ${r.url}`) : [],
    api_data: prod ? { state_ok: ok("state"), skeleton_ok: ok("skeleton") } : null,
  };
}
/** wait until no long task has ended in the last `ms`, for at most `cap`; returns whether the page did rest (recorded, never assumed). Asks the page one number, not its whole history. */
async function settle(page, ms, cap = SETTLE_CAP_MS) {
  const end = Date.now() + cap;
  while (Date.now() < end) {
    const since = await page.evaluate("(() => { const W = globalThis.__wpa; let e = 0; for (const [s, d] of W.lt) e = Math.max(e, s + d); return performance.now() - e; })()");
    if (since >= ms) return true;
    await sleep(250);
  }
  return false;
}
/** C, asked of the page itself (quietFrom's own source runs there, over the page's own long-task list): the earliest quiet-window start, or null. */
const quietInPage = (page, from, windowMs, until) => page.evaluate(`(${quietFrom.toString()})(globalThis.__wpa.lt, ${from}, ${windowMs}, Math.min(performance.now(), ${until}))`);

async function measureSample(browser, origin, cpu, scaleRef, worldPath, boundMs = INTERACTIVE_BOUND_MS) {
  const worldUrl = `${origin}${worldPath}`;
  const out ={ places: {}, failed_requests: [], error: null };
  const before = await readTown(origin);
  out.version_before = before.version;
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await ctx.addInitScript(pageInit);
  const page = await ctx.newPage();
  const reqs = new Map();      // every request of the whole sample, kept to the end (a failure or a legacy fallback in ANY phase counts, not only the cold load's)
  try {
    // same-site first, so the CPU throttle is on the process the World page then runs in
    await page.goto(`${origin}/build.json`);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
    await cdp.send("Performance.enable");
    await cdp.send("Network.enable");
    const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
    // the wire: every request's start, finish and size, and what it was
    let docT0 = null;
    cdp.on("Network.requestWillBeSent", (e) => { if (!reqs.has(e.requestId)) reqs.set(e.requestId, { url: e.request.url, t0: e.timestamp, type: e.type }); if (e.type === "Document" && e.request.url === worldUrl && docT0 === null) docT0 = e.timestamp; });
    cdp.on("Network.responseReceived", (e) => { const r = reqs.get(e.requestId); if (r) { r.status = e.response.status; r.type = e.type; } });
    cdp.on("Network.loadingFinished", (e) => { const r = reqs.get(e.requestId); if (r) { r.t1 = e.timestamp; r.bytes = e.encodedDataLength; } });
    cdp.on("Network.loadingFailed", (e) => { const r = reqs.get(e.requestId); if (r && !e.canceled) { r.failed = e.errorText; } });

    // 1 ── the cold load
    await page.goto(worldUrl, { waitUntil: "load" });
    out.visibility = await page.evaluate(() => document.visibilityState);
    // the map: a real phase failure if it does not show inside MAP_WAIT_MS (by the wall clock)
    let mapAt = null;
    for (const w0 = Date.now(); mapAt === null && Date.now() - w0 < MAP_WAIT_MS;) { mapAt = await page.evaluate("globalThis.__wpa.mapShownAt"); if (mapAt === null) await sleep(250); }
    out.map_shown_ms = mapAt;
    if (mapAt === null) throw new Error(`svg#map-svg with drawn marks did not appear within ${MAP_WAIT_MS / 1000} s`);
    // C: watched for INTERACTIVE_BOUND_MS of the page's clock after the map is shown, until the first 2 s with no long task (exact) or the bound (censored)
    const until = mapAt + boundMs;
    let tti = null;
    for (;;) {
      tti = await quietInPage(page, mapAt, QUIET_MS, until);
      if (tti !== null || (await nowMs(page)) >= until) break;
      await sleep(250);
    }
    const seen = observeInteractive((await readPage(page)).lt, mapAt, { boundMs, windowMs: QUIET_MS });
    // (the loop only decides when to stop looking; what is recorded is the same definition applied once to the page's whole long-task list)
    Object.assign(out, seen);
    // bytes of what finished by the cutoff: C when it was reached, else the end of the observation window (the document's request start is the clock's zero, close to navigation start)
    const cutoff = bytesCutoff(out);
    out.bytes_basis = cutoff.basis; out.bytes_cutoff_ms = cutoff.at_ms;
    const done = [...reqs.values()].filter((r) => r.t1 !== undefined && docT0 !== null && (r.t1 - docT0) * 1000 <= cutoff.at_ms + 1 && r.t0 >= docT0 - 0.001);
    out.bytes_cold_load_encoded = done.reduce((a, r) => a + (r.bytes ?? 0), 0);
    out.requests_cold_load = done.length;
    out.bytes_by_type = {}; for (const r of done) out.bytes_by_type[r.type ?? "Other"] = (out.bytes_by_type[r.type ?? "Other"] ?? 0) + (r.bytes ?? 0);
    out.cold_load_files = done.map((r) => { try { return new URL(r.url).pathname; } catch { return r.url; } }).sort();

    // 2 ── the tour holds the roll-in; a returning visitor skips it
    // (the tour's wrapper, .wv-tour, carries `hidden`; its card never does)
    const tour = await page.locator(".wv-tour:not([hidden])").count();
    if (tour) {
      await page.click(".wv-tour-skip", { timeout: 30000 });
      await page.waitForSelector(".wv-tour:not([hidden])", { state: "detached", timeout: 15000 }).catch(() => { throw new Error("the tour did not close after skip"); });
    }
    await page.mouse.move(4, 4);
    out.settled_after_skip = await settle(page, 1500);

    // 3 ── idle: nothing touched for 10 s
    const m0 = await metrics();
    await sleep(IDLE_MS);
    const m1 = await metrics();
    out.idle_busy_pct = ((m1.TaskDuration - m0.TaskDuration) / (m1.Timestamp - m0.Timestamp)) * 100;

    // 4 ── the two places, one drag each
    for (const [key, place] of Object.entries(PLACES)) {
      const rec = { id: place.id };
      rec.settled_before = await settle(page, 1500);      // whether the page had let go of the last input before the next hand reached for it (a page that never rests is measured anyway)
      // the common scale FIRST, wheeling over bare painting (a picked place opens a column over the map, and a wheel
      // there scrolls the column, not the map): the first place takes one notch in (the fit view is the zoom-out limit);
      // the second is brought to that. The search then centres the place without changing the zoom.
      let grab = await bareGrab(page);
      if (!grab) throw new Error(`${key}: no bare map point to wheel over`);
      await page.mouse.move(grab.x, grab.y);
      let cam = await camera(page);
      if (scaleRef.value === null) {
        const open = cam.scale;
        await page.mouse.wheel(0, -300); await sleep(2500); cam = await camera(page);
        if (sameScale(cam.scale, open, 0.01)) throw new Error(`${key}: the wheel did not zoom the map`);
        scaleRef.value = cam.scale;
      }
      for (let n = 0; n < 14 && !sameScale(cam.scale, scaleRef.value); n++) { await page.mouse.wheel(0, cam.scale < scaleRef.value ? -300 : 300); await sleep(1200); cam = await camera(page); }
      await page.mouse.move(4, 4);
      await page.fill(".wv-search-input", place.query);
      await page.waitForSelector(`.wv-search-hit[data-hit="${place.id}"]`, { timeout: 15000 });
      await page.click(`.wv-search-hit[data-hit="${place.id}"]`, { timeout: 90000 });
      await sleep(1500);
      cam = await camera(page);
      rec.scale = cam.scale; rec.scale_ref = scaleRef.value; rec.scale_ok = sameScale(cam.scale, scaleRef.value);
      rec.settled_after_pick = await settle(page, 1500);
      const standing = () => page.evaluate(() => document.querySelector(".wv-spectator-coordinate")?.textContent?.trim() ?? "");
      rec.standing = await standing();
      const off = pillOffsetM(rec.standing); rec.standing_offset_m = off ? Math.round(Math.hypot(off.x, off.y)) : null;
      rec.located = centredWithin(await placeRect(page, place.id), await paneRect(page)) || standingNear(place, rec.standing);
      rec.drawn_marks = await drawnMarks(page);
      // the drag: a hand moving the map in a slow ellipse for 10 s, ~60 moves a second
      cam = await camera(page);
      await page.evaluate(() => { const W = globalThis.__wpa; W.track = true; W.writes = 0; W.tx = null; W.ty = null; });
      const cam0 = cam;
      // the hand takes hold of bare painting: a picked place opens a column and card over the middle of the map, and a drag
      // that begins on them pans nothing. What is under the pointer is read, not assumed, and kept as evidence.
      grab = await bareGrab(page);
      if (!grab) throw new Error(`${key}: no bare map point to take hold of`);
      rec.grab = { x: Math.round(grab.x), y: Math.round(grab.y), under: grab.under };
      const mid = { x: grab.x, y: grab.y };
      const pane = await paneRect(page);
      const p0 = await nowMs(page);
      await page.mouse.move(mid.x, mid.y);
      await page.mouse.down();
      const w0 = Date.now(); let moves = 0;
      while (Date.now() - w0 < PAN_MS) {
        const t = (Date.now() - w0) / 1000;
        await page.mouse.move(mid.x - 120 + 120 * Math.cos((2 * Math.PI * t) / 2.5), mid.y + 90 * Math.sin((2 * Math.PI * t) / 3.7));
        moves++; await sleep(16);
      }
      await page.mouse.up();
      const p1 = await nowMs(page);
      const cam1 = await camera(page);
      const R = await readPage(page);
      await page.evaluate(() => { globalThis.__wpa.track = false; });
      const gaps = frameGaps(R.frames, p0, p1);
      const lt = longestTask(R.lt, p0, p1);
      rec.frame_p95_ms = quantile(gaps, 0.95);
      rec.frame_p50_ms = quantile(gaps, 0.5);
      rec.frames = gaps.length;
      rec.longest_task_ms = lt.ms; rec.long_tasks = lt.count;
      rec.moves = moves; rec.camera_writes = R.writes;
      // how far the painting travelled under the hand: the extent of the svg's translate during the drag (CSS px)
      rec.travel_px = R.tx && R.ty ? Math.hypot(R.tx[1] - R.tx[0], R.ty[1] - R.ty[0]) : 0;
      rec.still_in_view = (await placeRect(page, place.id).then((r) => !!r && r.x < pane.x + pane.width && r.x + r.width > pane.x && r.y < pane.y + pane.height && r.y + r.height > pane.y))
        || standingNear(place, await standing());
      out.places[key] = rec;
      await page.mouse.move(4, 4);
    }
    out.scale_ref = scaleRef.value;

    // 5 ── the end of the sample: the throttle proved, the heap after a collection, the page's size
    out.calibration_ms = await page.evaluate(() => { const t = performance.now(); let x = 0; for (let i = 0; i < 2e7; i++) x = (x + i * 7) % 1000003; return performance.now() - t + (x < 0 ? 1 : 0); });
    await cdp.send("HeapProfiler.enable");
    await cdp.send("HeapProfiler.collectGarbage");
    out.heap_after_gc_mib = (await metrics()).JSHeapUsedSize / 2 ** 20;
    out.dom_nodes = await page.evaluate(() => document.querySelectorAll("*").length);
    const R = await readPage(page);
    out.long_tasks_total = R.lt.length;
    out.visibility = R.vis.every((v) => v === "visible") ? "visible" : R.vis.join(",");
  } catch (e) {
    out.error = String(e?.message ?? e).split("\n").slice(0, 6).join(" | ").slice(0, 600);
  } finally {
    // a failed request invalidates the sample only if it is the page itself or the town's own code and data (on prod: /api/world/state and /skeleton, and
    // any request of the legacy WORLD export, which is the viewer's fallback); any other failure is recorded (other_failed_requests), not the measure's concern.
    // Read here, over everything the sample requested, so a failure in the pans or the idle counts as much as one in the cold load.
    Object.assign(out, classifyRequests([...reqs.values()], { prod: origin === PROD }));
    await ctx.close();
  }
  const after = await readTown(origin);
  out.version_after = after.version;
  out.freshness_moved = freshnessMoved(out.version_before, out.version_after);   // provenance: the town moved under the sample (not the frame)
  return out;
}

export async function runAudit({ origin = PROD, samples = 3, cpu = 4, worldPath = "/world/", boundMs = INTERACTIVE_BOUND_MS } = {}) {
  const require = createRequire(join(REPO, "package.json"));
  const pw = require("playwright");
  const pwVersion = JSON.parse(readFileSync(join(dirname(require.resolve("playwright/package.json")), "package.json"), "utf8")).version;
  const official = origin === PROD && samples === 3 && cpu === 4 && pwVersion === PINNED_PLAYWRIGHT && boundMs === INTERACTIVE_BOUND_MS;
  const browser = await pw.chromium.launch({ headless: true, args: ["--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows"] });
  const started = Date.now();
  const served = await readTown(origin);
  const scaleRef = { value: null };
  const list = [];
  const chromium = browser.version();
  try { for (let i = 0; i < samples; i++) list.push(await measureSample(browser, origin, cpu, scaleRef, worldPath, boundMs)); }
  finally { await browser.close(); }
  const env = {
    origin, cpu_throttle: cpu, samples, viewport: VIEWPORT, signed_in: false, idle_ms: IDLE_MS, pan_ms: PAN_MS, quiet_window_ms: QUIET_MS, interactive_bound_ms: boundMs, settle_cap_ms: SETTLE_CAP_MS, map_wait_ms: MAP_WAIT_MS,
    playwright: pwVersion, playwright_pinned: PINNED_PLAYWRIGHT, chromium, node: process.version, duration_s: Math.round((Date.now() - started) / 1000),
  };
  return auditRow({ samples: list, town: served.town, env, official, at: new Date().toISOString() });
}

// ── bytes per settlement, from git (no browser, no network) ──────────────────────────────────────────────────
/** the repo-served files the page requests: /world-engine/x -> x in this repo; /WORLD/f -> WORLD/f. Anything else is not repo-served. */
export function repoPathOf(urlPath) {
  const p = String(urlPath).split("?")[0];
  if (p.startsWith("/world-engine/")) return p.slice("/world-engine/".length);
  if (p === "/WORLD/world-state.json" || p === "/WORLD/skeleton.json") return p.slice(1);
  return null;
}
export const DEFAULT_SERVED = ["WORLD/world-state.json", "WORLD/skeleton.json", "spectator/viewer.mjs", "spectator/mists-render.mjs", "spectator/mark-icons.mjs", "spectator/circle-reader.mjs", "spectator/holdings.mjs", "spectator/home-column.mjs",
  "tools/world-engine.mjs", "tools/world-verbs.mjs", "tools/world-build.mjs", "tools/geometry.mjs", "tools/claim-instant.mjs", "tools/class-properties.mjs", "tools/consent.mjs", "tools/enter-exit.mjs", "tools/mark-kind.mjs", "tools/mark-name.mjs",
  "tools/mark-standing.mjs", "tools/mists-keep.mjs", "tools/portals.mjs", "tools/record-sources.mjs", "tools/region-outsiders.mjs", "tools/walk.mjs", "tools/walker-roster.mjs", "tools/water.mjs", "tools/where-is.mjs"];

export function backfillBytes({ files = DEFAULT_SERVED, repo = REPO } = {}) {
  const git = (...a) => execFileSync("git", ["-C", repo, ...a], { encoding: "buffer", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });
  const tags = git("tag", "-l", "settlement/S*").toString().trim().split("\n").filter(Boolean).sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")));
  return tags.map((tag) => {
    const sha = git("rev-list", "-n", "1", tag).toString().trim();
    let raw = 0, gz = 0; const missing = [];
    for (const f of files) {
      let b; try { b = git("show", `${sha}:${f}`); } catch { missing.push(f); continue; }
      raw += b.length; gz += gzipSync(b).length;
    }
    return {
      kind: "bytes-backfill", schema: 1, settlement: tag.replace("settlement/", ""), commit: sha, files: files.length - missing.length, files_missing: missing,
      repo_bytes_raw: raw, repo_bytes_gzip: gz,
      basis: "sum of git blob sizes (raw, and gzip -6) at the settlement tag of the selected World engine sources and retained WORLD exports; NOT the live /api/world/state payload, a browser cold load, or a timing replay. The fixed file set is applied to every tag; absent files are listed in files_missing, so early rows are lower bounds on that selected set, not the page of their day",
    };
  });
}

// ── the command line ─────────────────────────────────────────────────────────────────────────────────────────
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i < 0 ? dflt : process.argv[i + 1]; };
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--backfill-bytes")) {
    for (const row of backfillBytes()) console.log(JSON.stringify(row));
  } else {
    const row = await runAudit({ origin: arg("--origin", PROD).replace(/\/$/, ""), samples: Number(arg("--samples", 3)), cpu: Number(arg("--cpu", 4)), worldPath: arg("--world-path", "/world/"), boundMs: Number(arg("--interactive-bound-s", INTERACTIVE_BOUND_MS / 1000)) * 1000 });
    console.log(JSON.stringify(row));
    if (!row.valid) { console.error(`INVALID ROW — not a baseline. ${row.invalid.length} problem(s):\n  ` + row.invalid.join("\n  ")); process.exitCode = 2; }
  }
}
