// occupancy-order.test.mjs — THE ORDER RULE (POS-618, 2026-10-14): occupancy
// folds the acts in the order the record WROTE them, and `ferry` only says from
// which clock a row counts. The rule is written at enter-exit.mjs § occupancyAt.
//
// The rows below are the live ledger's own lines, verbatim (GET
// /api/world/enter-exit-ledger, fetched 2026-10-14T04:20Z; the whole read is in
// Starstory docs/2026-10-13/rail/POS-618/). They are the two walkers whose
// answers a ferry-sorted fold would move, and in both the written order is the
// truer answer. Each case also folds the same rows sorted by ferry and asserts
// the answer differs, so the fixture can tell the two orders apart: a fixture
// that both orders agreed on would pin nothing.

import { test } from "node:test";
import assert from "node:assert/strict";

import { occupancyAt, parseEnterExitLedger, withinOf } from "./enter-exit.mjs";

const fold = (lines) => parseEnterExitLedger(lines.join("\n")).acts;
const byFerry = (acts) => acts.map((a, i) => [a, i]).sort((x, y) => x[0].at - y[0].at || x[1] - y[1]).map(([a]) => a);
const stackOf = (acts, handle, at) => [...(occupancyAt(acts, at).get(handle) ?? [])];

// will-the-sailor, 2026-09-25: an enter_on_arrival to his sloop (stamped at the
// walk's arrival, 211.5798), then 4 s later an enter of the doubled coast and
// the selkie (stamped now, 211.5604), which ended the walk to the sloop.
const WILL = [
  "- 2026-09-25T18:43:27.831Z · will-the-sailor · enters orion-by-the-fire/the-reach · ferry 211.5798 · word neutral",
  "- 2026-09-25T18:43:27.832Z · will-the-sailor · enters will-the-sailor/the-sloop-at-anchor · ferry 211.5798 · word neutral",
  "- 2026-09-25T18:43:31.741Z · will-the-sailor · enters spar/the-doubled-coast · ferry 211.5604 · word neutral",
  "- 2026-09-25T18:43:31.741Z · will-the-sailor · enters current-the-reader/the-snug-harbour · ferry 211.5604 · word neutral",
  "- 2026-09-25T18:43:31.741Z · will-the-sailor · enters current-the-reader/the-snug-mooring · ferry 211.5604 · word neutral",
  "- 2026-09-25T18:43:31.741Z · will-the-sailor · enters current-the-reader/selkie · ferry 211.5604 · word neutral",
];

// sophia-familiaris, 2026-09-11: an enter_on_arrival to the porch (stamped at
// the rounded arrival, 183.4672); she arrived before it, entered by hand
// (183.4657) and left (183.4660, 183.4666).
const SOPHIA_PORCH = [
  "- 2026-09-11T17:29:12.372Z · sophia-familiaris · enters the-town/the-quay-reach · ferry 183.4672 · word neutral",
  "- 2026-09-11T17:29:12.372Z · sophia-familiaris · enters storm-of-the-porch/the-porch · ferry 183.4672 · word neutral",
  "- 2026-09-11T17:35:19.198Z · sophia-familiaris · enters the-town/the-quay-reach · ferry 183.4657 · word neutral",
  "- 2026-09-11T17:35:19.198Z · sophia-familiaris · enters storm-of-the-porch/the-porch · ferry 183.4657 · word neutral",
  "- 2026-09-11T17:35:32.112Z · sophia-familiaris · exits storm-of-the-porch/the-porch · ferry 183.4660",
  "- 2026-09-11T17:35:58.552Z · sophia-familiaris · exits the-town/the-quay-reach · ferry 183.4666",
];

// sophia-familiaris, 2026-09-22: she left the taproom, then entered the snug.
// The door stamped the snug's clock before its reads, so its ferry (204.6082)
// sits a breath behind the exit's (204.6083) although it was written after.
const SOPHIA_SNUG = [
  "- 2026-09-22T01:21:39.666Z · sophia-familiaris · enters current-the-reader/the-taproom · ferry 204.1133 · word neutral",
  "- 2026-09-22T07:17:58.926Z · sophia-familiaris · exits current-the-reader/the-taproom · ferry 204.6083",
  "- 2026-09-22T07:18:00.573Z · sophia-familiaris · enters current-the-reader/the-snug · ferry 204.6082 · word neutral",
];

test("THE ORDER RULE — will is in the selkie, never the sloop his walk did not reach", () => {
  const acts = fold(WILL);
  assert.equal(acts.length, WILL.length, "every fixture line parses");
  assert.equal(withinOf(occupancyAt(acts, 211.5798), "will-the-sailor"), "current-the-reader/selkie");
  assert.equal(withinOf(occupancyAt(acts, Infinity), "will-the-sailor"), "current-the-reader/selkie");
  // the fixture discriminates: sorted by ferry, the sloop would be innermost
  assert.equal(withinOf(occupancyAt(byFerry(acts), 211.5798), "will-the-sailor"), "will-the-sailor/the-sloop-at-anchor");
});

test("THE ORDER RULE — sophia is out of the porch she walked out of, whatever its late stamp says", () => {
  const acts = fold(SOPHIA_PORCH);
  assert.equal(acts.length, SOPHIA_PORCH.length, "every fixture line parses");
  assert.deepEqual(stackOf(acts, "sophia-familiaris", 183.4672), []);
  assert.deepEqual(stackOf(acts, "sophia-familiaris", Infinity), []);
  // before her own exits she was inside, by the hand entry
  assert.deepEqual(stackOf(acts, "sophia-familiaris", 183.4657), ["the-town/the-quay-reach", "storm-of-the-porch/the-porch"]);
  // the fixture discriminates: sorted by ferry, the late stamp re-enters her
  assert.deepEqual(stackOf(byFerry(acts), "sophia-familiaris", 183.4672), ["the-town/the-quay-reach", "storm-of-the-porch/the-porch"]);
});

test("THE ORDER RULE — sophia left the taproom and then entered the snug, as written", () => {
  const acts = fold(SOPHIA_SNUG);
  assert.equal(acts.length, SOPHIA_SNUG.length, "every fixture line parses");
  assert.deepEqual(stackOf(acts, "sophia-familiaris", 204.6083), ["current-the-reader/the-snug"]);
  // the fixture discriminates: sorted by ferry, the exit would empty the snug too
  assert.deepEqual(stackOf(byFerry(acts), "sophia-familiaris", 204.6083), []);
});

test("THE ORDER RULE — ferry still admits: a row counts only once its clock is reached", () => {
  const acts = fold(WILL);
  // between the two stamps only the rows written at 211.5604 count
  assert.deepEqual(stackOf(acts, "will-the-sailor", 211.57), [
    "spar/the-doubled-coast", "current-the-reader/the-snug-harbour", "current-the-reader/the-snug-mooring", "current-the-reader/selkie",
  ]);
  assert.deepEqual(stackOf(acts, "will-the-sailor", 211.56), []);
});
