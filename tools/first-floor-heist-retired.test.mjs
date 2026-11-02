// first-floor-heist-retired.test.mjs — the first-floor heist's declarations are retired (WLD-135, part 1 of 2).
//
// The declaration side only: the four candied class marks no longer declare a `named`
// creature (the bat, the raven, both wolves, the boss), and the chapel door no longer
// asks for the three keys. The keys themselves are withdrawn separately, through the
// town's door; nothing here reads, needs or proves them.
//
// READS: exactly five authored files, by path (no loader, no whole-world read): the four
// class marks and the door. Everything else is synthetic and in memory.
//
// THE COUPLING (why it is one change): a door cleared while a declaration still waits on
// it leaves a creature waiting on no lock (a fault); an `after_door` dropped while the lock
// stands leaves an eligible boss; keys gone while the lock stands leaves a wait nothing can
// meet. Only the complete retirement is none of those.
//
// CAN-FAIL FLIPS: write any `named` entry back onto one of the four classes (the reader
// case and the file case red); write `requires` back onto the door (the door case reds).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRecord } from "./marks-fold.mjs";
import { TOWN, creatureLaw, afterDoorOpen, afterDoorRefusal } from "./creatures.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLASS_DIR = "WORLD/marks/let-there-be-light/the-town-centre/the-keeping-works/postmark-node/entity/creature";
const CLASSES = ["candied-bat", "candied-raven", "candied-wolf", "candied-jetto"];
const DOOR_FILE = "WORLD/marks/wright/spire-hall-of-keepers-to-star-chapel/mark.md";
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

// ── the coupling, in memory ─────────────────────────────────────────────────────────

const DOOR = "tower/inner-door";
const HOLDERS = ["tower/holder-1", "tower/holder-2", "tower/holder-3"];
const ASKS = ["tower/token-a", "tower/token-b", "tower/token-c"];
const LOCK = { holds: ASKS, in: HOLDERS, at: "settlement" };
const door = (requires) => ({ id: DOOR, kind: "thing", by: "tower", at: { x: 0, y: 0 }, extent: { w: 2, h: 2 }, body: "A door.",
  entry: { word: "neutral", into: "tower/room", ...(requires ? { requires } : {}) } });
const tokens = () => ASKS.map((id, i) => ({ id, kind: "thing", by: "the-town", body: "A token.", held_by: HOLDERS[i] }));
const WAITING = { id: "creature:candied-jetto-den", after_door: DOOR };

test("the three bad shapes are each caught, and only the complete retirement is none of them", () => {
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

  // the complete retirement: no declaration waits, no door asks. Nothing dangles in either direction.
  assert.equal(afterDoorRefusal(undefined, [door(null)]), null);
  assert.deepEqual(afterDoorOpen({ id: "creature:none" }, [door(null)]), { open: true }, "nothing declared, nothing to wait on");
});
