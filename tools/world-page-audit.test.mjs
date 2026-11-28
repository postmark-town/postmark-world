// world-page-audit.test.mjs — the focused OFFLINE check of tools/perf/world-page-audit.mjs (WLD-222).
//
// Pure functions only: this opens no browser and no network, and never runs the audit. The audit itself is a
// manual CLI (node tools/perf/world-page-audit.mjs); importing it runs nothing. What is pinned here is the part
// that decides whether a row may be a baseline at all: a sample that measured the wrong place, did not actually
// pan, lacks a measurement, failed its cold load or straddled two RENDERED FRAMES (World snapshot / Site release) is
// INVALID, and an invalid sample can never turn into a valid zero or a shorter median. And the two rulings of the
// 2026-11-21 fit: a page that never goes 2 s without a long task is a CENSORED observation of C that still counts as a
// sample (never a failure, never a finite-subset median), and the town's freshness moving is provenance, not a reason
// to refuse to combine samples.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  quantile, median, spread, quietFrom, frameGaps, longestTask, windowTasks, observeInteractive, interactiveSummary, bytesCutoff,
  centredWithin, sameScale, dragMoved, sameVersion, sameFrame, freshnessMoved, versionOf, FRAME_KEYS, TAG_KEYS, FRESHNESS_KEYS,
  pillOffsetM, standingNear, classifyRequests, NEAR_CENTRE_M,
  sampleProblems, auditRow, readTown, repoPathOf, PLACES, MIN_CAMERA_WRITES, MIN_TRAVEL_PX, INTERACTIVE_BOUND_MS, QUIET_MS,
  panStalled, PAN_P95_BAR_MS, PAN_TASK_BAR_MS,
} from "./perf/world-page-audit.mjs";

test("prod context comes from the viewer's API snapshot, never the legacy export or a guessed build stamp", async () => {
  const original = globalThis.fetch, urls = [];
  const build = { code_sha: "site", world_sha: "engine", world_settlement: "S183", world_digest: "baked" };
  let state = { marks: [{}, {}, {}], parcels: [{}], meta: { source: "settlement", as_of: { settlement: "S999", digest: "actual-api" } } };
  globalThis.fetch = async (url) => { urls.push(url); return { ok: true, json: async () => url.endsWith("/build.json") ? build : state }; };
  try {
    const got = await readTown("https://postmark.town");
    assert.deepEqual(urls, ["https://postmark.town/build.json", "https://postmark.town/api/world/state"]);
    assert.equal(got.town.marks, 3); assert.equal(got.town.parcels, 1);
    assert.equal(got.town.data_source, "/api/world/state");
    assert.equal(got.version.world_settlement, "S999"); assert.equal(got.version.world_digest, "actual-api");
    assert.equal(got.version.world_sha, build.world_sha, "engine identity still comes from the compiled package");
    state = { marks: [{}], parcels: [] };
    const gap = await readTown("https://postmark.town");
    assert.equal(gap.version.world_digest, null, "an unstamped API answer is a gap, not the baked stamp substituted for it");
  } finally { globalThis.fetch = original; }
});

const BUILD = {
  code_sha: "c", code_ref: "release/2026-w47.5", world_sha: "w", world_ref: "settlement/S183", world_settlement: "S183", world_digest: "g",
  town_sha: "t", town_data_sha: "d", crossing: 323, town_index_as_of: "i",
};
const place = (over = {}) => ({ located: true, scale: 1.2, scale_ref: 1.2, scale_ok: true, camera_writes: 90, travel_px: 300, still_in_view: true, frame_p95_ms: 33, longest_task_ms: 0, long_tasks: 0, drawn_marks: 120, ...over });
const sample = (over = {}) => ({
  error: null, visibility: "visible", map_shown_ms: 9000, interactive_ms: 12000, interactive_censored: null, bytes_cold_load_encoded: 4_000_000, bytes_basis: "interactive", bytes_cutoff_ms: 12000,
  failed_requests: [], version_before: versionOf(BUILD), version_after: versionOf(BUILD), idle_busy_pct: 8, heap_after_gc_mib: 60, scale_ref: 1.2,
  places: { town_centre: place(), spire: place() }, ...over,
});
/** a censored sample: C never reached inside the bound; everything else measured */
const censored = (over = {}) => {
  const obs = observeInteractive(Array.from({ length: 400 }, (_, i) => [9000 + i * 450, 120]), 9000);   // a long task every 450 ms for the whole bound
  return sample({ interactive_ms: null, ...obs, bytes_basis: "observation_end", bytes_cutoff_ms: obs.interactive_observation.until_ms, ...over });
};
const TOWN = { ...BUILD, settlement: BUILD.world_settlement, marks: 3066, parcels: 195 };
const row = (samples, official = true, town = TOWN) => auditRow({ samples, town, env: {}, official, at: "2026-11-20T00:00:00Z" });

test("the median of three is the middle one and the range is kept; a missing sample is no value at all, never a zero", () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.deepEqual(spread([5, 1, 3]), { median: 3, min: 1, max: 5, samples: [5, 1, 3] });
  assert.equal(quantile([], 0.5), null);
  assert.equal(spread([5, NaN, 3]), null, "one failed sample cannot shorten the median to two");
  assert.equal(spread([]), null);
});

test("interactive = the first 2 s window with no long task; a window not yet over is not an answer", () => {
  const lt = [[1000, 300], [1500, 400], [4000, 100]];            // busy to 1900, quiet 1900-4000, a task at 4000
  assert.equal(quietFrom(lt, 1000, 2000, 10_000), 1900 + 0, "after the last task of the first burst, 2.1 s clear");
  assert.equal(quietFrom([[1000, 300], [2200, 100]], 1000, 2000, 10_000), 2300, "a task inside the window pushes the quiet past it");
  assert.equal(quietFrom([[1000, 300]], 1000, 2000, 2500), null, "only 1.2 s of quiet so far: not yet");
  assert.equal(quietFrom([], 500, 2000, 3000), 500, "no long task at all: interactive the moment the map is shown");
});

test("the pan numbers: frame gaps inside the drag only, and the longest task that overlaps it", () => {
  assert.deepEqual(frameGaps([0, 16, 33, 100, 120, 500], 10, 130), [17, 67, 20]);
  assert.deepEqual(longestTask([[0, 60], [100, 250], [900, 80]], 120, 600), { ms: 250, count: 1 }, "overlap counts; a task wholly before or after does not");
  assert.deepEqual(longestTask([[0, 60]], 120, 600), { ms: 0, count: 0 }, "none reached 50 ms: 0, not a missing value");
});

test("a place is 'located' only when it is under the middle of the map", () => {
  const pane = { x: 0, y: 0, width: 1000, height: 800 };
  assert.equal(centredWithin({ x: 480, y: 380, width: 40, height: 40 }, pane), true);
  assert.equal(centredWithin({ x: 900, y: 380, width: 40, height: 40 }, pane), false, "off to one side");
  assert.equal(centredWithin(null, pane), false, "no shape on the page is not 'near the middle'");
  assert.equal(sameScale(1.2, 1.21), true);
  assert.equal(sameScale(1.2, 0.6), false);
  assert.equal(dragMoved({ writes: MIN_CAMERA_WRITES, travelPx: MIN_TRAVEL_PX }), true);
  assert.equal(dragMoved({ writes: 0, travelPx: 0 }), false);
});

// ── a slow pan is a finding, not an invalid drag (WLD-226, Wright 2026-11-22 21:09Z) ─────────────────────────

test("slow pan: real travel but fewer than 5 writes is pan_stalled when a bar is crossed, read from the phase's own fields", () => {
  const slow = (over) => place({ camera_writes: 4, travel_px: 94.6, frame_p95_ms: 3316.5, longest_task_ms: 3305, frames: 9, long_tasks: 14, ...over });
  // ordinary validity is unchanged: enough writes and travel is valid and not stalled, whatever the bars say
  assert.equal(panStalled(place({ camera_writes: MIN_CAMERA_WRITES, travel_px: MIN_TRAVEL_PX, frame_p95_ms: 5000 })), false);
  assert.deepEqual(row([sample(), sample(), sample()]).pan_stalled, []);
  // the exception: both bars, and each bar alone
  assert.equal(panStalled(slow()), true);
  assert.equal(panStalled(slow({ frame_p95_ms: 50 })), true, "longest task alone");
  assert.equal(panStalled(slow({ longest_task_ms: 0 })), true, "p95 alone");
  // exact boundaries: p95 >= 100 crosses, task > 200 crosses
  assert.equal(panStalled(slow({ longest_task_ms: 0, frame_p95_ms: PAN_P95_BAR_MS })), true);
  assert.equal(panStalled(slow({ longest_task_ms: 0, frame_p95_ms: PAN_P95_BAR_MS - 0.1 })), false);
  assert.equal(panStalled(slow({ frame_p95_ms: 50, longest_task_ms: PAN_TASK_BAR_MS })), false);
  assert.equal(panStalled(slow({ frame_p95_ms: 50, longest_task_ms: PAN_TASK_BAR_MS + 1 })), true);
  assert.equal(panStalled(slow({ camera_writes: MIN_CAMERA_WRITES - 1, travel_px: MIN_TRAVEL_PX })), true, "exactly the travel minimum");
  // insufficient travel, or below the bars, stays an inert drag
  assert.equal(panStalled(slow({ travel_px: MIN_TRAVEL_PX - 0.1 })), false);
  assert.equal(panStalled(slow({ frame_p95_ms: 50, longest_task_ms: 100 })), false);
  assert.equal(panStalled(slow({ frame_p95_ms: null })), false, "no frames: nothing to read the bar from");
  assert.equal(panStalled(null), false);
  for (const w of [null, undefined, NaN, Infinity, "4"]) assert.equal(panStalled(slow({ camera_writes: w })), false, `camera_writes ${String(w)} is no count`);
  assert.equal(sampleProblems(sample({ places: { town_centre: slow({ camera_writes: null }), spire: place() } }), { official: true }).some((m) => /did not move the camera/.test(m)), true, "a missing count stays invalid");
  assert.equal(panStalled(place({ camera_writes: MIN_CAMERA_WRITES, travel_px: MIN_TRAVEL_PX - 0.1, frame_p95_ms: 3000 })), false);
  assert.equal(sampleProblems(sample({ places: { town_centre: place({ camera_writes: MIN_CAMERA_WRITES, travel_px: MIN_TRAVEL_PX - 0.1, frame_p95_ms: 3000 }), spire: place() } }), { official: true }).some((m) => /did not move the camera/.test(m)), true, "5 writes but 59.9 px is invalid");
  const bad = (over) => sampleProblems(sample({ places: { town_centre: slow(over), spire: place() } }), { official: true });
  assert.deepEqual(bad({}), [], "a slow pan is not an invalidity");
  assert.equal(bad({ travel_px: 30 }).some((m) => /did not move the camera/.test(m)), true);
  assert.equal(bad({ frame_p95_ms: 50, longest_task_ms: 100 }).some((m) => /did not move the camera/.test(m)), true, "low observations below the bars are inert");
  // a caller's flag cannot make one: only the phase's own numbers do
  assert.equal(bad({ travel_px: 30, pan_stalled: true }).some((m) => /did not move the camera/.test(m)), true);
});

test("slow pans keep their raw numbers on the row, and every other failure still invalidates", () => {
  const tc = place({ camera_writes: 4, travel_px: 94.6, frame_p95_ms: 3316.5, longest_task_ms: 3305, frames: 9, long_tasks: 14 });
  const r = row([sample({ places: { town_centre: tc, spire: place() } }), sample(), sample()]);
  assert.equal(r.valid, true, r.invalid.join("; "));
  assert.deepEqual(r.pan_stalled, [{ sample: 1, place: "town_centre", camera_writes: 4, travel_px: 94.6, frame_p95_ms: 3316.5, longest_task_ms: 3305, frames: 9, long_tasks: 14 }]);
  const wrongFrame = row([sample({ places: { town_centre: tc, spire: place() }, version_after: versionOf({ ...BUILD, world_sha: "other" }) }), sample(), sample()]);
  assert.equal(wrongFrame.valid, false, "a mixed frame still invalidates a slow pan");
  const notThere = row([sample({ places: { town_centre: { ...tc, located: false }, spire: place() } }), sample(), sample()]);
  assert.equal(notThere.valid, false);
  assert.equal(row([sample({ places: { town_centre: { ...tc, still_in_view: false }, spire: place() } }), sample(), sample()]).valid, false);
});

// ── C: exact, and censored ─────────────────────────────────────────────────────────────────────────────────

test("C exact: an early quiet window stops the watching; the BUDGET is stated apart from the window actually observed and counted", () => {
  const r = observeInteractive([[9000, 300], [9500, 400], [20_000, 100], [60_000, 500]], 9000);
  assert.equal(r.interactive_ms, 9900, "quiet from the end of the first burst (9500 + 400) to the next task");
  assert.equal(r.interactive_censored, null);
  const o = r.interactive_observation;
  assert.deepEqual([o.from_ms, o.budget_ms, o.budget_until_ms, o.quiet_window_ms], [9000, INTERACTIVE_BOUND_MS, 9000 + INTERACTIVE_BOUND_MS, QUIET_MS], "the budget, by the page's clock, with the 2 s window");
  assert.equal(o.first_quiet_start_ms, 9900);
  assert.equal(o.observed_to_ms, 9900 + QUIET_MS, "what the answer rested on: through the end of its own 2 s window, not the unspent 180 s");
  assert.equal(o.observed_ms, 9900 + QUIET_MS - 9000);
  assert.equal("last_start_tried_ms" in o, false, "no 'latest start tried' in the unspent future of an exact C");
  assert.equal(o.count, 2, "only the tasks inside the window actually observed are counted (the ones at 20 s and 60 s are after it)");
  assert.equal(o.total_ms, 300 + 400);
});

test("C censored: no 2 s window inside the bound is `>N s (never quiet: K long tasks, L ms total in the window)`, with its bound, reason and counts", () => {
  const lt = Array.from({ length: 400 }, (_, i) => [9000 + i * 450, 120]);                   // a task every 450 ms for 180 s
  const r = observeInteractive(lt, 9000);
  assert.equal(r.interactive_ms, null, "no number is invented");
  const c = r.interactive_censored;
  assert.equal(c.gt_ms, 9000 + INTERACTIVE_BOUND_MS - QUIET_MS, "C is more than the last start tried");
  assert.equal(c.long_tasks, 400);
  assert.equal(c.long_task_ms, 400 * 120);
  assert.equal(c.text, `>187.0 s (never quiet: 400 long tasks, 48000 ms total in the window)`);
  assert.match(c.reason, /no 2 s window without a long task began between map shown/);
  const o = r.interactive_observation;
  assert.equal(o.count, 400, "the window's long-task evidence is kept");
  assert.equal(o.longest.length, 5);
  assert.equal(o.observed_to_ms, o.budget_until_ms, "a censored sample has used the whole budget");
  assert.equal(o.observed_ms, INTERACTIVE_BOUND_MS);
  assert.equal(o.last_start_tried_ms, 9000 + INTERACTIVE_BOUND_MS - QUIET_MS);
});

test("the lookahead is inside the bound: a quiet window that would only END after the bound is censored, not exact", () => {
  // a task every 1.5 s keeps the page from ever being quiet for 2 s, up to +177 s; the last one ends at +177.1 s
  const dense = Array.from({ length: 119 }, (_, i) => [9000 + i * 1500, 100]);                   // 9000 … 9000+177 000
  const exact = observeInteractive(dense, 9000);
  assert.equal(exact.interactive_ms, 9000 + 177_000 + 100, "quiet from +177.1 s; its 2 s window ends at +179.1 s, inside the 180 s bound");
  // one more task at +178.4 s: the quiet could only begin at +178.5 s, so its 2 s window would end at +180.5 s, past the bound
  const late = observeInteractive([...dense, [9000 + 178_400, 100]], 9000);
  assert.equal(late.interactive_ms, null, "a window that would end after the bound is not seen: censored, not exact");
  assert.equal(late.interactive_censored.gt_ms, 9000 + INTERACTIVE_BOUND_MS - QUIET_MS);
});

test("C across samples is by INTERVAL: a censored bound is relative to its own sample's map-shown time, so it need not exceed an exact C", () => {
  const ex = (ms) => ({ interactive_ms: ms, interactive_censored: null });
  const ce = (gt) => ({ interactive_ms: null, interactive_censored: { gt_ms: gt, long_tasks: 10, long_task_ms: 1000, text: `>${gt / 1000} s` } });
  const iv = (s, k) => [s[k], s[`${k}_lower_ms`], s[`${k}_lower_strict`], s[`${k}_upper_ms`]];
  const all = interactiveSummary([ex(30_000), ex(10_000), ex(20_000)]);
  assert.deepEqual(iv(all, "median"), [20_000, 20_000, false, 20_000]); assert.equal(all.n_censored, 0); assert.equal(all.median_censored, false);
  assert.deepEqual([all.min, all.max], [10_000, 30_000]);
  // a censored bound well above every exact value: the middle is the larger exact, exactly as the plain case; the max is unbounded
  const one = interactiveSummary([ex(30_000), ce(178_000), ex(10_000)]);
  assert.equal(one.median, 30_000);
  assert.deepEqual(iv(one, "max"), [null, 178_000, true, null], "the max is more than 178 s and has no upper bound");
  assert.equal(one.min, 10_000); assert.equal(one.n_censored, 1);
  // THE LEAD'S CASE [10 s, 184 s, >182 s]: the median is the smaller of 184 and X>182, so it lies in (182, 184] — no exact value is established
  const lead = interactiveSummary([ex(10_000), ex(184_000), ce(182_000)]);
  assert.equal(lead.median, null, "184 s is not established as the median");
  assert.deepEqual(iv(lead, "median"), [null, 182_000, true, 184_000]);
  assert.equal(lead.median_censored, true);
  assert.deepEqual(iv(lead, "max"), [null, 184_000, false, null], "the max is at least 184 s (X could be smaller or larger), unbounded above");
  assert.equal(lead.min, 10_000);
  // overlapping bounds: [>182 s, >185 s, 184 s] — the median is at least 184 s (184 if X<184, else the smaller of X and Y), unbounded above
  const overlap = interactiveSummary([ce(182_000), ce(185_000), ex(184_000)]);
  assert.deepEqual(iv(overlap, "median"), [null, 184_000, false, null]);
  assert.deepEqual(iv(overlap, "min"), [null, 182_000, true, 184_000], "the min is between >182 s and 184 s");
  // two censored beside one exact: the middle is censored; no median over the finite subset
  const two = interactiveSummary([ex(10_000), ce(178_000), ce(177_000)]);
  assert.equal(two.median, null, "no finite-subset median");
  assert.deepEqual(iv(two, "median"), [null, 177_000, true, null]);
  assert.match(two.text, /2 of 3 samples censored/);
  assert.match(two.text, /median >177000 ms/);
  const three = interactiveSummary([ce(178_000), ce(177_000), ce(179_000)]);
  assert.deepEqual(iv(three, "median"), [null, 178_000, true, null]);
  assert.equal(interactiveSummary([ex(1), { interactive_ms: null, interactive_censored: null }]), null, "a sample with neither is a gap: no summary at all");
  assert.equal(interactiveSummary([ex(5_000), ex(5_000), ce(5_000)]).median, 5_000, "a tie with an exact value: the lower bound is the exact one, the censored one is above it");
});

test("the cold-load bytes name their cutoff: C when reached, the end of the observation when it was not", () => {
  assert.deepEqual(bytesCutoff(sample()), { at_ms: 12000, basis: "interactive" });
  const c = censored();
  assert.deepEqual(bytesCutoff(c), { at_ms: 9000 + INTERACTIVE_BOUND_MS, basis: "observation_end" });
  const r = row([sample(), censored(), sample()]);
  assert.equal(r.metrics.bytes_cold_load_encoded.basis, "mixed");
  assert.deepEqual(r.metrics.bytes_cold_load_encoded.cutoffs.map((x) => x.basis), ["interactive", "observation_end", "interactive"]);
  assert.equal(row([censored(), censored(), censored()]).metrics.bytes_cold_load_encoded.basis, "observation_end");
});

test("windowTasks clips to the window and keeps the five longest", () => {
  const w = windowTasks([[0, 500], [900, 200], [1500, 50], [3000, 100]], 1000, 2000);
  assert.equal(w.count, 2, "the task ending at 500 and the one starting at 3000 are outside");
  assert.equal(w.total_ms, 100 + 50, "the 900-1100 task counts only the 100 ms inside the window");
  assert.equal(w.max_ms, 200);
});

// ── the rows ────────────────────────────────────────────────────────────────────────────────────────────────

test("a complete, well-placed, panned, single-frame sample is valid, and three of them make a valid row with medians", () => {
  assert.deepEqual(sampleProblems(sample(), { official: true }), []);
  const r = row([sample({ map_shown_ms: 9000 }), sample({ map_shown_ms: 7000 }), sample({ map_shown_ms: 8000 })]);
  assert.equal(r.valid, true, r.invalid.join("; "));
  assert.equal(r.metrics.map_shown_ms.median, 8000);
  assert.deepEqual([r.metrics.map_shown_ms.min, r.metrics.map_shown_ms.max], [7000, 9000]);
  assert.equal(r.metrics.places.spire.pan_frame_p95_ms.median, 33);
  assert.equal(r.metrics.interactive_ms.median, 12000, "exact C: the old behaviour, a plain median");
  assert.equal(r.censored, false);
  assert.deepEqual(Object.keys(r.frame), FRAME_KEYS, "the row says what frame it was measured on");
});

test("A CENSORED SAMPLE COUNTS: the row stays valid, keeps all three samples, and the other phases are real numbers", () => {
  const r = row([sample(), censored(), sample()]);
  assert.equal(r.valid, true, r.invalid.join("; "));
  assert.equal(r.censored, true);
  assert.equal(r.samples.length, 3, "the censored sample is in the three-sample result");
  assert.equal(r.metrics.interactive_ms.n_censored, 1);
  assert.equal(r.metrics.interactive_ms.median, 12000, "middle by rank is exact; no median over the finite subset");
  assert.equal(r.metrics.idle_busy_pct.median, 8, "idle, heap, both pans and the bytes still ran and still count");
  assert.equal(r.metrics.heap_after_gc_mib.median, 60);
  assert.equal(r.metrics.places.town_centre.pan_frame_p95_ms.samples.length, 3);
  const mostly = row([censored(), censored(), sample()]);
  assert.equal(mostly.valid, true, mostly.invalid.join("; "));
  assert.equal(mostly.metrics.interactive_ms.median, null);
  assert.equal(mostly.metrics.interactive_ms.median_censored, true);
  assert.equal(mostly.samples[0].interactive_censored.text.startsWith(">"), true);
});

test("FALSIFIERS — each of these makes the row INVALID, never a baseline", () => {
  const bad = (s, re) => {
    const r = row([sample(), sample(), s]);
    assert.equal(r.valid, false);
    assert.ok(r.invalid.some((m) => re.test(m)), `${re}: ${r.invalid.join("; ")}`);
  };
  bad(sample({ places: { town_centre: place(), spire: place({ located: false }) } }), /spire: the place was not under the middle/);   // the wrong location
  bad(sample({ places: { town_centre: place({ camera_writes: 0, travel_px: 0 }), spire: place() } }), /town_centre: the drag did not move the camera/);   // no actual pan
  bad(sample({ places: { town_centre: place({ camera_writes: 1, travel_px: 0 }), spire: place() } }), /town_centre: the drag did not move the camera \(1 writes, 0 px\)/);   // the 11-20 inert drags
  bad(sample({ places: { town_centre: place(), spire: place({ scale_ok: false, scale: 0.4 }) } }), /spire: the camera was not at the common scale/);
  bad(sample({ places: { town_centre: place(), spire: place({ still_in_view: false }) } }), /spire: the place had left the screen/);
  bad(sample({ places: { town_centre: place() } }), /spire: not measured/);                                                          // an unsupported / skipped measurement
  bad(sample({ map_shown_ms: null }), /the map was never shown/);                                                                   // a failed phase
  bad(sample({ interactive_ms: null, interactive_censored: null }), /neither measured nor censored/);                                // C with no value AND no censoring
  bad(sample({ interactive_ms: null, interactive_censored: { gt_ms: NaN } }), /neither measured nor censored/);                      // a malformed censoring
  bad(sample({ error: "page.click: Timeout 30000ms exceeded." }), /phase failed/);                                                  // a missing selector
  bad(sample({ failed_requests: ["404 https://postmark.town/WORLD/world-state.json"] }), /failed requests/);                        // a failed cold load
  bad(sample({ bytes_cold_load_encoded: 0 }), /no cold-load bytes/);
  bad(sample({ bytes_basis: undefined }), /byte cutoff is unstated/);
  bad(sample({ visibility: "hidden" }), /not visible/);
  bad(sample({ version_after: versionOf({ ...BUILD, world_sha: "w2" }) }), /mixed frame/);                                           // the World moved under the sample
  bad(sample({ version_after: versionOf({ ...BUILD, code_sha: "c2" }) }), /mixed frame/);                                            // the Site release moved under the sample
  bad(sample({ version_before: null, version_after: null }), /build\.json was unavailable/);
  const r = row([sample(), sample(), sample({ idle_busy_pct: NaN })]);
  assert.equal(r.valid, false);
  assert.equal(r.metrics.idle_busy_pct, null, "a gap in one sample leaves the median null, it is not computed over two");
  assert.ok(r.invalid.some((m) => /no value for idle_busy_pct/.test(m)));
  // a censored C does not excuse a truly failed phase beside it
  const c = row([sample(), censored({ places: { town_centre: place({ camera_writes: 0, travel_px: 0 }), spire: place() } }), sample()]);
  assert.equal(c.valid, false);
  assert.ok(c.invalid.some((m) => /town_centre: the drag did not move the camera/.test(m)));
});

test("an unofficial run (another origin, other sample count) is flagged so; its version is not required", () => {
  const s = sample({ version_before: null, version_after: null });
  assert.deepEqual(sampleProblems(s, { official: false }), []);
  assert.equal(row([s], false).official, false);
});

// ── the comparator: the rendered frame, not the town's freshness ─────────────────────────────────────────────

test("TOWN FRESHNESS ALONE DOES NOT INVALIDATE: town_sha, town_data_sha and the crossing may move; the World snapshot and Site release may not", () => {
  const moved = versionOf({ ...BUILD, town_sha: "t2", town_data_sha: "d2", crossing: 324, town_index_as_of: "i2" });
  assert.deepEqual(freshnessMoved(versionOf(BUILD), moved).sort(), [...FRESHNESS_KEYS].sort());
  assert.equal(sameFrame(versionOf(BUILD), moved), true);
  assert.equal(sameVersion(versionOf(BUILD), moved), true);
  const s = sample({ version_after: moved, freshness_moved: freshnessMoved(versionOf(BUILD), moved) });
  assert.deepEqual(sampleProblems(s, { official: true }), [], "a sample the town moved under is still valid");
  const r = row([sample(), s, sample({ version_before: moved, version_after: moved })]);
  assert.equal(r.valid, true, r.invalid.join("; "));
  assert.equal(r.freshness_varied, true, "the row says the town moved, as provenance");
  assert.equal(row([sample(), sample(), sample()]).freshness_varied, false);
  // …but each key of the FRAME is a real change of the thing measured
  for (const k of FRAME_KEYS) {
    const other = versionOf({ ...BUILD, [k]: "x-" + k });
    assert.equal(sameFrame(versionOf(BUILD), other), false, k);
    const m = row([sample(), sample({ version_before: other, version_after: other }), sample()]);
    assert.equal(m.valid, false, k);
    assert.ok(m.invalid.some((x) => /mixed frame across the audit town and samples/.test(x)), k);
  }
  assert.equal(sameFrame(null, versionOf(BUILD)), false);
});

test("THE RELEASE TAGS ARE PROVENANCE, NOT IDENTITY: the Site stamps `ref || null`, so a null or renamed code_ref/world_ref with the same shas is the same frame", () => {
  assert.deepEqual(TAG_KEYS, ["code_ref", "world_ref"]);
  assert.equal(FRAME_KEYS.some((k) => TAG_KEYS.includes(k)), false, "no tag is a frame key");
  for (const tags of [{ code_ref: null, world_ref: null }, { world_ref: null }, { code_ref: "release/renamed", world_ref: "settlement/S183-renamed" }]) {
    const other = versionOf({ ...BUILD, ...tags });
    assert.equal(sameFrame(versionOf(BUILD), other), true, JSON.stringify(tags));
    const r = row([sample(), sample({ version_before: other, version_after: other }), sample()], true, { ...TOWN, ...tags });
    assert.equal(r.valid, true, `${JSON.stringify(tags)}: ${r.invalid.join("; ")}`);
    assert.deepEqual(r.tags, { code_ref: tags.code_ref !== undefined ? tags.code_ref : BUILD.code_ref, world_ref: tags.world_ref !== undefined ? tags.world_ref : BUILD.world_ref }, "recorded as provenance in the row");
  }
  // …while a changed sha under an unchanged (or null) label is a different frame
  const reshaped = versionOf({ ...BUILD, world_sha: "w2", world_ref: null });
  assert.equal(sameFrame(versionOf(BUILD), reshaped), false);
  assert.equal(sampleProblems(sample({ version_after: reshaped }), { official: true }).some((m) => /mixed frame/.test(m)), true);
});

// ── F1: the Town Centre's location test is NEAR the centre, not any pill ending in "of TC" ─────────────────────

test("F1 · the Town Centre is located only by the pill's DISTANCES: near the centre passes, the Spire's pill and any far camera do not", () => {
  const TC = PLACES.town_centre, SPIRE = PLACES.spire;
  assert.equal(NEAR_CENTRE_M, 500);
  assert.deepEqual(pillOffsetM("at TC · elevation +5 m"), { x: 0, y: 0 }, "exactly (0, 0)");
  assert.deepEqual(pillOffsetM("79 m N · 54 m W of TC · elevation +5 m"), { x: -54, y: -79 }, "north is -y, west is -x, as the page prints them");
  assert.deepEqual(pillOffsetM("5,512 m N · 3,843 m E of TC · elevation +60 m"), { x: 3843, y: -5512 }, "thousands separators");
  assert.deepEqual(pillOffsetM("40 m S of TC"), { x: 0, y: 40 }, "one axis when the other is zero");
  assert.equal(pillOffsetM(""), null); assert.equal(pillOffsetM("elevation +5 m"), null); assert.equal(pillOffsetM("12 m N"), null, "no 'of TC': not a position");
  // the row-1 evidence: all three TC samples read 79 m N · 54 m W (96 m from the centre)
  assert.equal(standingNear(TC, "79 m N · 54 m W of TC · elevation +5 m"), true);
  assert.equal(standingNear(TC, "at TC · elevation +5 m"), true);
  assert.equal(standingNear(TC, "300 m S · 300 m E of TC"), true, "424 m: inside the radius");
  assert.equal(standingNear(TC, "400 m S · 400 m E of TC"), false, "566 m: outside it");
  // THE VACUOUS CASE: the old /\bTC\b/ passed every one of these
  assert.equal(standingNear(TC, "5,512 m N · 3,843 m E of TC · elevation +60 m"), false, "the Spire's own pill is not the Town Centre");
  assert.equal(standingNear(TC, "25,000 m S · 40,000 m W of TC"), false, "a camera far across the map");
  assert.equal(standingNear(TC, ""), false);
  assert.equal(standingNear(SPIRE, "79 m N · 54 m W of TC"), false, "a place that declares no `near` is never located by the pill");
});

test("F1 · a Town Centre sample whose camera is elsewhere is not located and not 'still in view' by the pill alone", () => {
  // what measureSample does for both: `shape || standingNear(place, pill)` — with the Spire's pill the second term is false for the Town Centre
  const farPill = "5,512 m N · 3,843 m E of TC · elevation +60 m";
  assert.equal(centredWithin(null, { x: 0, y: 0, width: 1000, height: 800 }) || standingNear(PLACES.town_centre, farPill), false);
  const r = row([sample(), sample(), sample({ places: { town_centre: place({ located: false, still_in_view: false }), spire: place() } })]);
  assert.equal(r.valid, false);
  assert.ok(r.invalid.some((m) => /town_centre: the place was not under the middle/.test(m)));
  assert.ok(r.invalid.some((m) => /town_centre: the place had left the screen/.test(m)));
});

// ── F2: the page's data is /api/world/*; a read of the legacy export is a fallback, and a failure ANYWHERE in the sample counts ──

test("F2 · classifyRequests over the whole sample: API failures are the page's own, the legacy export is a fallback, and later phases count as much as the cold load", () => {
  const ok = (url, extra = {}) => ({ url, status: 200, type: "Fetch", ...extra });
  const good = [ok("https://postmark.town/world/", { type: "Document" }), ok("https://postmark.town/api/world/state"), ok("https://postmark.town/api/world/skeleton"), ok("https://postmark.town/api/world/walkers")];
  const clean = classifyRequests(good, { prod: true });
  assert.deepEqual([clean.failed_requests, clean.other_failed_requests, clean.legacy_data_requests], [[], [], []]);
  assert.deepEqual(clean.api_data, { state_ok: 1, skeleton_ok: 1 });
  // the 503-then-fallback case the review measured
  const fell = classifyRequests([...good.slice(0, 2), { url: "https://postmark.town/api/world/state", status: 503, type: "Fetch" }, ok("https://postmark.town/WORLD/world-state.json")].filter((r, i) => i !== 1), { prod: true });
  assert.ok(fell.failed_requests.some((f) => /503 .*\/api\/world\/state/.test(f)), "a failed API read is the page's OWN failure, not 'other'");
  assert.equal(fell.legacy_data_requests.length, 1, "the legacy export was read");
  assert.equal(fell.api_data.state_ok, 0);
  // a failure that happens late (an API re-read during the pans) is in the same list: the classification is over every request of the sample
  const late = classifyRequests([...good, { url: "https://postmark.town/api/world/state", status: 500, type: "Fetch" }], { prod: true });
  assert.equal(late.failed_requests.length, 1);
  // an unrelated failing request stays "other"
  const other = classifyRequests([...good, { url: "https://postmark.town/api/world/walkers", status: 500, type: "Fetch" }], { prod: true });
  assert.deepEqual([other.failed_requests.length, other.other_failed_requests.length], [0, 1]);
  // not the official origin: the legacy export IS the data there, and /api/world/* is not required
  const local = classifyRequests([ok("http://localhost:1/WORLD/world-state.json"), { url: "http://localhost:1/api/world/state", status: 404, type: "Fetch" }], { prod: false });
  assert.deepEqual([local.failed_requests, local.legacy_data_requests, local.api_data], [[], [], null]);
});

test("F2 · an official sample that fell back to the legacy export, or never read the API snapshot, is INVALID; the accepted row's samples (no such fields) are untouched", () => {
  const prodReqs = (extra) => classifyRequests([
    { url: "https://postmark.town/world/", status: 200, type: "Document" }, { url: "https://postmark.town/api/world/skeleton", status: 200, type: "Fetch" }, ...extra,
  ], { prod: true });
  const fallback = prodReqs([{ url: "https://postmark.town/api/world/state", status: 503, type: "Fetch" }, { url: "https://postmark.town/WORLD/world-state.json", status: 200, type: "Fetch" }]);
  const s = sample(fallback);
  const probs = sampleProblems(s, { official: true });
  assert.ok(probs.some((m) => /failed requests: 503 .*\/api\/world\/state/.test(m)), probs.join("; "));
  assert.ok(probs.some((m) => /fell back to the legacy WORLD export \(mixed population\)/.test(m)), probs.join("; "));
  assert.ok(probs.some((m) => /never read \/api\/world\/state and \/api\/world\/skeleton successfully/.test(m)), probs.join("; "));
  const r = row([sample(), sample(), s]);
  assert.equal(r.valid, false);
  // the fallback alone (the API read itself did not fail) is a mixed population too
  const alone = sample({ legacy_data_requests: ["200 https://postmark.town/WORLD/world-state.json"], api_data: { state_ok: 1, skeleton_ok: 1 } });
  assert.ok(sampleProblems(alone, { official: true }).some((m) => /legacy WORLD export/.test(m)));
  assert.deepEqual(sampleProblems(alone, { official: false }), [], "…but only on the official origin, where the API snapshot is the data");
  // a clean API sample, and a sample from before these fields existed, are valid
  assert.deepEqual(sampleProblems(sample({ legacy_data_requests: [], api_data: { state_ok: 4, skeleton_ok: 1 } }), { official: true }), []);
  assert.deepEqual(sampleProblems(sample(), { official: true }), [], "the accepted first row's samples carry neither field");
});

test("an official baseline requires a complete frame and town counts, not matching missing values", () => {
  for (const town of [null, { ...TOWN, marks: null }, { ...TOWN, parcels: null }, { ...TOWN, world_sha: null }, { ...TOWN, code_sha: null }, { ...TOWN, world_digest: null }, { ...TOWN, settlement: null }]) {
    const r = row([sample(), sample(), sample()], true, town);
    assert.equal(r.valid, false, JSON.stringify(town));
  }
  // freshness is provenance: an audit town that lacks it (or differs from the samples on it) is not refused for that
  assert.equal(row([sample(), sample(), sample()], true, { ...TOWN, town_sha: null, crossing: null }).valid, true);
});

test("versions compare on the frame; the repo path of a served URL is only for what the repo serves", () => {
  assert.equal(sameVersion(versionOf(BUILD), versionOf({ ...BUILD })), true);
  assert.equal(sameVersion(null, versionOf(BUILD)), false);
  assert.equal(repoPathOf("/world-engine/spectator/viewer.mjs?v=1"), "spectator/viewer.mjs");
  assert.equal(repoPathOf("/WORLD/world-state.json"), "WORLD/world-state.json");
  assert.equal(repoPathOf("/media/x.png"), null, "an image is not the repo's");
  assert.deepEqual(Object.keys(PLACES), ["town_centre", "spire"], "the two named places");
});
