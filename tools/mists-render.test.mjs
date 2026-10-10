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
import { mistsRenderAt, mistsTrueDistance, mistsColourAt, mistsCoreHex, mistsReachM, mistsKeepRects, mistsKeepAt, mistsCreatures, bellFor, BELL_PARTIALS, MISTS_PAINT, MISTS_TINT } from "../spectator/mists-render.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MISTS = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8")).mists;
const MARKS = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8")).marks;
const KEEP = mistsKeepAt(mistsKeepRects(MARKS));   // the town, as the viewer keeps it clear
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
    if (Math.max(mk.extent?.w ?? 0, mk.extent?.h ?? 0) > MISTS_PAINT.townMaxM) continue;   // the world's frame and open country
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

test("the page's season lines: the telling's bell from veil 0.3, and the drafted lanterns from 284, which the telling does not speak", async () => {
  const { seasonLine, seasonLines } = await import("./world-verbs.mjs");
  assert.deepEqual(seasonLines(null, 284), []);
  assert.deepEqual(seasonLines(mistsAt(244, MISTS), 244), []);
  const bell = seasonLine(mistsAt(272, MISTS), 272);
  assert.ok(bell, "the bell from 272");
  assert.deepEqual(seasonLines(mistsAt(272, MISTS), 272), [bell]);
  const at284 = seasonLines(mistsAt(284, MISTS), 284);
  assert.equal(at284.length, 2);
  assert.match(at284[1], /lantern/);
  assert.equal(seasonLine(mistsAt(284, MISTS), 284), bell, "the telling's line is unchanged");
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
      if (!mk?.at || !Number.isFinite(mk.at.x) || Math.max(mk.extent?.w ?? 0, mk.extent?.h ?? 0) > MISTS_PAINT.townMaxM) continue;
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
