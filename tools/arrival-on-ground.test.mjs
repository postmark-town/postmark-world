// arrival-on-ground.test.mjs — a walk that has arrived stands ON its target's
// ground, by the same test the enter's reach asks (WLD-5, 2026-10-14).
//
// THE DEFECT, measured on world 17b64ef1 (office lane plumb-arrival): 15,560
// simulated rim walks to every sited mark, and the published arrival point fell
// outside the mark it had arrived at in 1,107 of them:
//   · 1,066 of 14,700 at boxes, by up to 0.05 m: the arrival lies ON the box's
//     edge and was rounded to a tenth of a metre, half the time outward. Every
//     walk to a mark smaller than the grid (the register entries are 0.02 m)
//     failed, and 12 of 5,600 to marks of 5 m or more.
//   · all 41 at the Main Channel and the Pando River: a long, bent ring whose
//     anchor is off its own water, so the road toward the anchor missed the ring
//     and the walk fell back to the box's rim, which is not the river. Where
//     such a walk SHOULD end moves arrivals by up to 3 km, so it is a design
//     call (Wright, 2026-10-14: split out, filed for Darko). It is NOT fixed
//     here, and the probe below names those marks as the one known exception.
//   · `center` walks had the first defect too, at the anchor of a mark smaller
//     than the grid (380 of 14,860).
// The office's enter measures reach as "within the extent" (pointWithinMark), so
// each of those walkers was refused at the mark they had just arrived at, and a
// walk with enter_on_arrival could not be entered at arrival.
//
// THE RULE NOW (walk.mjs § pointOnGround, § walkTargetFor): an arrival is
// rounded inward, never out, and an arrival with no box stands exactly on its
// `toward`. No arrival moves by more than a tenth of a metre per axis.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { positionAt, walkTargetFor, extentForArrival, pointOnGround, targetEntryT } from "./walk.mjs";
import { pointWithinMark } from "./world-verbs.mjs";
import { pointInPolygon, polygonOf } from "./geometry.mjs";

// THE KNOWN EXCEPTION, by shape and never by name: a ring whose anchor lies off
// its own ground (a long bent river). Its walks still arrive off the water, as
// before this change; where they should end is Darko's call, filed separately.
const dryAnchored = (m) => { const ring = polygonOf(m); return !!ring && !pointInPolygon(m.at.x, m.at.y, ring); };

const WORLD = JSON.parse(readFileSync(new URL("../WORLD/world-state.json", import.meta.url), "utf8"));
const SITED = (WORLD.marks ?? []).filter((m) => m.kind === "sited" && m.at && m.extent);

/** Where a walk from `from` to mark `m` stands once it has arrived, as the office declares it. */
function arrivalAt(m, from, mode) {
  let toward = { x: m.at.x, y: m.at.y };
  let targetExtent = extentForArrival(mode, { w: m.extent.w, h: m.extent.h });
  const ringed = walkTargetFor(m, from, mode);
  if (ringed) { toward = ringed.toward; targetExtent = null; }
  const p = positionAt({ from, toward, at: 100, targetExtent, targetMarkId: m.id, pace: 60 }, 1e6);
  return { p, ringed: !!ringed };
}

/** Every sited mark, twenty roads each from a seeded scatter 50 m to 3 km out. */
function probe(marks, mode) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out = { walks: 0, outside: [], dry: [] };
  for (const m of marks) {
    for (let k = 0; k < 20; k++) {
      const ang = rnd() * 2 * Math.PI, d = 50 + rnd() * 3000;
      const from = { x: Math.round((m.at.x + Math.cos(ang) * d) * 10) / 10, y: Math.round((m.at.y + Math.sin(ang) * d) * 10) / 10 };
      const { p } = arrivalAt(m, from, mode);
      assert.equal(p.arrived, true);
      out.walks += 1;
      if (!pointWithinMark({ x: p.x, y: p.y }, m)) (dryAnchored(m) ? out.dry : out.outside).push({ id: m.id, from, at: { x: p.x, y: p.y } });
    }
  }
  return out;
}

test("THE PROBE · every rim walk to every sited mark in the world arrives ON the mark (but a dry-anchored river's, the known exception)", () => {
  const r = probe(SITED, "rim");
  assert.ok(r.walks > 10_000, `the world must actually be probed (${r.walks} walks)`);
  assert.ok(r.dry.every((x) => dryAnchored(SITED.find((m) => m.id === x.id))), "the exception is only ever a dry-anchored ring");
  assert.ok(r.dry.length > 0, "the dry-anchored rivers still arrive off the water, as before: where their walks end is Darko's call (filed 2026-10-14), and the PR that rules it changes this line");
  assert.deepEqual(r.outside.slice(0, 5), [], `${r.outside.length} of ${r.walks} rim arrivals stand outside their mark`);
});

test("THE PROBE · and every center walk", () => {
  const r = probe(SITED, "center");
  assert.deepEqual(r.outside.slice(0, 5), [], `${r.outside.length} of ${r.walks} center arrivals stand outside their mark`);
});

// The same, on a fixed sample that does not move with the world: the register
// entries smaller than the grid, a box on the half-tenth, and a hall.
const FIXTURES = [
  { id: "t/register-entry", kind: "sited", at: { x: 2422.02, y: 5592.68 }, extent: { w: 0.02, h: 0.02 } },
  { id: "t/margin-line", kind: "sited", at: { x: 2421.7, y: 5590.2335 }, extent: { w: 0.08, h: 0.004 } },
  { id: "t/cone", kind: "sited", at: { x: 221.05, y: 95.55 }, extent: { w: 0.5, h: 0.5 } },
  { id: "t/hall", kind: "sited", at: { x: 1000.05, y: -40.05 }, extent: { w: 30.1, h: 12.3 } },
];

test("THE FIXTURES · marks smaller than the grid and boxes on the half-tenth all arrive on their ground, both modes", () => {
  const r = { rim: probe(FIXTURES, "rim"), center: probe(FIXTURES, "center") };
  assert.equal(r.rim.walks, 80);
  assert.deepEqual(r.rim.outside, []);
  assert.deepEqual(r.center.outside, []);
});

test("pointOnGround · inward, never outward: the tenth-metre point when one fits, a finer one when the box is smaller, never off the box", () => {
  const box = { x: 221.05, y: 95.55, w: 0.5, h: 0.5 };   // 220.8 .. 221.3
  assert.deepEqual(pointOnGround({ x: 221.3, y: 95.33 }, box), { x: 221.3, y: 95.3 }, "on the edge: the grid point on the box");
  assert.deepEqual(pointOnGround({ x: 220.79999999, y: 95.5 }, box), { x: 220.8, y: 95.5 });
  const tiny = { x: 2422.02, y: 5592.68, w: 0.02, h: 0.02 };   // no tenth, no hundredth strictly inside the x range but 2422.01..2422.03
  const q = pointOnGround({ x: 2422.01, y: 5592.67 }, tiny);
  assert.ok(Math.abs(q.x - 2422.01) < 1e-9 && Math.abs(q.y - 5592.67) < 1e-9, JSON.stringify(q));
  assert.ok(q.x >= tiny.x - tiny.w / 2 && q.x <= tiny.x + tiny.w / 2 && q.y >= tiny.y - tiny.h / 2 && q.y <= tiny.y + tiny.h / 2);
});

test("a walker who has NOT arrived keeps the tenth-metre rounding, and the leg's arithmetic is unchanged", () => {
  const p = positionAt({ from: { x: 0, y: 0 }, toward: { x: 1000, y: 0 }, at: 100, targetExtent: { w: 20, h: 20 }, pace: 60 }, 100 + 0.0012345);
  assert.equal(p.arrived, false);
  assert.equal(p.x, Math.round(0.0012345 * 60000 * 10) / 10);
  assert.equal(p.remainingM, Math.round(990 - 0.0012345 * 60000));
});

test("NO ARRIVAL MOVES BY MORE THAN THE ROUNDING — against the old rule (the arrival point rounded to the tenth, either way), every sited mark, both modes", () => {
  // The rounding is a correctness fix; anything larger would change where a
  // walk ends, which is a design call (the split river branch was one).
  const round1 = (n) => Math.round(n * 10) / 10;
  for (const mode of ["rim", "center"]) {
    let seed = 11, worst = 0, n = 0;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (const m of SITED) for (let k = 0; k < 5; k++) {
      const ang = rnd() * 2 * Math.PI, d = 50 + rnd() * 3000;
      const from = { x: Math.round((m.at.x + Math.cos(ang) * d) * 10) / 10, y: Math.round((m.at.y + Math.sin(ang) * d) * 10) / 10 };
      let toward = { x: m.at.x, y: m.at.y }, targetExtent = extentForArrival(mode, { w: m.extent.w, h: m.extent.h });
      const ringed = walkTargetFor(m, from, mode); if (ringed) { toward = ringed.toward; targetExtent = null; }
      const now = positionAt({ from, toward, at: 100, targetExtent, targetMarkId: m.id, pace: 60 }, 1e6);
      const r = targetExtent ? { x: toward.x, y: toward.y, w: Math.abs(targetExtent.w), h: Math.abs(targetExtent.h) } : null;
      const t = r ? targetEntryT(from, toward, r) : 1;
      const old = { x: round1(from.x + (toward.x - from.x) * t), y: round1(from.y + (toward.y - from.y) * t) };
      worst = Math.max(worst, Math.abs(old.x - now.x), Math.abs(old.y - now.y)); n += 1;
    }
    assert.ok(n > 3000);
    assert.ok(worst <= 0.1 + 1e-9, `${mode}: an arrival moved ${worst} m on an axis`);
  }
});

test("THE RING BELT · a ring point that the tenth-metre rounding would carry off the ring is kept as it is (review of #206)", () => {
  // A ring 0.03 m deep: every tenth-metre point of y lies off it, so a rounded
  // stand-here point would put the walker outside the very ring they stand in.
  const sliver = { id: "t/sliver", kind: "sited", at: { x: 5, y: 0.025 }, extent: { w: 10, h: 0.03 },
    points: [[0, 0.01], [10, 0.01], [10, 0.04], [0, 0.04]] };
  const from = { x: 5.03, y: 0.025 };
  const t = walkTargetFor(sliver, from, "rim");
  assert.ok(t?.ringed, "the ring answers");
  assert.ok(pointWithinMark(t.toward, sliver), `the frozen point ${JSON.stringify(t.toward)} stands on the ring`);
  assert.deepEqual(t.toward, from, "kept unrounded, because rounding would carry it out");
  // and a point the rounding keeps on the ring is rounded as before
  const wide = { ...sliver, id: "t/wide", extent: { w: 10, h: 4 }, at: { x: 5, y: 2 }, points: [[0, 0], [10, 0], [10, 4], [0, 4]] };
  assert.deepEqual(walkTargetFor(wide, { x: 5.03, y: 2.04 }, "rim").toward, { x: 5, y: 2 });
});
