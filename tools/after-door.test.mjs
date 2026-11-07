// after-door.test.mjs — a named creature that waits on a door (`after_door`, 2026-10-22,
// carrying out WLD-25/k). The creature comes out at the first settlement whose world shows
// its door open: the door's `requires`, counted `at: "settlement"`, met by the printed
// `held_by` (portals.mjs § unmetRequires). The office's creature tick asks afterDoorOpen of
// the blessed world; mark-lint holds the door to a settlement count (afterDoorRefusal).
//
// THE CAN-FAIL FLIPS (each reds a case below): read the door's live record instead of the
// printout; open on one fewer; let a door that reads the live record through the lint; let
// a declaration's after_door through when it is not a mark id.

import { test } from "node:test";
import assert from "node:assert/strict";
import { TOWN, creatureLaw, afterDoorOpen, afterDoorRefusal } from "./creatures.mjs";
import { loadMarks } from "./marks-fold.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const marks = loadMarks(join(ROOT, "WORLD", "marks"));
const withNamed = (cls, named) => marks.map((m) => (m.kind === "class" && m.by === TOWN && String(m.class) === cls ? { ...m, named } : m));

const DOOR = "tower/inner-door";
const HOLDERS = ["tower/holder-1", "tower/holder-2", "tower/holder-3"];
const ASKS = ["tower/token-a", "tower/token-b", "tower/token-c"];
const door = (requires) => ({ id: DOOR, kind: "thing", by: "tower", at: { x: 0, y: 0 }, extent: { w: 2, h: 2 }, body: "A door.",
  entry: { word: "neutral", into: "tower/room", requires } });
const LOCK = { holds: ASKS, in: HOLDERS, at: "settlement" };
/** The world as a settlement printed it: the first n tokens in their holders' hands. */
const world = (n, requires = LOCK) => [door(requires), ...ASKS.map((id, i) => ({ id, kind: "thing", by: "the-town", body: "A token.", ...(i < n ? { held_by: HOLDERS[i] } : {}) }))];
const DECL = { id: "creature:wolf-den", after_door: DOOR };

test("the grammar: after_door is a door's mark id, carried as written", () => {
  const law = creatureLaw(withNamed("wolf", [{ slug: "den", at: { x: 1, y: 2 }, after_door: DOOR }]));
  // found by its id: a world that already declares other named creatures lists them too
  const den = (l) => l.named.find((d) => d.id === "creature:wolf-den");
  assert.equal(den(law).after_door, DOOR);
  assert.equal("after_door" in den(creatureLaw(withNamed("wolf", [{ slug: "den", at: { x: 1, y: 2 } }]))), false, "absent when not written");
  assert.throws(() => creatureLaw(withNamed("wolf", [{ slug: "den", at: { x: 1, y: 2 }, after_door: "no-slash" }])), /after_door is "no-slash", not a door's mark id/);
  assert.throws(() => creatureLaw(withNamed("wolf", [{ slug: "den", at: { x: 1, y: 2 }, after_door: 7 }])), /after_door is 7/);
});

test("OPEN AT THE SETTLEMENT THAT PRINTS THE LAST ONE: two printed, it waits; three printed, it comes out", () => {
  assert.deepEqual(afterDoorOpen(DECL, world(0)), { open: false, shut: true, why: `its door ${DOOR} is shut: 0 of 3 in place at this settlement` });
  assert.equal(afterDoorOpen(DECL, world(3).slice(1)).shut, undefined, "a door that is no lock is a fault, never a wait");
  assert.equal(afterDoorOpen(DECL, world(2)).open, false);
  assert.deepEqual(afterDoorOpen(DECL, world(3)), { open: true });
  assert.deepEqual(afterDoorOpen({ id: "creature:wolf-den" }, []), { open: true }, "no after_door: nothing to wait on");
});

test("FAIL CLOSED: a door not in the world, or one that is no settlement lock, never opens", () => {
  assert.match(afterDoorOpen(DECL, world(3).slice(1)).why, /names no mark/);
  assert.match(afterDoorOpen(DECL, world(3, { holds: ASKS, in: HOLDERS })).why, /reads the live record/);
  assert.match(afterDoorOpen(DECL, [{ ...door(undefined), entry: { word: "neutral", into: "tower/room" } }]).why, /asks for nothing/);
  assert.match(afterDoorOpen(DECL, world(3, { holds: [] , at: "settlement" })).why, /does not say plainly/);
});

test("THE LINT'S QUESTION: a door counted at a settlement passes; any other is named", () => {
  assert.equal(afterDoorRefusal(DECL, world(0)), null);
  assert.equal(afterDoorRefusal({ id: "x" }, []), null, "no after_door: nothing to check");
  assert.match(afterDoorRefusal(DECL, world(0, { holds: ASKS, in: HOLDERS })), /a creature waits on a door that counts at: "settlement"/);
  assert.match(afterDoorRefusal(DECL, []), /names no mark/);
});

test("a door that is not shown counts the same for the creature", () => {
  const hidden = { ...LOCK, shown: false };
  assert.deepEqual(afterDoorOpen(DECL, world(2, hidden)), { open: false, shut: true, why: `its door ${DOOR} is shut: 2 of 3 in place at this settlement` });
  assert.deepEqual(afterDoorOpen(DECL, world(3, hidden)), { open: true });
});
