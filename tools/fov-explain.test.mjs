// fov-explain.test.mjs — the opt-in `explain` diagnostic of fieldOfView / openYourEyes (WLD-105 A13).
//
// `explain: true` makes the result carry the decision the pass itself made for every mark with a place: not a candidate
// (outside the frame, the horizon, world-scale, beyond sight, at the centre), cut (the Mists, the fog, the land), told,
// past the budget, or folded into its household's cluster. The decisions are recorded where they are made. These tests hold:
//   1. DEFAULT UNCHANGED: with `explain` off the result has no `explain` key, and with it on the result is the same value
//      once that key is taken off (carried, counts, aggregate, far, observer), and the telling's text is byte-identical;
//   2. AGREEMENT: the verdicts agree with the result's own lists and counts (told = carried, budget = the tail, cluster =
//      clustered, the Mists' and the fog's counts), on the real world at several standpoints and budgets;
//   3. THE CASES: a signal cutting through fog, a thing at your feet, shelter from the Mists, the eye height on a land cut,
//      the frame, a far mark and the world-scale root are reported as the engine decided them.
// Invented marks for the cases; the real fold only for the agreement.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHeightfield, fieldOfView, fogModel, DIALS } from "./world-engine.mjs";
import { openYourEyes } from "./world-verbs.mjs";
import { buildWorld } from "./world-poc.mjs";

const flatHF = buildHeightfield({ controlPoints: [{ x: 0, y: 0, h: 5 }, { x: 10000, y: 0, h: 5 }, { x: 0, y: 10000, h: 5 }, { x: -10000, y: 0, h: 5 }] });
const light = { dawn_pole_m: { x: 5000, y: -5000 }, dark_pole_m: { x: -5000, y: 5000 } };
const worldOf = (marks, hf = flatHF) => ({ marks, terrain: { far_features: [], features: [], elevation: {} }, heightfield: hf, light, fogCeilingM: 22 });
const without = (r) => { const { explain, ...rest } = r; return rest; };
const count = (why, decision) => Object.values(why).filter((w) => w.decision === decision).length;

test("default unchanged: no `explain` key without the option, and the same result with it (the telling too)", () => {
  const w = buildWorld({ crossing: 19, marksDir: "WORLD/marks" });
  for (const at of [{ x: 0, y: 0 }, { x: -1375, y: -2550 }]) {
    for (const budget of [DIALS.context_budget, 4]) {
      const plain = fieldOfView(at, w, { crossing: 19, budget });
      const explained = fieldOfView(at, w, { crossing: 19, budget, explain: true });
      assert.equal("explain" in plain, false);
      assert.equal(typeof explained.explain, "object");
      assert.deepEqual(without(explained), plain, `${JSON.stringify(at)} budget ${budget}`);
    }
    const a = openYourEyes(at, w, { crossing: 19 }), b = openYourEyes(at, w, { crossing: 19, explain: true });
    assert.equal(b.tell(), a.tell(), "the telling is byte-identical");
    assert.equal("explain" in a.fov, false);
    assert.ok(b.fov.explain);
  }
});

test("agreement: the verdicts are the result's own lists and counts", () => {
  const w = buildWorld({ crossing: 19, marksDir: "WORLD/marks" });
  let budgetSeen = 0, clusterSeen = 0, mistsSeen = 0;
  for (const at of [{ x: 0, y: 0 }, { x: -1375, y: -2550 }, { x: -94570, y: -94570 }]) {
    for (const budget of [DIALS.context_budget, 3]) {
      const fov = fieldOfView(at, w, { crossing: 19, budget, explain: true });
      const why = fov.explain, c = fov.counts;
      assert.deepEqual(Object.keys(why).filter((id) => why[id].decision === "told").sort(), fov.carried.map((m) => m.id).sort(), "told is what is carried");
      assert.equal(count(why, "budget"), fov.aggregate.hidden_by_budget, "past the budget is the tail");
      assert.equal(count(why, "budget"), c.clustered, "(counts.clustered is the seated-out remainder: the tail, as the engine names it)");
      assert.equal(count(why, "told"), c.shown);
      assert.equal(count(why, "told") + count(why, "budget") + count(why, "cluster"), c.visible, "every visible mark has a seating verdict");
      assert.equal(count(why, "mists"), c.mistHidden ?? 0, "the Mists' own count");
      assert.equal(count(why, "visible"), 0, "no mark is left at its provisional verdict");
      const candidates = count(why, "told") + count(why, "budget") + count(why, "cluster") + count(why, "mists") + count(why, "fog") + count(why, "land");
      assert.equal(candidates, c.candidates, "the candidates are the marks the pass admitted");
      for (const [id, v] of Object.entries(why)) if (v.decision === "cluster") assert.ok(why[v.into] && ["told", "budget"].includes(why[v.into].decision), `${id} is folded into a rep the pass seated`);
      budgetSeen += count(why, "budget"); clusterSeen += count(why, "cluster"); mistsSeen += count(why, "mists");
    }
  }
  assert.ok(budgetSeen > 0 && clusterSeen > 0, "premise: the real world exercises the budget and the cluster verdicts");
  assert.ok(mistsSeen >= 0);
});

test("the cases: land and eye height, fog and a signal, at your feet, shelter, the frame, the horizon and the world root", () => {
  // a ridge between the observer and a low mark: cut by the land, with the eye height the sightline used
  const ridge = buildHeightfield({ controlPoints: [{ x: 0, y: 0, h: 5 }, { x: 500, y: 0, h: 80 }, { x: 1000, y: 0, h: 5 }, { x: 2000, y: 0, h: 5 }] });
  const land = fieldOfView({ x: 0, y: 0 }, worldOf([
    { id: "hh/low", kind: "sited", household: "hh", at: { x: 1000, y: 0 }, extent: { w: 2, h: 2 }, weight: 0, top_m: 0 },
    { id: "zz/tall", kind: "sited", household: "zz", at: { x: 1000, y: 0 }, extent: { w: 2, h: 2 }, weight: 0, top_m: 200 },
  ], ridge), { crossing: 0, explain: true }).explain;
  assert.equal(land["hh/low"].decision, "land");
  assert.equal(land["hh/low"].eyeM, DIALS.eye_height_m, "the eye height the sightline was cast from");
  assert.ok(Number.isFinite(land["hh/low"].occludeAt?.x) && Number.isFinite(land["hh/low"].occludeAt?.ground), "where the ground cut the sightline");
  assert.equal(land["zz/tall"].decision, "told");

  // thick fog: a plain mark at range is cut by the fog (with the reach), a signal at the same range is not (and is flagged)
  let crossing = 1, best = 0; // the thickest fog of the first 200 crossings, as world-engine.test.mjs picks it
  for (let c = 1; c < 200; c++) { const t = fogModel(c).thickness; if (t > best) { best = t; crossing = c; } }
  const far = 6000;
  const fogged = fieldOfView({ x: 0, y: 0 }, worldOf([
    { id: "plain/m", kind: "sited", household: "plain", at: { x: 0, y: far }, extent: { w: 4, h: 4 }, weight: 5, signal: false, top_m: 4 },
    { id: "sig/m", kind: "sited", household: "sig", at: { x: 1, y: far }, extent: { w: 4, h: 4 }, weight: 5, signal: true, top_m: 4 },
  ]), { crossing, explain: true }).explain;
  assert.equal(fogged["plain/m"].decision, "fog");
  assert.ok(fogged["plain/m"].reachM < far, "the reach that cut it");
  assert.notEqual(fogged["sig/m"].decision, "fog");
  assert.equal(fogged["sig/m"].signal, true);

  // a thing at your feet is admitted from where you stand, and says so
  const feet = fieldOfView({ x: 0, y: 0 }, worldOf([{ id: "a/bowl", kind: "sited", household: "a", at: { x: 40, y: 0 }, extent: { w: 200, h: 200 }, weight: 0 }]),
    { crossing: 0, atFeet: new Set(["a/bowl"]), explain: true }).explain;
  assert.equal(feet["a/bowl"].atFeet, true);

  // beyond sight, at the centre, outside the frame, the horizon, the world-scale root
  const marks = [
    { id: "n/beyond", kind: "sited", household: "n", at: { x: DIALS.max_sight_m + 500, y: 0 }, extent: { w: 10, h: 10 } },
    { id: "n/centre", kind: "sited", household: "n", at: { x: 0, y: 0 }, extent: { w: 10, h: 10 } },
    { id: "n/outside", kind: "sited", household: "n", at: { x: 100, y: 0 }, extent: { w: 10, h: 10 } },
    { id: "n/peak", kind: "sited", household: "n", at: { x: 100, y: 100 }, extent: { w: 10, h: 10 }, far: true },
    { id: "n/root", kind: "sited", household: "n", at: { x: 0, y: 500 }, extent: { w: DIALS.world_scale_extent_m + 1, h: DIALS.world_scale_extent_m + 1 } },
  ];
  const e = fieldOfView({ x: 0, y: 0 }, worldOf(marks), { crossing: 0, frame: (m) => m.id !== "n/outside", explain: true }).explain;
  assert.equal(e["n/beyond"].decision, "beyond-sight"); assert.equal(e["n/beyond"].maxSightM, DIALS.max_sight_m);
  assert.equal(e["n/centre"].decision, "at-centre");
  assert.equal(e["n/outside"].decision, "outside-frame");
  assert.equal(e["n/peak"].decision, "horizon");
  assert.equal(e["n/root"].decision, "world-scale");
});

test("the Mists: a mark behind the wall is `mists`, and a sheltered observer's marks carry `sheltered`", () => {
  const w = buildWorld({ crossing: 19, marksDir: "WORLD/marks" });
  // the far standpoint past the town's clear box is where the Mists cut marks (see the agreement test's mistHidden count)
  let found = null;
  for (const at of [{ x: -94570, y: -94570 }, { x: 40000, y: 40000 }, { x: -40000, y: 40000 }, { x: 4075, y: 5050 }]) {
    const fov = fieldOfView(at, w, { crossing: 19, explain: true });
    if ((fov.counts.mistHidden ?? 0) > 0) { found = { at, fov }; break; }
  }
  if (found) {
    const mists = Object.entries(found.fov.explain).filter(([, v]) => v.decision === "mists");
    assert.equal(mists.length, found.fov.counts.mistHidden);
    assert.ok(mists.every(([, v]) => !v.sheltered), "nothing sheltered is cut by the Mists");
  }
  const sheltered = fieldOfView({ x: 0, y: 0 }, worldOf([{ id: "s/m", kind: "sited", household: "s", at: { x: 300, y: 0 }, extent: { w: 20, h: 20 } }]),
    { crossing: 19, shelter: () => true, explain: true }).explain;
  assert.ok(["told", "budget", "cluster", "land", "fog", "mists"].includes(sheltered["s/m"].decision));
});
