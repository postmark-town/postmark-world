// exit-lock.test.mjs — WLD-5 A: leaving a dungeon by `exit` locks you out of it
// until the next settlement (Darko, Sitting B 2026-10-18 20:22 and 20:27; the
// words and the readings ruled 2026-10-19 09:21).
//
// The world is portals.test.mjs's Spire in miniature, with the Spire carrying its
// own `into` as WLD-63 has it, so it is entered from anywhere in its outline. The
// office holds the record and hands the verbs the locks in force (`lockedOut`);
// these tests hold what the verbs do with them and what they say.

import { test } from "node:test";
import assert from "node:assert/strict";

import { enter, exit } from "./world-verbs.mjs";
import { exitLockWords, lockedOutWords, lockedPassage, hhmmZ } from "./portals.mjs";
import { nameInSentence } from "./mark-name.mjs";

const SPIRE = "spire/the-spire";
const UNTIL = "2026-10-19T18:00:00.000Z";
const LEFT = "2026-10-19T17:12:30.000Z";
const LOCKED = { [SPIRE]: { until: UNTIL, left_at: LEFT } };

function world({ word = "neutral", determined = undefined } = {}) {
  const marks = [
    { id: "spire/grounds", kind: "sited", by: "spire", at: { x: 1000, y: 1000 }, extent: { w: 500, h: 400 }, body: "The Grounds." },
    { id: SPIRE, kind: "sited", by: "spire", class: "dungeon", at: { x: 1000, y: 1000 }, extent: { w: 300, h: 300 },
      body: "The Starforge Spire.", entry: { into: "spire/vestibule", lands_at: "spire/doors-inside" } },
    { id: "spire/vestibule", kind: "sited", by: "spire", at: { x: 880, y: 1000 }, extent: { w: 50, h: 50 }, body: "The vestibule." },
    { id: "spire/hall", kind: "sited", by: "spire", at: { x: 1030, y: 1000 }, extent: { w: 200, h: 200 }, body: "The great hall." },
    { id: "spire/the-approach", kind: "sited", by: "spire", at: { x: 820, y: 1000 }, extent: { w: 30, h: 30 }, body: "The approach." },
    { id: "spire/doors-outside", kind: "sited", by: "spire", at: { x: 845, y: 1000 }, extent: { w: 4, h: 2 },
      body: "The Gilded Doors.", entry: { word, into: "spire/vestibule", lands_at: "spire/doors-inside" } },
    { id: "spire/doors-inside", kind: "sited", by: "spire", at: { x: 860, y: 1000 }, extent: { w: 4, h: 2 },
      body: "The Gilded Doors, from inside.", entry: { word: "neutral", into: "spire/the-approach" } },
    { id: "spire/hall-door", kind: "sited", by: "spire", at: { x: 900, y: 1000 }, extent: { w: 2, h: 2 },
      body: "A door to the hall.", entry: { word: "neutral", into: "spire/hall" } },
    // a signpost on the Grounds that leads two ways: into the Spire, or along the approach
    { id: "spire/signpost", kind: "sited", by: "spire", at: { x: 800, y: 1150 }, extent: { w: 2, h: 2 },
      body: "Two ways.", entry: { word: "neutral", into: ["spire/vestibule", "spire/the-approach"] } },
  ];
  return { marks, ...(determined ? { determined } : {}) };
}
const AT = (x, y) => ({ x, y, name: "ann" });
const occ = (stack) => new Map([["ann", stack]]);

test("THE ACCEPT STEP is Darko's sentence, with the settlement's time and where you will be set down", () => {
  const x = exit("spire/hall", world(), { occupancy: occ([SPIRE, "spire/hall"]), handle: "ann", enteredVia: "spire/doors-outside", locksUntil: UNTIL });
  assert.deepEqual(x.rows, [], "the ask writes nothing");
  assert.equal(x.awaiting.because, "Leave the Spire from here? You can't come back in until the next settlement (18:00Z)."
    + " Walking out through a door doesn't count. You'll be set down outside, at Doors Outside.");
  assert.match(x.awaiting.how, /Call again with confirm: true to go; nothing was recorded\.$/);
  assert.doesNotMatch(x.awaiting.because, /confirm/, "the page prints `because`; the agent's instruction is `how`");
  assert.deepEqual(x.lock, { dungeon: SPIRE, until: UNTIL });
});

test("a NAMED dungeon is said by its name, as given", () => {
  const w = world({ determined: { [`${SPIRE}::name`]: "the Spire", "spire/doors-outside::name": "the Gilded Doors" } });
  const x = exit("spire/hall", w, { occupancy: occ([SPIRE, "spire/hall"]), handle: "ann", enteredVia: "spire/doors-outside", locksUntil: UNTIL });
  assert.equal(x.awaiting.because, "Leave the Spire from here? You can't come back in until the next settlement (18:00Z)."
    + " Walking out through a door doesn't count. You'll be set down outside, at the Gilded Doors.");
});

test("CONFIRMED, the exit carries the lock the office writes on its act: the dungeon and the settlement", () => {
  const x = exit("spire/hall", world(), { occupancy: occ([SPIRE, "spire/hall"]), handle: "ann", confirm: true, enteredVia: "spire/doors-outside", locksUntil: UNTIL, iso: LEFT });
  assert.equal(x.rows.length, 1);
  assert.deepEqual(x.lock, { dungeon: SPIRE, until: UNTIL, left_at: LEFT,
    note: "You can't come back into the Spire until the next settlement (18:00Z)." }, "and the time is said again");
});

test("LOCKED OUT, every way in is refused with a line naming when, and nothing is written: the portal", () => {
  const e = enter(AT(845, 1000), "spire/doors-outside", world(), { occupancy: occ(["spire/grounds"]), handle: "ann", lockedOut: LOCKED });
  assert.equal(e.refused, "dungeon-locked");
  assert.equal(e.error, "You left the Spire by exit at 17:12Z, so you can't come back in until the next settlement (18:00Z). Nothing was recorded.");
  assert.equal(e.dungeon, SPIRE);
  assert.equal(e.locked_until, UNTIL);
  assert.equal(e.rows, undefined, "no rows at all");
});

test("LOCKED OUT: the dungeon itself, entered from anywhere in its outline", () => {
  const e = enter(AT(1100, 1100), SPIRE, world(), { occupancy: occ(["spire/grounds"]), handle: "ann", lockedOut: LOCKED });
  assert.equal(e.refused, "dungeon-locked");
  assert.equal(e.dungeon, SPIRE);
});

test("THE LOCK IS ASKED FIRST: before the portal's own word, so an opposed door still names when", () => {
  const e = enter(AT(845, 1000), "spire/doors-outside", world({ word: "opposed" }), { occupancy: occ(["spire/grounds"]), handle: "ann", lockedOut: LOCKED });
  assert.equal(e.refused, "dungeon-locked");
});

test("NOT LOCKED: the same passage goes through, and a lock on another dungeon never bites", () => {
  for (const lockedOut of [null, {}, { "elsewhere/crypt": { until: UNTIL } }]) {
    const e = enter(AT(845, 1000), "spire/doors-outside", world(), { occupancy: occ(["spire/grounds"]), handle: "ann", lockedOut });
    assert.equal(e.error, undefined);
    assert.ok(e.entered.includes(SPIRE), "entered the dungeon");
  }
});

test("MOVING BETWEEN ROOMS NEVER COUNTS: inside the dungeon, its lock is never asked", () => {
  const e = enter(AT(900, 1000), "spire/hall-door", world(), { occupancy: occ([SPIRE, "spire/vestibule"]), handle: "ann", lockedOut: LOCKED });
  assert.equal(e.error, undefined);
  assert.deepEqual(e.entered, ["spire/hall"]);
});

test("WALKING OUT A DOOR COSTS NOTHING: a portal out carries no lock; only exit does", () => {
  const e = enter(AT(860, 1000), "spire/doors-inside", world(), { occupancy: occ([SPIRE, "spire/vestibule"]), handle: "ann" });
  assert.equal(e.error, undefined);
  assert.equal(e.lock, undefined);
  assert.ok(e.exited.includes(SPIRE));
});

test("A LIST WITH AN OPEN WAY still offers its choices; the locked way is refused when picked, the open one passes", () => {
  const w = world();
  const opts = { occupancy: occ(["spire/grounds"]), handle: "ann", lockedOut: LOCKED };
  const ask = enter(AT(800, 1150), "spire/signpost", w, opts);
  assert.equal(ask.error, undefined);
  assert.deepEqual(ask.choose.map((c) => c.id), ["spire/vestibule", "spire/the-approach"]);
  assert.equal(enter(AT(800, 1150), "spire/signpost", w, { ...opts, into: "spire/vestibule" }).refused, "dungeon-locked");
  assert.equal(enter(AT(800, 1150), "spire/signpost", w, { ...opts, into: "spire/the-approach" }).error, undefined);
});

test("the words, alone: the clock as the town says it, a missing exit time, and the names", () => {
  assert.equal(hhmmZ("2026-10-19T06:00:00.000Z"), "06:00Z");
  assert.equal(hhmmZ("2026-10-19T17:59:59.999Z"), "17:59Z");
  assert.equal(hhmmZ("not a time"), null);
  assert.equal(lockedOutWords({ dungeon: SPIRE, until: UNTIL }),
    "You left the Spire by exit, so you can't come back in until the next settlement (18:00Z). Nothing was recorded.");
  assert.equal(exitLockWords({ dungeon: SPIRE }),
    "Leave the Spire from here? You can't come back in until the next settlement. Walking out through a door doesn't count.");
  assert.equal(nameInSentence("wright/the-starforge-spire"), "the Starforge Spire");
  assert.equal(nameInSentence("wright/spire-gilded-doors"), "Spire Gilded Doors");
  assert.equal(nameInSentence("wright/the-starforge-spire", { "wright/the-starforge-spire::name": "The Spire" }), "The Spire");
  assert.equal(lockedPassage({ id: "x", entry: { into: "spire/vestibule" } }, { marks: world().marks, lockedOut: null }), null);
});
