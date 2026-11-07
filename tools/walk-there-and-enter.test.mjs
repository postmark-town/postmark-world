// walk-there-and-enter.test.mjs — the enter button's refusal-from-afar grows the
// walk the door already knows how to take (founder-agreed 2026-09-11).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { walkThereOffer, walkThereSheetHTML, walkEnterSheetHTML, walkEntryOf } from "../spectator/viewer.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");

test("A REFUSAL FROM AFAR IS AN OFFER — from the body's own walk first, from the door's sentence when the body has none, never from any other refusal", () => {
  const withWalk = { error: "bounce", defect: "you are not at that door — x stands ~340 m from where you stand", walk: { to: { x: 563, y: -294.5 }, mark: "illuminator/the-looking-room-parcel" } };
  assert.deepEqual(walkThereOffer(409, withWalk, "whatever/the-page-named"), { mark: "illuminator/the-looking-room-parcel", to: { x: 563, y: -294.5 } }, "the office's plan names the mark; the page defers to it");
  const sentenceOnly = { error: "bounce", defect: "you are not at that door — a/b stands ~40 m from where you stand" };
  assert.deepEqual(walkThereOffer(409, sentenceOnly, "a/b"), { mark: "a/b", to: null }, "today's office sends no walk in the 409: the sentence is recognised");
  assert.deepEqual(walkThereOffer(409, { error: "bounce", defect: "a door is entered from its threshold — walk to (1, 2) and knock again" }, "a/b"), { mark: "a/b", to: null }, "and the renamed sentence too");
  assert.equal(walkThereOffer(409, { error: "bounce", defect: "you are within x — this walk would carry you out" }, "a/b"), null, "another 409 is not a walk offer");
  assert.equal(walkThereOffer(422, sentenceOnly, "a/b"), null, "and neither is any other status");
  assert.equal(walkThereOffer(409, sentenceOnly, ""), null, "no mark named, nothing to walk to");
  const sheet = walkThereSheetHTML({ mark: "a/b", to: null }, "you are not at that door");
  assert.match(sheet, /<button type="button" class="ctl wv-walk-enter" data-walk-enter="a\/b">walk there and enter<\/button>/);
  assert.match(sheet, /wv-cross-cancel">stay here/);
  // ⚑ THE FLIP: make walkThereOffer ignore `body.walk` → the first line reds.
});

test("[pin] THE PAGE WIRES IT — crossInto offers on the refusal, the delegate sends the walk with entry on arrival, and nothing else about entering changed", () => {
  assert.match(SOURCE, /const offer = answer\.error === "bounce" \? walkThereOffer\(response\?\.status, answer, markId\) : null;/, "crossInto asks the pure rule");
  assert.match(SOURCE, /apexAct\("walk", \{ mark_id: markId, enter_on_arrival: true, \.\.\.\(into \? \{ into \} : \{\}\), \.\.\.\(accept \? \{ accept: true \} : \{\}\) \}\)/, "one act: the walk door, entry on arrival, the walker's word only when asked");
  assert.match(SOURCE, /closest\("\[data-walk-enter\]"\)/, "the root delegate reads the button");
  assert.match(SOURCE, /closest\("\[data-walk-enter-accept\]"\)/, "and the terms accept for a walk");
  assert.match(SOURCE, /apexAct\("enter", \{ mark: markId, \.\.\.\(into \? \{ into \} : \{\}\), \.\.\.\(accept \? \{ accept: true \} : \{\}\) \}\)/, "the enter act is untouched");
  // ⚑ THE FLIP: drop the `[data-walk-enter]` branch from the delegate → the third line reds.
});

// ── WLD-48: the walk's answer carries the door under `entry` ─────────────────
//
// The office's walk door nests the entry's answer in the walk's own receipt
// (office world.mjs § walkEntryReceipt; its own pin is test/pos-171-receipt-
// wording.test.mjs leg 3b: `out.entry.awaiting`, `out.entry.terms`). The page
// read `awaiting`/`terms` off the walk's TOP level, so a terms door reached by a
// walk showed "on the way" and its accept could never fire. The fixtures are the
// office's two shapes, the train's (w43 f2d3d0b6) and WLD-5's (#541, where a
// pre-check that would not enter queues nothing and says why). Both nest.

const MARK = "the-town/the-post-office";
const TERMS = { body: "aboard: her timetable binds", edge: "aboard", consequence: "you ride where she sails" };
const WALK = {   // the walk's own fields, which say nothing about the door
  handle: "rig-actor", from: { x: 0, y: 0 }, toward: { x: 40, y: 30 }, mark_id: MARK,
  departed_at_crossing: 1000, leg_m: 50, eta_crossings: 0.0004,
  note: "position derives from this record and the clock; you arrive whether or not anyone is watching",
};
const ASKED = { handle: "rig-actor", awaiting: { mark: MARK, terms: TERMS }, terms: TERMS };
const TRAIN_TERMS = { ...WALK, entry: { queued_for_arrival: true, stop: MARK, eta: 1000.0004, ...ASKED,
  note: "the entry is adjudicated when you arrive; nothing has been entered yet" } };
const WLD5_TERMS = { ...WALK, entry: { queued_for_arrival: false, stop: MARK, eta: 1000.0004, ...ASKED,
  note: "nothing is queued: this mark asks for your word: walk again with accept: true to have the entry made on arrival. Nothing has been entered" } };
const WLD5_REFUSED = { ...WALK, entry: { queued_for_arrival: false, stop: MARK, eta: 1000.0004,
  refused: "the gate is barred to strangers after dark",
  note: "nothing is queued: the mark refuses you as its law stands now. Its own words are above. Nothing has been entered" } };
const QUEUED = { ...WALK, entry: { queued_for_arrival: true, stop: MARK, eta: 1000.0004,
  note: "the entry is adjudicated when you arrive; nothing has been entered yet" } };

test("WLD-48: a terms door reached by a walk asks with its terms, and its accept resends the WALK — in the train's shape and in WLD-5's", () => {
  for (const [name, answer] of [["train", TRAIN_TERMS], ["WLD-5", WLD5_TERMS]]) {
    assert.equal(walkEntryOf(answer), answer.entry, `${name}: the door's answer is the walk's entry`);
    const sheet = walkEnterSheetHTML(answer, MARK);
    assert.match(sheet, /this door has terms/, `${name}: the sheet is the door's ask`);
    assert.match(sheet, /aboard: her timetable binds/, `${name}: in the door's own words`);
    assert.match(sheet, /<button type="button" class="ctl wv-cross-accept" data-walk-enter-accept="the-town\/the-post-office">accept and cross<\/button>/,
      `${name}: and its accept is the walk's accept`);
    assert.doesNotMatch(sheet, /data-enter-accept=/, `${name}: never the enter button's accept`);
    assert.doesNotMatch(sheet, /on the way/, `${name}: an ask is not a departure note`);
  }
  // ⚑ THE FLIP: `walkEntryOf = (answer) => answer` (read the top level, as before) → the first line reds.
});

test("WLD-48 G1: when nothing is queued the walk still stands, and the sheet says the door's words — never the walk's position sentence", () => {
  const refused = walkEnterSheetHTML(WLD5_REFUSED, MARK);
  assert.match(refused, /<div class="wv-cross-head">on the way<\/div>/, "the walk stands, so it is on the way");
  assert.match(refused, /the gate is barred to strangers after dark/, "the mark's own refusal is said");
  assert.match(refused, /nothing is queued: the mark refuses you/, "and the office's note, which says nothing was queued");
  assert.ok(refused.indexOf("barred") < refused.indexOf("nothing is queued"), "the mark's words first: the note says they are 'above'");
  assert.doesNotMatch(refused, /position derives|you arrive whether or not/, "the walk's own sentence is not the door's answer");
  assert.doesNotMatch(refused, /cross the threshold when you arrive/, "and nothing promises an entry that was not queued");

  const queued = walkEnterSheetHTML(QUEUED, MARK);
  assert.match(queued, /on the way/);
  assert.match(queued, /the entry is adjudicated when you arrive; nothing has been entered yet/, "a queued entry says so in the office's words");
  assert.doesNotMatch(queued, /position derives/);

  const object = walkEnterSheetHTML({ ...WALK, entry: { refused: { because: "the mark opposes entry" }, note: "x" } }, MARK);
  assert.match(object, /the mark opposes entry/, "a refusal the door gave as an object is said by its `because`");

  const bare = walkEnterSheetHTML({ note: "an answer with no entry block" }, MARK);
  assert.match(bare, /an answer with no entry block/, "an answer with no `entry` is read as itself, as before");
  // ⚑ THE FLIP: drop `refused` from the words → the second assert reds.
});

test("[pin] WLD-48: walkThereAndEnter places the sheet the pure rule builds, and stops at an ask", () => {
  assert.match(SOURCE, /placeCrossingSheet\(liveCard\(\), walkEnterSheetHTML\(answer, markId\), \{ button \}\);/,
    "the walk's sheet is the pure rule's");
  assert.match(SOURCE, /if \(isTermsAsk\(walkEntryOf\(answer\)\)\) return;/, "an ask waits for the walker's word");
  assert.doesNotMatch(SOURCE, /isTermsAsk\(answer\)\) \{ placeCrossingSheet/, "the top-level read is gone");
});
