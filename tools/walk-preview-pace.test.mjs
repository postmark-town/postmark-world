// walk-preview-pace.test.mjs — the walk desk previews at the town's LIVE stride.
//
// Founder, 2026-08-21: "I'm clicking to redirect rei and the walk ETA still
// says the old rate on the site."
//
// The pace was ruled from 15 to 60 km per crossing by 008b, and the live law is
// the RESIDENT class's own dial — "the stride is the mover's, never this verb's" (Keemin, 2026-08-22). tools/walk.mjs's WALK_KM_PER_CROSSING stays 15
// forever on purpose — it derives the unstamped legs written before that
// ruling, so their history never rewrites. Right for reading the past, wrong
// for previewing the future, and previewWalkLeg was doing the second with the
// first.
//
// THESE READ THE REAL STORE ON PURPOSE. The bug that caused this whole thread
// was a class's verb-form rename (departure -> depart) that an office lookup
// missed; a test over a hand-made fixture would have sailed through it. So the
// name and the dial are asserted against WORLD/world-state.json as it actually
// stands, which is the only thing that can notice the next rename.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WALK_KM_PER_CROSSING } from "./walk.mjs";
import { departPaceKm, STRIDE_CLASS_ID, previewWalkLeg, walkLegParts } from "../spectator/viewer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STORE = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
// the classes are law nodes, not marks (WLD-116): the page reads them from the fold-derived law artifact beside the store
STORE.marks = [...STORE.marks, ...JSON.parse(readFileSync(join(ROOT, "WORLD/law-state.json"), "utf8")).nodes];

test("THE LIVE STORE CARRIES THE STRIDE: the resident class is in world-state.json, by that name, with its dial", () => {
  const mover = STORE.marks.find((m) => m.id === STRIDE_CLASS_ID);
  assert.ok(mover, `${STRIDE_CLASS_ID} is not in the published store — a rename would land exactly here`);
  assert.equal(mover.kind, "class");
  assert.equal(mover.class, "resident");
  // the dial is a property of the class now (LOGOS v2 part 2), a row of its own
  // under the class; a store folded before the change carries it as the class
  // row's `dials`, and the store is always the last crossing's fold
  const property = STORE.marks.find((m) => m.kind === "property" && m.parent === STRIDE_CLASS_ID && m.name === "pace_km_per_crossing");
  assert.equal(property ? Number(property.default) : mover.dials?.pace_km_per_crossing, 60,
    "the store must carry the dial, not just the class — reading `class` and not `dials` is what left the preview guessing");
  assert.equal(departPaceKm(STORE.marks), 60);
});

test('PREVIEWS QUOTE 60, NOT 15: "the walk ETA still says the old rate on the site"', () => {
  const from = { x: 0, y: 0 }, toward = { x: 60000, y: 0 };   // 60 km — one crossing at the live stride
  const live = previewWalkLeg({ from, toward, paceKm: departPaceKm(STORE.marks) });
  const legacy = previewWalkLeg({ from, toward });

  assert.equal(live.paceKm, 60);
  assert.equal(live.paceFromRecord, true);
  assert.ok(Math.abs(live.etaCrossings - 1) < 0.01, `60 km at 60 km/crossing is one crossing; got ${live.etaCrossings}`);

  assert.equal(legacy.paceKm, WALK_KM_PER_CROSSING);
  assert.equal(legacy.paceFromRecord, false);
  assert.ok(Math.abs(legacy.etaCrossings - 4) < 0.01, "and the old constant would have promised four");
  assert.ok(legacy.etaCrossings / live.etaCrossings > 3.9,
    "the two answers differ by the whole ruling — which is what the founder was seeing");
});

test("A PREVIEW THAT GUESSED SAYS SO, and one that did not stays quiet", () => {
  const leg = { distanceM: 1000, etaCrossings: 0.5, paceKm: 15, paceFromRecord: false };
  assert.match(walkLegParts(leg).paceNote, /legacy 15 km stride/);
  assert.equal(walkLegParts({ ...leg, paceKm: 60, paceFromRecord: true }).paceNote, "",
    "the ordinary path reads exactly as it did");
});

test("departPaceKm refuses anything that is not a usable stride", () => {
  assert.equal(departPaceKm([]), null, "no class in the store at all");
  assert.equal(departPaceKm([{ id: STRIDE_CLASS_ID, kind: "class" }]), null, "class present, dials absent — the state this fix was written for");
  assert.equal(departPaceKm([{ id: STRIDE_CLASS_ID, dials: {} }]), null);
  assert.equal(departPaceKm([{ id: STRIDE_CLASS_ID, dials: { pace_km_per_crossing: 0 } }]), null, "zero is not a stride");
  assert.equal(departPaceKm([{ id: STRIDE_CLASS_ID, dials: { pace_km_per_crossing: -5 } }]), null);
  assert.equal(departPaceKm([{ id: STRIDE_CLASS_ID, dials: { pace_km_per_crossing: "sixty" } }]), null);
  assert.equal(departPaceKm([{ id: STRIDE_CLASS_ID, dials: { pace_km_per_crossing: 60 } }]), 60);
});

test("THE FOLD CARRIES A CLASS'S DIALS — without that the viewer's read has nothing to read", () => {
  const classed = STORE.marks.filter((m) => m.kind === "class");
  assert.ok(classed.length > 100, `expected the keeping works in the store; found ${classed.length} class marks`);
  // a class's dials are its property rows now (LOGOS v2 part 2), each carrying
  // its name and default under the class; a store folded before the change
  // carries them as the class row's `dials`
  const classIds = new Set(classed.map((m) => m.id));
  const properties = STORE.marks.filter((m) => m.kind === "property" && classIds.has(m.parent) && m.name && m.default !== undefined);
  const withDials = classed.filter((m) => m.dials && Object.keys(m.dials).length);
  assert.ok(properties.length >= 1 || withDials.length >= 1,
    "no class in the store carries its dials — the fold has stopped publishing them and every dial-reading surface is guessing again");
});
