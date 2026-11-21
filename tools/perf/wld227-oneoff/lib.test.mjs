// lib.test.mjs — the offline check of WLD-227's one-off capture: pure functions only. No browser, no network, no prod.
//   node --test tools/perf/wld227-oneoff/lib.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  pinProblems, minutesToNearestBoundary, clearOfCrossings, parsePill, nearCentre, centredWithin, sameScale, dragMoved, rssMiB,
  frameKind, sampleSpans, attribute, phaseWindows, BASELINE_SCALE,
} from "./lib.mjs";

const SHA = "a".repeat(40), OTHER = "b".repeat(40);

test("the pin: the run is the reviewed commit on a clean tree, by the full sha, never a prefix", () => {
  assert.deepEqual(pinProblems({ go: SHA, head: SHA, porcelain: "" }), []);
  assert.match(pinProblems({ go: SHA, head: OTHER, porcelain: "" })[0], /is not the reviewed commit/);
  assert.match(pinProblems({ go: SHA.slice(0, 7), head: SHA, porcelain: "" })[0], /full 40-hex/, "a short sha is a refusal");
  assert.match(pinProblems({ go: undefined, head: SHA, porcelain: "" })[0], /full 40-hex/);
  assert.match(pinProblems({ go: SHA, head: SHA, porcelain: " M tools/x.mjs" }).join(), /not clean/, "a dirty tree is not the committed script");
  assert.match(pinProblems({ go: SHA, head: null, porcelain: "" }).join(), /could not be read/);
});

test("the clock: the whole bounded run lies twenty minutes clear of every 00/06/12/18 Z boundary", () => {
  const z = (h, m) => Date.UTC(2026, 10, 21, h, m);
  assert.equal(minutesToNearestBoundary(z(6, 0)), 0);
  assert.equal(minutesToNearestBoundary(z(5, 40)), 20);
  assert.equal(Math.round(minutesToNearestBoundary(z(23, 50))), 10, "the next day's 00:00 counts");
  assert.equal(clearOfCrossings(z(7, 0)), true, "07:00-07:10 is clear of 06:00 and 12:00");
  assert.equal(clearOfCrossings(z(6, 10)), false, "ten minutes after a settlement is not twenty");
  assert.equal(clearOfCrossings(z(5, 45)), false, "a run that would end past 05:55 meets the 06:00 settlement inside its clear margin");
  assert.equal(clearOfCrossings(z(6, 20)), true, "twenty minutes after, with ten minutes of run, is clear");
  assert.equal(clearOfCrossings(z(11, 35)), false, "a run ending 11:45 is inside twenty minutes of 12:00");
  assert.equal(clearOfCrossings(z(11, 10)), true);
});

test("the place: 'of TC' is on every pill, so it is parsed, and only a position near the origin whose shape is under the middle of the map is the Town Centre", () => {
  assert.deepEqual(parsePill("79 m N · 54 m W of TC · elevation +5 m"), { x: -54, y: -79 }, "the audit's own row-1 pill: N is northward (y negative), W is west (x negative)");
  assert.deepEqual(parsePill("at TC"), { x: 0, y: 0 });
  assert.deepEqual(parsePill("5,512 m N · 3,843 m E of TC · elevation +60 m"), { x: 3843, y: -5512 }, "thousands separators");
  assert.deepEqual(parsePill("120 m S of TC"), { x: 0, y: 120 }, "one axis only");
  assert.equal(parsePill(""), null);
  assert.equal(parsePill("somewhere else"), null);
  const centred = true;
  assert.equal(nearCentre("79 m N · 54 m W of TC", { centred }).ok, true);
  assert.equal(nearCentre("5,512 m N · 3,843 m E of TC · elevation +60 m", { centred }).ok, false, "the Spire's pill says 'of TC' too: it is NOT the Town Centre");
  assert.equal(nearCentre("79 m N · 54 m W of TC", { centred: false }).ok, false, "near by the pill but the shape is not under the middle of the map: not placed");
  assert.equal(nearCentre("", { centred }).ok, false);
  assert.equal(nearCentre("at TC", { centred }).metres, 0);
});

test("the geometry helpers behave as the audit's did", () => {
  const pane = { x: 0, y: 0, width: 1000, height: 600 };
  assert.equal(centredWithin({ x: 480, y: 280, width: 40, height: 40 }, pane), true);
  assert.equal(centredWithin({ x: 100, y: 100, width: 40, height: 40 }, pane), false);
  assert.equal(centredWithin(null, pane), false);
  assert.equal(sameScale(BASELINE_SCALE * 1.05, BASELINE_SCALE), true);
  assert.equal(sameScale(BASELINE_SCALE * 1.2, BASELINE_SCALE), false);
  assert.equal(dragMoved({ writes: 8, travelPx: 236 }), true, "the audit's row-1 drag at the Town Centre moved the camera");
  assert.equal(dragMoved({ writes: 2, travelPx: 236 }), false);
  assert.equal(dragMoved({ writes: 8, travelPx: 10 }), false);
});

test("the memory watchdog reads VmRSS from /proc status text", () => {
  assert.equal(rssMiB("Name:\tchrome\nVmRSS:\t  2097152 kB\nThreads:\t4\n"), 2048);
  assert.equal(rssMiB("Name:\tx\n"), 0);
  assert.equal(rssMiB(undefined), 0);
});

// a small invented profile: root -> program, idle, gc, native "memcpy", a minified file's `a` and `b`, with b calling a (and a recursing)
const nodes = [
  { id: 1, callFrame: { functionName: "(root)", url: "" }, children: [2, 3, 4, 5, 6] },
  { id: 2, callFrame: { functionName: "(program)", url: "" } },
  { id: 3, callFrame: { functionName: "(idle)", url: "" } },
  { id: 4, callFrame: { functionName: "(garbage collector)", url: "" } },
  { id: 5, callFrame: { functionName: "memcpy", url: "" } },
  { id: 6, callFrame: { functionName: "b", url: "https://x.test/app.min.js", lineNumber: 0, columnNumber: 4000 }, children: [7] },
  { id: 7, callFrame: { functionName: "a", url: "https://x.test/app.min.js", lineNumber: 0, columnNumber: 100 }, children: [8] },
  { id: 8, callFrame: { functionName: "a", url: "https://x.test/app.min.js", lineNumber: 0, columnNumber: 100 } },
  { id: 9, callFrame: { functionName: "", url: "" } },
];
// 1 ms per sample: idle x4, then a x2, b x1, memcpy x1, gc x1, program x1, a(recursive, node 8) x1, anonymous-no-file x1
const profile = { nodes,
  startTime: 1_000_000, endTime: 1_000_000 + 12_000,
  samples: [3, 3, 3, 3, 7, 7, 6, 5, 4, 2, 8, 9], timeDeltas: [0, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000] };

test("frames are told apart: named buckets, native, unattributed, and js with a file", () => {
  assert.deepEqual(["(idle)", "(program)", "(garbage collector)", "(root)"].map((n) => frameKind({ functionName: n, url: "" })), ["idle", "program", "gc", "root"]);
  assert.equal(frameKind({ functionName: "memcpy", url: "" }), "native");
  assert.equal(frameKind({ functionName: "", url: "" }), "unattributed");
  assert.equal(frameKind({ functionName: "a", url: "https://x.test/app.min.js" }), "js");
});

test("each sample counts for the time until the next, the last until endTime", () => {
  const spans = sampleSpans(profile);
  assert.equal(spans.length, 12);
  assert.deepEqual([spans[0].t0, spans[0].t1], [1_000_000, 1_001_000]);
  assert.equal(spans.at(-1).t1, 1_012_000, "the last sample runs to the profile's end");
});

test("attribution: self time by function and file, the buckets said as buckets, no name invented for a minified file", () => {
  const all = attribute(profile, { fromUs: profile.startTime, toUs: profile.endTime });
  assert.equal(all.window_ms, 12);
  assert.deepEqual(all.buckets_ms, { idle: 4, program: 1, gc: 1, native: 1, unattributed: 1, js: 4, root: 0 });
  assert.equal(all.busy_ms, 8, "busy is the window without (idle)");
  const [a, b] = all.top_functions;
  assert.equal(a.key, "a @ https://x.test/app.min.js:1:101", "the function as the file says it, with its line and column");
  assert.deepEqual([a.self_ms, b.self_ms], [3, 1], "a: two samples on the node and one on its recursive twin, all the same function");
  assert.equal(a.pct_of_window, 25); assert.equal(a.pct_of_busy, 37.5);
  assert.equal(a.inclusive_ms, 3, "inclusive counts a recursive function once per sample");
  assert.equal(b.inclusive_ms, 4, "b's own sample plus the three samples spent in a, which b calls");
  assert.deepEqual(all.top_files.map((f) => [f.key, f.self_ms]), [["https://x.test/app.min.js", 4]]);
  assert.match(all.definition, /clipped to the window/);
});

test("attribution is clipped to the window: the idle phase and the pan phase are different questions", () => {
  const idle = attribute(profile, { fromUs: 1_000_000, toUs: 1_004_000 });
  assert.equal(idle.window_ms, 4);
  assert.equal(idle.buckets_ms.idle, 4, "the first four samples are the untouched page waiting");
  assert.deepEqual(idle.top_functions, []);
  const pan = attribute(profile, { fromUs: 1_004_500, toUs: 1_012_000 });
  assert.equal(pan.window_ms, 7.5, "a sample half inside the window counts for its half");
  assert.equal(pan.buckets_ms.idle, 0);
  assert.equal(attribute({ nodes: [], samples: [], timeDeltas: [], startTime: 0, endTime: 0 }).top_functions.length, 0, "no profile, no culprit");
});

test("the phase windows ride the node-side wall clock from the profiler start, and the clocks' agreement is said", () => {
  const marks = { profile_start: { wall: 100 }, idle_end: { wall: 110 }, pan_start: { wall: 110 }, pan_end: { wall: 120.1 }, profile_stop: { wall: 120.2 } };
  const p = { startTime: 5_000_000, endTime: 5_000_000 + 20_150_000 };
  const w = phaseWindows({ profile: p, marks });
  assert.deepEqual(w.idle, { fromUs: 5_000_000, toUs: 15_000_000 });
  assert.deepEqual(w.pan, { fromUs: 15_000_000, toUs: 25_100_000 });
  assert.equal(w.skew_ms, 50);
  assert.equal(w.within_tolerance, true);
  const off = phaseWindows({ profile: { startTime: 0, endTime: 30_000_000 }, marks });
  assert.equal(off.within_tolerance, false, "a profile much longer or shorter than the wall time between start and stop is named, not trusted");
});
