// mists-render.test.mjs — the Mists as the page paints them (POS-553).
//
// THE FACE IS CENTRED ON THE WALL first (WLD-81, Darko 2026-10-19 18:53,
// superseding POS-553's "the paint may cover more than the physics, never
// less"): the same noise, its flat creep-in taken out. At the schedule's
// crossings 244, 272 and 282, every point the engine puts behind the wall past
// the furthest the face can stand back is fully opaque in the paint's back
// layer, on a dense grid over the whole band and around every clearing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mistsAt, mistsHere } from "./world-engine.mjs";
import { mistsBakePlan, mistsSheetFeatherAt, mistsRenderAt, mistsBakeAt, mistsTrueDistance, mistsColourAt, mistsCoreHex, mistsReachM, mistsBackM, mistsCoreM, mistsOpaqueFromM, mistsKeepRects, mistsKeepAt, mistsOpenCountry, mistsCreatures, mistsCreatureBox, mistsCreatureSVG, bellFor, BELL_PARTIALS, MISTS_PAINT, MISTS_TINT } from "../spectator/mists-render.mjs";

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
  test(`the hard rule at ${n}: every point behind the wall, past the furthest the face stands back, is fully opaque in the paint`, () => {
    const m = mistsAt(n, MISTS);
    assert.ok(m, `the Mists stand at ${n}`);
    let behind = 0;
    for (const p of samples(m)) {
      const inWall = mistsHere(p, m).inWall;
      assert.equal(mistsTrueDistance(m, p.x, p.y) > 0, inWall, `the paint's distance agrees with the engine at (${p.x}, ${p.y})`);
      if (!inWall || !(mistsTrueDistance(m, p.x, p.y) > mistsBackM(m, 0) + MISTS_PAINT.softM)) continue;
      behind += 1;
      assert.equal(mistsRenderAt(m, p.x, p.y, 0).alpha, 1, `opaque behind the wall at (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
      assert.equal(mistsRenderAt(m, p.x, p.y, 0, KEEP).alpha, 1, `opaque behind the wall even where the town is kept clear (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
    }
    assert.ok(behind > 1000, `the grid reached the wall (${behind} points)`);
  });
}

// FALSIFIER (WLD-81): the painted face's MEAN over the whole wall sits within
// ±50 m of the engine's true face, and the same noise still wanders both ways
// (some bumps onto the clear side, some back into the Mist), unevenly.
for (const n of [244, 259, 272, 282]) {
  test(`FALSIFIER (WLD-81): the painted face is centred on the true face, and wanders both ways, at ${n}`, () => {
    const m = mistsAt(n, MISTS), c = m.clear, offs = [];
    const sides = [
      [(t) => ({ x: c.minX + t, y: c.minY }), { x: 0, y: -1 }, c.maxX - c.minX], [(t) => ({ x: c.minX + t, y: c.maxY }), { x: 0, y: 1 }, c.maxX - c.minX],
      [(t) => ({ x: c.minX, y: c.minY + t }), { x: -1, y: 0 }, c.maxY - c.minY], [(t) => ({ x: c.maxX, y: c.minY + t }), { x: 1, y: 0 }, c.maxY - c.minY],
    ];
    for (const [at, dir, len] of sides) for (let t = 1000; t < len - 1000; t += 100) {
      const p = at(t);
      // the face: where the back layer turns opaque, walking from the clear side into the wall (+ = into the wall)
      let q = -1500; while (mistsRenderAt(m, p.x + dir.x * q, p.y + dir.y * q, 0).alpha < 1 && q < 1500) q += 5;
      offs.push(q);
    }
    const mean = offs.reduce((a, b) => a + b, 0) / offs.length;
    assert.ok(Math.abs(mean) <= 50, `the mean painted face stands ${mean.toFixed(0)} m from the true face over ${offs.length} samples`);
    assert.ok(offs.some((o) => o < -50) && offs.some((o) => o > 50), "it wanders both ways");
    assert.ok(Math.max(...offs) - Math.min(...offs) > 150, `unevenly (${Math.min(...offs)}..${Math.max(...offs)} m)`);
  });
}

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

// THE WALL FOLLOWS THE FACE (WLD-81, Darko 2026-10-19 18:53): once the paint is on
// the page the opaque vector wall starts where the paint turns opaque, so a
// pocket the face leaves past the true face shows the paint's own falloff; the
// pointer is still taken from the true face by the wall's own path, unpainted.
test("ragged: the opaque wall follows the painted face, and the pointer stays on the true face", async () => {
  const { mistsWallSVG } = await import("../spectator/viewer.mjs");
  const reg = { originPx: { x: 485, y: 760 }, mPerPx: 5 };
  const m = mistsAt(259, MISTS);
  const flat = mistsWallSVG(m, { ...reg, painted: true });
  const svg = mistsWallSVG(m, { ...reg, painted: true, ragged: true });
  const ptr = svg.match(/<path class="wv-mists-wall"[^>]*>/)[0], back = svg.match(/<path class="wv-mists-wall-ragged"[^>]*>/)[0];
  assert.equal(ptr.match(/ d="[^"]*"/)[0], flat.match(/<path class="wv-mists-wall"[^>]*>/)[0].match(/ d="[^"]*"/)[0], "the pointer's path is the true wall");
  assert.match(ptr, /pointer-events="all"/);
  assert.match(ptr, /fill-opacity="0"/, "and unpainted");
  assert.match(back, /pointer-events="none"/);
  assert.match(back, new RegExp(`fill="${mistsCoreHex(m)}"`), "in the core colour");
  // along the west side: every vertex of the ragged wall sits where the paint is opaque, and some stand back past the true face
  const pts = [...back.matchAll(/(-?\d+\.\d) (-?\d+\.\d)/g)].map(([, x, y]) => ({ x: (Number(x) - reg.originPx.x) * reg.mPerPx, y: (Number(y) - reg.originPx.y) * reg.mPerPx }))
    .filter((q) => q.x <= m.clear.minX + 1 && q.x > m.clear.minX - 2000 && q.y > m.clear.minY + 1000 && q.y < m.clear.maxY - 1000);
  assert.ok(pts.length > 100, `the west side was read (${pts.length})`);
  for (const q of pts) assert.equal(mistsRenderAt(m, q.x - 1, q.y, 0).alpha, 1, `opaque just past the ragged wall at (${q.x.toFixed(0)}, ${q.y.toFixed(0)})`);
  assert.ok(pts.some((q) => q.x < m.clear.minX - 50), "the wall stands back where the face does");
  assert.equal(mistsOpaqueFromM(m, { x: m.clear.minX, y: 2233 }, { x: -1, y: 0 }), 0, "where the face stands on the clear side, the wall is on the true face");
  // the page swaps it in once the paint is on, and lite mode keeps the true face
  const SRC = readFileSync(join(ROOT, "spectator/viewer.mjs"), "utf8");
  assert.match(SRC, /mapCtx\.mistsCam\.replaceChildren\(g\);\s*\/\/[^\n]*\n\s*mapCtx\.mistsLayer\.innerHTML = mistsWallSVG\(drawn, \{ \.\.\.mapCtx, painted: true, ragged: true \}\);/);
  assert.match(SRC, /if \(lite\.on\) \{\s*mapCtx\.mistsLayer\.innerHTML = mistsWallSVG\(m, \{ \.\.\.mapCtx, painted: true \}\);/);
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

test("the creatures: seeded by the crossing, sparse at 244 and populated by 284, behind the wall, never over the town", () => {
  const counts = [];
  for (const n of [244, 272, 284]) {
    const m = mistsAt(n, MISTS), cs = mistsCreatures(m, { first: 244, keep: KEEP });
    assert.deepEqual(mistsCreatures(m, { first: 244, keep: KEEP }), cs, "the same crossing, the same creatures");
    for (const c of cs) {
      for (const [a, b] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) assert.equal(KEEP(c.x + a * c.sizeM, c.y + b * c.sizeM), 0, `${c.kind} at (${c.x}, ${c.y}) stands clear of the town`);
      const d = mistsTrueDistance(m, c.x, c.y);
      assert.ok(d > 0 && d < 1500, `${c.kind} stands behind the wall's true face, never on the clear side (true-face distance ${Math.round(d)} m; WLD-56 D5)`);
      assert.ok(["wolf", "raven", "bat"].includes(c.kind), `${c.kind} is one of the season's kinds`);
    }
    counts.push(cs.length);
  }
  assert.ok(counts[0] < counts[1] && counts[1] <= counts[2], `fewer at first, more by 284 (${counts.join(", ")})`);
  assert.ok(counts[0] >= 3 && counts[2] >= 25, `sparse but present at 244, populated at 284 (${counts.join(", ")})`);
  assert.deepEqual(mistsCreatures(null), [], "no Mists, no creatures");
});

test("the drawn silhouette, not its point, stands wholly behind the wall: every corner of every box, at every crossing of the season (WLD-56 D5, review of #219 F1)", () => {
  let boxes = 0;
  for (let n = 244; n <= 288; n += 2) {
    const m = mistsAt(n, MISTS);
    for (const c of mistsCreatures(m, { first: 244, keep: KEEP })) {
      const b = mistsCreatureBox(c);
      for (const [x, y] of [[b.minX, b.minY], [b.maxX, b.minY], [b.minX, b.maxY], [b.maxX, b.maxY], [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]])
        assert.ok(mistsTrueDistance(m, x, y) > 0, `crossing ${n}: ${c.kind} (${c.pose}) at (${c.x}, ${c.y}), size ${c.sizeM}: its box reaches (${Math.round(x)}, ${Math.round(y)}), ${Math.round(-mistsTrueDistance(m, x, y))} m onto the clear side`);
      const k = m.clear;
      assert.ok(b.maxX < k.minX || b.minX > k.maxX || b.maxY < k.minY || b.minY > k.maxY, `crossing ${n}: ${c.kind}'s box is off the clear box entirely`);
      boxes += 1;
    }
  }
  assert.ok(boxes > 500, `the season's silhouettes were all checked (${boxes})`);
});

test("the box is the one the silhouette is drawn in: its path's box at its size, from its point", () => {
  const reg = { originPx: { x: 0, y: 0 }, mPerPx: 1, ink: "#000" };
  for (const c of [{ kind: "wolf", pose: "stand", x: 100, y: 200, sizeM: 600 }, { kind: "raven", pose: "perch", x: 0, y: 0, sizeM: 300 }, { kind: "raven", pose: "lift", x: 0, y: 0, sizeM: 300 }, { kind: "bat", pose: "flit", x: -50, y: 9, sizeM: 230 }]) {
    const svg = mistsCreatureSVG(c, reg), b = mistsCreatureBox(c);
    const [, ax, ay] = svg.match(/<g transform="translate\(([-\d.]+) ([-\d.]+)\)"><path/);
    const scale = c.sizeM / 100;
    assert.equal(Math.round(c.x + Number(ax) * scale), Math.round(b.minX), `${c.kind} ${c.pose}: drawn from the box's left edge`);
    assert.equal(Math.round(c.y + Number(ay) * scale), Math.round(b.minY), `${c.kind} ${c.pose}: drawn from the box's top edge`);
    assert.equal(Math.round(b.maxX - b.minX), c.sizeM);
  }
});

// THE SHEET'S EDGE IS NOT A FACE (WLD-81, superseding the POS-553 review's "the
// sheet's edge is a face too"): the painted sheet (the atlas painting, 1500 x
// 2400 units at 5 m, the Origin at 485,760) is a rectangle, and past it the
// ground is open country (its feather), never fog: at 259 the old face was a 2 km
// flat creep. With the frame the town stays clear, and the frame paints nothing.
const FRAME = { minX: -485 * 5, minY: -760 * 5, maxX: (1500 - 485) * 5, maxY: (2400 - 760) * 5 };
test("with the sheet's frame: the town stays clear, and the frame paints nothing", () => {
  for (const n of [244, 259, 272, 284]) {
    const plain = mistsAt(n, MISTS), m = { ...plain, frame: FRAME };
    for (const p of samples(m)) for (const li of [0, 1, 2])
      assert.deepEqual(mistsRenderAt(m, p.x, p.y, li), mistsRenderAt(plain, p.x, p.y, li), `the frame changes nothing at (${p.x}, ${p.y})`);
    for (const mk of MARKS) {
      if (!mk?.at || !Number.isFinite(mk.at.x) || mistsOpenCountry(mk)) continue;
      if (mistsHere(mk.at, m).inWall) continue;
      const a = 1 - [0, 1, 2].reduce((acc, li) => acc * (1 - mistsRenderAt(m, mk.at.x, mk.at.y, li, KEEP).alpha), 1);
      assert.ok(a <= 0.2, `${mk.id} at ${n} is under ${a.toFixed(2)} of fog`);
    }
  }
  // the clear ground between the sheet's west edge (x −2425) and the true wall at 259 (x −4391) is not painted solid
  const m = { ...mistsAt(259, MISTS), frame: FRAME };
  for (let x = -2500; x > m.clear.minX + 600; x -= 100) assert.ok(mistsBakeAt(m, 0, x, 2233, KEEP).alpha < 1, `no fog face at the sheet's edge (${x})`);
});

// THE BAKE'S OWN RULE (#186 review): every test below runs mistsBakeAt, the
// rule the canvas bake applies pixel by pixel, the skip included, with the
// painted sheet's frame. Three layers together, each at either end of its drift.
const bakeWorst = (m, x, y, li, keep = KEEP) => { const L = MISTS_PAINT.layers[li];
  return Math.max(...[0, 1, -1].map((sg) => mistsBakeAt(m, li, x - sg * L.driftM, y - sg * L.driftM * 0.45, keep).alpha)); };
const bakeComposite = (m, x, y, keep = KEEP) => 1 - [0, 1, 2].reduce((a, li) => a * (1 - bakeWorst(m, x, y, li, keep)), 1);
const footprint = (mk) => { const w = (mk.extent?.w ?? 0) / 2, h = (mk.extent?.h ?? 0) / 2;
  return [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]].map(([a, b]) => ({ x: mk.at.x + a * w, y: mk.at.y + b * h })); };

// The far south-west's wetland is a household's (sol-am-lichterfenster): the
// clearing was sized for it, but if it moves out the Mists may cover it
// (WLD-38), so its absence is told, never failed; `checked` keeps the test whole.
const WETLAND = "sol-am-lichterfenster/vesperfen-wetland";
function bakeKeepsClearings(marks, keep = KEEP) {
  let checked = 0;
  const notes = [];
  for (const n of CROSSINGS) {
    const m = { ...mistsAt(n, MISTS), frame: FRAME };
    const inside = marks.filter((mk) => mk?.at && Number.isFinite(mk.at.x) && m.clearings.some((k) => Math.hypot(mk.at.x - k.x, mk.at.y - k.y) < k.r));
    if (!inside.some((mk) => mk.id === WETLAND)) notes.push(`${WETLAND} is not in a clearing at ${n}`);
    for (const mk of inside) for (const p of footprint(mk)) {
      if (mistsHere(p, m).inWall) continue;
      const a = bakeComposite(m, p.x, p.y, keep);
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
  return notes;
}

test("the bake keeps the clearings clear: no paint above a haze on any mark inside them, whatever its size, at 244, 272 and 282", (t) => {
  const notes = bakeKeepsClearings(MARKS);
  t.diagnostic(notes.length ? notes.join("; ") : "the far south-west's wetland is in its clearing");
});

test("MAY COVER, in the paint: the far south-west's wetland moved out of its clearing is told, never failed, and the bake still keeps the clearings clear", (t) => {
  const moved = MARKS.map((mk) => (mk?.id === WETLAND ? { ...mk, at: { x: mk.at.x + 6000, y: mk.at.y } } : mk));
  const notes = bakeKeepsClearings(moved, mistsKeepAt(mistsKeepRects(moved, MISTS.clearings_m)));
  t.diagnostic(notes.join("; "));
  assert.deepEqual(notes, CROSSINGS.map((n) => `${WETLAND} is not in a clearing at ${n}`));
});

test("the bake's face is ragged, never a straight line, on the west and south at 244", () => {
  const m = { ...mistsAt(244, MISTS), frame: FRAME };
  const faces = { west: [], south: [] };   // read every 50 m: the town's margins (every household's mark, any size) take whole stretches of the strip
  for (let y = FRAME.minY + 600; y < FRAME.maxY - 600; y += 50) {
    let x = FRAME.maxX - 2000; while (x > m.clear.minX - mistsBackM(m, 0) - 200 && mistsBakeAt(m, 0, x, y).alpha < 1) x -= 10;
    if (KEEP(x, y) < 1) faces.west.push(x);
  }
  for (let x = FRAME.minX + 600; x < FRAME.maxX - 600; x += 50) {
    let y = FRAME.minY + 3000; while (y < m.clear.maxY + mistsBackM(m, 0) + 200 && mistsBakeAt(m, 0, x, y).alpha < 1) y += 10;
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
// 2026-10-19, WLD-81: the face arm now reads the engine's true south face, since the
// sheet-edge face it read on main is gone by ruling; prod's own noise has a 19–20-sample
// run there. The same noise in a new place: a measurement change, not a looser look.
const FACE_STRAIGHT_MAX = 20;
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
    assert.ok(a <= FACE_STRAIGHT_MAX, `${n}: the face runs straight (±${STRAIGHT_TOL_M} m) for ${a} samples of 50 m`);
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
    const plan = mistsBakePlan(m);
    for (const { li, box, skip } of plan) {
      for (let t = 0; t <= 1; t += 0.01) for (const d of [0, inset]) {
        const pts = [{ x: box.minX + d + t * (box.maxX - box.minX - 2 * d), y: box.minY + d }, { x: box.minX + d + t * (box.maxX - box.minX - 2 * d), y: box.maxY - d },
          { x: box.minX + d, y: box.minY + d + t * (box.maxY - box.minY - 2 * d) }, { x: box.maxX - d, y: box.minY + d + t * (box.maxY - box.minY - 2 * d) }];
        for (const p of pts) {
          if (!(mistsTrueDistance(m, p.x, p.y) > 0)) continue;   // a box over clear ground ends in the clear, past every bank
          if (skip && p.x >= skip.minX && p.x <= skip.maxX && p.y >= skip.minY && p.y <= skip.maxY) continue;   // the main bake's own ground
          // another bake of this layer carries the paint on past this edge (a clearing's box round
          // the main box's corner, WLD-81's wider boxes): an edge there is no edge on the page
          const inside = (b) => p.x > b.minX && p.x < b.maxX && p.y > b.minY && p.y < b.maxY;
          if (plan.some((q) => q.li === li && q.box !== box && inside(q.box))) continue;
          const r = mistsBakeAt(m, li, p.x, p.y, KEEP);
          if (li > 0) assert.equal(r.alpha, 0, `layer ${li} at ${n} paints ${r.alpha} at its box's edge (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
          else assert.equal("#" + mistsColourAt(m, r.depth).map((v) => v.toString(16).padStart(2, "0")).join(""), core, `the back layer at ${n} is the wall's colour at its box's edge`);
          read += 1;
        }
      }
    }
    assert.ok(read > 1000, `the boxes' edges were read at ${n} (${read})`);
  }
  // and the line where the front layers give out is no rectangle either: east of the clear ground at 284
  const m = mistsAt(284, MISTS), out = [];
  for (let y = m.clear.minY + 1000; y < m.clear.maxY - 1000; y += 50) {
    let x = m.clear.maxX + 600; while (mistsRenderAt(m, x, y, 1).alpha > 0 && x < m.clear.maxX + 2000) x += 5;
    out.push(x);
  }
  const run = longestStraightRun(out);
  assert.ok(run <= STRAIGHT_MAX, `the front layers' fade runs straight (±${STRAIGHT_TOL_M} m) for ${run} samples of 50 m`);
});
