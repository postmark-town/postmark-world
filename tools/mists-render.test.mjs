// mists-render.test.mjs — the Mists as the page paints them (POS-553).
//
// THE ONE HARD RULE first: the paint may cover more than the physics, never
// less. At the schedule's crossings 244, 272 and 282, every point the engine
// puts behind the wall (mistsHere → inWall) is fully opaque in the paint's back
// layer, on a dense grid over the whole band and around every clearing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mistsAt, mistsHere } from "./world-engine.mjs";
import { mistsBakePlan, mistsSheetFeatherAt, mistsRenderAt, mistsBakeAt, mistsTrueDistance, mistsColourAt, mistsCoreHex, mistsReachM, mistsKeepRects, mistsKeepAt, mistsOpenCountry, mistsCreatures, bellFor, BELL_PARTIALS, MISTS_PAINT, MISTS_TINT } from "../spectator/mists-render.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MISTS = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8")).mists;
const MARKS = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8")).marks;
const KEEP = mistsKeepAt(mistsKeepRects(MARKS, MISTS.clearings_m));   // the town, as the viewer keeps it clear
const CROSSINGS = [244, 272, 282];

// a grid over the band (the clear ground ± 3 km) plus a ring around each clearing
function samples(m) {
  const out = [], c = m.clear, pad = 3000, step = 97;   // an odd step, so the grid never sits on the face alone
  for (let x = c.minX - pad; x <= c.maxX + pad; x += step)
    for (let y = c.minY - pad; y <= c.maxY + pad; y += step) out.push({ x, y });
  for (const k of m.clearings ?? [])
    for (let a = 0; a < 360; a += 1.5) for (const dr of [-400, -50, -1, 1, 50, 400, 1500])
      out.push({ x: k.x + (k.r + dr) * Math.cos(a * Math.PI / 180), y: k.y + (k.r + dr) * Math.sin(a * Math.PI / 180) });
  // right at the true face, both sides, along every side
  for (let t = 0; t <= 1; t += 0.01) for (const e of [-1, 1, 5]) {
    const x = c.minX + (c.maxX - c.minX) * t, y = c.minY + (c.maxY - c.minY) * t;
    out.push({ x, y: c.minY - e }, { x, y: c.maxY + e }, { x: c.minX - e, y }, { x: c.maxX + e, y });
  }
  return out;
}

for (const n of CROSSINGS) {
  test(`the hard rule at ${n}: every point behind the wall is fully opaque in the paint`, () => {
    const m = mistsAt(n, MISTS);
    assert.ok(m, `the Mists stand at ${n}`);
    let behind = 0;
    for (const p of samples(m)) {
      const inWall = mistsHere(p, m).inWall;
      assert.equal(mistsTrueDistance(m, p.x, p.y) > 0, inWall, `the paint's distance agrees with the engine at (${p.x}, ${p.y})`);
      if (!inWall) continue;
      behind += 1;
      assert.equal(mistsRenderAt(m, p.x, p.y, 0).alpha, 1, `opaque behind the wall at (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
      assert.equal(mistsRenderAt(m, p.x, p.y, 0, KEEP).alpha, 1, `opaque behind the wall even where the town is kept clear (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
    }
    assert.ok(behind > 1000, `the grid reached the wall (${behind} points)`);
  });
}

test("the paint covers more than the physics: the corners round into banks, and the banks reach inward", () => {
  const m = mistsAt(282, MISTS), c = m.clear;
  // 60 m inside the true corner is clear ground, and painted opaque
  assert.equal(mistsHere({ x: c.minX + 60, y: c.minY + 60 }, m).inWall, false);
  assert.equal(mistsRenderAt(m, c.minX + 60, c.minY + 60, 0).alpha, 1);
  // along a side, the opaque face stands inward of the true face by an uneven amount
  const depths = [];
  for (let x = c.minX + 1500; x < c.maxX - 1500; x += 250) {
    let d = 0; while (mistsRenderAt(m, x, c.minY + d + 5, 0).alpha >= 1 && d < 2000) d += 5;
    depths.push(d);
  }
  assert.ok(Math.min(...depths) >= mistsReachM(m) * 0.3 - 5, "never less than the reach's floor");
  assert.ok(Math.max(...depths) - Math.min(...depths) > 100, `uneven along the side (${Math.min(...depths)}..${Math.max(...depths)} m)`);
});

test("the fringe is the engine's 400 m band: haze on the clear side that thins toward the clear land", () => {
  const m = mistsAt(272, MISTS), c = m.clear, x = (c.minX + c.maxX) / 2;
  const reachFloor = mistsReachM(m) * MISTS_PAINT.layers[2].reach + MISTS_PAINT.softM;   // the widest layer's bank, so only haze is left past it
  const deep = mistsRenderAt(m, x, c.minY + m.fringeM + reachFloor + 600, 2).alpha;
  assert.equal(deep, 0, "past the band and the banks, the clear land is clear");
  const inBand = mistsRenderAt(m, x, c.minY + m.fringeM * 0.5, 2).alpha;
  assert.ok(inBand > 0 && inBand < 1, `translucent in the band (${inBand.toFixed(2)})`);
});

test("never white: the face is the tint, darker with depth and the veil, near-black at the core", () => {
  for (const n of CROSSINGS) {
    const m = mistsAt(n, MISTS);
    for (let d = 0; d <= 1; d += 0.1) assert.ok(Math.max(...mistsColourAt(m, d)) <= Math.max(...[1, 3, 5].map((i) => parseInt(MISTS_TINT.slice(i, i + 2), 16))));
  }
  const core = mistsColourAt(mistsAt(282, MISTS), 1);
  assert.ok(Math.max(...core) < 40, `near-black at the deepest veil's core (${core})`);
  assert.match(mistsCoreHex(mistsAt(244, MISTS)), /^#[0-9a-f]{6}$/);
});

test("the bell: nothing before the Mists, one strike from 244, two (a semitone lower) from the deepest veil", () => {
  assert.equal(bellFor(null), null);
  assert.equal(mistsAt(243, MISTS), null);
  const first = bellFor(mistsAt(244, MISTS)), deep = bellFor(mistsAt(282, MISTS));
  assert.equal(first.strikes, 1); assert.equal(deep.strikes, 2);
  assert.ok(deep.prime < first.prime);
  assert.equal(bellFor(mistsAt(271, MISTS)).strikes, 1);
  const hum = BELL_PARTIALS.find((p) => p.ratio === 0.5);
  assert.ok(first.prime * hum.ratio > 60 && first.prime * hum.ratio < 70, "the hum sits near 60–70 Hz");
  assert.ok(Math.max(...BELL_PARTIALS.map((p) => p.decayS)) >= 6 && Math.max(...BELL_PARTIALS.map((p) => p.decayS)) <= 8, "a 6–8 s decay");
});

test("the viewer paints over the vector wall, which keeps its exact geometry and pointer", async () => {
  const { mistsWallSVG } = await import("../spectator/viewer.mjs");
  const reg = { originPx: { x: 485, y: 760 }, mPerPx: 5 };
  const m = mistsAt(272, MISTS);
  assert.equal(mistsWallSVG(null, { ...reg, painted: true }), "", "before the Mists, nothing");
  const flat = mistsWallSVG(m, reg).match(/<path class="wv-mists-wall"[^>]*>/)[0];
  const painted = mistsWallSVG(m, { ...reg, painted: true }).match(/<path class="wv-mists-wall"[^>]*>/)[0];
  assert.equal(painted.match(/ d="[^"]*"/)[0], flat.match(/ d="[^"]*"/)[0], "the same wall");
  assert.match(painted, /pointer-events="all"/);
  assert.match(painted, new RegExp(`fill="${mistsCoreHex(m)}"`), "in the paint's core colour, never white");
  // the hard rule's guarantee in the page is this path: fully opaque, and so is
  // the group it is drawn in (no opacity anywhere between it and the painting)
  const svg = mistsWallSVG(m, { ...reg, painted: true });
  assert.doesNotMatch(painted, /opacity/, "the painted wall carries no fill-opacity or opacity");
  assert.match(svg, /^<g class="wv-mists" aria-hidden="true">/, "its group is the plain one");
  assert.doesNotMatch(svg.match(/^<g[^>]*>/)[0], /opacity|style=/, "and its group carries no opacity or style either");
});

// THE TOWN IS KEPT CLEAR (Darko 2026-10-10 09:45): at 284, no parcel's or
// mark's footprint is under more than a light haze, all three layers together,
// with every layer at either end of its drift. The engine's wall is the only
// exception (a point it hides stays hidden).
const LIGHT_HAZE = 0.2;
// each layer drifts on its own clock, so the worst case takes each layer at its own worst end
const worstLayer = (m, x, y, li) => { const L = MISTS_PAINT.layers[li];
  return Math.max(...[0, 1, -1].map((sg) => mistsRenderAt(m, x - sg * L.driftM, y - sg * L.driftM * 0.45, li, KEEP).alpha)); };
const composite = (m, x, y) => 1 - [0, 1, 2].reduce((a, li) => a * (1 - worstLayer(m, x, y, li)), 1);
test("the town is kept clear at 284: every mark's footprint is under no more than a light haze", () => {
  const m = mistsAt(284, MISTS);
  let checked = 0, hidden = 0;
  for (const mk of MARKS) {
    if (!mk?.at || !Number.isFinite(mk.at.x)) continue;
    if (mistsOpenCountry(mk)) continue;   // the town's own frame and open country; every household's mark is read
    const w = (mk.extent?.w ?? 0) / 2, h = (mk.extent?.h ?? 0) / 2;
    for (const [a, b] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const x = mk.at.x + a * w, y = mk.at.y + b * h;
      if (mistsHere({ x, y }, m).inWall) { hidden += 1; continue; }
      // a layer drifted by (dx, dy) shows at (x, y) what it painted at (x - dx, y - dy)
      const al = composite(m, x, y);
      assert.ok(al <= LIGHT_HAZE, `${mk.id} at (${x}, ${y}) is under ${al.toFixed(2)} of fog`);
      checked += 1;
    }
  }
  assert.ok(checked > 3000, `the footprints were read (${checked} points; ${hidden} behind the wall, the physics')`);
});

test("the creatures: seeded by the crossing, sparse at 244 and populated by 284, in the banks, never over the town", () => {
  const counts = [];
  for (const n of [244, 272, 284]) {
    const m = mistsAt(n, MISTS), cs = mistsCreatures(m, { first: 244, keep: KEEP });
    assert.deepEqual(mistsCreatures(m, { first: 244, keep: KEEP }), cs, "the same crossing, the same creatures");
    for (const c of cs) {
      for (const [a, b] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) assert.equal(KEEP(c.x + a * c.sizeM, c.y + b * c.sizeM), 0, `${c.kind} at (${c.x}, ${c.y}) stands clear of the town`);
      const d = mistsTrueDistance(m, c.x, c.y);
      assert.ok(d > -mistsReachM(m) * 1.3 && d < 400, `${c.kind} is in the banks (true-face distance ${Math.round(d)} m)`);
    }
    counts.push(cs.length);
  }
  assert.ok(counts[0] < counts[1] && counts[1] <= counts[2], `fewer at first, more by 284 (${counts.join(", ")})`);
  assert.ok(counts[0] >= 3 && counts[2] >= 25, `sparse but present at 244, populated at 284 (${counts.join(", ")})`);
  assert.deepEqual(mistsCreatures(null), [], "no Mists, no creatures");
});

// THE SHEET'S EDGE IS A FACE TOO (POS-553 review): the painted sheet (the atlas
// painting, 1500 x 2400 units at 5 m, the Origin at 485,760) is a rectangle; the
// fog stands past it and reaches raggedly over it, so its sides never show. With
// the frame the hard rule and the town's clearance both still hold.
const FRAME = { minX: -485 * 5, minY: -760 * 5, maxX: (1500 - 485) * 5, maxY: (2400 - 760) * 5 };
test("with the sheet's frame: the hard rule holds, the town stays clear, and the sheet's edge is under fog, unevenly", () => {
  for (const n of [244, 272, 284]) {
    const m = { ...mistsAt(n, MISTS), frame: FRAME };
    for (const p of samples(m)) if (mistsHere(p, m).inWall) assert.equal(mistsRenderAt(m, p.x, p.y, 0, KEEP).alpha, 1);
    for (const mk of MARKS) {
      if (!mk?.at || !Number.isFinite(mk.at.x) || mistsOpenCountry(mk)) continue;
      if (mistsHere(mk.at, m).inWall) continue;
      const a = 1 - [0, 1, 2].reduce((acc, li) => acc * (1 - mistsRenderAt(m, mk.at.x, mk.at.y, li, KEEP).alpha), 1);
      assert.ok(a <= 0.2, `${mk.id} at ${n} is under ${a.toFixed(2)} of fog`);
    }
  }
  // round all four sides of the sheet, away from the town, the fog's opaque face stands an uneven way in
  const m = { ...mistsAt(272, MISTS), frame: FRAME }, depths = [];
  const sides = [
    (t, d) => ({ x: FRAME.minX + d, y: FRAME.minY + t * (FRAME.maxY - FRAME.minY) }), (t, d) => ({ x: FRAME.maxX - d, y: FRAME.minY + t * (FRAME.maxY - FRAME.minY) }),
    (t, d) => ({ x: FRAME.minX + t * (FRAME.maxX - FRAME.minX), y: FRAME.minY + d }), (t, d) => ({ x: FRAME.minX + t * (FRAME.maxX - FRAME.minX), y: FRAME.maxY - d }),
  ];
  for (const at of sides) for (let t = 0.08; t < 0.92; t += 0.02) {
    const edge = at(t, 100); if (KEEP(edge.x, edge.y) > 0) continue;
    let d = -600; for (;;) { const p = at(t, d); if (mistsRenderAt(m, p.x, p.y, 0).alpha < 1 || d >= 1500) break; d += 10; }
    if (KEEP(at(t, d).x, at(t, d).y) > 0) continue;   // the town's margin stopped it, not the noise
    depths.push(d);
  }
  assert.ok(depths.length > 10, `the sheet's edge was read (${depths.length} points)`);
  assert.ok(Math.min(...depths) >= MISTS_PAINT.frameInsetM, "the fog covers the sheet's edge everywhere it is read");
  assert.ok(Math.max(...depths) - Math.min(...depths) > 100, `unevenly (${Math.min(...depths)}..${Math.max(...depths)} m)`);
});

// THE BAKE'S OWN RULE (#186 review): every test below runs mistsBakeAt, the
// rule the canvas bake applies pixel by pixel, the skip included, with the
// painted sheet's frame. Three layers together, each at either end of its drift.
const bakeWorst = (m, x, y, li) => { const L = MISTS_PAINT.layers[li];
  return Math.max(...[0, 1, -1].map((sg) => mistsBakeAt(m, li, x - sg * L.driftM, y - sg * L.driftM * 0.45, KEEP).alpha)); };
const bakeComposite = (m, x, y) => 1 - [0, 1, 2].reduce((a, li) => a * (1 - bakeWorst(m, x, y, li)), 1);
const footprint = (mk) => { const w = (mk.extent?.w ?? 0) / 2, h = (mk.extent?.h ?? 0) / 2;
  return [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]].map(([a, b]) => ({ x: mk.at.x + a * w, y: mk.at.y + b * h })); };

test("the bake keeps the clearings clear: no paint above a haze on any mark inside them, whatever its size, at 244, 272 and 282", () => {
  let checked = 0;
  for (const n of CROSSINGS) {
    const m = { ...mistsAt(n, MISTS), frame: FRAME };
    const inside = MARKS.filter((mk) => mk?.at && Number.isFinite(mk.at.x) && m.clearings.some((k) => Math.hypot(mk.at.x - k.x, mk.at.y - k.y) < k.r));
    assert.ok(inside.some((mk) => mk.id === "sol-am-lichterfenster/vesperfen-wetland"), "the far south-west's wetland is among them");
    for (const mk of inside) for (const p of footprint(mk)) {
      if (mistsHere(p, m).inWall) continue;
      const a = bakeComposite(m, p.x, p.y);
      assert.ok(a <= LIGHT_HAZE, `${mk.id} at ${n}, (${p.x.toFixed(0)}, ${p.y.toFixed(0)}): ${a.toFixed(2)} of fog`);
      checked += 1;
    }
    // and walking out from each clearing's centre, the opaque bank begins only near its own edge
    for (const k of m.clearings) {
      let r = 0; while (r < k.r && mistsBakeAt(m, 0, k.x + r, k.y).alpha < 1) r += 25;
      assert.ok(r >= k.r - mistsReachM(m) - MISTS_PAINT.tongueM - 50, `clearing ${k.id} at ${n}: opaque from r ${r} of ${k.r}`);   // the banks' reach and their short tongues
    }
  }
  assert.ok(checked > 100, `footprints read (${checked})`);
});

test("the bake's face off the sheet is ragged, never a straight line, on the west and south at 244", () => {
  const m = { ...mistsAt(244, MISTS), frame: FRAME };
  const faces = { west: [], south: [] };   // read every 50 m: the town's margins (every household's mark, any size) take whole stretches of the strip
  for (let y = FRAME.minY + 600; y < FRAME.maxY - 600; y += 50) {
    let x = FRAME.maxX - 2000; while (x > m.clear.minX - 200 && mistsBakeAt(m, 0, x, y).alpha < 1) x -= 10;
    if (KEEP(x, y) < 1) faces.west.push(x);
  }
  for (let x = FRAME.minX + 600; x < FRAME.maxX - 600; x += 50) {
    let y = FRAME.minY + 3000; while (y < m.clear.maxY + 200 && mistsBakeAt(m, 0, x, y).alpha < 1) y += 10;
    if (KEEP(x, y) < 1) faces.south.push(y);
  }
  for (const [side, list] of Object.entries(faces)) {
    assert.ok(list.length >= 8, `${side}: the face was read clear of the town (${list.length} points)`);
    const spread = Math.max(...list) - Math.min(...list);
    assert.ok(spread > 150, `${side}: the face wanders ${spread} m, not a straight line`);
    // and no long straight run: consecutive points never all equal
    const runs = list.slice(1).filter((v, i) => v === list[i]).length;
    assert.ok(runs < list.length / 2, `${side}: ${runs} of ${list.length} steps lie on one line`);
  }
});

test("the bake keeps every household's mark clear, whatever its size, at 244, 272, 282 and 284 (#186 review: sahil/the-far-shore)", () => {
  let checked = 0;
  const households = MARKS.filter((mk) => mk?.at && Number.isFinite(mk.at.x) && !mistsOpenCountry(mk));
  assert.ok(households.some((mk) => mk.id === "sahil/the-far-shore"), "the far shore, a household's 3.2 km mark, is among them");
  assert.ok(MARKS.filter(mistsOpenCountry).every((mk) => mk.by === "the-town" || mk.household === "the-town"), "only the town's own marks are open country");
  for (const n of [244, 272, 282, 284]) {
    const m = { ...mistsAt(n, MISTS), frame: FRAME };
    for (const mk of households) for (const p of footprint(mk)) {
      if (mistsHere(p, m).inWall) continue;
      const a = bakeComposite(m, p.x, p.y);
      assert.ok(a <= LIGHT_HAZE, `${mk.id} at ${n}, (${p.x.toFixed(0)}, ${p.y.toFixed(0)}): ${a.toFixed(2)} of fog`);
      checked += 1;
    }
  }
  assert.ok(checked > 3000, `footprints read (${checked})`);
});

test("open country is the town's own, read from the id when by and household are missing", () => {
  assert.equal(mistsOpenCountry({ id: "the-town/let-there-be-light", extent: { w: 320000, h: 320000 } }), true);
  assert.equal(mistsOpenCountry({ id: "sahil/the-far-shore", extent: { w: 3200, h: 1000 } }), false);
  assert.equal(mistsOpenCountry({ id: "the-town/a-bench", extent: { w: 2, h: 1 } }), false, "small town marks are the town, kept");
});

// NO STRAIGHT RUNS ALONG THE SOUTH (Darko 2026-10-11: "too perfectly
// rectangular"). Across the sheet's south, every 50 m, three lines are read:
// the FACE (where the bake's back layer, the town kept clear, first turns half
// opaque, walking south), its FOOT (where, past the face, the fog has darkened
// 60% of the way to the core), and the SHEET'S EDGE (where its feather into the
// open country is half drawn). None may lie within ±20 m of one straight line
// (any slope) for more than 15 samples in a row (750 m); nor may the town's
// margin, where the fog thins to haze. At #186's merge
// (d19052e5) the longest runs were: face 25 at 244 and 28 at 284, foot 31 at
// 244 and 28 at 284, the sheet's edge 31 (the sea's long flat bank, the far
// shore's margin against the true face, and the dark band at the bank's foot).
const STRAIGHT_TOL_M = 20, STRAIGHT_MAX = 15;
export function longestStraightRun(ys, tol = STRAIGHT_TOL_M) {
  let best = 0;
  for (let i = 0; i < ys.length; i++) {
    for (let j = i + best + 1; j <= ys.length; j++) {
      const seg = ys.slice(i, j);
      if (seg.some((v) => v == null)) break;
      // the least-squares line through the run; every sample within tol of it
      const n = seg.length, mx = (n - 1) / 2, my = seg.reduce((a, b) => a + b, 0) / n;
      let sxy = 0, sxx = 0;
      seg.forEach((v, k) => { sxy += (k - mx) * (v - my); sxx += (k - mx) ** 2; });
      const slope = sxx ? sxy / sxx : 0;
      if (seg.some((v, k) => Math.abs(v - (my + slope * (k - mx))) > tol)) break;
      best = n;
    }
  }
  return best;
}
export function southFaceAndFoot(m, keep = KEEP) {
  const face = [], foot = [];
  for (let x = FRAME.minX + 600; x < FRAME.maxX - 600; x += 50) {
    let f = null, ft = null;
    const y0 = FRAME.maxY - 5000;
    // a column the sheet's east or west fog already covers at its start is not the south's: no reading
    if (mistsBakeAt(m, 0, x, y0, keep).alpha >= 0.5) { face.push(null); foot.push(null); continue; }
    for (let y = y0; y < m.clear.maxY + 2500; y += 5) {
      const r = mistsBakeAt(m, 0, x, y, keep);
      if (f == null && r.alpha >= 0.5) f = y;
      if (f != null && r.depth >= 0.6) { ft = y; break; }
    }
    face.push(f); foot.push(ft);
  }
  return { face, foot };
}
test("no straight runs: the fog's face, its dark foot and the sheet's own edge along the south all wander, at 244 and 284", () => {
  for (const n of [244, 284]) {
    const m = { ...mistsAt(n, MISTS), frame: FRAME };
    const { face, foot } = southFaceAndFoot(m);
    const read = face.filter((v, i) => v != null && foot[i] != null).length;
    assert.ok(read > 90, `the south was read at ${n} (${read} of ${face.length} samples)`);
    const a = longestStraightRun(face), b = longestStraightRun(foot);
    assert.ok(a <= STRAIGHT_MAX, `${n}: the face runs straight (±${STRAIGHT_TOL_M} m) for ${a} samples of 50 m`);
    assert.ok(b <= STRAIGHT_MAX, `${n}: the foot runs straight (±${STRAIGHT_TOL_M} m) for ${b} samples of 50 m`);
  }
  const edge = [];
  for (let x = FRAME.minX + 600; x < FRAME.maxX - 600; x += 50) {
    let y = FRAME.maxY - 1500; while (mistsSheetFeatherAt(FRAME, x, y) < 0.5 && y < FRAME.maxY + 600) y += 5;
    edge.push(y);
  }
  const c = longestStraightRun(edge);
  assert.ok(c <= STRAIGHT_MAX, `the sheet's edge runs straight (±${STRAIGHT_TOL_M} m) for ${c} samples of 50 m`);
  // and the town's margin, where the fog thins to haze: round the far shore (the
  // south's longest household mark), its south and east edges (18 and 7 at d19052e5)
  const south = [], east = [];
  for (let x = -3400; x <= -600; x += 50) { let y = 8400; while (KEEP(x, y) > 0.5 && y < 11000) y += 5; south.push(y); }
  for (let y = 7000; y <= 8800; y += 50) { let x = -400; while (KEEP(x, y) > 0.5 && x < 3000) x += 5; east.push(x); }
  for (const [side, list] of [["south", south], ["east", east]]) {
    const run = longestStraightRun(list);
    assert.ok(run <= STRAIGHT_MAX, `the far shore's margin runs straight on its ${side} (±${STRAIGHT_TOL_M} m) for ${run} samples of 50 m`);
  }
});

// THE ROLL-IN WAITS FOR THE TOUR (Darko 2026-10-11): the viewer's gate, driven
// through the orders a first visit can take.
test("the roll-in waits for the tour: held under it, played when it closes, taken back if the tour interrupts it", async () => {
  const { mistsIntroGate } = await import("../spectator/viewer.mjs");
  const running = () => true, still = () => false;
  // the tour is up when the paint arrives: hold, then roll on close, once
  let g = mistsIntroGate(), a = { id: "a" }, b = { id: "b" };
  assert.equal(g.arrive(a, true), "hold");
  assert.equal(g.held, a);
  assert.equal(g.rehold(b), true, "a repaint while held waits instead");
  assert.equal(g.tourClosed(), b, "the tour closes: the latest paint rolls in");
  assert.equal(g.tourClosed(), null, "and only once");
  assert.equal(g.rehold(a), false, "nothing waits after");
  // no tour: roll now; the tour opening mid-roll takes it back, closing replays it
  g = mistsIntroGate();
  assert.equal(g.arrive(a, false), "roll");
  assert.equal(g.tourOpened(running), a, "a running roll-in is taken back");
  assert.equal(g.tourClosed(), a, "and played after the tour");
  // a roll-in that has finished is never replayed by a later tour
  g = mistsIntroGate();
  g.arrive(a, false); g.done(a);
  assert.equal(g.tourOpened(running), null);
  assert.equal(g.tourClosed(), null);
  g = mistsIntroGate();
  g.arrive(a, false);
  assert.equal(g.tourOpened(still), null, "a roll-in not running (reduced motion) is not taken back");
  assert.equal(g.tourClosed(), null);
});

test("the viewer rolls in through the gate: the tour's open and close drive it, and the bell waits under the tour", () => {
  const src = readFileSync(join(ROOT, "spectator/viewer.mjs"), "utf8");
  const body = (name) => { const i = src.indexOf(`  function ${name}(`); return src.slice(i, src.indexOf("\n  }\n", i)); };
  assert.match(body("mistsIntro"), /mistsRollIn\.arrive\(item, tourShown\(\)\)/, "the first Mists ask whether the tour is up");
  assert.match(body("mistsRollInPlay"), /mistsBellArm\(m\)/, "the bell is armed only when the roll-in plays");
  assert.doesNotMatch(body("mistsIntro"), /mistsBellArm/, "never while it waits");
  assert.match(body("openTour"), /mistsRollIn\.tourOpened\(/);
  assert.match(body("closeTour"), /mistsRollIn\.tourClosed\(\)/);
  assert.match(body("mistsBellRing"), /tourShown\(\)\) return;/, "no strike under the tour's card");
});

// NO FAINT RECTANGLES (2026-10-11, zoomed out at 284: a one-level step round
// the town and round Pando's clearing). Every bake's box meets the vector wall,
// and at its edge only the back layer may paint, in the wall's exact colour:
// the front layers, whose premultiplied rounding made the step, are gone from
// the core before any box's edge, however far they drift.
test("no faint rectangles: at every bake box's edge, inset by the widest drift, only the back layer paints, in the wall's own colour", () => {
  for (const n of [244, 272, 284]) {
    const m = { ...mistsAt(n, MISTS), frame: FRAME }, core = mistsCoreHex(m);
    const inset = Math.max(...MISTS_PAINT.layers.map((L) => L.driftM)) + 1;
    let read = 0;
    for (const { li, box } of mistsBakePlan(m)) {
      for (let t = 0; t <= 1; t += 0.01) for (const d of [0, inset]) {
        const pts = [{ x: box.minX + d + t * (box.maxX - box.minX - 2 * d), y: box.minY + d }, { x: box.minX + d + t * (box.maxX - box.minX - 2 * d), y: box.maxY - d },
          { x: box.minX + d, y: box.minY + d + t * (box.maxY - box.minY - 2 * d) }, { x: box.maxX - d, y: box.minY + d + t * (box.maxY - box.minY - 2 * d) }];
        for (const p of pts) {
          if (!(mistsTrueDistance(m, p.x, p.y) > 0)) continue;   // a box over clear ground ends in the clear, past every bank
          const r = mistsBakeAt(m, li, p.x, p.y, KEEP);
          if (li > 0) assert.equal(r.alpha, 0, `layer ${li} at ${n} paints ${r.alpha} at its box's edge (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
          else assert.equal("#" + mistsColourAt(m, r.depth).map((v) => v.toString(16).padStart(2, "0")).join(""), core, `the back layer at ${n} is the wall's colour at its box's edge`);
          read += 1;
        }
      }
    }
    assert.ok(read > 1000, `the boxes' edges were read at ${n} (${read})`);
  }
});
