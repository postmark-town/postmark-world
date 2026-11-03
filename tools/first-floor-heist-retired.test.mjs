// first-floor-heist-retired.test.mjs — the first-floor heist's declarations are retired (WLD-135, part 1 of 2).
//
// The four candied class marks no longer declare a `named` creature (the bat, the raven,
// both wolves, the boss), and the chapel door no longer asks for the three keys.
//
// The three keys are KEPT (Darko, 2026-11-03 09:44 EDT, WLD-135/a Spire keys: "Keep them").
// They stay their owners' as keepsakes in the knights and open nothing now. Until that
// ruling this PR deleted the three key files by hand; it no longer deletes or edits them.
// Case 4 asserts they are still in the tree; that their content is main's (owner, holder,
// body) is proved by blob equality against main at hand-in, not pinned here, because
// custody moves at settlements.
//
// ARTIFACT CASES (1-4) read authored files by path (no loader, no whole-world read):
// the four class marks, the door and the three keys.
//
// CASE 5 IS A SYNTHETIC COUPLING CONTROL, not an artifact falsifier: in-memory marks only,
// documenting why the declarations and the door change together (a door cleared while a
// declaration still waits on it leaves a creature waiting on no lock; an `after_door`
// dropped while the lock stands leaves an eligible boss; keys gone while the lock stands
// leaves a wait nothing can meet). It never reads the repo's classes or door.
//
// CAN-FAIL FLIPS (artifact cases): write any `named` entry back onto one of the four
// classes (cases 1 and 2 red); write `requires` back onto the door (case 3 reds); delete
// any one key file (case 4 reds, and its in-memory control shows each missing key is named).

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRecord } from "./marks-fold.mjs";
import { TOWN, creatureLaw, afterDoorOpen, afterDoorRefusal } from "./creatures.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLASS_DIR = "WORLD/marks/let-there-be-light/the-town-centre/the-keeping-works/postmark-node/entity/creature";
const CLASSES = ["candied-bat", "candied-raven", "candied-wolf", "candied-jetto"];
const DOOR_FILE = "WORLD/marks/wright/spire-hall-of-keepers-to-star-chapel/mark.md";
const KEY_FILES = ["the-lumber-room-key", "the-mirror-room-key", "the-hall-of-keepers-key"].map((k) => `WORLD/marks/the-town/${k}/mark.md`);
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const classFile = (k) => `${CLASS_DIR}/${k}/mark.md`;

test("the four candied classes stay classes, with their kind and actions, and declare no named creature", () => {
  for (const k of CLASSES) {
    const text = read(classFile(k));
    const rec = parseRecord(text, classFile(k));
    assert.equal(rec.kind, "class", k);
    assert.equal(rec.by, TOWN, k);
    assert.equal(rec.class, k, k);
    assert.equal(rec.extends, "creature", k);
    assert.equal(rec.kind_file, `WORLD/kinds/${k}.kind`, `${k} keeps its behaviour file`);
    assert.ok(Array.isArray(rec.actions) && rec.actions.length > 0, `${k} keeps its actions`);
    assert.equal("named" in rec, false, `${k} declares no named creature`);
    assert.doesNotMatch(text, /^named:/m, `${k}: no named line in the file either`);
  }
});

test("the reader sees none: the real four class records, read by the real creature law, name no creature", () => {
  const props = (id, dials) => Object.entries(dials).map(([name, v]) =>
    ({ id: `${id}-${name}`, kind: "property", by: TOWN, tier: "constitution", parent: id, name, default: v === null ? "null" : v }));
  const creature = [{ id: "the-town/creature", kind: "class", by: TOWN, class: "creature" },
    ...props("the-town/creature", { from_crossing: null, rotation: null, band_from_m: 0, band_to_m: 400, keep_m: 440, apart_m: 150, span_h: 12 })];
  // the real records, given the ids the loader would give them; counts are synthetic
  const real = () => CLASSES.map((k) => ({ ...parseRecord(read(classFile(k)), classFile(k)), id: `the-town/${k}` }));
  const law = (records) => creatureLaw([...creature, ...records, ...CLASSES.flatMap((k) => props(`the-town/${k}`, { count_per_window: 0 }))]);
  const got = law(real());
  assert.deepEqual(got.kinds.map((x) => x.kind), [...CLASSES].sort(), "the four kinds are still read (the law lists them by name)");
  assert.deepEqual(got.named, [], "and none of them names a creature");
  // the control: the same reader, one entry written back (synthetic ids), is not blind to it
  const back = real().map((r) => (r.class === "candied-jetto"
    ? { ...r, named: [{ slug: "den", at: { x: 1, y: 2 }, after_door: "tower/inner-door" }] } : r));
  assert.deepEqual(law(back).named.map((d) => d.id), ["creature:candied-jetto-den"], "a declaration written back would be read");
});

test("the chapel door keeps its passage and asks for nothing", () => {
  const text = read(DOOR_FILE);
  const rec = parseRecord(text, DOOR_FILE);
  assert.deepEqual(rec.entry, {
    word: "neutral",
    into: "wright/spire-star-chapel",
    lands_at: "wright/spire-star-chapel-to-hall-of-keepers",
  }, "word, into and lands_at are as they were, and there is nothing else");
  assert.equal("requires" in rec.entry, false);
  assert.doesNotMatch(text, /requires/, "no requirement anywhere in the file");
});

// ── the keys are kept ───────────────────────────────────────────────────────────────

// What is wrong with the three key files as `readText` sees them (null = no file): one line per key.
// Only the facts the Keep ruling fixes are read; owner, holder and body move at settlements and are not.
const keyGaps = (readText) => KEY_FILES.flatMap((path) => {
  const text = readText(path);
  if (text == null) return [`${path}: missing`];
  const rec = parseRecord(text, path);
  return rec.kind === "thing" && rec.by === TOWN ? [] : [`${path}: not a the-town thing`];
});

test("the three keys are kept: each key file is still in the tree, a the-town thing (Darko 11-03 09:44, \"Keep them\")", () => {
  assert.deepEqual(keyGaps((p) => (existsSync(join(ROOT, p)) ? read(p) : null)), [], "the three keys are kept, not retired");
  // the control, in memory (invented bodies): the same check names each missing key, one at a time
  const kept = (p) => `---\nkind: thing\nby: ${TOWN}\nheld_by: tower/holder\nowned_by: someone\n---\n\nAn invented key.\n`;
  assert.deepEqual(keyGaps(kept), [], "three kept keys: no gap");
  for (const gone of KEY_FILES)
    assert.deepEqual(keyGaps((p) => (p === gone ? null : kept(p))), [`${gone}: missing`], `${gone} missing is caught`);
  assert.deepEqual(keyGaps((p) => kept(p).replace("kind: thing", "kind: event")), KEY_FILES.map((p) => `${p}: not a the-town thing`), "a key turned into something else is caught");
});

// ── the coupling, in memory ─────────────────────────────────────────────────────────

const DOOR = "tower/inner-door";
const HOLDERS = ["tower/holder-1", "tower/holder-2", "tower/holder-3"];
const ASKS = ["tower/token-a", "tower/token-b", "tower/token-c"];
const LOCK = { holds: ASKS, in: HOLDERS, at: "settlement" };
const door = (requires) => ({ id: DOOR, kind: "thing", by: "tower", at: { x: 0, y: 0 }, extent: { w: 2, h: 2 }, body: "A door.",
  entry: { word: "neutral", into: "tower/room", ...(requires ? { requires } : {}) } });
const tokens = () => ASKS.map((id, i) => ({ id, kind: "thing", by: "the-town", body: "A token.", held_by: HOLDERS[i] }));
const WAITING = { id: "creature:candied-jetto-den", after_door: DOOR };

test("synthetic coupling control: door-only, after_door-only and keys-only are each a bad shape for the after-door reader", () => {
  // the whole heist as it stood (synthetic): a lock, its tokens, a boss that waits on it. Healthy.
  assert.equal(afterDoorRefusal(WAITING, [door(LOCK), ...tokens()]), null);
  assert.deepEqual(afterDoorOpen(WAITING, [door(LOCK), ...tokens()]), { open: true });

  // the door cleared alone: the boss still waits, on a door that is no lock, a fault and not a wait
  const doorOnly = [door(null), ...tokens()];
  assert.match(afterDoorRefusal(WAITING, doorOnly), /asks for nothing/);
  assert.match(afterDoorOpen(WAITING, doorOnly).why, /no lock to wait on/);
  assert.equal(afterDoorOpen(WAITING, doorOnly).open, false);

  // the after_door dropped alone, the lock standing: the boss has nothing to wait on, so it is eligible at once
  const dropped = { id: WAITING.id };
  assert.deepEqual(afterDoorOpen(dropped, [door(LOCK)]), { open: true }, "eligible with the lock still standing and no key held");

  // the keys gone alone (in memory only), the lock standing: the boss waits on what nothing can meet
  const keysGone = afterDoorOpen(WAITING, [door(LOCK)]);
  assert.equal(keysGone.open, false);
  assert.equal(keysGone.shut, true, "a real lock, shut for good");
  // (the real state, no declaration, no requirement and the keys kept, is what cases 1-4 assert of the real files)
});
