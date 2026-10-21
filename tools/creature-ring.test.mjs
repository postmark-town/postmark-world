// creature-ring.test.mjs — WLD-82 (RULED by Darko 2026-10-19 17:09): each live
// creature's awareness ring, at its kind's ring_m, as a faint dotted circle in
// the creature's red, wearing the map's one faint-ring style (the expired
// conversation's line), never a copy of it. The office's find row carries the
// ring_m (office WLD-82 part 1 of 2); no ring_m, no ring.
// Run: node --test tools/creature-ring.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { creatureRingSVG, liveCreaturesFrom } from "../spectator/viewer.mjs";
import { ringRoomOf, ringRoomOutline, inCreatureRing } from "./portals.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
// a CSS rule by its exact selector, at the start of a line
const escRe = (t) => t.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
const rule = (sel) => (SOURCE.match(new RegExp("^" + escRe(sel) + " \\{[^}]*\\}", "m")) ?? [""])[0];

test("the find row's ring_m rides through to the page's creature; none when the office sends none", () => {
  const [wolf, bat] = liveCreaturesFrom({ found: { creatures: [
    { id: "creature:wolf-259-1", kind: "wolf", name: "a grey wolf", at: { x: 10, y: 20 }, ring_m: 80 },
    { id: "creature:bat-259-1", kind: "bat", at: { x: 0, y: 0 } },
  ] } });
  assert.equal(wolf.ring_m, 80);
  assert.equal("ring_m" in bat, false, "no field, no ring");
});

test("the ring is the kind's ring_m in painting pixels, centred on the creature", () => {
  assert.equal(creatureRingSVG({ at: { x: 100, y: 200 }, ringM: 80, mPerPx: 5 }),
    '<circle cx="100" cy="200" r="16" class="wv-faint-ring ov-creature-aware"/>');
  assert.equal(creatureRingSVG({ at: { x: 100, y: 200 }, ringM: undefined, mPerPx: 5 }), "", "no ring_m, no ring");
  assert.equal(creatureRingSVG({ at: { x: 100, y: 200 }, ringM: 80, mPerPx: 0 }), "", "no scale, no ring");
  assert.equal(creatureRingSVG({ at: { x: "x", y: 0 }, ringM: 80, mPerPx: 5 }), "", "no point, no ring");
});

test("ONE faint-ring style: the expired conversation's dotted line, worn by the ring in the creature's red", () => {
  const shared = rule(".wv-faint-ring, .wv-convo");
  assert.match(shared, /stroke-dasharray:3 4;/, "dotted, as an expired conversation is");
  assert.match(shared, /stroke-width:1\.5;/);
  assert.doesNotMatch(rule(".wv-convo"), /stroke-dasharray/, "the conversation's own rule carries no second copy of the line");
  const aware = rule(".ov-creature-aware");
  assert.match(aware, /stroke:#d8706a;/, "the creature's own red (its token's rim)");
  assert.doesNotMatch(aware, /dasharray|stroke-width/, "the line is the shared one, not a copy");
  assert.match(rule(".wv-convo.is-live"), /stroke-dasharray:none;/, "a live conversation still breathes solid");
});

test("[pin] the page draws each creature's ring under the tokens, from its own ring_m, stopped at its room", () => {
  assert.match(SOURCE, /const ringRoom = c\.ring_m \? ringRoomOutline\(ringRoomOf\(\{ x: c\.x, y: c\.y \}, allMarks\(\)\)\) : null;/);
  assert.match(SOURCE, /rings \+= creatureRingSVG\(\{ at: px\(\{ x: c\.x, y: c\.y \}\), ringM: c\.ring_m, mPerPx: mapCtx\?\.mPerPx,\s+room: ringRoom \? ringRoom\.map\(\(p\) => px\(p\)\) : null, clipId: `wv-ring-\$\{c\.id\}` \}\);/);
  assert.match(SOURCE, /return rings \+ out;/, "rings first: under every token");
});

// ── INDOORS A RING STOPS AT THE ROOM'S WALLS (WLD-25, 2026-10-21) ─────────────
// A dungeon of two rooms side by side, a door in their shared wall, a table in
// the west room, and a field outside it.
const DUNGEON = { id: "d/keep", kind: "sited", class: "dungeon", at: { x: 50, y: 0 }, extent: { w: 100, h: 40 } };
const WEST = { id: "d/west", kind: "sited", at: { x: 25, y: 0 }, extent: { w: 50, h: 40 } };
const EAST = { id: "d/east", kind: "sited", at: { x: 75, y: 0 }, extent: { w: 50, h: 40 },
  points: [[50, -20], [100, -20], [100, 20], [60, 20], [50, 10]] };
const DOOR = { id: "d/west-to-east", kind: "sited", at: { x: 50, y: 0 }, extent: { w: 2, h: 2 }, entry: { word: "neutral", into: "d/east" } };
const TABLE = { id: "d/table", kind: "sited", class: "thing", at: { x: 30, y: 0 }, extent: { w: 4, h: 3 } };
const FIELD = { id: "t/field", kind: "sited", at: { x: 50, y: 200 }, extent: { w: 300, h: 100 } };
const MARKS = [DUNGEON, WEST, EAST, DOOR, TABLE, FIELD];

test("a creature in a dungeon's room hears inside that room; outdoors it has no room", () => {
  assert.equal(ringRoomOf({ x: 20, y: 5 }, MARKS)?.id, "d/west");
  assert.equal(ringRoomOf({ x: 80, y: 0 }, MARKS)?.id, "d/east", "a room's own ring holds it");
  assert.equal(ringRoomOf({ x: 30, y: 0 }, MARKS)?.id, "d/west", "on a table, the room around it: a thing is never a room");
  assert.equal(ringRoomOf({ x: 50, y: 0 }, MARKS)?.id, "d/west", "in a doorway, a room and never the door");
  assert.equal(ringRoomOf({ x: 50, y: 200 }, MARKS), null, "a field no dungeon governs is no room: the plain circle");
  assert.equal(ringRoomOf({ x: 500, y: 500 }, MARKS), null, "open country: no room");
  assert.equal(ringRoomOf({ x: "x", y: 0 }, MARKS), null);
});

test("the ring is ring_m AND the room: an act through the wall is not heard", () => {
  const room = ringRoomOf({ x: 40, y: 0 }, MARKS);
  assert.equal(inCreatureRing({ x: 45, y: 5 }, { x: 40, y: 0 }, 30, room), true, "same room, in reach");
  assert.equal(inCreatureRing({ x: 60, y: 0 }, { x: 40, y: 0 }, 30, room), false, "in reach, but through the wall");
  assert.equal(inCreatureRing({ x: 60, y: 0 }, { x: 40, y: 0 }, 30, null), true, "outdoors the circle alone decides");
  assert.equal(inCreatureRing({ x: 5, y: 0 }, { x: 40, y: 0 }, 30, room), false, "in the room, out of reach");
});

test("the outline it stops at: the room's own ring when it has one, else its box", () => {
  assert.deepEqual(ringRoomOutline(EAST), [{ x: 50, y: -20 }, { x: 100, y: -20 }, { x: 100, y: 20 }, { x: 60, y: 20 }, { x: 50, y: 10 }]);
  assert.deepEqual(ringRoomOutline(WEST), [{ x: 0, y: -20 }, { x: 50, y: -20 }, { x: 50, y: 20 }, { x: 0, y: 20 }]);
  assert.equal(ringRoomOutline(null), null);
});

test("indoors the drawn ring is clipped to the room's outline; outdoors it is the plain circle", () => {
  const room = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }];
  assert.equal(creatureRingSVG({ at: { x: 5, y: 4 }, ringM: 30, mPerPx: 5, room, clipId: "wv-ring-creature:bat-1-0" }),
    '<clipPath id="wv-ring-creature-bat-1-0"><polygon points="0,0 10,0 10,8"/></clipPath>'
    + '<circle cx="5" cy="4" r="6" class="wv-faint-ring ov-creature-aware" clip-path="url(#wv-ring-creature-bat-1-0)"/>');
  assert.equal(creatureRingSVG({ at: { x: 5, y: 4 }, ringM: 30, mPerPx: 5, room: null, clipId: "x" }),
    '<circle cx="5" cy="4" r="6" class="wv-faint-ring ov-creature-aware"/>');
  assert.equal(creatureRingSVG({ at: { x: 5, y: 4 }, ringM: 30, mPerPx: 5, room: [{ x: 0, y: 0 }, { x: 1, y: 1 }], clipId: "x" }),
    '<circle cx="5" cy="4" r="6" class="wv-faint-ring ov-creature-aware"/>', "fewer than three points is no outline");
  assert.equal(creatureRingSVG({ at: { x: 5, y: 4 }, ringM: 30, mPerPx: 5, room, clipId: null }),
    '<circle cx="5" cy="4" r="6" class="wv-faint-ring ov-creature-aware"/>', "no id, no clip");
});
