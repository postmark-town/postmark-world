// first-floor-opens.test.mjs — WLD-135: the whole first floor of the Starforge Spire
// stops being a dungeon, and the floors above stay one.
//
//   node --test tools/first-floor-opens.test.mjs
//
// RULED (Darko, 2026-11-01 18:24 EST, verbatim): "agreed on the 121 call." It answers
// Wright's recommendation of 18:2x: "The whole first floor of the Starforge Spire stops
// being a dungeon. … Every first-floor room is walkable, seen and heard like any place,
// and the exit lock no longer applies there." And: "The floors above stay the dungeon
// (WLD-3). WLD-121's hearing wall applies only there."
//
// THE LAW THE OPENING RIDES (LOGOS/classes.md § The portal and the dungeon): "A dungeon
// is a sited-mark class, and its rules reach every mark it geometrically contains", and
// of `rooms`, "the lint judges only those". So a floor leaves the dungeon when its mark
// leaves the class, never when ids leave `rooms`: every reader below asks the class and
// the geometry (portals.mjs § dungeonIndex), and only the lint reads the list.
//
// MEASURED at origin/main 674a6649: the Spire has no floor above the first. Its eleven
// stairs write no `entry` (the stairs class's "Coming Soon!"), every portal's `into`
// names one of its 22 rooms or the ground outside, and no mark carries a floor. So the
// opening is the Spire's own mark leaving the class (`kind: dungeon` to `kind: sited`,
// its `rooms` dropped), and the floors above are a stand-in here: a dungeon of their
// own, reached by a stair that writes its own `into` (classes.md § The stairs: "A later
// floor is reached by writing `into`, `lands_at` and a word"), standing apart from the
// first floor's ground. Whether WLD-3 builds them that way is WLD-3's question (the last
// test pins what happens if it does not).
//
// THE CONSUMERS, each driven as its door drives it: the Office's reads and the World
// page call `standpointSight`; the Office walls hearing with what a keyless standpoint
// is not shown (office src/world.mjs § interiorIdsNow); its walk door asks `walkFence`;
// its enter and exit doors call `enter` and `exit`, handing in the exit locks in force
// as `lockedOut`; its creatures and the page's ring ask `ringRoomOf`; the map's icon is
// `markWhat`; the gate is `portalFindings`; the eyes are `standpointSight`, then
// `openYourEyes`, as the Office's worldEyes composes them.
//
// The fixture carries the real Spire's ids on purpose: a slug or a prefix exception in a
// reader would open the rooms-only arm, and that arm must stay shut.
//
// Every world here is synthetic. Nothing reads a record, and nothing retires a creature
// or a key: that plane is the authorised hand's, after the mid-quest check.

import { test } from "node:test";
import assert from "node:assert/strict";

import { enter, exit, enterPrompt, openYourEyes, standpointSight, walkFence, heldDungeon } from "./world-verbs.mjs";
import { ringRoomOf, portalFindings } from "./portals.mjs";
import { fold } from "./marks-fold.mjs";
import { buildHeightfield } from "./world-engine.mjs";
import { markWhat } from "../spectator/mark-icons.mjs";

const SPIRE = "wright/the-starforge-spire";
const GROUNDS = "wright/starforge-spire-grounds";
const FORECOURT = "wright/spire-forecourt";
const VESTIBULE = "wright/spire-gilded-vestibule";
const HALL = "wright/spire-hall-of-keepers";
const LUMBER = "wright/spire-lumber-room";
const CHAPEL = "wright/spire-star-chapel";
const DOORS = "wright/spire-gilded-doors";
const DOORS_INSIDE = "wright/spire-gilded-doors-inside";
const TO_LUMBER = "wright/spire-hall-of-keepers-to-lumber-room";
const CHAPEL_DOOR = "wright/spire-hall-of-keepers-to-star-chapel";
const KNIGHT = "wright/spire-hall-of-keepers-bat-knight";
const KEY = "the-town/the-lumber-room-key";
const RUG = "wright/spire-hall-of-keepers-rug";
const STAIR = "wright/spire-the-little-spiral";
// the floors above, a stand-in: their own dungeon, apart from the first floor's ground
const UPPER = "wld3/the-upper-floors";
const LANDING = "wld3/upper-landing";
const GALLERY = "wld3/upper-gallery";
const DRAWN_OVER = "wld3/drawn-over-the-first-floor";

const FIRST_FLOOR_ROOMS = [VESTIBULE, HALL, LUMBER, CHAPEL];
// every mark the first floor holds: its rooms, their doors and things, the key rooms' key
// and holder, and the stair up. The control in the first test holds this list to today's
// engine, so it cannot drift from the geometry below.
const FIRST_FLOOR = [...FIRST_FLOOR_ROOMS, DOORS_INSIDE, "wright/spire-gilded-vestibule-to-hall-of-keepers",
  "wright/spire-hall-of-keepers-to-gilded-vestibule", TO_LUMBER, "wright/spire-lumber-room-to-hall-of-keepers",
  CHAPEL_DOOR, "wright/spire-star-chapel-to-hall-of-keepers", KNIGHT, KEY, RUG, "wright/spire-star-chapel-altar", STAIR];
const UPPER_INSIDE = [LANDING, GALLERY, "wld3/landing-to-gallery", "wld3/gallery-to-landing", "wld3/landing-down", "wld3/gallery-chest"];

const UNTIL = "2026-11-02T06:00:00.000Z";
const LEFT = "2026-11-01T23:10:00.000Z";

const M = (id, x, y, w, h, extra = {}) => ({ id, by: id.split("/")[0], household: id.split("/")[0], kind: "sited", tier: "market",
  at: { x, y }, extent: { w, h }, date: "2026-10-18T12:00:00Z", body: id.split("/")[1], ...extra });
const door = (id, x, y, into, extra = {}) => M(id, x, y, 2, 2, { entry: { word: "neutral", into, ...extra } });

/** The Spire in one of three shapes, everything else the same:
 *    "open"        the opening: its mark leaves the class (kind: sited), its `rooms` dropped;
 *    "dungeon"     today's Spire (kind: dungeon, its rooms declared);
 *    "rooms-only"  the falsifier: still kind: dungeon, every first-floor id taken off `rooms`.
 *  `drawnOver` adds a second dungeon drawn over the first floor's ground (the last test). */
function world(spire = "open", { drawnOver = false } = {}) {
  const keep = {
    open: { kind: "sited" },
    dungeon: { kind: "dungeon", rooms: [...FIRST_FLOOR_ROOMS] },
    "rooms-only": { kind: "dungeon", rooms: [] },
  }[spire];
  assert.ok(keep, `no Spire shape "${spire}"`);
  const ux = 2000;
  const marks = [
    M("the-town/let-there-be-light", 0, 0, 60000, 60000),
    M(GROUNDS, 0, 0, 500, 400),
    M(FORECOURT, -170, 0, 60, 80),
    M(SPIRE, 0, 0, 240, 180, { ...keep, entry: { into: VESTIBULE, lands_at: DOORS_INSIDE } }),
    // the first floor: four rooms tiling the keep, two of them the heist's key rooms
    M(VESTIBULE, -98, 0, 36, 36),
    M(HALL, -40, 0, 76, 80),
    M(LUMBER, 40, -50, 60, 30),
    M(CHAPEL, 50, 30, 60, 50),
    // in from the grounds, out to the forecourt, and between the rooms
    door(DOORS, -125, 0, VESTIBULE, { lands_at: DOORS_INSIDE }),
    door(DOORS_INSIDE, -113, 0, FORECOURT),
    door("wright/spire-gilded-vestibule-to-hall-of-keepers", -82, 0, HALL),
    door("wright/spire-hall-of-keepers-to-gilded-vestibule", -76, 0, VESTIBULE),
    door(TO_LUMBER, -4, -30, LUMBER),
    door("wright/spire-lumber-room-to-hall-of-keepers", 12, -50, HALL),
    // the chapel's door asks for the key, the real door's shape: counted at a settlement, not shown
    door(CHAPEL_DOOR, -4, 20, CHAPEL, { requires: { holds: [KEY], in: [KNIGHT], at: "settlement", shown: false, says: "The chapel doors hold fast." } }),
    door("wright/spire-star-chapel-to-hall-of-keepers", 22, 30, HALL),
    M(KNIGHT, -40, 30, 3, 3, { kind: "thing", holder: true }),
    M(KEY, 40, -55, 1, 1, { kind: "thing" }),
    M(RUG, -40, 0, 10, 6),
    M("wright/spire-star-chapel-altar", 60, 40, 6, 3),
    // the stair up, as WLD-3 would write it: a stair whose own entry carries `into`
    M(STAIR, -60, -30, 4, 4, { kind: "stairs", entry: { word: "neutral", into: LANDING } }),
    // the floors above: a dungeon of their own, with an exit down to the hall
    M(UPPER, ux, 0, 200, 150, { kind: "dungeon", rooms: [LANDING, GALLERY] }),
    M(LANDING, ux - 50, 0, 80, 100),
    M(GALLERY, ux + 45, 0, 90, 100),
    door("wld3/landing-to-gallery", ux - 12, 0, GALLERY),
    door("wld3/gallery-to-landing", ux + 2, 0, LANDING),
    door("wld3/landing-down", ux - 88, 0, HALL),
    M("wld3/gallery-chest", ux + 50, 20, 4, 3, { kind: "thing" }),
    ...(drawnOver ? [M(DRAWN_OVER, -18, -5, 200, 124, { kind: "dungeon" })] : []),
  ];
  return { marks };
}

const occ = (stack) => new Map([["ann", stack]]);
const AT = (x, y) => ({ x, y, name: "ann" });
const sorted = (xs) => [...xs].sort();
/** What a standpoint is shown: keyless (the spectator, the World page signed out) or a resident's stack. */
const shownTo = (w, stack = null) =>
  new Set(standpointSight(w, stack ? { occupancy: occ(stack), handle: "ann" } : {}).marks.map((m) => m.id));
/** The set the Office walls hearing with: every mark a keyless standpoint is not shown
 *  (office src/world.mjs § interiorIdsNow, read at train/2026-w46 967838f0). */
const interiorOf = (w) => { const seen = shownTo(w); return new Set(w.marks.filter((m) => !seen.has(m.id)).map((m) => m.id)); };

test("THE ARMS: the opening, today's Spire and the rooms-only edit differ only in the Spire's own mark", () => {
  const strip = (w) => w.marks.filter((m) => m.id !== SPIRE);
  assert.deepEqual(strip(world("open")), strip(world("dungeon")));
  assert.deepEqual(strip(world("rooms-only")), strip(world("dungeon")));
  const spire = (s) => world(s).marks.find((m) => m.id === SPIRE);
  assert.equal(spire("open").kind, "sited");
  assert.equal("rooms" in spire("open"), false, "the opening drops `rooms`, a property of the dungeon class");
  assert.equal(spire("dungeon").kind, "dungeon");
  assert.deepEqual(spire("rooms-only").rooms, []);
});

test("SEEN LIKE ANY PLACE: every first-floor mark, the key rooms' included, is shown from outside, from the floor and to an old entered stack; the floors above show only their own mark", () => {
  // LAW (RULED 18:24 EST): "Every first-floor room is walkable, seen and heard like any place"
  const w = world("open");
  const stacks = { outside: [GROUNDS], "on the floor": [GROUNDS, SPIRE, HALL], "entered before the opening": [GROUNDS, SPIRE, LUMBER], keyless: null };
  for (const [who, stack] of Object.entries(stacks)) {
    const seen = shownTo(w, stack);
    assert.deepEqual(FIRST_FLOOR.filter((id) => !seen.has(id)), [], `${who}: no first-floor mark is hidden`);
    assert.deepEqual(UPPER_INSIDE.filter((id) => seen.has(id)), [], `${who}: nothing inside the floors above is shown`);
    assert.ok(seen.has(UPPER), `${who}: the floors above read as their own mark`);
  }
  // inside the floors above, the room you entered and what it holds, not its neighbours
  const up = shownTo(w, [UPPER, GALLERY]);
  assert.ok(up.has("wld3/gallery-chest") && !up.has("wld3/landing-to-gallery"), "the gallery, not the landing");
  // CONTROL (today's Spire, the base column): the same stacks are shown nothing of the first floor
  const today = world("dungeon");
  for (const stack of [[GROUNDS], null]) {
    const seen = shownTo(today, stack);
    assert.deepEqual(FIRST_FLOOR.filter((id) => seen.has(id)), [], "today: a dungeon is opaque from outside");
  }
});

test("HEARD LIKE ANY PLACE: the set the Office walls hearing with holds nothing of the first floor, and still holds the floors above", () => {
  // LAW (RULED 18:24 EST): "WLD-121's hearing wall applies only there" (the floors above)
  const interior = interiorOf(world("open"));
  assert.deepEqual(sorted(interior), sorted(UPPER_INSIDE), "the floors above keep theirs, and the first floor keeps nothing");
  for (const id of [GROUNDS, SPIRE, LUMBER])
    assert.equal(interior.has(id), false, `${id}: a stack entered before the opening holds no walled room`);
  // CONTROL: today the set is the first floor and the floors above, exactly (this also holds the fixture's lists to the geometry)
  assert.deepEqual(sorted(interiorOf(world("dungeon"))), sorted([...FIRST_FLOOR, ...UPPER_INSIDE]));
});

test("WALKABLE: no fence on the first floor from any room of it; the floors above still fence the walk to the room you entered", () => {
  // LAW (classes.md): "Inside a dungeon, your walk is fenced to the room you entered."
  const w = world("open");
  for (const room of FIRST_FLOOR_ROOMS) {
    const stack = [GROUNDS, SPIRE, room];
    assert.equal(walkFence(stack, w.marks), null, `${room}: no fence`);
    assert.equal(heldDungeon(stack, w.marks), null, `${room}: inside no dungeon`);
  }
  assert.equal(walkFence([UPPER, GALLERY], w.marks)?.id, GALLERY, "upstairs, the fence is the room");
  assert.equal(heldDungeon([UPPER, GALLERY], w.marks), UPPER);
  // CONTROL: today the first floor fences the walk to the room
  assert.equal(walkFence([GROUNDS, SPIRE, HALL], world("dungeon").marks)?.id, HALL);
});

test("ENTERED AS ANY PLACE IS: a first-floor room is entered by name from outside, the chapel included; the Spire's `into` still sets you down inside the doors; inside, no portal is needed", () => {
  const w = world("open");
  const chapel = enter(AT(-200, 150), CHAPEL, w, { occupancy: occ([GROUNDS]), handle: "ann" });
  assert.equal(chapel.error, undefined, chapel.error);
  assert.equal(chapel.refused, null, "no door refused it, and no dungeon did");
  assert.ok(chapel.entered.includes(CHAPEL));
  assert.deepEqual(chapel.walk?.to, { x: 50, y: 30 }, "entering from outside carries the walk to it, as any place does");
  // the Spire's own `into` (WLD-63) is any mark's now: entering it from its outline passes into the vestibule
  const keep = enter(AT(0, 0), SPIRE, w, { occupancy: occ([GROUNDS]), handle: "ann" });
  assert.equal(keep.error, undefined, keep.error);
  assert.equal(keep.into, VESTIBULE);
  assert.deepEqual(keep.entered, [VESTIBULE]);
  // from one room to another by name, with no portal
  const lumber = enter(AT(-98, 0), LUMBER, w, { occupancy: occ([GROUNDS, SPIRE, VESTIBULE]), handle: "ann" });
  assert.equal(lumber.error, undefined, lumber.error);
  assert.deepEqual(lumber.entered, [LUMBER]);
  // the chapel's door keeps its own law: its `requires` is the door's, not the dungeon's, and the opening leaves it standing
  assert.equal(enter(AT(-4, 20), CHAPEL_DOOR, w, { occupancy: occ([GROUNDS, SPIRE, HALL]), handle: "ann" }).refused, "requires");
  // the floors above: hidden from the first floor, and entered only by their portal
  assert.equal(enter(AT(-60, -30), GALLERY, w, { occupancy: occ([GROUNDS, SPIRE, HALL]), handle: "ann" }).error, `no mark '${GALLERY}' to enter`);
  const upper = enter(AT(-60, -30), UPPER, w, { occupancy: occ([GROUNDS, SPIRE, HALL]), handle: "ann" });
  assert.equal(upper.refused, "dungeon");
  assert.deepEqual(upper.portals.map((p) => p.id), [STAIR]);
  const up = enter(AT(-60, -30), STAIR, w, { occupancy: occ([GROUNDS, SPIRE, HALL]), handle: "ann" });
  assert.equal(up.error, undefined, up.error);
  assert.deepEqual(up.within, [UPPER, LANDING], "up the stair is into the floors above, and out of the first floor");
  // CONTROL: today the chapel and the lumber room are no marks at all to an outsider or a neighbour
  const today = world("dungeon");
  assert.equal(enter(AT(-200, 150), CHAPEL, today, { occupancy: occ([GROUNDS]), handle: "ann" }).error, `no mark '${CHAPEL}' to enter`);
  assert.equal(enter(AT(-98, 0), LUMBER, today, { occupancy: occ([GROUNDS, SPIRE, VESTIBULE]), handle: "ann" }).error, `no mark '${LUMBER}' to enter`);
});

test("NOT BY GEOMETRY: standing on a first-floor room's ground offers entry and enters nothing; standing on the floors above from outside offers nothing", () => {
  const w = world("open");
  const offer = enterPrompt(AT(40, 20), w, { occupancy: occ([GROUNDS]), handle: "ann" });
  assert.equal(offer?.mark, CHAPEL, "the room is offered");
  assert.match(offer.ask, /Enter\?$/, "an offer, never an entry");
  assert.equal(enterPrompt(AT(2045, 0), w, { occupancy: occ([]), handle: "ann" }), null, "the floors above offer nothing to a walker outside");
  // CONTROL: today the chapel's ground offers the Spire, never the chapel
  assert.equal(enterPrompt(AT(40, 20), world("dungeon"), { occupancy: occ([GROUNDS]), handle: "ann" })?.mark, SPIRE);
});

test("LEFT AS ANY PLACE IS: exit from a first-floor room is a plain step out, with no confirm, no whole-dungeon leave and no lock, even handed a settlement; the floors above still lock", () => {
  // LAW (classes.md): "Leaving by `exit` costs the dungeon until the next settlement"; the ruling: "the exit lock no longer applies there"
  const w = world("open");
  const out = exit(LUMBER, w, { occupancy: occ([GROUNDS, SPIRE, LUMBER]), handle: "ann", locksUntil: UNTIL, iso: LEFT });
  assert.equal(out.awaiting, undefined, "no confirm is asked");
  assert.equal(out.lock, undefined, "no lock is written");
  assert.equal(out.rows.length, 1);
  assert.match(out.rows[0], / · ann · exits wright\/spire-lumber-room · /);
  assert.deepEqual(out.within, [GROUNDS, SPIRE], "a step out of the room, not out of a dungeon");
  const keep = exit(SPIRE, w, { occupancy: occ([GROUNDS, SPIRE, HALL]), handle: "ann", confirm: true, locksUntil: UNTIL, iso: LEFT });
  assert.equal(keep.lock, undefined);
  assert.deepEqual(keep.within, [GROUNDS]);
  // the floors above: the whole dungeon is left, and it locks
  const upper = exit(GALLERY, w, { occupancy: occ([UPPER, GALLERY]), handle: "ann", confirm: true, locksUntil: UNTIL, iso: LEFT });
  assert.equal(upper.lock?.dungeon, UPPER);
  assert.equal(upper.lock?.until, UNTIL);
  assert.deepEqual(upper.within, []);
  // CONTROL: today the same exit asks first, and names the lock
  const today = exit(LUMBER, world("dungeon"), { occupancy: occ([GROUNDS, SPIRE, LUMBER]), handle: "ann", locksUntil: UNTIL, iso: LEFT });
  assert.equal(today.awaiting?.effect, "confirm");
  assert.deepEqual(today.lock, { dungeon: SPIRE, until: UNTIL });
});

test("THE EXIT LOCK NO LONGER APPLIES THERE: a lock left on the Spire before the opening bites no way in; a lock on the floors above still does", () => {
  const w = world("open");
  const lockedOut = { [SPIRE]: { until: UNTIL, left_at: LEFT } };   // the Office's record of an exit made before the opening
  const doors = enter(AT(-125, 0), DOORS, w, { occupancy: occ([GROUNDS]), handle: "ann", lockedOut });
  assert.equal(doors.refused, null, doors.error);
  assert.deepEqual(doors.entered, [VESTIBULE]);
  const keep = enter(AT(0, 0), SPIRE, w, { occupancy: occ([GROUNDS]), handle: "ann", lockedOut });
  assert.equal(keep.refused, null, keep.error);
  const inner = enter(AT(-4, -30), TO_LUMBER, w, { occupancy: occ([GROUNDS, HALL]), handle: "ann", lockedOut });
  assert.equal(inner.refused, null, inner.error);
  // the floors above keep theirs
  const up = enter(AT(-60, -30), STAIR, w, { occupancy: occ([GROUNDS, SPIRE, HALL]), handle: "ann", lockedOut: { [UPPER]: { until: UNTIL, left_at: LEFT } } });
  assert.equal(up.refused, "dungeon-locked");
  assert.equal(up.dungeon, UPPER);
  // CONTROL: today the same lock refuses the doors
  const today = enter(AT(-125, 0), DOORS, world("dungeon"), { occupancy: occ([GROUNDS]), handle: "ann", lockedOut });
  assert.equal(today.refused, "dungeon-locked");
  assert.equal(today.dungeon, SPIRE);
});

test("A CREATURE'S RING on the first floor is the plain circle; on the floors above it stops at the room's walls (WLD-25)", () => {
  const w = world("open");
  assert.equal(ringRoomOf({ x: 40, y: -50 }, w.marks), null, "the lumber room is no dungeon's room");
  assert.equal(ringRoomOf({ x: 2045, y: 0 }, w.marks)?.id, GALLERY);
  // CONTROL: today the lumber room walls the ring
  assert.equal(ringRoomOf({ x: 40, y: -50 }, world("dungeon").marks)?.id, LUMBER);
});

test("THE MAP: the Spire is no longer drawn as a dungeon (it carries `into`, so it reads as a door); the floors above still are", () => {
  const icon = (w, id) => markWhat(w.marks.find((m) => m.id === id));
  assert.equal(icon(world("open"), SPIRE), "door");
  assert.equal(icon(world("open"), UPPER), "dungeon");
  assert.equal(icon(world("dungeon"), SPIRE), "dungeon", "control: today's icon");
});

test("THE GATE: the opening lints clean and the floors above are still held to the dungeon's rules; the rooms-only edit lints clean too, so a green gate proves nothing", () => {
  const errors = (w) => portalFindings(w.marks).filter((f) => f.sev === "ERROR");
  assert.deepEqual(errors(world("open")), []);
  assert.deepEqual(portalFindings(world("open").marks).filter((f) => f.mark === SPIRE), [], "nothing is judged of the Spire's rooms: it declares none and is no dungeon");
  // the floors above are still judged: let their rooms stack, and the rule bites
  const stacked = world("open");
  const gallery = stacked.marks.find((m) => m.id === GALLERY);
  gallery.at = { x: 1960, y: 0 };
  assert.deepEqual(portalFindings(stacked.marks).filter((f) => f.rule === "rooms-do-not-overlap").map((f) => f.mark), [GALLERY]);
  assert.deepEqual(errors(world("rooms-only")), [], "the rooms-only edit is green at the gate (the next test shows it is still shut)");
  assert.deepEqual(errors(world("dungeon")), [], "control: today's Spire lints clean");
});

test("THE FALSIFIER: taking the first floor's ids off `rooms` and keeping the class opens nothing; every reader still shuts the floor", () => {
  // LAW (classes.md): "A dungeon is a sited-mark class, and its rules reach every mark it geometrically contains"
  const w = world("rooms-only");
  assert.deepEqual(FIRST_FLOOR.filter((id) => !interiorOf(w).has(id)), [], "every first-floor mark is still hidden and walled");
  assert.equal(walkFence([GROUNDS, SPIRE, HALL], w.marks)?.id, HALL, "still fenced");
  assert.equal(enter(AT(-200, 150), CHAPEL, w, { occupancy: occ([GROUNDS]), handle: "ann" }).error, `no mark '${CHAPEL}' to enter`, "still no mark to an outsider");
  assert.equal(exit(LUMBER, w, { occupancy: occ([GROUNDS, SPIRE, LUMBER]), handle: "ann", locksUntil: UNTIL }).awaiting?.effect, "confirm", "still left whole");
  assert.equal(enter(AT(-125, 0), DOORS, w, { occupancy: occ([GROUNDS]), handle: "ann", lockedOut: { [SPIRE]: { until: UNTIL, left_at: LEFT } } }).refused, "dungeon-locked", "still locked");
  assert.equal(ringRoomOf({ x: 40, y: -50 }, w.marks)?.id, LUMBER, "still walls a ring");
  assert.equal(markWhat(w.marks.find((m) => m.id === SPIRE)), "dungeon", "still drawn as one");
});

test("WLD-3'S QUESTION, PINNED: a dungeon drawn over the first floor's ground shuts it again, whatever any list says; floors are told apart only by where they stand", () => {
  // LAW (classes.md): "its rules reach every mark it geometrically contains". Today no field tells a floor from the
  // ground beneath it, so the floors above stay a dungeon and the first floor stays open only while they stand apart.
  const w = world("open", { drawnOver: true });
  const interior = interiorOf(w);
  assert.deepEqual(FIRST_FLOOR_ROOMS.filter((id) => !interior.has(id)), [], "every first-floor room is walled again");
  assert.equal(walkFence([GROUNDS, SPIRE, HALL], w.marks)?.id, HALL);
  // control: the same world without it is open
  assert.equal(walkFence([GROUNDS, SPIRE, HALL], world("open").marks), null);
});

// ── the eyes, composed as the Office composes them: standpointSight, then openYourEyes ──

const flatHF = buildHeightfield({ controlPoints: [{ x: 0, y: 0, h: 5 }, { x: 10000, y: 0, h: 5 }, { x: 0, y: 10000, h: 5 }, { x: -10000, y: 0, h: 5 }] });
const light = { dawn_pole_m: { x: 5000, y: -5000 }, dark_pole_m: { x: -5000, y: 5000 } };
function folded(w) {
  const f = fold({ marks: w.marks, terrain: { features: [] }, stakes: [], tick: 1, households: {} });
  assert.deepEqual(f.errors, [], "the fixture folds clean");
  return { ...f, terrain: { far_features: [], features: [], elevation: {} }, heightfield: flatHF, light, fogCeilingM: 22 };
}
const told = (w, state, stack) =>
  openYourEyes(state, standpointSight(w, { occupancy: occ(stack), handle: "ann" }), { entered: stack }).fov.carried.map((c) => c.id);

test("TOLD LIKE ANY PLACE: standing in the hall's footprint without entering it, the eyes tell the hall's rug; today they cannot", () => {
  const here = AT(-38, 8);
  assert.ok(told(folded(world("open")), here, [GROUNDS]).includes(RUG), "the rug is told");
  const today = told(folded(world("dungeon")), here, [GROUNDS]);
  assert.deepEqual(today.filter((id) => FIRST_FLOOR.includes(id)), [], "control: today nothing of the first floor is told");
});
