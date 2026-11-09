// settlement-test-world.test.mjs — the suite reads the CANDIDATE world (WLD-119; the S131 lesson, world#309 / #310).
//
//   node --test tools/settlement-test-world.test.mjs
//
// WHAT IS PINNED. tools/settlement-test-world.mjs folds this tree as the sweep's final fold does and puts the result
// where some fifty test files read the world (WORLD/world-state.json), `npm test`'s pretest, before any test. Without
// it a pull request that adds marks is graded against the last crossing's snapshot, which does not have them: S131,
// world#309's seven sweets passed merge CI and went red at the sweep (the creatures' keep, the Lately rail).
//
//   1 · THE S131 SHAPE, on an invented added mark in a scratch copy of this tree: before preparation the world the
//       tests read lacks it (the control, and the very predicate the gate asks), after it holds it, the town's keep
//       read from that world grows by it, and the Lately rail (#310's existing UTC-day holdback, read here, not
//       changed) still waits for its day. The pair is the discrimination: supplying the stale snapshot, or bypassing
//       preparation, leaves the predicate red by name.
//   2 · IT FAILS, NEVER FALLS BACK: no state to derive stakes from, and a mark the loader refuses, each throw (the
//       CLI exits 2, with the sentinel) and leave the committed state byte for byte as it was.
//   3 · THE WIRING, a source pin (labelled): package.json's pretest runs it, `npm test` itself and the candle's
//       selector are untouched.
//   4 · THE REAL TREE: the world this suite is reading holds every mark of this tree. Under `npm test` the pretest makes
//       that true; a bare `node --test` on a pull request that added marks, with no preparation, is red here by name.
//
// INVENTED DATA throughout (one invented mark, an invented handle). B1's invented behaviour fixtures (#361) and the
// actual-world artifact guards (tools/containment-committed.test.mjs) are untouched: this prepares only the fold.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COMPOSITE, REFUSAL_SENTINEL, STATE_REL, missingFromState, prepareCandidateWorld } from "./settlement-test-world.mjs";
import { mistsKeepRects } from "./mists-keep.mjs";
import { activityFeed } from "../spectator/viewer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

/** a scratch copy of this tree's tools/ and WORLD/ (all a fold needs), never the tree itself */
function scratchTree() {
  const dir = mkdtempSync(join(tmpdir(), "wld119-test-"));
  for (const d of ["tools", "WORLD"]) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
  return dir;
}
const ADDED = { by: "invented-sweeter", slug: "a-sweet-on-the-clear-ground" };
const ADDED_ID = `${ADDED.by}/${ADDED.slug}`;
const ADDED_DATE = "2026-11-10T12:00:00.000Z";   // the day after `EVE`, as world#309's sweets were dated the day after S131's evening
const EVE = "2026-11-09T23:59:59.999Z";
function addMark(dir, body = `---\nkind: parcel\nby: ${ADDED.by}\ndate: ${ADDED_DATE}\nat: { x: 6000, y: 6000 }\nextent: { w: 25, h: 25 }\n---\n\nAn invented sweet, for the test.\n`) {
  const d = join(dir, "WORLD", "marks", ADDED.by, ADDED.slug);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "mark.md"), body);
}
const stateOf = (dir) => JSON.parse(readFileSync(join(dir, STATE_REL), "utf8"));
const MISTS = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8")).mists;
/** the town's keep as the creatures' tests read it (tools/creatures.test.mjs keepAt, without the Mists): one rect per sited mark's reach */
const keepOf = (state) => mistsKeepRects(state.marks, MISTS.clearings_m, 440);

test("THE S131 SHAPE: an added mark is absent from the world the suite would read, present once the candidate world is prepared, and regenerates the keep", () => {
  const dir = scratchTree();
  addMark(dir);
  // the control, and the gate's own predicate: the tree has the mark, the committed world does not
  const stale = stateOf(dir);
  assert.deepEqual(missingFromState(dir).notInState, [ADDED_ID], "the stale snapshot lacks the added mark: this is what a bypassed preparation leaves the tests reading");
  assert.equal(stale.marks.some((m) => m.id === ADDED_ID), false);
  const keepBefore = keepOf(stale).length;
  const committedFiles = ["WORLD/containment.json", "WORLD/INDEX.md", "WORLD/region-outsiders.json", "WORLD/region-outsiders.md"].filter((f) => existsSync(join(dir, f)));
  const guarded = new Map(committedFiles.map((f) => [f, sha(join(dir, f))]));

  const receipt = prepareCandidateWorld({ repo: dir });

  const prepared = stateOf(dir);
  assert.deepEqual(missingFromState(dir), { notInState: [], notInTree: [] }, "after preparation the world holds every mark of the tree, and none it does not carry");
  const mark = prepared.marks.find((m) => m.id === ADDED_ID);
  assert.ok(mark, "the added mark is in the world the tests read");
  assert.equal(prepared.marks.length, stale.marks.length + 1, "exactly one mark more: the candidate's contribution, nothing else added or dropped");
  assert.equal(typeof mark.weight, "number", "folded, not copied: it carries the fold's own fields");
  assert.equal(keepOf(prepared).length, keepBefore + 1, "the keep the creatures' tests read grows by the added mark's reach (S131's stale keep)");
  // the receipt binds what it is and what it did not do
  assert.equal(receipt.kind, COMPOSITE);
  assert.match(receipt.kind, /public git composite/);
  assert.match(receipt.kind, /not a store read/);
  assert.deepEqual(receipt.candidate_contribution, { marks_not_in_the_committed_state: 1, first: [ADDED_ID] });
  assert.equal(receipt.folded.marks, prepared.marks.length);
  assert.equal(receipt.state_file.prepared_sha256, createHash("sha256").update(readFileSync(join(dir, STATE_REL))).digest("hex"));
  assert.notEqual(receipt.state_file.prepared_sha256, receipt.state_file.committed_sha256);
  // only the state the tests read was written: the pull request's own committed derived files stay judged by their own guards
  for (const [f, was] of guarded) assert.equal(sha(join(dir, f)), was, `${f} is the pull request's, not ours`);
  // #310's UTC-day holdback is READ here, not changed: the prepared mark waits for its day on the Lately rail
  const rows = (now) => activityFeed({ marks: [{ id: mark.id, date: mark.date, by: mark.by }], now, limit: 10 }).rows.map((r) => r.subject);
  assert.deepEqual(rows(EVE), [], "the evening before its day, the candidate mark is not on the rail (S131's other red)");
  assert.deepEqual(rows(ADDED_DATE), [ADDED_ID], "on its day it is");
});

test("it fails and never falls back: no committed fold to take the stakes from, and a fold that dies, each leave the state as it was", () => {
  // 1 · no state
  const none = scratchTree();
  writeFileSync(join(none, STATE_REL), "{ not json");
  assert.throws(() => prepareCandidateWorld({ repo: none }), /unreadable/);
  assert.equal(readFileSync(join(none, STATE_REL), "utf8"), "{ not json", "the refused run did not write over it");
  // the CLI's door: exit 2, the sentinel, and its own words
  const cli = spawnSync(process.execPath, [join(ROOT, "tools", "settlement-test-world.mjs"), none], { encoding: "utf8" });
  assert.equal(cli.status, 2, "a refusal is exit 2: npm test stops before a test runs");
  assert.match(cli.stderr, new RegExp(REFUSAL_SENTINEL));
  assert.match(cli.stderr, /REFUSED/);
  // 2 · a fold that dies (the loader is lenient about a bad mark, so the dying is the fold's own: this tree's fold script throws)
  const bad = scratchTree();
  addMark(bad);
  const fold = join(bad, "tools", "marks-fold.mjs");
  writeFileSync(fold, readFileSync(fold, "utf8") + "\nthrow new Error('an invented fold failure');\n");   // after the fold has run, so it dies having written its scratch outputs
  const before = sha(join(bad, STATE_REL));
  assert.throws(() => prepareCandidateWorld({ repo: bad }), /the fold of this tree exited 1.*an invented fold failure/s, "the failure is the fold's own, named");
  assert.equal(sha(join(bad, STATE_REL)), before, "the committed state is untouched: no stale fallback is substituted and none is half-written");
  // the control: the same tree with a working fold prepares (a refusal above is the fold's, not the harness's)
  const fine = scratchTree();
  assert.equal(prepareCandidateWorld({ repo: fine }).candidate_contribution.marks_not_in_the_committed_state, 0, "an unchanged tree is a no-op contribution");
});

test("[pin] npm test prepares the candidate world first (pretest), and neither npm test's selector nor the candle's changed", () => {
  const scripts = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts;
  assert.equal(scripts.pretest, "node tools/settlement-test-world.mjs", "npm runs this before `npm test`, in the required suite's existing route");
  assert.equal(scripts.test, 'node --test "tools/*.test.mjs"', "the blocking suite's selector is as it was");
  assert.equal(scripts["test:candle"], "node tools/run-candle-suites.mjs", "the crossing's own gate does not prepare: its sweep has just folded the world");
  assert.equal(/pretest|settlement-test-world/.test(scripts["test:candle"] + scripts.gate), false);
});

test("THE REAL TREE: the world this suite reads holds every mark of this tree (a bare run on a stale snapshot is red here, by name)", () => {
  const gap = missingFromState(ROOT);
  assert.deepEqual(gap.notInState, [], "marks in this tree that WORLD/world-state.json does not hold: run `node tools/settlement-test-world.mjs` (npm test does, first)");
  assert.deepEqual(gap.notInTree, [], "marks the world holds that this tree does not carry");
});
