// page-small-fixes.test.mjs — the World page's small fixes before W2 ships
// (Darko 2026-10-18 12:04: "if there are other obvious smaller bugs we can fix
// within an hour or so we should add them"), the pure halves. Their rendered
// halves are in tools/part2-on-the-page.test.mjs. Evidence: the playground's
// holders walk, G:/Starstory/docs/2026-10-18/playground-holders/.
//
// ── THE CAN-FAIL FLIPS ─────────────────────────────────────────────────────
//   containmentIndex keying things on class === "thing" alone   → 2 reds
//   kickerOf showing a registry key                             → 1 reds

import { test } from "node:test";
import assert from "node:assert/strict";
import { smallestContainingMark, containmentIndex, bodyPlace, placeLabel, kickerOf } from "../spectator/viewer.mjs";

const PARCEL = { id: "sb-ash/sb-lantern-ground", kind: "parcel", by: "sb-ash", household: "sb-ash", at: { x: 200, y: -350 }, extent: { w: 40, h: 40 } };
// the W1 form the playground's bowl is still in: kind: sited + class
const BOWL = { id: "sb-ash/a-halloween-bowl", kind: "sited", class: "halloween-candy-bowl", by: "sb-ash", at: { x: 205, y: -345 }, extent: { w: 1, h: 1 } };
const BOWL_W2 = { ...BOWL, id: "sb-ash/a-second-bowl", kind: "halloween-candy-bowl", class: undefined, at: { x: 210, y: -340 } };
const CLASSES = [
  { id: "the-town/thing", kind: "class", class: "thing", extends: "sited", parent: "the-town/mark" },
  { id: "the-town/halloween-candy-bowl", kind: "class", class: "halloween-candy-bowl", extends: "thing", parent: "the-town/thing" },
];

test("2. a resident at a bowl stands on the ground, never on the bowl: the place line names the innermost GROUND mark", () => {
  const marks = [PARCEL, BOWL, BOWL_W2, ...CLASSES];
  assert.equal(smallestContainingMark({ x: 205, y: -345 }, marks), PARCEL.id, "the record's class marks say a bowl is a thing (W1 form)");
  assert.equal(smallestContainingMark({ x: 210, y: -340 }, marks), PARCEL.id, "and in the W2 form");
  // the resident path holds no class marks: the page hands in the kinds it has learned
  const read = [PARCEL, BOWL];
  assert.equal(smallestContainingMark({ x: 205, y: -345 }, read), BOWL.id, "with nothing to say what a bowl is, the record answers as before");
  const index = containmentIndex(read, { thingClasses: new Set(["thing", "halloween-candy-bowl"]) });
  const place = bodyPlace({ handle: "sb-cleo", x: 205, y: -345, standing: true }, { marks: read, index });
  assert.equal(place.inside, PARCEL.id);
  assert.equal(placeLabel(place, read, {}, { index }), "on Sb Lantern Ground's ground", "never \"on A Halloween Bowl's ground\"");
  // a plain sited mark (a bench) is still ground: things are kept out by class, never by size
  const BENCH = { id: "sb-ash/a-bench", kind: "sited", by: "sb-ash", at: { x: 205, y: -345 }, extent: { w: 1, h: 1 } };
  assert.equal(smallestContainingMark({ x: 205, y: -345 }, [PARCEL, BENCH, ...CLASSES]), BENCH.id);
});

test("1. a column's kicker names the household as every card does, never the registry key a pending amend carries", () => {
  // the set-down's re-site amend comes back on /world/my-marks' docket with the store's household key
  assert.equal(kickerOf({ id: "sb-ash/a-tin-box", by: "sb-ash", household: "hh:sb-lantern" }), "sb-ash");
  assert.equal(kickerOf({ id: "sb-ash/a-tin-box", by: "sb-ash", household: "sb-ash" }), "sb-ash", "a published mark: its household, as before");
  assert.equal(kickerOf({ id: "keeminlee/x", by: "darko", household: "keeminlee" }), "keeminlee", "a household that is not its author's handle is kept");
  assert.equal(kickerOf({ id: "the-town/x" }), "the town");
});
