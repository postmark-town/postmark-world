// dungeon-into.test.mjs — WLD-63: entering a dungeon goes through its `into`.
//
//   node --test tools/dungeon-into.test.mjs
//
// The ruling (WLD-5, Darko with Wright 2026-10-13 18:44–19:54 EDT): "`into`: a
// mark, or a list of marks. Entering me actually enters that mark. With a list,
// the consent answer that comes back asks which one, and nothing is recorded
// until the resident picks. No `into` means you enter the mark itself." And
// "from ANYWHERE in the Chapel's extent, you can enter, and pick your into, and
// end up at its position within the Chapel" — no walking to the door first
// (22:44: "a certain level of pedantry that we want to avoid").
//
// The world: open Grounds holding two dungeons. The Spire names one way in, its
// vestibule, landing inside the Gilded Doors (the Starforge Spire's own entry).
// The Chapel names five: its five doors, each a portal set in its wall that
// leads back out, so each door is its own landing. A third dungeon, the Crypt,
// names none and is entered by the one portal that leads into it.

import { test } from "node:test";
import assert from "node:assert/strict";

import { portalFindings, portalsInto, passageTargetOf, dungeonLanding } from "./portals.mjs";
import { enter, exit } from "./world-verbs.mjs";

const SPIRE = "t/spire", CHAPEL = "t/chapel", CRYPT = "t/crypt";
const DOORS = ["t/door-n", "t/door-e", "t/door-s", "t/door-w", "t/door-apse"];
const out = (id, at) => ({ id, kind: "sited", by: "t", at, extent: { w: 2, h: 2 }, body: `${id}, the way back out.`,
  entry: { word: "neutral", into: "t/grounds" } });

function world() {
  return { marks: [
    { id: "t/grounds", kind: "sited", by: "t", at: { x: 0, y: 0 }, extent: { w: 1000, h: 1000 }, body: "The open Grounds." },
    // the Spire: one way in, the vestibule, landing inside the Gilded Doors
    { id: SPIRE, kind: "sited", by: "t", class: "dungeon", at: { x: -200, y: 0 }, extent: { w: 200, h: 200 }, body: "The Spire.",
      entry: { into: "t/vestibule", lands_at: "t/doors-inside" } },
    { id: "t/vestibule", kind: "sited", by: "t", at: { x: -280, y: 0 }, extent: { w: 30, h: 30 }, body: "The vestibule." },
    { id: "t/hall", kind: "sited", by: "t", at: { x: -180, y: 0 }, extent: { w: 120, h: 150 }, body: "The hall." },
    { id: "t/doors-inside", kind: "sited", by: "t", at: { x: -292, y: 0 }, extent: { w: 2, h: 2 }, body: "The Gilded Doors, from inside.",
      entry: { word: "neutral", into: "t/grounds" } },
    { id: "t/doors-outside", kind: "sited", by: "t", at: { x: -302, y: 0 }, extent: { w: 2, h: 2 }, body: "The Gilded Doors.",
      entry: { word: "neutral", into: "t/vestibule", lands_at: "t/doors-inside" } },
    // the Chapel: five doors, picked from; each door is its own landing
    { id: CHAPEL, kind: "sited", by: "t", class: "dungeon", at: { x: 200, y: 0 }, extent: { w: 200, h: 200 }, body: "The Chapel.",
      entry: { word: "welcomed", into: DOORS } },
    { id: "t/nave", kind: "sited", by: "t", at: { x: 200, y: 20 }, extent: { w: 120, h: 160 }, body: "The nave." },
    { id: "t/apse", kind: "sited", by: "t", at: { x: 200, y: -80 }, extent: { w: 60, h: 30 }, body: "The apse." },
    { id: "t/altar", kind: "sited", by: "t", at: { x: 200, y: 0 }, extent: { w: 4, h: 2 }, body: "The altar." },
    out("t/door-n", { x: 200, y: -59 }), out("t/door-e", { x: 259, y: 20 }), out("t/door-s", { x: 200, y: 99 }),
    out("t/door-w", { x: 141, y: 20 }), out("t/door-apse", { x: 200, y: -94 }),
    // the Crypt: no into of its own, one portal leads in
    { id: CRYPT, kind: "sited", by: "t", class: "dungeon", at: { x: 0, y: 300 }, extent: { w: 60, h: 60 }, body: "The Crypt." },
    { id: "t/crypt-room", kind: "sited", by: "t", at: { x: 0, y: 300 }, extent: { w: 50, h: 50 }, body: "The crypt's one room." },
    { id: "t/crypt-out", kind: "sited", by: "t", at: { x: 0, y: 280 }, extent: { w: 2, h: 2 }, body: "Up and out.",
      entry: { word: "neutral", into: "t/grounds" } },
    { id: "t/crypt-hatch", kind: "sited", by: "t", at: { x: 0, y: 260 }, extent: { w: 2, h: 2 }, body: "A hatch into the crypt.",
      entry: { word: "neutral", into: "t/crypt-room" } },
  ] };
}
const occ = (stack) => new Map([["ann", stack]]);
const AT = (x, y) => ({ x, y, name: "ann" });
const acts = (r) => r.rows.map((l) => l.split(" · ")[2]);

test("a one-door dungeon is entered directly, from anywhere in its extent, straight through to its into's landing", () => {
  // the far corner of the Spire, nowhere near its doors
  const a = enter(AT(-110, 90), SPIRE, world(), { occupancy: occ(["t/grounds"]), handle: "ann", at: 300 });
  assert.equal(a.error, undefined);
  assert.equal(a.refused, null);
  assert.equal(a.via, SPIRE, "the Spire itself is the way in");
  assert.equal(a.into, "t/vestibule");
  assert.deepEqual(acts(a), [`enters ${SPIRE}`, "enters t/vestibule"]);
  assert.deepEqual(a.within, ["t/grounds", SPIRE, "t/vestibule"]);
  assert.deepEqual({ x: a.landing.x, y: a.landing.y, mark: a.landing.mark }, { x: -289.5, y: 0, mark: "t/doors-inside" }, "set down a step in from the Gilded Doors (row 68 (a))");
  assert.equal(a.walk, null, "standing in its extent: no walk to a door first");
  assert.match(a.rows[0], /word neutral/, "the Spire writes no word, so it answers neutral, as any mark does");
});

test("from outside the extent the passage names the walk to it (the office's reach refuses), as at every threshold", () => {
  const a = enter(AT(-400, 0), SPIRE, world(), { occupancy: occ(["t/grounds"]), handle: "ann" });
  assert.deepEqual(a.walk, { to: { x: -200, y: 0 }, mark: SPIRE });
});

test("a five-door dungeon asks which door, and nothing is recorded until the resident picks", () => {
  const a = enter(AT(150, 60), CHAPEL, world(), { occupancy: occ(["t/grounds"]), handle: "ann" });
  assert.deepEqual(a.rows, [], "nothing recorded");
  assert.equal(a.stranded, CHAPEL);
  assert.deepEqual(a.choose, DOORS.map((id) => ({ id, body: `${id}, the way back out.` })), "each door's id and body, in the order written");
  assert.match(a.note, /Enter again with into: one of t\/door-n, t\/door-e, t\/door-s, t\/door-w, t\/door-apse\. Nothing was recorded\./);
});

test("a wrong pick is refused, names the ways, and records nothing", () => {
  const a = enter(AT(150, 60), CHAPEL, world(), { occupancy: occ(["t/grounds"]), handle: "ann", into: "t/vestibule" });
  assert.match(a.error, /^into: "t\/vestibule" is not one of t\/chapel's ways; pick one of: t\/door-n, /);
  assert.deepEqual(a.choose.map((c) => c.id), DOORS);
  assert.equal(a.rows, undefined);
});

test("a pick lands you at that door, however far it is from where you stand, with no walk; you are in the room it opens on, never inside the doorway", () => {
  // standing at the Chapel's south-west, picking the apse door at its far north
  const a = enter(AT(150, 90), CHAPEL, world(), { occupancy: occ(["t/grounds"]), handle: "ann", into: "t/door-apse" });
  assert.equal(a.into, "t/door-apse");
  assert.equal(a.walk, null);
  assert.deepEqual(acts(a), [`enters ${CHAPEL}`, "enters t/apse"]);
  assert.deepEqual(a.within, ["t/grounds", CHAPEL, "t/apse"]);
  assert.deepEqual({ x: a.landing.x, y: a.landing.y }, { x: 200, y: -91.5 }, "a 1.5 m step in from the apse door (row 68 (a)), off its square");
  assert.match(a.rows[0], /word welcomed/, "the Chapel's own word rides every row");
  // the west door opens on the nave
  const w = enter(AT(150, 90), CHAPEL, world(), { occupancy: occ(["t/grounds"]), handle: "ann", into: "t/door-w" });
  assert.deepEqual(w.within, ["t/grounds", CHAPEL, "t/nave"]);
  assert.deepEqual({ x: w.landing.x, y: w.landing.y }, { x: 143.5, y: 20 });
});

test("a door counts as a threshold only inside the place entered; any other way is entered as before", () => {
  const m = world().marks, byId = new Map(m.map((x) => [x.id, x]));
  assert.equal(passageTargetOf(byId.get(CHAPEL), byId.get("t/door-s"), m).id, "t/nave");
  assert.equal(passageTargetOf(byId.get("t/doors-outside"), byId.get("t/vestibule"), m).id, "t/vestibule");
  // a portal OUTSIDE the place naming a door elsewhere still enters what it names
  assert.equal(passageTargetOf(byId.get("t/crypt-hatch"), byId.get("t/doors-inside"), m).id, "t/doors-inside");
});

test("a dungeon with no into keeps a clear refusal that names its ways in", () => {
  const a = enter(AT(0, 300), CRYPT, world(), { occupancy: occ(["t/grounds"]), handle: "ann" });
  assert.equal(a.refused, "dungeon");
  assert.equal(a.error, "t/crypt is a dungeon that names no way in of its own (no `into`), so it is entered through the portals that lead into it. Its ways in: t/crypt-hatch");
  assert.deepEqual(a.portals.map((p) => p.id), ["t/crypt-hatch"]);
});

test("G3 holds: a mark inside a dungeon is no mark to an outsider, and inside one only a portal enters", () => {
  const w = world();
  assert.equal(enter(AT(200, 0), "t/altar", w, { occupancy: occ(["t/grounds"]), handle: "ann" }).error, "no mark 't/altar' to enter");
  const inside = enter(AT(200, 0), "t/altar", w, { occupancy: occ(["t/grounds", CHAPEL, "t/nave"]), handle: "ann" });
  assert.equal(inside.refused, "dungeon");
  assert.match(inside.error, /^you are inside t\/chapel, a dungeon — inside one, the only way to enter anything is a portal/);
});

test("leaving a dungeon entered through its own into sets you down at its nearest way in, as an entry with no portal on record", () => {
  const w = world();
  const a = exit("t/vestibule", w, { occupancy: occ(["t/grounds", SPIRE, "t/vestibule"]), handle: "ann",
    confirm: true, enteredVia: SPIRE, state: AT(-292, 0) });
  assert.deepEqual(a.within, ["t/grounds"]);
  assert.deepEqual(a.landing, { x: -302, y: 0, via: "t/doors-outside", chosen: true });
  // the dungeon is not listed among its own ways in: its outline is no stop to be set down at
  assert.deepEqual(portalsInto(SPIRE, w.marks).map((p) => p.id), ["t/doors-outside"]);
  assert.equal(dungeonLanding(CHAPEL, w.marks, { enteredVia: CHAPEL, state: AT(200, -94) }), null,
    "a dungeon whose only way in is its own into has no portal to set you down at (WLD-63 gap, named in the report)");
});

test("the lint reads both: a dungeon's own into and a list of doors lint clean", () => {
  const errors = portalFindings(world().marks).filter((f) => f.sev === "ERROR");
  assert.deepEqual(errors, []);
  const warns = portalFindings(world().marks).filter((f) => f.sev === "WARN").map((f) => f.mark);
  assert.deepEqual(warns, [], "every room the doors open on has a way out");
});
