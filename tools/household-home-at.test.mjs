// household-home-at.test.mjs — A RESIDENT'S HOME IS THE GROUND THEY HOLD.
//
// THE PARCEL IS THE HOME (ruling 7). The fold publishes the parcel list for
// exactly this — `world-build.mjs`: "every reader that needs to answer 'where
// does this resident stand?' reads the same list" — and the office's `homeOf`
// reads it as `parcelsFor(handle)[0].at`.
//
// The viewer did not. Three of its readers took the coordinate from
// `seeding/manifest.json` instead: `homeFor` (a household resident's walk
// origin), `readActorHome`'s fallback when the office cannot be reached, and
// `renderPresets` (the jump-to-my-house buttons). That file is the July atlas
// painting at 5 m/px, so the button labelled with your house walked you to
// where a painting put it. It is deleted and this answers instead
// (postmark#3025), which makes the page and the door name one place.
//
// RED against main, which exports no `householdHomeAt`. Imported dynamically so
// the absence fails an assertion instead of crashing the module load.

import test from "node:test";
import assert from "node:assert/strict";

const viewerModule = () => import("../spectator/viewer.mjs");

async function homeAt() {
  const mod = await viewerModule();
  assert.equal(typeof mod.householdHomeAt, "function",
    "spectator/viewer.mjs must export householdHomeAt");
  return mod.householdHomeAt;
}

// The fold's own rows, copied from WORLD/world-state.json at 5f042bb.
const PARCELS = [
  { id: "rei/the-lanternstep-house-parcel", household: "rei", at: { x: 1088, y: -794.5 }, extent: { w: 25, h: 25 } },
  { id: "current-the-reader/the-keepers-flat", household: "current-the-reader", at: { x: -350, y: 4955 }, extent: { w: 25, h: 25 } },
];
// The same two as parcel MARKS, which is what the resident path holds — the
// fold is never loaded there, and a resident's read carries their own ground.
const MARKS = PARCELS.map((p) => ({ ...p, kind: "parcel", by: p.household }));

test("the home is the centre of the parcel the household holds", async () => {
  const householdHomeAt = await homeAt();
  assert.deepEqual(householdHomeAt("rei", { parcels: PARCELS }),
    { x: 1088, y: -794.5, markId: "rei/the-lanternstep-house-parcel" });
  assert.deepEqual(householdHomeAt("current-the-reader", { parcels: PARCELS }),
    { x: -350, y: 4955, markId: "current-the-reader/the-keepers-flat" });
});

test("the resident path answers the same, from the parcel MARKS it holds", async () => {
  const householdHomeAt = await homeAt();
  // No fold, so no published rows — this is the path that never opens the 0.93 MB
  // world-state, and the path the manifest was fetched as a "small whole" for.
  assert.deepEqual(householdHomeAt("rei", { marks: MARKS }),
    householdHomeAt("rei", { parcels: PARCELS }),
    "one answer, whichever source the page happens to hold");
});

test("a household holding NO ground has no home, and that absence is the honest one", async () => {
  const householdHomeAt = await homeAt();
  assert.equal(householdHomeAt("nobody", { parcels: PARCELS, marks: MARKS }), null);
  assert.equal(householdHomeAt("", { parcels: PARCELS }), null);
  assert.equal(householdHomeAt("rei", {}), null, "no sources in hand is an absence, never a guess");
});

test("a parcel with no usable centre is skipped rather than answered with NaN", async () => {
  const householdHomeAt = await homeAt();
  const broken = [{ id: "rei/bad", household: "rei", at: { x: null, y: 3 } }, ...PARCELS];
  assert.equal(householdHomeAt("rei", { parcels: broken }).markId, "rei/the-lanternstep-house-parcel");
});

test("a mark filed as a parcel of somebody else is not this household's home", async () => {
  const householdHomeAt = await homeAt();
  assert.equal(householdHomeAt("rei", { marks: [{ id: "spar/x", kind: "parcel", by: "spar", at: { x: 1, y: 2 } }] }), null);
});

test("only a PARCEL answers — a sited mark on the ground is not the ground", async () => {
  const householdHomeAt = await homeAt();
  const house = { id: "rei/the-lanternstep-house", kind: "sited", by: "rei", at: { x: 9, y: 9 } };
  assert.equal(householdHomeAt("rei", { marks: [house] }), null);
  assert.equal(householdHomeAt("rei", { marks: [house, ...MARKS] }).markId, "rei/the-lanternstep-house-parcel");
});

test("CONTROL — the probe can tell the two households apart", async () => {
  const householdHomeAt = await homeAt();
  assert.notDeepEqual(householdHomeAt("rei", { parcels: PARCELS }),
    householdHomeAt("current-the-reader", { parcels: PARCELS }));
});

test("[pin] all three readers ask for the ground, and none of them asks a manifest", async () => {
  const { readFileSync } = await import("node:fs");
  const code = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8")
    .replace(/^\s*\/\/.*$/gm, "");
  const calls = code.match(/householdHomeAt\(/g) ?? [];
  assert.ok(calls.length >= 4,
    `homeFor, readActorHome and renderPresets must each ask; found ${calls.length} call(s) plus the definition`);
  assert.ok(!/manifest\?\.homes|manifest\.homes/.test(code),
    "and nothing reads a seeding manifest's homes any more");
});
