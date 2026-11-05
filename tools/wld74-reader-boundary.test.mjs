// wld74-reader-boundary.test.mjs — WLD-74, B at the reader boundary (Wright,
// 2026-11-05 04:48, on Bevel's 04:47Z Packet): a thing is within only once
// entered, and a thing at your feet stays an object you see and reach.
//
// The engine's own readers, asked at ONE invented point (the origin of a
// throwaway world), so every arm differs from its control by one fact:
//   E1  isThingIn: the class chain decides a thing; an untyped carriable is not one
//   E2  orient's within: an unentered thing is absent, an entered one present,
//       one stepped out of absent again; null `entered` is nothing entered
//   E3  openYourEyes's within, the same; the spine the telling tells
//   E4  the thing at your feet is an object (exact centre AND off centre), and
//       `here: true` stays the kept home's alone
//   E5  the things at your feet take the first seats WITHIN the budget, after the
//       kept home; past the budget they go to the tail like any mark
//   E6  the telling says "here" for a thing at your feet, keyed on the at-feet
//       relation and never on a rounded 0 m
// and what B must leave alone: containmentChain is geometric (enterPrompt still
// offers the bowl), a room or a place under the point stays within, and an
// entered room still frames the sight.
//
// Every record is invented. Run: node --test tools/wld74-reader-boundary.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHeightfield, fieldOfView, DIALS } from "./world-engine.mjs";
import { orient, openYourEyes, containmentChain, enterPrompt } from "./world-verbs.mjs";
import { isThingIn, kindIndexOf } from "./mark-kind.mjs";

const flatHF = buildHeightfield({ controlPoints: [{ x: 0, y: 0, h: 5 }, { x: 10000, y: 0, h: 5 }, { x: 0, y: 10000, h: 5 }, { x: -10000, y: 0, h: 5 }] });
const light = { dawn_pole_m: { x: 5000, y: -5000 }, dark_pole_m: { x: -5000, y: 5000 } };
const P = { x: 0, y: 0 };

// the class tree, as the town's law files it (kind: class, by the-town, extends)
const CLASS = (name, ext) => ({ id: `the-town/${name}`, kind: "class", by: "the-town", household: "the-town", tier: "constitution", class: name, ...(ext ? { extends: ext } : {}), body: `the ${name} class` });
const LAW = [CLASS("postmark-node"), CLASS("mark", "postmark-node"), CLASS("sited", "mark"), CLASS("thing", "sited"), CLASS("halloween-candy-bowl", "thing")];

const ROOT = { id: "the-town/let-there-be-light", by: "the-town", household: "the-town", kind: "sited", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 60000, h: 60000 }, body: "Let there be light." };
const HOME = { id: "sbx-ana/home", by: "sbx-ana", household: "sbx-ana", kind: "parcel", tier: "market", at: { x: 0, y: 0 }, extent: { w: 25, h: 25 }, body: "ana's home ground." };
// THE BOWL, a subclass thing (the census's candy bowl), centred exactly on the point
const BOWL = { id: "sbx-ana/a-door-bowl", by: "sbx-ana", household: "sbx-ana", kind: "halloween-candy-bowl", tier: "market", at: { x: 0, y: 0 }, extent: { w: 2, h: 2 }, holder: true, body: "A carved bowl by ana's door." };
// THE LAMP, a direct thing in the old spelling, centred 0.7 m off the point; its footprint holds the point
const LAMP = { id: "sbx-ana/a-lamp", by: "sbx-ana", household: "sbx-ana", kind: "sited", class: "thing", tier: "market", at: { x: 0.7, y: 0 }, extent: { w: 2, h: 2 }, body: "A small lamp." };
// THE STOOL, untyped and carriable: no class, so not a thing (the wide-class question stays out). Its footprint
// holds the bowl's whole, so the geometric nest keeps it beside an entered bowl (an overlapping sibling it drops)
const STOOL = { id: "sbx-ana/a-stool", by: "sbx-ana", household: "sbx-ana", kind: "sited", tier: "market", at: { x: 0, y: 0.2 }, extent: { w: 3, h: 3 }, body: "A three-legged stool." };
// THE PEBBLE, a thing whose centre is 0.4 m away (a displayed 0 m) and whose footprint does NOT hold the point
const PEBBLE = { id: "sbx-ana/a-pebble", by: "sbx-ana", household: "sbx-ana", kind: "thing", tier: "market", at: { x: 0.4, y: 0 }, extent: { w: 0.5, h: 0.5 }, body: "A pebble." };
// THE SHED, an untyped sited room around the point
const SHED = { id: "sbx-ana/the-shed", by: "sbx-ana", household: "sbx-ana", kind: "sited", tier: "market", at: { x: 0, y: 0 }, extent: { w: 10, h: 10 }, body: "A garden shed." };

function worldOf(marks, { law = LAW } = {}) {
  return {
    marks: [ROOT, ...law, ...marks],
    parcels: [{ id: HOME.id, household: "sbx-ana", at: HOME.at, extent: HOME.extent }], households: { "sbx-ana": "sbx-ana" },
    terrain: { far_features: [], features: [], elevation: {} }, heightfield: flatHF, light, fogCeilingM: 22,
  };
}
const W = worldOf([HOME, SHED, BOWL, LAMP, STOOL, PEBBLE]);
const withinIds = (w) => w.map((m) => m.id);
const carriedIds = (fov) => fov.carried.map((c) => c.id);
const lineOf = (tell, id) => tell.split("\n").find((l) => l.includes(`[${id},`)) ?? null;

test("E1 · the class chain decides a thing: direct, old spelling and subclass are; untyped and a place are not", () => {
  const idx = kindIndexOf(W.marks);
  assert.equal(isThingIn(BOWL, idx), true, "a halloween-candy-bowl extends thing");
  assert.equal(isThingIn(LAMP, idx), true, "class: thing, the old spelling");
  assert.equal(isThingIn(PEBBLE, idx), true, "kind: thing");
  assert.equal(isThingIn(STOOL, idx), false, "an untyped carriable stays out (not newly admitted)");
  assert.equal(isThingIn(SHED, idx), false, "an untyped room is not a thing");
  assert.equal(isThingIn(HOME, idx), false, "a parcel is not a thing");
  // CONTROL, the reason the keyless read is handed its class law (K1): with no class marks in hand the
  // subclass cannot be resolved, while a direct thing still can
  const bare = kindIndexOf([BOWL, LAMP]);
  assert.equal(isThingIn(BOWL, bare), false, "no class nodes in hand: the subclass is not known to be a thing");
  assert.equal(isThingIn(LAMP, bare), true, "a direct thing needs no class node");
});

test("E2 · orient: an unentered thing is not within; entered, it is; stepped out of, it is not again. The place under the point stays", () => {
  const unentered = withinIds(orient(P, W).you.within);
  assert.ok(!unentered.includes(BOWL.id) && !unentered.includes(LAMP.id), `unentered things absent: ${unentered.join(", ")}`);
  for (const id of [ROOT.id, HOME.id, SHED.id, STOOL.id]) assert.ok(unentered.includes(id), `${id} stays within (a place, a room, the untyped carriable)`);
  const entered = withinIds(orient(P, W, { entered: [BOWL.id] }).you.within);
  assert.ok(entered.includes(BOWL.id), "entered: the bowl is within");
  assert.ok(!entered.includes(LAMP.id), "the lamp, not entered, is still not");
  assert.deepEqual(entered.filter((id) => id !== BOWL.id), unentered, "entering the bowl moves nothing else");
  const exited = withinIds(orient(P, W, { entered: [] }).you.within);
  assert.deepEqual(exited, unentered, "a stack that no longer holds the bowl reads as unentered");
  assert.deepEqual(withinIds(orient(P, W, { entered: null }).you.within), unentered, "null entered means nothing entered");
});

test("E3 · openYourEyes's within (the telling's spine) agrees with orient, arm for arm", () => {
  for (const entered of [null, [], [BOWL.id], [LAMP.id]])
    assert.deepEqual(withinIds(openYourEyes(P, W, { entered }).radial.within), withinIds(orient(P, W, { entered }).you.within), `entered ${JSON.stringify(entered)}`);
  const told = openYourEyes(P, W).tell();
  const spineLine = told.split("\n").find((l) => l.startsWith("You are within")) ?? "";
  assert.doesNotMatch(spineLine, /a-door-bowl|a-lamp/, "the telling does not say you are within a thing you never entered");
});

test("E4 · the thing at your feet is an object, exact centre and off centre; `here: true` is the kept home's alone", () => {
  const fov = openYourEyes(P, W).fov;
  assert.ok(carriedIds(fov).includes(BOWL.id), "exact centre: the bowl is carried");
  assert.ok(carriedIds(fov).includes(LAMP.id), "off centre (0.7 m): the lamp is carried");
  assert.ok(!fov.carried.some((c) => c.here), "no actor: nothing carries here: true");
  // the kept home, with a bowl centred on it: the home's flag, never the bowl's
  const home = openYourEyes(P, W, { actor: "sbx-ana" }).fov;
  assert.equal(home.carried.find((c) => c.id === HOME.id)?.here, true, "the kept home at its centre carries here: true");
  assert.equal(home.carried.find((c) => c.id === BOWL.id)?.here, undefined, "the bowl centred on the home does not");
  // entered, the bowl is the frame and the inside, not a seat (the sight frame's rule, unchanged)
  const inBowl = openYourEyes(P, W, { entered: [BOWL.id] }).fov;
  assert.ok(!carriedIds(inBowl).includes(BOWL.id), "entered: the bowl is the frame, told in within");
  // CONTROL: the untyped stool keeps today's standing: it is within, and it is a candidate off centre as before
  assert.ok(withinIds(openYourEyes(P, W).radial.within).includes(STOOL.id));
});

test("E6 · the words: here for a thing at your feet, a distance for a 0 m neighbour, here for the kept home", () => {
  const told = openYourEyes(P, W).tell();
  assert.match(lineOf(told, BOWL.id) ?? "", /^ {2}· here — /, "exact centre reads here");
  assert.match(lineOf(told, LAMP.id) ?? "", /^ {2}· here — /, "off centre reads here");
  // the pebble's displayed distance rounds to 0, but its footprint does not hold the point: no here
  const pebble = openYourEyes(P, W).fov.carried.find((c) => c.id === PEBBLE.id);
  assert.equal(pebble?.distM, 0, "control: the pebble's rounded distance is 0");
  assert.match(lineOf(told, PEBBLE.id) ?? "", /^ {2}· 0 m [NESW]+ — /, "a rounded 0 m is not the at-feet rule");
  // the kept home you stand in is told by the spine, never as a band line (unchanged): its `here` is the row's flag (E4)
  const home = openYourEyes(P, W, { actor: "sbx-ana" }).tell();
  assert.equal(lineOf(home, HOME.id), null, "control: the kept home is told in the spine, not listed");
  assert.match(lineOf(home, BOWL.id) ?? "", /^ {2}· here — /, "the bowl centred on the kept home reads here by the at-feet relation");
});

// a crowd that outranks any 2 m thing at your feet: each 40 m stall, heavy and close
const CROWD = (n) => Array.from({ length: n }, (_, i) => ({
  id: `crowd${i}/stall`, by: `crowd${i}`, household: `crowd${i}`, kind: "sited", tier: "market",
  at: { x: 30 + i * 0.5, y: 3 }, extent: { w: 40, h: 40 }, weight: 50, body: "b",
}));
const FEET = ["sbx-ana/bowl-one", "sbx-ana/bowl-two", "sbx-ana/bowl-three"].map((id, i) => ({ ...BOWL, id, at: { x: [0, 0.6, -0.6][i], y: 0 } }));

test("E5 · normal budget: the things at your feet are never the ones cut, and they count toward the budget", () => {
  const w = worldOf([HOME, ...FEET, ...CROWD(14)]);
  const fov = openYourEyes(P, w).fov;
  for (const f of FEET) assert.ok(carriedIds(fov).includes(f.id), `${f.id} carried`);
  assert.equal(fov.carried.length, DIALS.context_budget, "within the ordinary budget, not beside it");
  assert.equal(fov.aggregate.hidden_by_budget, fov.counts.visible - DIALS.context_budget, "the rest is the existing tail");
  // they rank below the crowd: ORDER seats them, not their score
  const ranked = [...fov.carried].sort((a, b) => b.score - a.score).map((c) => c.id);
  assert.ok(ranked.indexOf(FEET[0].id) > ranked.indexOf("crowd0/stall"), "control: the crowd outranks the bowls on score");
  // with the kept home: the home rides outside the budget, the feet first within it
  const home = openYourEyes(P, w, { actor: "sbx-ana" }).fov;
  assert.ok(carriedIds(home).includes(HOME.id));
  for (const f of FEET) assert.ok(carriedIds(home).includes(f.id), `${f.id} carried beside the kept home`);
  assert.equal(home.carried.filter((c) => c.id !== HOME.id).length, DIALS.context_budget);
});

test("E5 · a small budget: overflow is bounded and counted in the existing tail, never an exemption", () => {
  const w = worldOf([HOME, ...FEET, ...CROWD(14)]);
  const fov = openYourEyes(P, w, { budget: 2 }).fov;
  assert.equal(fov.carried.length, 2, "two seats, two carried");
  assert.ok(carriedIds(fov).every((id) => FEET.some((f) => f.id === id)), `both seats go to things at your feet: ${carriedIds(fov).join(", ")}`);
  assert.equal(fov.aggregate.hidden_by_budget, fov.counts.visible - 2, "the third bowl and the crowd are the tail");
  // the small view and the default view stay different views (the budget is the caller's)
  assert.ok(openYourEyes(P, w).fov.carried.length > fov.carried.length);
});

// F3 (Bevel's FIX1 counterexample): at-feet is footprint containment, but a far household folds by CENTRE
// distance (cluster_beyond_m). Two wide nested things of one household whose footprints both hold the point and
// whose centres stand ~700 m off; and, as the control, two small far things of the same household not at your feet
const WIDE = [["sbx-bea/a-long-awning", -700, 1404], ["sbx-bea/a-longer-awning", -701, 1406]].map(([id, x, w]) => ({
  id, by: "sbx-bea", household: "sbx-bea", kind: "thing", tier: "market", at: { x, y: -1 }, extent: { w, h: 4 }, body: "A long awning.",
}));
const AFAR = [["sbx-bea/a-far-crate", -1500], ["sbx-bea/a-far-barrel", -1510]].map(([id, x]) => ({
  id, by: "sbx-bea", household: "sbx-bea", kind: "thing", tier: "market", at: { x, y: 0 }, extent: { w: 2, h: 2 }, body: "A crate.",
}));

test("F3 · two things at your feet whose centres stand past cluster_beyond_m are both seated, not folded into one", () => {
  // a flat world with the eye above the fog line: nothing here is cut by weather, light or ground
  const w = { ...worldOf([...WIDE, ...AFAR]), fogCeilingM: 0 };
  const idx = kindIndexOf(w.marks);
  // THE PREMISES, measured: canonical sited things (numeric at/extent, mark-lint's gate; under the world-scale
  // frame; the class chain says thing), both footprints hold the point, both centres past the cluster distance
  for (const t of WIDE) {
    assert.ok([t.at.x, t.at.y, t.extent.w, t.extent.h].every(Number.isFinite), `${t.id}: numeric at/extent`);
    assert.ok(Math.max(t.extent.w, t.extent.h) < DIALS.world_scale_extent_m, `${t.id}: not the world frame`);
    assert.equal(isThingIn(t, idx), true, `${t.id} is a thing`);
    assert.ok(withinIds(containmentChain(P, [t])).includes(t.id), `${t.id}'s footprint holds the point`);
    assert.ok(Math.hypot(t.at.x - P.x, t.at.y - P.y) > DIALS.cluster_beyond_m, `${t.id}'s centre is past cluster_beyond_m`);
  }
  const fov = openYourEyes(P, w).fov;
  assert.equal(fov.counts.candidates, 4, "the two awnings and the two far things are candidates");
  assert.equal(fov.counts.visible, 4, "and all four are visible: no other cull is in play");
  for (const t of WIDE) assert.ok(carriedIds(fov).includes(t.id), `${t.id}, at your feet, is seated (budget ${DIALS.context_budget})`);
  for (const t of WIDE) assert.match(lineOf(openYourEyes(P, w).tell(), t.id) ?? "", /^ {2}· here — /, `${t.id} reads here`);
  // CONTROL: the far household still folds what is not at your feet, to one rep that is not an awning
  const far = carriedIds(fov).filter((id) => AFAR.some((t) => t.id === id));
  assert.equal(far.length, 1, `the two far things fold to one: ${far.join(", ")}`);
  assert.equal(fov.carried.find((c) => c.id === far[0])?.clusteredCount, 1, "the other is its clusteredCount");
  assert.equal(fov.carried.filter((c) => WIDE.some((t) => t.id === c.id)).some((c) => c.clusteredCount), false, "an awning is never the household's rep");
  // the budget still bounds them: one seat, one awning; the other goes to the existing tail, not folded away
  const one = openYourEyes(P, w, { budget: 1 }).fov;
  assert.equal(one.carried.length, 1);
  assert.ok(WIDE.some((t) => t.id === one.carried[0].id), `the one seat goes to an awning: ${one.carried[0].id}`);
  assert.equal(one.aggregate.hidden_by_budget, 2, "the other awning and the far rep are the tail");
});

test("GEOMETRY UNTOUCHED · containmentChain still holds the bowl, and enterPrompt still offers it", () => {
  assert.ok(withinIds(containmentChain(P, W.marks)).includes(BOWL.id), "the chain is geometric: the bowl holds the point");
  const prompt = enterPrompt(P, worldOf([HOME, BOWL]), { occupancy: new Map(), handle: "sbx-ana" });
  assert.equal(prompt?.mark, BOWL.id, "walking onto the bowl still offers to enter it");
  const inside = enterPrompt(P, worldOf([HOME, BOWL]), { occupancy: new Map([["sbx-ana", [BOWL.id]]]), handle: "sbx-ana" });
  assert.notEqual(inside?.mark, BOWL.id, "once entered, it is not offered again");
});

test("ROOM CONTROL · an entered room frames the sight and stays within; a thing inside it at your feet is still an object", () => {
  const w = worldOf([HOME, SHED, BOWL]);
  const eyes = openYourEyes(P, w, { entered: [SHED.id] });
  assert.ok(withinIds(eyes.radial.within).includes(SHED.id), "the entered shed is within");
  assert.ok(!withinIds(eyes.radial.within).includes(BOWL.id), "the bowl in it, not entered, is not");
  assert.ok(carriedIds(eyes.fov).includes(BOWL.id), "the bowl inside the shed's frame is seen at your feet");
  assert.ok(!carriedIds(eyes.fov).includes(HOME.id), "the frame still scopes: the parcel outside the shed is not a seat");
  // and the shed itself, unentered, is a place: within as ever
  assert.ok(withinIds(orient(P, w).you.within).includes(SHED.id));
});

test("E4 at the engine seam · fieldOfView with no atFeet skips the exact centre as it always did (the input is the only door)", () => {
  const fov = fieldOfView(P, W);
  assert.ok(!carriedIds(fov).includes(BOWL.id), "no input: the exact-centre bowl is skipped");
  const admitted = fieldOfView(P, W, { atFeet: new Set([BOWL.id]) });
  assert.ok(carriedIds(admitted).includes(BOWL.id), "the input admits it");
  assert.equal(admitted.carried.find((c) => c.id === BOWL.id)?.here, undefined, "admitted, it is not flagged here");
});
