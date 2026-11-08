// unpublish-verdict.test.mjs — the one unpublish rule, case by case (postmark#3757).
//
// The sweep and the office's stakes warning both read this function, so every
// sentence a household is told about the next settlement is one of these rows.

import test from "node:test";
import assert from "node:assert/strict";
import { STALE_ROWS, UNPUBLISH_RULE, rowClassOf, unpublishVerdict } from "./unpublish-verdict.mjs";

const commons = { household: "house-of-many-doors", class: "commons", path: "WORLD/marks/let-there-be-light/the-uphill-firepit/mark.md" };
const market = { standing: "market" };

test("the dial stands at today's rule until WLD-51 is ruled", () => {
  assert.equal(STALE_ROWS, "skip");
  assert.equal(UNPUBLISH_RULE,
    "At each settlement, a commons mark with no stamps behind it leaves the world. A mark standing on your household's ground or the town's never does, whatever it was first filed as.",
    "Darko's sentence, verbatim (WLD-51, 2026-10-14 14:31 EDT)");
  // the words leave two conditions out; the verdict still asks both
  assert.deepEqual(unpublishVerdict(commons, { escrow: 0, pathOnMain: false, standing: "market" }).unpublish, false, "a path not on main is still never swept");
  assert.equal(unpublishVerdict(undefined, { escrow: 0, pathOnMain: true, standing: "market" }).unpublish, false, "a mark the registry does not hold is still never a candidate");
  assert.equal(rowClassOf("market"), "commons");
  assert.equal(rowClassOf("home"), "home");
});

test("the conditions, as the sweep has always asked them, for a mark that still walks commons", () => {
  assert.deepEqual(unpublishVerdict({ ...commons, class: "home" }, { escrow: 0, pathOnMain: true, ...market }), { unpublish: false, why: "not-commons" });
  assert.deepEqual(unpublishVerdict({ ...commons, class: "constitution" }, { escrow: 0, pathOnMain: true, ...market }), { unpublish: false, why: "not-commons" });
  assert.deepEqual(unpublishVerdict(commons, { escrow: 2, pathOnMain: true, ...market }), { unpublish: false, why: "backed" });
  assert.deepEqual(unpublishVerdict(commons, { escrow: 0, pathOnMain: true, ...market }), { unpublish: true, why: "commons-unbacked", path: commons.path });
});

test("THE SAFETY HALF: a commons row whose mark now WALKS home or constitution is never unpublished, path on main or not", () => {
  for (const standing of ["home", "constitution"]) {
    assert.deepEqual(unpublishVerdict(commons, { escrow: 0, pathOnMain: true, standing }), { unpublish: false, why: "walks-not-commons" }, standing);
    assert.deepEqual(unpublishVerdict(commons, { escrow: 0, pathOnMain: false, standing, staleRows: "rederive", currentPath: "x" }),
      { unpublish: false, why: "walks-not-commons" }, `${standing}, under either dial`);
  }
  // a mark that does not stand is not kept by this half: the stored rules apply, as before
  assert.deepEqual(unpublishVerdict(commons, { escrow: 0, pathOnMain: true, standing: null }), { unpublish: true, why: "commons-unbacked", path: commons.path });
});

test("a walk not run is never a no: standing unread answers null, and the mark is not taken", () => {
  assert.deepEqual(unpublishVerdict(commons, { escrow: 0, pathOnMain: true }), { unpublish: null, why: "standing-unread" });
});

test("the other half is NOT here: a row stored home whose mark walks commons is still never swept (WLD-51)", () => {
  assert.deepEqual(unpublishVerdict({ ...commons, class: "home" }, { escrow: 0, pathOnMain: true, standing: "market" }), { unpublish: false, why: "not-commons" });
});

test("kinofire's firepit: a commons row whose path is not on main is not swept today", () => {
  assert.deepEqual(unpublishVerdict(commons, { escrow: 0, pathOnMain: false, ...market }), { unpublish: false, why: "stale-path" });
});

test("an input not measured is never a no: escrow or path unread answers null", () => {
  assert.deepEqual(unpublishVerdict(commons, { escrow: null, pathOnMain: true, ...market }), { unpublish: null, why: "escrow-unread" });
  assert.deepEqual(unpublishVerdict(commons, { escrow: 0, pathOnMain: null, ...market }), { unpublish: null, why: "path-unread" });
  assert.deepEqual(unpublishVerdict(commons, { escrow: 0, ...market }), { unpublish: null, why: "path-unread" }, "the default is unread, not absent");
});

test("the walk and the path are asked only when the answer turns on them", () => {
  let walked = 0, asked = 0;
  const standing = () => { walked += 1; return "market"; };
  const pathOnMain = () => { asked += 1; return true; };
  unpublishVerdict({ ...commons, class: "home" }, { escrow: 0, pathOnMain, standing });
  unpublishVerdict(commons, { escrow: 1, pathOnMain, standing });
  assert.equal(walked + asked, 0, "a home row and a backed row cost nothing, as in the sweep before");
  unpublishVerdict(commons, { escrow: 0, pathOnMain, standing });
  assert.deepEqual([walked, asked], [1, 1]);
  unpublishVerdict(commons, { escrow: 0, pathOnMain, standing: () => { walked += 1; return "home"; } });
  assert.deepEqual([walked, asked], [2, 1], "a mark that walks home costs no path read");
});

test("\"rederive\" (WLD-51's other branch): a stale row is judged by where and what the mark is now", () => {
  const stale = { escrow: 0, pathOnMain: false, staleRows: "rederive" };
  assert.deepEqual(unpublishVerdict(commons, { ...stale, standing: "market", currentPath: "WORLD/marks/lupi/rootwood-bookend/mark.md" }),
    { unpublish: true, why: "rederived-commons-unbacked", path: "WORLD/marks/lupi/rootwood-bookend/mark.md" },
    "a market mark at zero escrow is swept from where it is filed now");
  assert.deepEqual(unpublishVerdict(commons, { ...stale, standing: null }), { unpublish: false, why: "not-standing" }, "a row for a mark that is gone takes nothing");
  assert.deepEqual(unpublishVerdict(commons, { ...stale, standing: "market", currentPath: null }), { unpublish: null, why: "filing-unread" });
  assert.deepEqual(unpublishVerdict(commons, { ...stale, standing: "market", currentPath: "x", pathOnMain: true }),
    { unpublish: true, why: "commons-unbacked", path: commons.path }, "a row whose path IS on main is untouched by the dial");
  assert.throws(() => unpublishVerdict(commons, { escrow: 0, pathOnMain: false, staleRows: "sweep-everything", ...market }), /unknown STALE_ROWS/);
});
