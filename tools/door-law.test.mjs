// door-law.test.mjs — WLD-253 (CORE-129 layer 1, ruled 2026-11-25): door is a class.   node --test tools/door-law.test.mjs
//
// The ruling: `the-town/door` stands under sited, a sibling of thing, and answers makers: false, which governs amending as well as making;
// `into`, `lands_at` and `requires` are declared on door alone; the 44 doors that stood are re-kinded to door by the town, keeping every
// value and their makers; thing declares `entry: none`, locked (the override rule's first use). A founder-merged World PR is the town's act
// (WLD-253/town-act), so the gate reads what a record says and the office (doorWriteVerdict) asks who wrote it.
//
// These are the falsifiers: an into on a thing, a dungeon or a stairs passing; a resident's 45th door standing; an alias or an entry-carried
// field slipping through; a resident's amend of a door's fields allowed; a fed ring that no longer opens. Each goes red here by name.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, cpSync, rmSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  DOOR_CLASS, DOOR_FIELDS, DOOR_LAW, NO_WAY_IN, REKINDED_DOORS, isRekindedDoor, isDoorClass, isDoorMark, classHasNoWayIn,
  doorFieldWrites, doorStanding, doorRefusal, doorWriteVerdict, allowedDoors,
} from "./door-law.mjs";
import { loadMarks } from "./marks-fold.mjs";
import { classIndex, classChain, propertyOf, propertyAt } from "./class-properties.mjs";
import { enter } from "./world-verbs.mjs";
import { landingOf, ringRoomOf } from "./portals.mjs";
import { entryLawOf } from "./enter-exit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MARKS_DIR = join(HERE, "..", "WORLD", "marks");
const REAL = join(MARKS_DIR, "let-there-be-light");
const LINT = join(HERE, "mark-lint.mjs");
const SCRATCH = [];
after(() => { for (const d of SCRATCH) rmSync(d, { recursive: true, force: true }); });

const TOWN = "the-town";
const LISTED = "little-bird/a-ring-in-the-pantry"; // one of the 44, a resident's
const LIVE = loadMarks(MARKS_DIR).filter((m) => m && !m._error);
const IDX = classIndex(LIVE);
const rec = (id, kind, by, fields = {}) => ({ id, kind, by, at: { x: 0, y: 0 }, extent: { w: 2, h: 2 }, body: id, ...fields });

// ── the class graph, as ruled ────────────────────────────────────────────────

test("THE GRAPH: door under sited, makers false; into, lands_at and requires on door alone; door may hold; thing's entry the locked none", () => {
  assert.deepEqual(classChain(IDX, DOOR_CLASS).map((c) => String(c.class)), ["door", "sited", "mark", "postmark-node"]);
  assert.equal(propertyOf(IDX, "door", "makers")?.value, false);
  assert.equal(propertyOf(IDX, "door", "makers")?.tier, "constitution");
  for (const f of DOOR_FIELDS) {
    const p = propertyOf(IDX, "door", f);
    assert.equal(p?.from, "door", `${f} is door's own`);
    assert.equal(p.tier, "sovereign", `${f}: each door's own value (a tier says whose value, never who may write it)`);
    for (const k of ["mark", "sited", "thing", "portal-ground", "stairs", "dungeon", "vehicle", "halloween-candy-bowl"])
      assert.equal(propertyOf(IDX, k, f), null, `${k} declares no ${f}`);
  }
  assert.equal(propertyAt(IDX, "door", ["holder", "capacity"])?.from, "door", "a door may hold, with its own capacity");
  assert.equal(propertyAt(IDX, "door", ["holder", "open"])?.from, "door");
  assert.equal(propertyOf(IDX, "door", "entry")?.tier, "sovereign", "a door's entry (its word and terms) stays its maker's");
  const thingEntry = propertyOf(IDX, "thing", "entry");
  assert.deepEqual([thingEntry?.value, thingEntry?.tier, thingEntry?.from], [NO_WAY_IN, "constitution", "thing"]);
  assert.equal(propertyOf(IDX, "sited", "entry")?.value, null, "the parent's entry is unchanged");
  assert.equal(LIVE.some((m) => m.id === "the-town/mark-entry-into" || m.id === "the-town/mark-entry-lands-at"), false,
    "the superseded constitution children are gone");
});

test("THE OVERRIDE RULE: the nearest declaration wins, a thing's subclass inherits the locked none, and only the town's subclass loosens it", () => {
  assert.equal(classHasNoWayIn("thing", IDX), true);
  assert.equal(classHasNoWayIn("halloween-candy-bowl", IDX), true, "an ordinary subclass inherits it");
  assert.equal(classHasNoWayIn("sited", IDX), false);
  assert.equal(classHasNoWayIn("door", IDX), false);
  assert.equal(classHasNoWayIn("thing", null), false, "no graph, no answer");
  // a town subclass that redeclares entry loosens it (the bag of holding's shape, CORE-129 layer 2; not built here)
  const loose = [{ id: "the-town/a-roomy-bag", kind: "class", by: TOWN, class: "a-roomy-bag", extends: "thing" },
                 { id: "the-town/a-roomy-bag-entry", kind: "property", by: TOWN, tier: "constitution", name: "entry", default: "null", parent: "the-town/a-roomy-bag" }];
  assert.equal(classHasNoWayIn("a-roomy-bag", classIndex([...LIVE, ...loose])), false, "the town's subclass may loosen it");
  // a household's class is no class the index reads, so it loosens nothing (and the lint refuses the redeclaration: the gate test below)
  const theirs = loose.map((m) => ({ ...m, by: "alice", id: m.id.replace("the-town/", "alice/") }));
  assert.equal(classIndex([...LIVE, ...theirs]).byName.has("a-roomy-bag"), false);
});

// ── the 44 ───────────────────────────────────────────────────────────────────

test("THE 44: 3 + 41 distinct names, each re-kinded to door with its maker and its fields its own; LOGOS names the same 44", () => {
  assert.equal(REKINDED_DOORS.length, 44);
  assert.equal(new Set(REKINDED_DOORS).size, 44);
  const byId = new Map(LIVE.map((m) => [m.id, m]));
  for (const id of REKINDED_DOORS) {
    const m = byId.get(id);
    assert.ok(m, `${id} stands in the tree`);
    assert.equal(m.kind, "door", id);
    assert.equal(m.by, id.split("/")[0], `${id} keeps its maker`);
    assert.ok(m.into !== undefined, `${id} writes its into as its own field`);
    assert.deepEqual(doorFieldWrites(m).filter((w) => w.where === "entry"), [], `${id} carries nothing in entry`);
    assert.deepEqual(doorStanding(m, { marks: IDX }), { door: true, allowed: true, why: "rekinded" }, id);
  }
  assert.equal(REKINDED_DOORS.filter((id) => id.startsWith("little-bird/")).length, 3);
  assert.equal(REKINDED_DOORS.filter((id) => id.startsWith("wright/")).length, 41);
  // every resident door in the tree is on the list, and nothing in it is refused (the census at the named ref is the dry run's)
  const residents = LIVE.filter((m) => isDoorMark(m, IDX) && m.by !== TOWN).map((m) => m.id);
  assert.deepEqual(residents.filter((id) => !isRekindedDoor(id)), []);
  assert.deepEqual(LIVE.filter((m) => m.kind !== "class" && m.kind !== "property" && doorRefusal(m, { marks: IDX })).map((m) => m.id), []);
  assert.deepEqual(allowedDoors(LIVE), [...REKINDED_DOORS].sort());
  const logos = readFileSync(join(HERE, "..", "LOGOS", "classes.md"), "utf8");
  const start = logos.indexOf("- **Door is a class, and doors are the town's");
  const line = logos.slice(start, logos.indexOf("tools/door-law.mjs", start));
  assert.deepEqual([...line.matchAll(/`((?:little-bird|wright)\/[a-z0-9-]+)`/g)].map((m) => m[1]).sort(), [...REKINDED_DOORS].sort());
});

// ── may this record stand ────────────────────────────────────────────────────

test("STANDING: the town's door and one of the 44 by name stand; a resident's 45th door and a lookalike name do not (makers: false)", () => {
  const door = (id, by) => rec(id, "door", by, { entry: { word: "neutral" }, into: "g/room" });
  assert.deepEqual(doorStanding(door("g/town-door", TOWN)), { door: true, allowed: true, why: "town" });
  assert.deepEqual(doorStanding(door(LISTED, "little-bird")), { door: true, allowed: true, why: "rekinded" });
  assert.deepEqual(doorStanding({ ...door(LISTED, "little-bird"), into: "anywhere/else" }).allowed, true, "the name is the grandfathering, not its values");
  for (const id of ["little-bird/a-new-door", "little-bird/a-ring-in-the-pantry-2", "little-bird/a-ring-in-the-pantr", "wright/spire-new-wing",
                    "Little-Bird/a-ring-in-the-pantry", " little-bird/a-ring-in-the-pantry"])
    assert.deepEqual(doorStanding(door(id, "little-bird")), { door: true, allowed: false, why: "makers" }, id);
  // a door that names no way yet is still a door, and still the town's to make
  assert.deepEqual(doorStanding(rec("rena/a-frame", "door", "rena")), { door: true, allowed: false, why: "makers" });
  const r = doorRefusal(door("little-bird/a-new-door", "little-bird"));
  assert.equal(r.words, `little-bird/a-new-door is a door, and it is not the town's or one of the 44 the town re-kinded — ${DOOR_LAW}`);
  // a subclass of door is a door, by the graph
  const sub = [{ id: "the-town/trapdoor", kind: "class", by: TOWN, class: "trapdoor", extends: "door" }];
  assert.equal(isDoorClass("trapdoor", classIndex([...LIVE, ...sub])), true);
  assert.equal(isDoorClass("trapdoor"), false, "without the graph, only door itself");
});

test("STANDING: a door field on any other class is refused by name, flat or inside entry, whoever wrote it", () => {
  for (const [klass, extra] of [["thing", {}], ["sited", {}], ["dungeon", { class: "dungeon" }], ["stairs", { class: "stairs" }], ["portal-ground", { class: "portal-ground" }]]) {
    const kind = extra.class ? "sited" : klass;
    for (const by of ["rena", TOWN, "wright"]) {
      const flat = doorStanding(rec("x/y", kind, by, { ...extra, into: "g/room", lands_at: "g/mat" }));
      assert.deepEqual(flat, { door: false, allowed: false, why: "fields-off-door", fields: ["into", "lands_at"], klass: klass === "sited" ? null : klass }, `${klass} by ${by}`);
      const carried = doorStanding(rec("x/y", kind, by, { ...extra, entry: { word: "neutral", requires: { holds: ["k"] } } }));
      assert.deepEqual(carried.fields, ["entry.requires"], `${klass} by ${by}: entry-carried`);
    }
  }
  assert.match(doorRefusal(rec("rena/a-chest", "thing", "rena", { into: "g/room" })).words,
    /^rena\/a-chest writes into, and it is a thing, not a door — into, lands_at and requires are door's alone/);
  assert.match(doorRefusal(rec("rena/a-mark", "sited", "rena", { entry: { into: "g/room" } })).words, /^rena\/a-mark writes entry\.into, and it is no class's instance, not a door/);
  // a stairs that writes no entry is no door (its class's default way is no field), and an entry's word and terms are no door field
  assert.deepEqual(doorStanding(rec("home/stair", "sited", "home", { class: "stairs" })), { door: false, allowed: true, why: "not-a-door" });
  assert.deepEqual(doorStanding(rec("x/y", "sited", "rena", { entry: { word: "welcomed", edge: "within", consequence: "mind the step" } })),
    { door: false, allowed: true, why: "not-a-door" });
});

test("STANDING: presence, not truth, and every spelling: a door writing a field in entry, misspelled, or twice is refused by name", () => {
  const door = (fields) => rec("g/d", "door", TOWN, fields);
  assert.deepEqual(doorStanding(door({ into: "g/room", lands_at: { x: 1, y: 2 }, requires: { holds: ["k"] } })).allowed, true);
  for (const [fields, named] of [
    [{ entry: { word: "neutral", into: "g/room" } }, ["entry.into"]],
    [{ Into: "g/room" }, ["Into"]],
    [{ into: "g/room", "lands-at": "g/mat" }, ["lands-at"]],
    [{ into: "g/room", landsAt: "g/mat" }, ["landsAt"]],
    [{ into: "g/room", REQUIRES: { holds: ["k"] } }, ["REQUIRES"]],
    [{ into: "g/room", Into: "g/other" }, ["Into"]],
    [{ into: "g/room", entry: { into: "g/room" } }, ["entry.into"]],
  ]) {
    const s = doorStanding(door(fields));
    assert.equal(s.why, "field-spelling", JSON.stringify(fields));
    assert.deepEqual(s.fields, named, JSON.stringify(fields));
  }
  // null, "" and [] are written fields (a removal written as a value is still a write)
  for (const v of [null, "", []]) assert.equal(doorStanding(rec("x/y", "thing", "rena", { into: v })).why, "fields-off-door", JSON.stringify(v));
  // a key that merely contains the word is no field
  for (const k of ["intoit", "lands", "required"]) assert.equal(doorStanding(rec("x/y", "thing", "rena", { [k]: "g/x" })).why, "not-a-door", k);
  // every spelling is kept, not folded into the first (the alias lesson of 2026-11-25 19:33Z)
  assert.deepEqual(doorFieldWrites({ into: "A", Into: "B", entry: { INTO: "C" } }).map((w) => `${w.where}:${w.key}`), ["flat:into", "flat:Into", "entry:INTO"]);
});

// ── may this write be made (the office's leave-mark and amend, POS-1238) ─────

test("WRITE: a resident may not create a door, make a mark a door or no longer one, or change any door field, on one of the 44 too", () => {
  const ring = LIVE.find((m) => m.id === LISTED);
  const v = (before, after, by = "little-bird") => doorWriteVerdict({ by, before, after, marks: IDX });
  const refusedFor = (r, changed, why) => {
    assert.equal(r.allowed, false, why);
    assert.equal(r.why, "makers", why);
    assert.deepEqual(r.changed, changed, why);
    assert.ok(r.words.endsWith(DOOR_LAW), why);
  };
  refusedFor(v(null, rec("little-bird/a-new-door", "door", "little-bird", { into: "g/room" })), [...DOOR_FIELDS], "create a door");
  refusedFor(v(rec("little-bird/a-shed", "sited", "little-bird"), rec("little-bird/a-shed", "door", "little-bird", { into: "g/room" })), [...DOOR_FIELDS], "make a mark a door");
  refusedFor(v(ring, { ...ring, kind: "sited", into: undefined, lands_at: undefined, requires: undefined }), [...DOOR_FIELDS], "a door made no longer a door");
  refusedFor(v(ring, { ...ring, into: "somewhere/else" }), ["into"], "change into");
  refusedFor(v(ring, { ...ring, lands_at: { x: 1, y: 1 } }), ["lands_at"], "change lands_at");
  refusedFor(v(ring, { ...ring, requires: { holds: ["little-bird/a-crumb"], shown: false } }), ["requires"], "change requires");
  const { requires, ...noRequires } = ring;
  refusedFor(v(ring, noRequires), ["requires"], "an ordinary amend that drops a door field is a change, so the office must carry them over");
  const { lands_at, ...noLanding } = ring;
  refusedFor(v(ring, { ...noLanding, into: ["the-town/the-town-centre"] }), ["lands_at"], "into as a list of one is the same; lands_at gone is not");
});

test("WRITE: welcome words and the mark's own place stay the maker's; the town may; an actor not read is null; form is checked for everyone", () => {
  const ring = LIVE.find((m) => m.id === LISTED);
  const v = (before, after, by = "little-bird") => doorWriteVerdict({ by, before, after, marks: IDX });
  assert.deepEqual(v(ring, { ...ring, at: { x: ring.at.x + 3, y: ring.at.y }, body: "A ring, moved." }), { allowed: true, why: "no-door-change" }, "moving it stays the maker's");
  assert.deepEqual(v(ring, { ...ring, entry: { word: "welcomed" } }), { allowed: true, why: "no-door-change" }, "its word stays the maker's");
  assert.deepEqual(v(ring, { ...ring, into: [ring.into] }), { allowed: true, why: "no-door-change" }, "the same into, as a list of one");
  assert.deepEqual(v(ring, null), { allowed: true, why: "withdraw" }, "withdrawing stays the maker's: never silently revoked");
  assert.deepEqual(v(null, rec("little-bird/a-note", "sited", "little-bird")), { allowed: true, why: "not-a-door" });
  assert.deepEqual(v(ring, { ...ring, into: "anywhere/else" }, TOWN), { allowed: true, why: "town" });
  assert.deepEqual(v(null, rec("the-town/a-door", "door", TOWN, { into: "g/room" }), TOWN), { allowed: true, why: "town" });
  for (const admin of ["wright", "jetto"]) assert.equal(v(null, rec(`${admin}/d`, "door", admin, { into: "g/room" }), admin).allowed, false, `${admin}: WLD-21's admin classes grant no door`);
  for (const by of [undefined, null, "", 7, {}]) assert.deepEqual(doorWriteVerdict({ by, before: ring, after: { ...ring, into: "x" } }), { allowed: null, why: "actor-unread" }, String(by));
  // form, for every writer, the town included: a door field on a thing, or a door field misspelled or riding in entry
  const thing = rec("rena/a-chest", "thing", "rena", { into: "g/room" });
  for (const by of ["rena", TOWN]) {
    const r = doorWriteVerdict({ by, before: null, after: thing, marks: IDX });
    assert.deepEqual([r.allowed, r.why, r.changed], [false, "fields-off-door", ["into"]], by);
    assert.match(r.words, /^into on a thing — into, lands_at and requires are door's alone/);
  }
  const misspelt = doorWriteVerdict({ by: TOWN, before: null, after: rec("the-town/d", "door", TOWN, { into: "a", Into: "b" }), marks: IDX });
  assert.deepEqual([misspelt.allowed, misspelt.why, misspelt.changed], [false, "field-spelling", ["Into"]]);
  const carried = doorWriteVerdict({ by: TOWN, before: null, after: rec("the-town/d", "door", TOWN, { entry: { into: "a" } }), marks: IDX });
  assert.deepEqual([carried.why, carried.changed], ["field-spelling", ["entry.into"]]);
});

test("WRITE FAILS CLOSED on the class graph: no graph, an empty one, one without door, or a class it cannot place answers null, never a yes", () => {
  const create = rec("rena/a-porch", "porch", "rena", { into: "g/room" });
  const amend = { before: rec("rena/a-porch", "porch", "rena", { into: "g/room" }), after: rec("rena/a-porch", "porch", "rena", { into: "g/elsewhere" }) };
  const noDoor = classIndex(LIVE.filter((m) => !(m.kind === "class" && m.class === "door")));
  for (const [label, marks] of [["no graph", null], ["no graph (undefined)", undefined], ["an empty graph", []], ["a graph without door", noDoor]]) {
    assert.deepEqual(doorWriteVerdict({ by: "rena", before: null, after: create, marks }), { allowed: null, why: "classes-unread", classes: ["door"] }, `${label}: create`);
    assert.equal(doorWriteVerdict({ by: "rena", ...amend, marks }).allowed, null, `${label}: amend`);
    assert.equal(doorWriteVerdict({ by: "rena", before: null, after: rec("rena/a-note", "sited", "rena"), marks }).allowed, null, `${label}: even a plain mark is unjudged`);
  }
  // the graph in hand, but not the record's class: unresolved, so null (a resident cannot pass a door subclass off by naming it)
  assert.deepEqual(doorWriteVerdict({ by: "rena", before: null, after: create, marks: IDX }), { allowed: null, why: "classes-unread", classes: ["porch"] });
  assert.deepEqual(doorWriteVerdict({ by: "rena", before: rec("rena/x", "porch", "rena"), after: rec("rena/x", "sited", "rena"), marks: IDX }).classes, ["porch"]);
  // what stays as it was: an unread actor is null first, and withdrawing (the office's own ownership rule decides who) needs no class
  assert.deepEqual(doorWriteVerdict({ by: null, before: null, after: create }), { allowed: null, why: "actor-unread" });
  assert.deepEqual(doorWriteVerdict({ by: "rena", before: amend.before, after: null }), { allowed: true, why: "withdraw" });
});

// a town-made subclass of door, as layer 2 or the town might add one: the graph says it is a door, everywhere a door is asked
const PORCH_CLASS = { id: "the-town/porch", kind: "class", by: TOWN, tier: "constitution", class: "porch", extends: "door" };
const WITH_PORCH = [...LIVE, PORCH_CLASS];

test("A DOOR SUBCLASS IS A DOOR wherever a door is asked: the write, the ring room and a room's own landing (the class graph, never the kind's spelling)", () => {
  const idx = classIndex(WITH_PORCH);
  assert.equal(isDoorClass("porch", idx), true);
  // the write: a resident's porch is a door, refused by makers; the town's stands
  const r = doorWriteVerdict({ by: "rena", before: null, after: rec("rena/a-porch", "porch", "rena", { into: "g/room" }), marks: idx });
  assert.deepEqual([r.allowed, r.why], [false, "makers"]);
  assert.deepEqual(doorWriteVerdict({ by: TOWN, before: null, after: rec("the-town/a-porch", "porch", TOWN, { into: "g/room" }), marks: idx }), { allowed: true, why: "town" });
  assert.equal(doorStanding(rec("the-town/a-porch", "porch", TOWN, { into: "g/room" }), { marks: idx }).why, "town");
  // the ring room: inside a dungeon, a door is never the room a creature hears in, and a porch is no room either
  const keep = { id: "d/keep", kind: "sited", class: "dungeon", at: { x: 50, y: 0 }, extent: { w: 100, h: 40 } };
  const inner = (kind) => ({ id: "d/inner", kind, by: TOWN, at: { x: 50, y: 0 }, extent: { w: 20, h: 20 }, into: "d/keep" });
  for (const kind of ["door", "porch"]) assert.equal(ringRoomOf({ x: 50, y: 0 }, [...WITH_PORCH, keep, inner(kind)])?.id, "d/keep", kind);
  assert.equal(ringRoomOf({ x: 50, y: 0 }, [...WITH_PORCH, keep, { ...inner("sited"), into: undefined }])?.id, "d/inner", "CONTROL: a plain room is the ring room");
  // a room's own landing: a porch-room names its landing as a door-room does
  const hallSide = { ...rec("t/hall-to-chamber", "door", TOWN, { into: "t/chamber", lands_at: "t/chamber-to-hall" }), at: { x: 5, y: -2 } };
  const chamberSide = { ...rec("t/chamber-to-hall", "door", TOWN, { into: "t/hall" }), at: { x: 5, y: 2 } };
  const hall = { id: "t/hall", kind: "sited", by: "t", at: { x: 0, y: -20 }, extent: { w: 40, h: 40 }, body: "The hall." };
  const land = (room) => landingOf(entryLawOf(hallSide), room, new Map([PORCH_CLASS, ...LIVE.filter((m) => m.kind === "class"), hall, room, hallSide, chamberSide].map((m) => [m.id, m])), { room, portal: hallSide });
  for (const kind of ["door", "porch"]) {
    const l = land({ id: "t/chamber", kind, by: TOWN, at: { x: 0, y: 15 }, extent: { w: 30, h: 30 }, body: "The chamber.", lands_at: { x: 0, y: 25 } });
    assert.deepEqual({ by: l.by, x: l.x, y: l.y }, { by: "room", x: 0, y: 25 }, kind);
  }
});

test("THE MAP: a door the camera stands within keeps its own pip, by its class (a town subclass too); no thing, no plain room, nothing by id", async () => {
  const { spineDoors } = await import("../spectator/viewer.mjs");
  const byId = new Map(WITH_PORCH.map((m) => [m.id, m]));
  // the live spine at the pantry ring: the world, the guest caves' pantry, the ring itself
  const spine = [{ id: "the-town/let-there-be-light" }, { id: "vermillion/guest-caves-pantry-of-arrival" }, { id: LISTED }];
  assert.deepEqual(spineDoors(spine, { byId, marks: WITH_PORCH }).map((m) => m.id), [LISTED], "the ring, not the pantry around it");
  const porch = rec("the-town/a-porch", "porch", TOWN, { into: "g/room" });
  const marks = [...WITH_PORCH, porch];
  const ids = (within) => spineDoors(within, { byId: new Map(marks.map((m) => [m.id, m])), marks }).map((m) => m.id);
  assert.deepEqual(ids([{ id: porch.id }, { id: LISTED }, { id: LISTED }]), [porch.id, LISTED], "a door subclass by the graph, each door once");
  // no former-thing exception: a thing (whatever it once was), a plain room and a mark with no place get none
  const asThing = { ...LIVE.find((m) => m.id === LISTED), id: "little-bird/a-thing-ring", kind: "thing" };
  const placeless = rec("the-town/a-door-nowhere", "door", TOWN, { into: "g/room", at: undefined });
  const more = [...marks, asThing, placeless];
  assert.deepEqual(spineDoors([{ id: asThing.id }, { id: "vermillion/guest-caves-pantry-of-arrival" }, { id: placeless.id }],
    { byId: new Map(more.map((m) => [m.id, m])), marks: more }).map((m) => m.id), []);
  // without the porch class in the graph, a porch is no door: the class decides, not the kind's spelling
  assert.deepEqual(spineDoors([{ id: porch.id }], { byId: new Map([[porch.id, porch]]), marks: LIVE }).map((m) => m.id), []);
});

test("THE SIGN: the glyph and the display switch call a door subclass a door with or without into, by the same graph as the map's pip; no graph, no door", async () => {
  const { doorClassesOf, thingClassesOf, markWhat } = await import("../spectator/mark-icons.mjs");
  const { markInDisplaySelection, DISPLAY_MARK_KINDS } = await import("../spectator/viewer.mjs");
  const doors = doorClassesOf(WITH_PORCH);
  assert.deepEqual([...doorClassesOf(LIVE)], [DOOR_CLASS], "the live graph: door alone");
  assert.deepEqual([...doors].sort(), ["door", "porch"], "a town subclass joins by the graph");
  for (const not of ["thing", "sited", "creature", "mark"]) assert.equal(doors.has(not), false, `${not} is no door class`);
  const opts = { doorClasses: doors, thingClasses: thingClassesOf(WITH_PORCH) };
  const ring = LIVE.find((m) => m.id === LISTED);
  const porch = rec("the-town/a-porch", "porch", TOWN);
  const porchInto = rec("the-town/a-porch-into", "porch", TOWN, { into: "g/room" });
  const room = rec("g/room", "sited", "g");
  const bowl = rec("g/bowl", "thing", "g");
  assert.equal(markWhat(ring, { ...opts, cls: "door" }), "door", "an ordinary door");
  assert.equal(markWhat(porch, { ...opts, cls: "porch" }), "door", "a door subclass without into");
  assert.equal(markWhat(porchInto, { ...opts, cls: "porch" }), "door", "a door subclass with into");
  assert.equal(markWhat(room, { ...opts, cls: "" }), "place", "a plain room stays a place");
  assert.equal(markWhat(bowl, { ...opts, cls: "thing" }), "thing", "a thing stays a thing");
  // the unknown-graph boundary: without porch in the graph (or with no graph at all), only an `into` makes it read as a door
  for (const o of [{ doorClasses: doorClassesOf(LIVE) }, {}]) {
    assert.equal(markWhat(porch, { ...o, cls: "porch" }), "place", "no graph, no door");
    assert.equal(markWhat(porchInto, { ...o, cls: "porch" }), "door", "an into is still a door's sign");
  }
  // the display switch answers to the same key: doors off hides the porch, places off does not
  assert.ok(DISPLAY_MARK_KINDS.includes("door") && DISPLAY_MARK_KINDS.includes("place"));
  const whatOf = (m) => markWhat(m, { ...opts, cls: String(m.kind) === "sited" ? "" : String(m.kind) });
  assert.equal(markInDisplaySelection(porch, { off: ["door"] }, { whatOf }), false, "doors off: the porch is hidden");
  assert.equal(markInDisplaySelection(porch, { off: ["place"] }, { whatOf }), true, "places off: the porch stays");
  assert.equal(markInDisplaySelection(room, { off: ["door"] }, { whatOf }), true, "doors off: a room stays");
});

// ── the passage ──────────────────────────────────────────────────────────────

function passageWorld(extra) {
  return { marks: [
    { id: "g/grounds", kind: "sited", by: "g", at: { x: 0, y: 0 }, extent: { w: 400, h: 400 }, body: "The grounds." },
    { id: "g/room", kind: "sited", by: "g", at: { x: 100, y: 0 }, extent: { w: 40, h: 40 }, body: "A room." },
    ...extra.map((m) => ({ ...m, at: { x: 10, y: 0 } })),
  ] };
}
const occ = new Map([["ann", ["g/grounds"]]]);
const AT = { x: 10, y: 0, name: "ann" };

test("PASSAGE: an into on a thing, a stairs or a dungeon, an unlisted resident door, and an entry-carried field are refused by name; nothing is recorded", () => {
  for (const [m, words] of [
    [rec("rena/a-chest", "thing", "rena", { into: "g/room" }), /^rena\/a-chest writes into, and it is a thing, not a door — /],
    [rec("home/a-stair", "sited", "home", { class: "stairs", entry: { word: "neutral", into: "g/room" } }), /^home\/a-stair writes entry\.into, and it is a stairs, not a door — /],
    [rec("t/a-keep", "sited", TOWN, { class: "dungeon", into: "g/room" }), /^t\/a-keep writes into, and it is a dungeon, not a door — /],
    [rec("little-bird/a-new-door", "door", "little-bird", { into: "g/room" }), /^little-bird\/a-new-door is a door, and it is not the town's or one of the 44 the town re-kinded — /],
    [rec("the-town/an-old-door", "door", TOWN, { entry: { word: "neutral", into: "g/room" } }), /^the-town\/an-old-door writes entry\.into: a door writes into:, lands_at: and requires: as its own fields, once each, never inside entry — /],
  ]) {
    const r = enter(AT, m.id, passageWorld([m]), { occupancy: occ, handle: "ann" });
    assert.equal(r.refused, "door-law", m.id);
    assert.match(r.error, words, m.id);
    assert.equal(r.rows, undefined, `${m.id}: nothing recorded`);
  }
  for (const lawful of [rec("g/town-door", "door", TOWN, { into: "g/room" }), rec(LISTED, "door", "little-bird", { into: "g/room" })]) {
    const a = enter(AT, lawful.id, passageWorld([lawful]), { occupancy: occ, handle: "ann" });
    assert.equal(a.error, undefined, `${lawful.id}: ${a.error}`);
    assert.deepEqual(a.entered, ["g/room"], lawful.id);
  }
});

test("PASSAGE: Little Bird's rings and bag, re-kinded, stay shut until fed and open when fed, landing where they always did (the live tree)", () => {
  const world = { marks: LIVE };
  for (const [door, food, into, landsOn] of [
    ["little-bird/a-ring-in-the-pantry", "little-bird/breakfast-on-the-shelf", "the-town/the-town-centre", "little-bird/a-ring-of-black-stone"],
    ["little-bird/a-ring-of-black-stone", "little-bird/a-pancake-in-paper", "vermillion/guest-caves-pantry-of-arrival", null],
    ["little-bird/a-paper-bag-of-crumbs", "little-bird/exhibit-8", "dom-pidgey/pidgey-heights", "dom-pidgey/the-guest-book"],
  ]) {
    const m = LIVE.find((x) => x.id === door);
    const opts = { occupancy: new Map([["ann", []]]), handle: "ann", at: 100, accepted: true };
    const here = { x: m.at.x, y: m.at.y, name: "ann" };
    assert.equal(enter(here, door, world, { ...opts, holdings: { [door]: [] } }).refused, "requires", `${door}: hungry, it stays shut`);
    const fed = enter(here, door, world, { ...opts, holdings: { [door]: [food] } });
    assert.equal(fed.error, undefined, `${door}: ${fed.error}`);
    assert.deepEqual(fed.entered, [into], door);
    assert.equal(fed.landing.mark ?? null, landsOn, door);
    assert.equal(propertyAt(IDX, "door", ["holder", "capacity"]) !== null && (m.holder === true || String(m.holder) === "true"), true, `${door} still holds`);
  }
});

test("PASSAGE: a room's own lands_at sets you down only where the room is a door that stands", () => {
  const room = { id: "t/chamber", at: { x: 0, y: 15 }, extent: { w: 30, h: 30 }, body: "The chamber.", lands_at: { x: 0, y: 25 } };
  const hallSide = { ...rec("t/hall-to-chamber", "door", TOWN, { into: "t/chamber", lands_at: "t/chamber-to-hall" }), at: { x: 5, y: -2 } };
  const chamberSide = { ...rec("t/chamber-to-hall", "door", TOWN, { into: "t/hall" }), at: { x: 5, y: 2 } };
  const hall = { id: "t/hall", kind: "sited", by: "t", at: { x: 0, y: -20 }, extent: { w: 40, h: 40 }, body: "The hall." };
  const land = (r) => landingOf(entryLawOf(hallSide), r, new Map([hall, r, hallSide, chamberSide].map((m) => [m.id, m])), { room: r, portal: hallSide });
  assert.equal(land({ ...room, kind: "door", by: TOWN }).by, "room", "the town's door-room names its landing");
  for (const r of [{ ...room, kind: "sited", by: "t" }, { ...room, kind: "door", by: "t" }]) {
    const l = land(r);
    assert.notEqual(l.by, "room", `${r.kind} by ${r.by}`);
    assert.equal(l.lands_mark, "t/chamber-to-hall", "the door's own landing, as if the room had written none");
  }
});

// ── the gate ─────────────────────────────────────────────────────────────────

function lintTree({ records = [], classes = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "door-law-lint-")); SCRATCH.push(dir);
  const root = join(dir, "let-there-be-light");
  mkdirSync(root, { recursive: true });
  copyFileSync(join(REAL, "mark.md"), join(root, "mark.md"));
  cpSync(join(REAL, "logos"), join(root, "logos"), { recursive: true });
  const NODE = "the-town-centre/the-keeping-works/postmark-node";
  for (const rel of ["the-town-centre", "the-town-centre/the-keeping-works", NODE, `${NODE}/mark`])
    { mkdirSync(join(root, rel), { recursive: true }); copyFileSync(join(REAL, rel, "mark.md"), join(root, rel, "mark.md")); }
  // the classes the fixture names, whole (their property nodes with them): sited, thing, door
  for (const rel of [`${NODE}/mark/sited`, `${NODE}/mark/thing`, `${NODE}/mark/door`]) cpSync(join(REAL, rel), join(root, rel), { recursive: true });
  const write = (d, lines, body) => { mkdirSync(d, { recursive: true }); writeFileSync(join(d, "mark.md"), ["---", ...lines, "---", "", body, ""].join("\n")); };
  for (const { by, dir: d, kind = "sited", x, fields = [] } of records)
    write(join(root, d), [`kind: ${kind}`, `by: ${by}`, "date: 2026-11-25", `at: { x: ${x}, y: 0 }`, "extent: { w: 2, h: 2 }", ...fields], `${d}.`);
  for (const { by, dir: d, lines } of classes) write(join(root, d), [`by: ${by}`, "date: 2026-11-25", ...lines], "A clause of the fixture's class space, long enough to read.");
  return dir;
}
function gate(dir) {
  try { return { code: 0, out: execFileSync(process.execPath, [LINT, "--marks-dir", dir], { encoding: "utf8" }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout ?? "") + String(e.stderr ?? "") }; }
}

test("THE GATE: the lint refuses by name an into on a thing, an entry-carried field, a resident's 45th door and an entry on a thing; the 44 and the town's doors pass", () => {
  const out = gate(lintTree({ records: [
    { by: "little-bird", dir: "the-cupboard", x: 300 },
    { by: "little-bird", dir: "a-chest", kind: "thing", x: 310, fields: ["into: little-bird/the-cupboard"] },
    { by: "little-bird", dir: "a-trunk", kind: "thing", x: 320, fields: ["entry: {\"word\":\"neutral\"}"] },
    { by: "little-bird", dir: "a-new-door", kind: "door", x: 330, fields: ["into: little-bird/the-cupboard"] },
    { by: "the-town", dir: "an-old-door", kind: "door", x: 340, fields: ["entry: {\"word\":\"neutral\",\"into\":\"little-bird/the-cupboard\"}"] },
    { by: "little-bird", dir: "a-ring-in-the-pantry", kind: "door", x: 350, fields: ["into: little-bird/the-cupboard", "holder: true", "capacity: 1"] },
    { by: "the-town", dir: "a-town-door", kind: "door", x: 360, fields: ["entry: {\"word\":\"welcomed\"}", "into: little-bird/the-cupboard"] },
  ] }));
  assert.equal(out.code, 1, out.out);
  assert.match(out.out, /\[ERROR\] [^\n]*a-chest: \[door-law\] little-bird\/a-chest writes into, and it is a thing, not a door — /);
  assert.match(out.out, /\[ERROR\] [^\n]*a-trunk: \[door-law\] entry: thing's entry is none, locked \(the-town\/thing-entry\)/);
  assert.match(out.out, /\[ERROR\] [^\n]*a-new-door: \[door-law\] little-bird\/a-new-door is a door, and it is not the town's or one of the 44 the town re-kinded — /);
  assert.match(out.out, /\[ERROR\] [^\n]*an-old-door: \[door-law\] the-town\/an-old-door writes entry\.into: a door writes into:, lands_at: and requires: as its own fields/);
  assert.doesNotMatch(out.out, /(a-ring-in-the-pantry|a-town-door): \[door-law\]/, "one of the 44, and the town's own door, stand");
  assert.match(out.out, /^4 error\(s\)/m, "the four refused records are the tree's only errors");
});

test("THE GATE: a household's class may not redeclare thing's locked entry; the town's subclass may (the override rule's lock)", () => {
  const NODE = "the-town-centre/the-keeping-works/postmark-node";
  const theirs = gate(lintTree({ classes: [
    { by: "alice", dir: "alices-bag", lines: ["kind: class", "class: alices-bag", "extends: thing"] },
    { by: "the-town", dir: "alices-bag/alices-bag-entry", lines: ["kind: property", "tier: constitution", "name: entry", "default: null"] },
  ] }));
  assert.match(theirs.out, /alices-bag-entry: alice\/alices-bag redeclares thing's entry, a constitution property/);
  const town = gate(lintTree({ classes: [
    { by: "the-town", dir: `${NODE}/mark/thing/a-roomy-bag`, lines: ["kind: class", "tier: constitution", "class: a-roomy-bag", "extends: thing"] },
    { by: "the-town", dir: `${NODE}/mark/thing/a-roomy-bag/a-roomy-bag-entry`, lines: ["kind: property", "tier: constitution", "name: entry", "default: null"] },
  ] }));
  assert.doesNotMatch(town.out, /redeclares thing's entry/, town.out);
});
