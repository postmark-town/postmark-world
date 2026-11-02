// heightfield-far.test.mjs — the far-sample search (WLD-144, Postmark 3D W5).
//
// A sample that runs out of grid rings (or sits outside the grid altogether) used
// to take the full scan over every control point. It is now answered from an
// index over the OCCUPIED cells. That is only safe if the answer does not move by
// a bit, so this file asserts nothing remembered: it carries the ORIGINAL sort
// implementation verbatim as the oracle (the same one heightfield-selection.test
// keeps) and holds the field against it with Object.is, on invented points only.
// It reads no World state, no skeleton and no fixture, so it is a lone-file run.
//
// Every control point and every sample below is made up here from a seeded
// generator (no Math.random: a failure must replay).

import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

import { DIALS, buildHeightfield } from "./world-engine.mjs";

// ── THE ORIGINAL, kept verbatim as the oracle ───────────────────────────────
function referenceHeightfield({ controlPoints, power = DIALS.idw_power, k = DIALS.idw_k }) {
  const cps = controlPoints.map((c) => ({ x: c.x, y: c.y, h: c.h, id: c.id ?? null }));
  const K = Math.min(k, cps.length);
  return (x, y) => {
    const near = cps
      .map((c) => ({ c, d2: (x - c.x) ** 2 + (y - c.y) ** 2 }))
      .sort((a, b) => a.d2 - b.d2)
      .slice(0, K);
    if (near[0].d2 === 0) return near[0].c.h;
    let wsum = 0, hsum = 0;
    for (const { c, d2 } of near) { const w = 1 / Math.pow(d2, power / 2); wsum += w; hsum += w * c.h; }
    return hsum / wsum;
  };
}

// a seeded generator (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let checked = 0;   // every sample compared in this file
function agree(fast, slow, x, y, what) {
  const a = fast(x, y), b = slow(x, y);
  checked += 1;
  if (!Object.is(a, b)) assert.fail(`${what}: elevation at (${x}, ${y}) is ${a}, the sort says ${b}`);
}

// a town: a clump of points with a few outliers far out (the real shape: ~600 points
// in a few km and a handful 96 km away), distinct heights so a wrong pick shows
function town(n, seed, spread, outliers = 3) {
  const u = rng(seed);
  const pts = Array.from({ length: n }, (_, i) => ({
    x: Math.round((u() - 0.5) * spread * 100) / 100,
    y: Math.round((u() - 0.5) * spread * 100) / 100,
    h: Math.round(u() * 4000) / 10,
    id: `t${i}`,
  }));
  for (let o = 0; o < outliers; o += 1) {
    const ang = u() * 2 * Math.PI;
    pts.push({ x: Math.round(Math.cos(ang) * 96000 * 100) / 100, y: Math.round(Math.sin(ang) * 96000 * 100) / 100, h: 1 + o, id: `o${o}` });
  }
  return pts;
}

// the grid's cell size, mirrored from buildGrid so the boundary samples can sit
// EXACTLY on cell edges. If buildGrid's sizing ever moves, these samples merely
// stop being on boundaries (the oracle comparison still holds); the boundary test
// below also sweeps edges at many sizes so it does not hang on this one formula.
function cellSize(cps, K) {
  const iqr = (vals) => { const s = [...vals].sort((a, b) => a - b); return s[Math.floor(s.length * 0.75)] - s[Math.floor(s.length * 0.25)]; };
  const area = Math.max(1, iqr(cps.map((c) => c.x)) * iqr(cps.map((c) => c.y)));
  return Math.max(1, Math.sqrt((area * K) / cps.length));
}
// the neighbours of a double
const f64 = new Float64Array(1), u64 = new BigUint64Array(f64.buffer);
function nudge(v, steps) { f64[0] = v; u64[0] += BigInt(v >= 0 ? steps : -steps); return f64[0]; }

// ── FAR SAMPLES ──────────────────────────────────────────────────────────────

test("far samples: beyond the rings and far outside the bounds, 100 to 200 km out", () => {
  for (const [n, seed] of [[100, 11], [700, 12], [2500, 13]]) {
    const controlPoints = town(n, seed, 12000);
    const fast = buildHeightfield({ controlPoints }).elevationAt;
    const slow = referenceHeightfield({ controlPoints });
    for (let a = 0; a < 360; a += 3) {
      for (const R of [30000, 100000, 150000, 200000, 1e6, 1e9]) {
        const x = Math.cos(a * Math.PI / 180) * R, y = Math.sin(a * Math.PI / 180) * R;
        agree(fast, slow, x, y, `n=${n} far`);
        agree(fast, slow, Math.round(x), Math.round(y), `n=${n} far rounded`);
      }
    }
  }
});

test("far samples in the empty between: inside the span of the points, nowhere near any", () => {
  // the town and its outliers, sampled along rays that cross the gap between them
  for (const [n, seed] of [[200, 21], [1500, 22]]) {
    const controlPoints = town(n, seed, 6000, 6);
    const fast = buildHeightfield({ controlPoints }).elevationAt;
    const slow = referenceHeightfield({ controlPoints });
    const u = rng(seed + 1000);
    for (let i = 0; i < 4000; i += 1) {
      const ang = u() * 2 * Math.PI, R = 4000 + u() * 120000;
      agree(fast, slow, Math.cos(ang) * R, Math.sin(ang) * R, `n=${n} gap`);
    }
  }
});

test("the far search reaches a lone point on the far side of an empty field", () => {
  // 80 clustered points and one point at 150 km: a sample next to the lone point
  // must pick it first, and a sample opposite must pick the cluster
  const controlPoints = [...town(80, 31, 2000, 0), { x: 150000, y: -150000, h: 777, id: "lone" }];
  const fast = buildHeightfield({ controlPoints }).elevationAt;
  const slow = referenceHeightfield({ controlPoints });
  for (const [x, y] of [[149990, -150003], [150000, -150000], [140000, -140000], [-150000, 150000], [0, 0], [75000, -75000]])
    agree(fast, slow, x, y, "lone");
  assert.equal(fast(150000, -150000), 777, "standing on the lone point");
});

// ── SPARSE GRIDS ─────────────────────────────────────────────────────────────

test("sparse grids: points kilometres apart, most cells empty", () => {
  for (const [n, seed, spread] of [[65, 41, 200000], [300, 42, 400000], [1000, 43, 1000000]]) {
    const u = rng(seed);
    const controlPoints = Array.from({ length: n }, (_, i) => ({ x: Math.round((u() - 0.5) * spread), y: Math.round((u() - 0.5) * spread), h: Math.round(u() * 800) / 4, id: `s${i}` }));
    for (const k of [1, 8, 20]) {
      const fast = buildHeightfield({ controlPoints, k }).elevationAt;
      const slow = referenceHeightfield({ controlPoints, k });
      for (let i = 0; i < 2000; i += 1) agree(fast, slow, (u() - 0.5) * spread * 1.6, (u() - 0.5) * spread * 1.6, `sparse n=${n} k=${k}`);
    }
  }
});

test("a thin field: every point on one line, and on one column", () => {
  for (const [mapX, mapY] of [[(i) => i * 40, () => 0], [() => 5, (i) => i * 40], [(i) => i * 40, (i) => i * 40]]) {
    const controlPoints = Array.from({ length: 150 }, (_, i) => ({ x: mapX(i), y: mapY(i), h: (i * 31) % 113, id: `l${i}` }));
    const fast = buildHeightfield({ controlPoints }).elevationAt;
    const slow = referenceHeightfield({ controlPoints });
    for (let x = -50000; x <= 50000; x += 2500) for (let y = -50000; y <= 50000; y += 2500) agree(fast, slow, x, y, "thin");
    for (let x = -300; x <= 6300; x += 100) for (let y = -300; y <= 6300; y += 100) agree(fast, slow, x, y, "thin near");
  }
});

// ── BOUNDARIES ───────────────────────────────────────────────────────────────

test("samples and points exactly on cell boundaries, and a hair either side", () => {
  const K = DIALS.idw_k;
  for (const [n, seed, spread] of [[120, 51, 3000], [600, 52, 8000]]) {
    const base = town(n, seed, spread, 2);
    const size = cellSize(base, K);
    // put a third of the points exactly on cell edges and corners
    const u = rng(seed + 1);
    const controlPoints = base.map((c, i) => (i % 3 === 0
      ? { ...c, x: Math.round(c.x / size) * size, y: (i % 2 ? Math.round(c.y / size) * size : c.y) }
      : c));
    const fast = buildHeightfield({ controlPoints }).elevationAt;
    const slow = referenceHeightfield({ controlPoints });
    for (let i = -80; i <= 80; i += 1) {
      for (let j = -80; j <= 80; j += 7) {
        const ex = i * size, ey = j * size;
        for (const [x, y] of [[ex, ey], [nudge(ex, 1), ey], [nudge(ex, -1), nudge(ey, 1)], [ex, nudge(ey, -3)], [nudge(ex, 2), nudge(ey, -2)]])
          agree(fast, slow, x, y, `boundary n=${n}`);
      }
    }
    // the far window's own edge: samples whose ring window (maxRing cells) just touches the occupied span
    const maxRing = Math.max(2, Math.floor((Math.sqrt(controlPoints.length / 2) - 1) / 2));
    const xs = controlPoints.map((c) => c.x), ys = controlPoints.map((c) => c.y);
    const hiX = Math.max(...xs), loX = Math.min(...xs), hiY = Math.max(...ys), loY = Math.min(...ys);
    for (let d = maxRing - 3; d <= maxRing + 4; d += 1) {
      for (const off of [0, 0.5, 1 - 1e-9, 1, 1 + 1e-9]) {
        const t = (d + off) * size;
        for (const [x, y] of [[hiX + t, (loY + hiY) / 2], [loX - t, (loY + hiY) / 2], [(loX + hiX) / 2, hiY + t], [(loX + hiX) / 2, loY - t], [hiX + t, hiY + t], [loX - t, loY - t], [hiX + t, Math.round(u() * hiY)]])
          agree(fast, slow, x, y, `window edge n=${n} d=${d}+${off}`);
      }
    }
  }
});

test("boundaries at many cell sizes: lattices whose spacing sets the cell edge", () => {
  for (const step of [1, 7, 25, 113, 400]) {
    const controlPoints = [];
    for (let i = 0; i < 12; i += 1) for (let j = 0; j < 12; j += 1) controlPoints.push({ x: i * step, y: j * step, h: (i * 17 + j * 5) % 41, id: `${i},${j}` });
    const fast = buildHeightfield({ controlPoints }).elevationAt;
    const slow = referenceHeightfield({ controlPoints });
    const size = cellSize(controlPoints, DIALS.idw_k);
    for (let m = -40; m <= 40; m += 1) {
      for (let q = -40; q <= 40; q += 3) {
        agree(fast, slow, m * size, q * size, `lattice step=${step}`);
        agree(fast, slow, m * step * 0.5, q * step * 0.5, `lattice half-step=${step}`);
      }
    }
    for (const R of [10, 40, 150]) for (let a = 0; a < 360; a += 15) agree(fast, slow, step * 6 + Math.cos(a) * R * step, step * 6 + Math.sin(a) * R * step, `lattice far step=${step}`);
  }
});

// ── TIES AT THE K-TH SEAT ────────────────────────────────────────────────────

// All twelve integer points at distance 5 from the origin, scaled, so at a sample
// on the origin they tie exactly; shuffled so the index order is not the angle order
const RING12 = [[0, 5], [0, -5], [5, 0], [-5, 0], [3, 4], [3, -4], [-3, 4], [-3, -4], [4, 3], [4, -3], [-4, 3], [-4, -3]];

test("exact ties at the K-th seat across cells: the lower index wins, as the stable sort had it", () => {
  for (const scale of [1, 60, 350, 2500]) {
    for (let seed = 1; seed <= 6; seed += 1) {
      const u = rng(seed * 101 + scale);
      const ring = RING12.map(([a, b], i) => ({ x: a * scale, y: b * scale, h: 100 + i, id: `r${i}` }));
      for (let i = ring.length - 1; i > 0; i -= 1) { const j = Math.floor(u() * (i + 1)); [ring[i], ring[j]] = [ring[j], ring[i]]; }
      // background points all strictly farther than the ring from the origin
      const bg = Array.from({ length: 70 }, (_, i) => {
        const ang = u() * 2 * Math.PI, R = 9 * scale + u() * 30 * scale;
        return { x: Math.round(Math.cos(ang) * R), y: Math.round(Math.sin(ang) * R), h: 900 + i, id: `b${i}` };
      });
      const controlPoints = [...bg.slice(0, 35), ...ring, ...bg.slice(35)];
      for (const k of [1, 2, 3, 5, 8, 11, 12, 13, 20]) {
        const fast = buildHeightfield({ controlPoints, k }).elevationAt;
        const slow = referenceHeightfield({ controlPoints, k });
        agree(fast, slow, 0, 0, `ring tie scale=${scale} k=${k}`);
      }
    }
  }
});

test("exact ties far away: mirrored points equidistant from a sample 100+ km out on the axis", () => {
  // mirror pairs about the x axis: a sample on the axis is exactly as far from
  // (x, y) as from (x, -y), at any distance, in different cells; many such pairs,
  // heights all different, and index order shuffled
  for (let seed = 1; seed <= 8; seed += 1) {
    const u = rng(seed * 977);
    const pairs = [];
    for (let i = 0; i < 40; i += 1) {
      const x = Math.round((u() - 0.5) * 6000), y = 1 + Math.round(u() * 4000);
      pairs.push({ x, y, h: i * 2 }, { x, y: -y, h: i * 2 + 1 });
    }
    for (let i = pairs.length - 1; i > 0; i -= 1) { const j = Math.floor(u() * (i + 1)); [pairs[i], pairs[j]] = [pairs[j], pairs[i]]; }
    const controlPoints = pairs.map((c, i) => ({ ...c, id: `m${i}` }));
    for (const k of [1, 2, 3, 4, 7, 8, 9, 16, 25]) {
      const fast = buildHeightfield({ controlPoints, k }).elevationAt;
      const slow = referenceHeightfield({ controlPoints, k });
      for (const X of [-1e6, -200000, -150000, -100000, 100000, 150000, 200000, 1e6, 3e6])
        agree(fast, slow, X, 0, `mirror seed=${seed} k=${k}`);
      for (const Y of [-200000, 200000]) agree(fast, slow, 0, Y, `mirror (off the mirror axis) seed=${seed} k=${k}`);
    }
  }
});

test("exact ties among identical coordinates: duplicates keep the earlier point, near and far", () => {
  const dups = [];
  for (let i = 0; i < 90; i += 1) dups.push({ x: (i % 6) * 100, y: Math.floor(i / 6) * 100, h: i, id: `d${i}` });   // 15 coordinates × 6 duplicates, 6 in a row
  for (let i = 0; i < 30; i += 1) dups.push({ x: 250, y: 250, h: 1000 + i, id: `same${i}` });                       // 30 more in one place, later in the list
  const fast = buildHeightfield({ controlPoints: dups }).elevationAt;
  const slow = referenceHeightfield({ controlPoints: dups });
  for (const [x, y] of [[250, 250], [0, 0], [500, 1400], [260, 250], [250, 3000], [250, 150000], [-150000, 250], [120000, -120000], [1e7, 250]])
    agree(fast, slow, x, y, "duplicates");
});

// ── EXACT HITS ───────────────────────────────────────────────────────────────

test("exact hits: standing on every control point returns what the sort returns", () => {
  for (const [n, seed] of [[66, 61], [400, 62], [1500, 63]]) {
    const controlPoints = town(n, seed, 9000, 4);
    // plus some points that share a coordinate with a different height
    controlPoints.push({ ...controlPoints[3], h: -1, id: "twin" }, { ...controlPoints[n], h: -2, id: "far-twin" });
    const fast = buildHeightfield({ controlPoints }).elevationAt;
    const slow = referenceHeightfield({ controlPoints });
    for (const c of controlPoints) agree(fast, slow, c.x, c.y, `hit n=${n} ${c.id}`);
    // the first listed at a coordinate wins, near and far
    assert.equal(fast(controlPoints[n].x, controlPoints[n].y), controlPoints[n].h, "an outlier's own height");
    assert.equal(fast(controlPoints[3].x, controlPoints[3].y), controlPoints[3].h, "the first at a shared coordinate");
  }
});

// ── SUPPORTED K AND POWER ────────────────────────────────────────────────────

test("every supported k and power, near and far", () => {
  const controlPoints = town(500, 71, 8000, 4);
  const samples = [[0, 0], [1234.5, -987.25], [-3000, 2500], [20000, 20000], [-96000, 30], [100000, 100000], [-150000, 20000], [1e6, -1e6]];
  for (const k of [1, 2, 3, 4, 5, 8, 9, 16, 17, 64, 499, 500, 504, 505, 600, 10000]) {
    for (const power of [DIALS.idw_power, 1, 2, 3, 4, 0.5, 2.5]) {
      const fast = buildHeightfield({ controlPoints, k, power }).elevationAt;
      const slow = referenceHeightfield({ controlPoints, k, power });
      for (const [x, y] of samples) agree(fast, slow, x, y, `k=${k} power=${power}`);
    }
  }
  // the dials' own defaults, with neither given
  const fast = buildHeightfield({ controlPoints }).elevationAt, slow = referenceHeightfield({ controlPoints });
  for (const [x, y] of samples) agree(fast, slow, x, y, "defaults");
});

test("an unsupported k keeps the answer the full scan gave (the far search is not asked)", () => {
  // k of 0, a fraction or NaN has never been a real dial; the field answered NaN
  // for it and still does, near or far; a negative k still refuses to build
  const controlPoints = town(100, 72, 4000, 2);
  for (const k of [0, 2.5, NaN]) {
    const f = buildHeightfield({ controlPoints, k }).elevationAt;
    for (const [x, y] of [[0, 0], [50000, 50000], [1e6, 1e6]]) assert.equal(Object.is(f(x, y), NaN), true, `k=${k} at ${x},${y}`);
  }
  assert.throws(() => buildHeightfield({ controlPoints, k: -1 }), /length/i);
});

// ── NON-FINITE SAMPLES ───────────────────────────────────────────────────────

test("a sample that is not a finite number is answered as the scan answered it, with and without a grid", () => {
  const bad = [NaN, Infinity, -Infinity];
  const samples = [];
  for (const a of bad) { samples.push([a, 0], [0, a], [5000, a], [a, -5000]); for (const b of bad) samples.push([a, b]); }
  for (const n of [1, 5, 64, 65, 300, 2000]) {
    const controlPoints = town(n, 81, 5000, n > 5 ? 2 : 0).slice(0, n + (n > 5 ? 2 : 0));
    for (const k of [1, 8, 40]) {
      const fast = buildHeightfield({ controlPoints, k }).elevationAt;
      const slow = referenceHeightfield({ controlPoints, k });
      for (const [x, y] of samples) agree(fast, slow, x, y, `nonfinite n=${n} k=${k}`);
      // and a finite sample afterwards is not poisoned by the beat a bad one left
      agree(fast, slow, 1500, -1500, `after nonfinite n=${n}`);
      agree(fast, slow, 150000, 150000, `far after nonfinite n=${n}`);
    }
  }
});

test("huge but finite samples: the squares do not overflow, the answer is still the sort's", () => {
  const controlPoints = town(300, 82, 6000, 3);
  const fast = buildHeightfield({ controlPoints }).elevationAt;
  const slow = referenceHeightfield({ controlPoints });
  for (const X of [1e12, -1e50, 1e100, -3e100, 1e150])
    for (const Y of [0, 1e12, -1e100, 7e149]) agree(fast, slow, X, Y, "huge");
});

// ── FEWER THAN K, AND AROUND GRID_MIN_POINTS ─────────────────────────────────

test("fewer points than k, one point, and counts around GRID_MIN_POINTS (64)", () => {
  const samples = [[0, 0], [10, -10], [300, 400], [5000, 5000], [-120000, 80000], [1e7, 1e7]];
  for (const n of [1, 2, 3, 7, 8, 9, 10, 31, 62, 63, 64, 65, 66, 67, 72, 73, 100, 129]) {
    const u = rng(n * 7919);
    const controlPoints = Array.from({ length: n }, (_, i) => ({ x: Math.round((u() - 0.5) * 3000), y: Math.round((u() - 0.5) * 3000), h: i * 3 + 1, id: `c${i}` }));
    for (const k of [1, 2, 8, 70, 200]) {
      const fast = buildHeightfield({ controlPoints, k }).elevationAt;
      const slow = referenceHeightfield({ controlPoints, k });
      for (const [x, y] of samples) agree(fast, slow, x, y, `n=${n} k=${k}`);
      for (const c of controlPoints.slice(0, 5)) agree(fast, slow, c.x, c.y, `n=${n} k=${k} on a point`);
    }
  }
});

test("all points on one coordinate, and two points: degenerate fields", () => {
  for (const n of [2, 70, 200]) {
    const controlPoints = Array.from({ length: n }, (_, i) => ({ x: 42, y: -7, h: i, id: `z${i}` }));
    const fast = buildHeightfield({ controlPoints }).elevationAt;
    const slow = referenceHeightfield({ controlPoints });
    for (const [x, y] of [[42, -7], [0, 0], [42, 90000], [-1e6, 1e6], [42.5, -7]]) agree(fast, slow, x, y, `one place n=${n}`);
  }
});

// ── THE SEEDED FUZZ ──────────────────────────────────────────────────────────

test("seeded fuzz against the sort: many thousands of samples, bit-equal for every one", (t) => {
  const before = checked;
  const shapes = {
    clump: (u, n) => town(n, Math.floor(u() * 1e9), 500 + u() * 15000, Math.floor(u() * 5)),
    uniform: (u, n) => { const sp = 1000 + u() * 300000; return Array.from({ length: n }, (_, i) => ({ x: (u() - 0.5) * sp, y: (u() - 0.5) * sp, h: u() * 100, id: `u${i}` })); },
    integers: (u, n) => Array.from({ length: n }, (_, i) => ({ x: Math.floor(u() * 60) * 25, y: Math.floor(u() * 60) * 25, h: Math.floor(u() * 50), id: `i${i}` })),
    twoClumps: (u, n) => Array.from({ length: n }, (_, i) => (i % 2 ? { x: 80000 + u() * 900, y: -60000 + u() * 900, h: u() * 9, id: `a${i}` } : { x: u() * 900, y: u() * 900, h: u() * 9, id: `b${i}` })),
    ring: (u, n) => Array.from({ length: n }, (_, i) => { const a = (i / n) * 2 * Math.PI, R = 3000 + (i % 3); return { x: Math.round(Math.cos(a) * R), y: Math.round(Math.sin(a) * R), h: i % 17, id: `g${i}` }; }),
    axisPairs: (u, n) => Array.from({ length: n }, (_, i) => ({ x: Math.floor(i / 2) * 37, y: (i % 2 ? 1 : -1) * (500 + Math.floor(i / 2) % 9 * 100), h: i % 23, id: `x${i}` })),
    farClumps: (u, n) => Array.from({ length: n }, (_, i) => { const c = i % 4; return { x: [0, 120000, -90000, 30000][c] + Math.round(u() * 2000), y: [0, 5000, -140000, 160000][c] + Math.round(u() * 2000), h: u() * 50, id: `f${i}` }; }),
  };
  const names = Object.keys(shapes);
  let configs = 0;
  for (let seed = 1; seed <= 56; seed += 1) {
    const u = rng(seed * 2654435761);
    const shape = names[seed % names.length];
    const n = [65, 90, 150, 300, 600, 1200][Math.floor(u() * 6)];
    const controlPoints = shapes[shape](u, n);
    const k = [1, 3, 8, 8, 8, 12, 20][Math.floor(u() * 7)];
    const power = [2, 2, 2, 1, 3, 4][Math.floor(u() * 6)];
    const fast = buildHeightfield({ controlPoints, k, power }).elevationAt;
    const slow = referenceHeightfield({ controlPoints, k, power });
    const xs = controlPoints.map((c) => c.x), ys = controlPoints.map((c) => c.y);
    const lo = [Math.min(...xs), Math.min(...ys)], hi = [Math.max(...xs), Math.max(...ys)];
    const per = n >= 1200 ? 500 : 1000;
    for (let i = 0; i < per; i += 1) {
      const r = u();
      let x, y;
      if (r < 0.25) { x = lo[0] + u() * (hi[0] - lo[0]); y = lo[1] + u() * (hi[1] - lo[1]); }                         // inside the span
      else if (r < 0.40) { const c = controlPoints[Math.floor(u() * n)]; x = c.x; y = c.y; }                          // on a point
      else if (r < 0.50) { const c = controlPoints[Math.floor(u() * n)]; x = c.x + Math.round((u() - 0.5) * 4); y = c.y + Math.round((u() - 0.5) * 4); } // beside a point, integer offsets (ties)
      else if (r < 0.70) { const a = u() * 2 * Math.PI, R = u() * 40000; x = (lo[0] + hi[0]) / 2 + Math.cos(a) * R; y = (lo[1] + hi[1]) / 2 + Math.sin(a) * R; }   // a few km to 40 km out
      else if (r < 0.92) { const a = u() * 2 * Math.PI, R = 90000 + u() * 120000; x = Math.cos(a) * R; y = Math.sin(a) * R; }                        // 90–210 km out
      else if (r < 0.96) { x = Math.round((u() - 0.5) * 4e6); y = Math.round((u() - 0.5) * 4e6); }                       // millions of metres
      else { x = Math.round(lo[0] + u() * (hi[0] - lo[0])); y = Math.round(lo[1] + u() * (hi[1] - lo[1])); }          // integer sample (more exact ties)
      agree(fast, slow, x, y, `fuzz seed=${seed} ${shape} n=${n} k=${k} power=${power}`);
    }
    configs += 1;
  }
  const swept = checked - before;
  t.diagnostic(`fuzz: ${swept} samples over ${configs} fields`);
  assert.ok(configs >= 56 && swept >= 40000, `fuzz compared ${swept} samples over ${configs} fields`);
});

test("the field is not stateful: the same far sample twice, and far then near then far, agree", () => {
  const controlPoints = town(800, 91, 7000, 4);
  const fast = buildHeightfield({ controlPoints }).elevationAt;
  const slow = referenceHeightfield({ controlPoints });
  const seq = [[150000, 20000], [10, 10], [150000, 20000], [-90000, 90000], [3000, -2000], [-90000, 90000], [0, 0], [1e7, 0]];
  for (let round = 0; round < 3; round += 1) for (const [x, y] of seq) agree(fast, slow, x, y, `round ${round}`);
  // two fields do not share an index
  const other = buildHeightfield({ controlPoints: controlPoints.slice(0, 300) }).elevationAt;
  const otherSlow = referenceHeightfield({ controlPoints: controlPoints.slice(0, 300) });
  agree(other, otherSlow, 150000, 20000, "second field");
  agree(fast, slow, 150000, 20000, "first field again");
});

// ── THE COST: NEAR UNCHANGED, FAR CHEAP ──────────────────────────────────────
//
// A correctness test cannot tell a fast implementation from a slow one. This is
// deliberately loose (a shared machine under load must not turn a perf win into a
// red suite): the far search must beat a plain full scan over the same points by
// a wide margin, which only an index that skips most points can do. The measured
// numbers are in the PR. The margin guarded here is much smaller than the one
// measured, so a regression back to scanAll blows through it.
function fullScan(cps, K) {
  // a plain one-pass K selection (no sort), the cost of the old scanAll
  const bestD = new Float64Array(K), bestI = new Int32Array(K);
  return (x, y) => {
    let n = 0;
    for (let i = 0; i < cps.length; i += 1) {
      const dx = x - cps[i].x, dy = y - cps[i].y, d2 = dx * dx + dy * dy;
      if (n === K && !(d2 < bestD[K - 1])) continue;
      let j = n < K ? n : K - 1;
      while (j > 0 && d2 < bestD[j - 1]) { bestD[j] = bestD[j - 1]; bestI[j] = bestI[j - 1]; j -= 1; }
      bestD[j] = d2; bestI[j] = i;
      if (n < K) n += 1;
    }
    return bestD[0];
  };
}

test("far samples cost a fraction of a full scan, at a few thousand and tens of thousands of points", () => {
  // best of three runs each, so one noisy slice of a shared machine cannot decide it;
  // the margin is the smaller one measured (about 2.3x at 3,000 points, about 10x at
  // 30,000 against this plain scan; against the old ring walk plus scan it was 30x and 230x)
  for (const [n, margin, N] of [[3000, 1.5, 6000], [30000, 5, 1500]]) {
    const controlPoints = town(n, 101, 20000, 6);
    const f = buildHeightfield({ controlPoints }).elevationAt;
    const scan = fullScan(controlPoints, DIALS.idw_k);
    const pts = Array.from({ length: N }, (_, i) => { const a = i * 2.399963, R = 100000 + (i % 100) * 1000; return [Math.cos(a) * R, Math.sin(a) * R]; });
    f(pts[0][0], pts[0][1]);   // the lazy index is built by the first far sample; not timed
    let sink = 0, far = Infinity, full = Infinity;
    for (let rep = 0; rep < 3; rep += 1) {
      const t0 = performance.now();
      for (const [x, y] of pts) sink += f(x, y);
      far = Math.min(far, performance.now() - t0);
      const t1 = performance.now();
      for (const [x, y] of pts) sink += scan(x, y);
      full = Math.min(full, performance.now() - t1);
    }
    assert.ok(Number.isFinite(sink));
    assert.ok(far * margin < full, `n=${n}: ${N} far samples took ${far.toFixed(1)}ms; a plain full scan took ${full.toFixed(1)}ms`);
  }
});

// ══ WLD-144 DISPOSITION (Bevel, D25): THE GRID KEYS MUST NOT ALIAS ═══════════════
//
// `main` filed each cell under the number gx * 2^21 + gy. Past a cell index of
// 2^32 that number needs more than 53 bits, so a double rounds it and different
// cells share a key; the ring walk then reads one list twice and offers the same
// point more than once, which fills the K seats with copies and moves the answer.
// The cells are now filed by (gx, gy) exactly, and a sample whose cell index is
// too large for the ring loop to count in (past 2^52) goes to the occupied-cell
// search instead of looping forever. Both are corrections of existing `main`
// behaviour at coordinates no real sample reaches (the town's marks reach about
// 135 km, a cell index of about 400); everywhere else the answers are main's own
// bit for bit, which the kernel below is here to say.

// ── MAIN'S NUMERIC KERNEL, VERBATIM ──────────────────────────────────────────
// buildHeightfield, GRID_MIN_POINTS, GRID_KEY_SPAN and buildGrid exactly as they
// are in tools/world-engine.mjs at the pinned base (postmark-world 89d8cbd2, the
// main this PR started from), with only the `export` keyword removed. It needs no
// World import, no record and no fixture. The test after this block checks the
// copy against the pinned source whenever git can show it.
const MAIN_PIN = "89d8cbd235d62df94b5d6793433dade8cef665ff";
function mainKernel(DIALS) {
function buildHeightfield({ controlPoints, power = DIALS.idw_power, k = DIALS.idw_k }) {
  if (!controlPoints?.length) throw new Error("heightfield needs control points");
  const cps = controlPoints.map((c) => ({ x: c.x, y: c.y, h: c.h, id: c.id ?? null }));
  const K = Math.min(k, cps.length);
  // THE K NEAREST, WITHOUT SORTING THE WORLD TO FIND THEM.
  //
  // This function is the floor of the whole engine: line-of-sight samples it
  // along every ray, so opening one pair of eyes calls it tens of thousands of
  // times. It used to answer by building an object for EVERY control point,
  // sorting all of them, and keeping the first eight — O(n log n) work and n
  // allocations to select a constant 8. Profiling put 91% of openYourEyes in
  // here, and it was quietly superlinear in the size of the town, because the
  // control points are extracted from the marks: a town with 5× the marks has
  // 8× the control points, so every sample got dearer at the same time as there
  // were more samples to take. 743 marks → 1.3 s; 3,830 marks → 4.5 MINUTES.
  //
  // A fixed-size insertion beat is the whole fix. K is 8, so the inner shuffle
  // is a handful of moves and never grows; the scratch is hoisted out of the
  // call because allocating it per sample was a large share of the cost on its
  // own (the profiler's GC line). Answers are BIT-IDENTICAL to the sort — same
  // points, same order, same summation — and a test pins that against the
  // original implementation rather than against a remembered number.
  //
  // Ties keep the earlier control point, which is what the stable sort did: an
  // equal distance is decided by the index, so a latecomer never displaces the
  // point that was already holding the seat.
  const bestD2 = new Float64Array(K);
  const bestH = new Float64Array(K);
  const bestI = new Int32Array(K);
  let n = 0;
  // one candidate into the beat, ordered by (distance, index) — the index only
  // ever decides a tie, which the full scan below never meets out of order
  function offer(i, x, y) {
    const c = cps[i];
    const dx = x - c.x, dy = y - c.y;
    const d2 = dx * dx + dy * dy;
    if (n === K && !(d2 < bestD2[K - 1] || (d2 === bestD2[K - 1] && i < bestI[K - 1]))) return;   // cannot beat the worst held
    let j = n < K ? n : K - 1;
    while (j > 0 && (d2 < bestD2[j - 1] || (d2 === bestD2[j - 1] && i < bestI[j - 1]))) {
      bestD2[j] = bestD2[j - 1]; bestH[j] = bestH[j - 1]; bestI[j] = bestI[j - 1]; j -= 1;
    }
    bestD2[j] = d2; bestH[j] = c.h; bestI[j] = i;
    if (n < K) n += 1;
  }
  function weigh() {
    if (bestD2[0] === 0) return bestH[0];       // exactly on a control point
    let wsum = 0, hsum = 0;
    for (let i = 0; i < n; i += 1) { const w = 1 / Math.pow(bestD2[i], power / 2); wsum += w; hsum += w * bestH[i]; }
    return hsum / wsum;
  }
  function scanAll(x, y) {
    n = 0;
    for (let i = 0; i < cps.length; i += 1) offer(i, x, y);
    return weigh();
  }
  // ── A GRID OVER THE POINTS, SO A SAMPLE ASKS ITS NEIGHBOURS FIRST (POS-228) ──
  //
  // The beat above still visits every control point for every sample, and the
  // telling takes tens of thousands of samples; part 1's profile of the live
  // page put elevationAt at 9–14% of the main thread. So the points are
  // bucketed into square cells, and a sample walks rings of cells outward from
  // its own until the K it holds are CLOSER than anything a further ring could
  // contain — then stops. A sample far from every cell (the outliers sit 96 km
  // out) runs out of rings and takes the full scan, which is the old answer.
  //
  // THE ANSWER MUST NOT MOVE BY A BIT, and the reason it cannot is the stop
  // rule. A point left unvisited is at least the ring's edge away, and the
  // search only stops when the K-th distance held is strictly inside that edge
  // (with a margin for the edge's own rounding) — so every point that could sit
  // in the K, or tie with its last seat, was visited. Visiting order is by cell
  // rather than by index, so ties are broken on the INDEX explicitly: the same
  // (distance, index) order the stable sort kept, and the same order the full
  // scan's strict comparisons keep. heightfield-selection.test.mjs holds both
  // paths against the original sort.
  const grid = cps.length > GRID_MIN_POINTS && cps.every((c) => Number.isFinite(c.x) && Number.isFinite(c.y))
    ? buildGrid(cps, K) : null;
  function elevationAt(x, y) {
    if (!grid || !Number.isFinite(x) || !Number.isFinite(y)) return scanAll(x, y);
    const { size, cells, maxRing } = grid;
    const cx = Math.floor(x / size), cy = Math.floor(y / size);
    n = 0;
    for (let r = 0; r <= maxRing; r += 1) {
      for (let gx = cx - r; gx <= cx + r; gx += 1) {
        const edgeX = gx === cx - r || gx === cx + r;
        for (let gy = cy - r; gy <= cy + r; gy += (edgeX || r === 0) ? 1 : 2 * r) {
          const cell = cells.get(gx * GRID_KEY_SPAN + gy);
          if (cell) for (let m = 0; m < cell.length; m += 1) offer(cell[m], x, y);
        }
      }
      if (n < K) continue;
      // the nearest a point outside the rings walked so far can be, less a
      // hair for the rounding in the division that filed each point in a cell
      const edge = Math.min(x - (cx - r) * size, (cx + r + 1) * size - x, y - (cy - r) * size, (cy + r + 1) * size - y) - size * 1e-9;
      if (edge > 0 && bestD2[K - 1] < edge * edge) return weigh();
    }
    return scanAll(x, y);
  }
  return { elevationAt, controlPoints: cps };
}

const GRID_MIN_POINTS = 64;       // below this the full scan is already cheap
const GRID_KEY_SPAN = 1 << 21;    // cell (gx, gy) → one number key; a collision only merges two cells, never loses one
// The cell is sized off the middle half of the points (the interquartile box
// in x and in y), so the 96 km outliers cannot stretch it, to hold about K/4 of
// them — measured on the town's 627 points over twenty tellings, ~350 m cells
// ran 2.1–2.3× faster than the full scan, where 700 m and 240 m cells were
// slower. The rings stop once walking them would visit more cells than half the
// points: past that, the full scan is the cheaper way to the same answer.
function buildGrid(cps, K) {
  const iqr = (vals) => { const s = [...vals].sort((a, b) => a - b); return s[Math.floor(s.length * 0.75)] - s[Math.floor(s.length * 0.25)]; };
  const area = Math.max(1, iqr(cps.map((c) => c.x)) * iqr(cps.map((c) => c.y)));
  const size = Math.max(1, Math.sqrt((area * K) / cps.length));
  const maxRing = Math.max(2, Math.floor((Math.sqrt(cps.length / 2) - 1) / 2));
  const cells = new Map();
  for (let i = 0; i < cps.length; i += 1) {
    const key = Math.floor(cps[i].x / size) * GRID_KEY_SPAN + Math.floor(cps[i].y / size);
    let cell = cells.get(key);
    if (!cell) cells.set(key, (cell = []));
    cell.push(i);
  }
  return { size, cells, maxRing };
}
  return buildHeightfield;
}
const mainBuildHeightfield = mainKernel(DIALS);

test("the embedded main kernel is main's text (checked against the pinned source when git has it)", (t) => {
  let source;
  try { source = execFileSync("git", ["show", `${MAIN_PIN}:tools/world-engine.mjs`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
  catch { t.diagnostic(`the pinned base ${MAIN_PIN.slice(0, 8)} is not in this checkout; the embedded kernel was not compared`); return; }
  const start = source.indexOf("export function buildHeightfield(");
  const last = /^function buildGrid\([^\n]*\) \{/m.exec(source);
  const slice = source.slice(start, source.indexOf("\n}", last.index) + 2).replace("export function buildHeightfield", "function buildHeightfield");
  assert.ok(mainKernel.toString().includes(slice), "the embedded kernel is the pinned source, byte for byte");
});

// ── BEVEL'S CASE ─────────────────────────────────────────────────────────────
// A 100-unit cloud translated to x = 1e11, k = 8, power = 2, seed-1 generator
// (his reproduction, WLD-144-review-354-alias-repro.mjs). Invented points only.
function bevelCloud() {
  let seed = 1;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  return Array.from({ length: 100 }, (_, i) => ({ id: `probe-${i}`, x: 1e11 + 100 * random(), y: 100 * random(), h: 100 * random() }));
}

test("Bevel's translated cloud: the field answers what the sort answers, where main's aliased keys did not", () => {
  const controlPoints = bevelCloud();
  const [x, y] = [99999999966.26978, 18.36111723144477];
  const slow = referenceHeightfield({ controlPoints, k: 8, power: 2 });
  const fast = buildHeightfield({ controlPoints, k: 8, power: 2 }).elevationAt;
  const main = mainBuildHeightfield({ controlPoints, k: 8, power: 2 }).elevationAt;
  assert.equal(slow(x, y), 43.43058509395884, "the oracle's answer");
  assert.equal(Object.is(fast(x, y), slow(x, y)), true, `the field says ${fast(x, y)}`);
  assert.equal(main(x, y), 56.13266877711569, "main's answer, from the same point offered several times (the defect, kept here as the reason for this test)");
  // and from inside the cloud, where the near ring walk (not the far search) answers
  const u = rng(1234);
  let mainWrong = 0;
  for (let i = 0; i < 400; i += 1) {
    const sx = 1e11 + u() * 100, sy = u() * 100;
    agree(fast, slow, sx, sy, "inside Bevel's cloud");
    if (!Object.is(main(sx, sy), slow(sx, sy))) mainWrong += 1;
  }
  assert.ok(mainWrong > 0, "main's aliased keys do move answers inside such a cloud (else this case proves nothing)");
});

// ── TRANSLATED CLOUDS ────────────────────────────────────────────────────────

// a cloud of n points in a `width` box whose corner is at (ox, oy); coordinates are
// multiples of 1/8 so they are exact doubles at every offset up to 1e15
function cloudAt(n, width, ox, oy, seed) {
  const u = rng(seed);
  const q = (v) => Math.round(v * 8) / 8;
  return Array.from({ length: n }, (_, i) => ({ x: q(ox + u() * width), y: q(oy + u() * width), h: Math.round(u() * 4000) / 10, id: `q${i}` }));
}

test("translated clouds at 1e9, 1e11, 1e13 and 1e15 on x, on y and on both: samples inside, beside and outside are the sort's", () => {
  const before = checked;
  let fields = 0;
  for (const off of [1e9, 1e11, 1e13, 1e15]) {
    for (const [ox, oy] of [[off, 0], [0, off], [off, off], [-off, off]]) {
      for (const [n, width, k] of [[100, 100, 8], [300, 3000, 8], [90, 40, 3], [200, 800, 17]]) {
        const seed = Math.floor(off / 1e3 + n * 13 + width);
        const controlPoints = cloudAt(n, width, ox, oy, seed);
        const fast = buildHeightfield({ controlPoints, k }).elevationAt;
        const slow = referenceHeightfield({ controlPoints, k });
        const u = rng(seed + 7);
        for (let i = 0; i < 180; i += 1) {
          const r = u();
          let x, y;
          if (r < 0.40) { x = ox + u() * width; y = oy + u() * width; }                                              // inside
          else if (r < 0.55) { const c = controlPoints[Math.floor(u() * n)]; x = c.x; y = c.y; }                    // on a point
          else if (r < 0.70) { const c = controlPoints[Math.floor(u() * n)]; x = c.x + (u() - 0.5) * 8; y = c.y + (u() - 0.5) * 8; }   // beside one
          else if (r < 0.85) { x = ox + (u() - 0.5) * width * 3 + width / 2; y = oy + (u() - 0.5) * width * 3 + width / 2; }          // in and just outside
          else if (r < 0.95) { const a = u() * 2 * Math.PI, R = width * (2 + u() * 200); x = ox + width / 2 + Math.cos(a) * R; y = oy + width / 2 + Math.sin(a) * R; }   // far from it
          else { x = (u() - 0.5) * 2e5; y = (u() - 0.5) * 2e5; }                                                    // back at the town's own scale
          agree(fast, slow, x, y, `cloud at (${ox}, ${oy}) n=${n} width=${width} k=${k}`);
        }
        fields += 1;
      }
    }
  }
  assert.ok(fields === 64 && checked - before === 64 * 180, `${checked - before} samples over ${fields} translated fields`);
});

// ── MAIN'S OWN ANSWERS, WHERE ITS KEYS DO NOT ALIAS ──────────────────────────

test("on every field main answered correctly the field is main's answer to the bit (main's kernel run beside it)", () => {
  const before = checked;
  const shapes = [
    () => town(65, 201, 4000, 2), () => town(300, 202, 9000, 3), () => town(900, 203, 14000, 5), () => town(2500, 204, 30000, 6),
    () => cloudAt(120, 500, 25000, -40000, 205), () => cloudAt(400, 6000, 1e6, 1e6, 206),
    () => cloudAt(150, 100, 1e9, 0, 207),                       // 1e9 on x: a cell index of about 7e7, still under 2^32
  ];
  let fields = 0;
  for (const make of shapes) {
    const controlPoints = make();
    for (const [k, power] of [[8, 2], [1, 2], [3, 1], [17, 3], [8, 4]]) {
      const fast = buildHeightfield({ controlPoints, k, power }).elevationAt;
      const main = mainBuildHeightfield({ controlPoints, k, power }).elevationAt;
      const xs = controlPoints.map((c) => c.x), ys = controlPoints.map((c) => c.y);
      const lo = [Math.min(...xs), Math.min(...ys)], hi = [Math.max(...xs), Math.max(...ys)];
      const u = rng(k * 1000 + power + fields);
      for (let i = 0; i < 400; i += 1) {
        const r = u();
        let x, y;
        if (r < 0.4) { x = lo[0] + u() * (hi[0] - lo[0]); y = lo[1] + u() * (hi[1] - lo[1]); }
        else if (r < 0.55) { const c = controlPoints[Math.floor(u() * controlPoints.length)]; x = c.x; y = c.y; }
        else if (r < 0.75) { x = lo[0] + (u() * 3 - 1) * (hi[0] - lo[0]); y = lo[1] + (u() * 3 - 1) * (hi[1] - lo[1]); }
        else if (r < 0.95) { const a = u() * 2 * Math.PI, R = 20000 + u() * 180000; x = (lo[0] + hi[0]) / 2 + Math.cos(a) * R; y = (lo[1] + hi[1]) / 2 + Math.sin(a) * R; }
        else { x = Math.round(lo[0] + u() * (hi[0] - lo[0])); y = Math.round(lo[1] + u() * (hi[1] - lo[1])); }
        agree(fast, main, x, y, `against main: field ${fields} k=${k} power=${power}`);
      }
      fields += 1;
    }
  }
  assert.ok(fields === 35 && checked - before === 35 * 400, `${checked - before} samples compared with main's kernel over ${fields} fields`);
});

// ── NO CANDIDATE OFFERED TWICE (Bevel, 17:33Z) ───────────────────────────────
//
// "Not aliased" has to hold for the cells the ring walk LOOKS UP as well as the
// cells that are stored: a repeated lookup key repeats a candidate even when the
// stored cells are distinct. So this runs a copy of the engine in which every
// call to `offer` is counted per index, and the count is reset whenever the beat
// is emptied (a sample that is handed from the ring walk to the far search starts
// a fresh beat, which is how it has always started the scan, so a point may be
// offered again after that reset and is not deduplicated across it). Within a beat,
// no index may be offered twice, and the K held at the end holds no index twice. The copy is made from the engine's own text with
// three lines of hooks added, in a temp folder; nothing is written to the repo.
function hooked(source, { beats, far }) {
  const count = (re, text) => (text.match(re) ?? []).length;
  assert.equal(count(/^ {2}function offer\(i, x, y\) \{$/gm, source), 1, "one offer");
  assert.equal(count(/^ {2}function weigh\(\) \{$/gm, source), 1, "one weigh");
  assert.equal(count(/^ {4}n = 0;$/gm, source), beats, "the places the beat is emptied (scan, ring walk, and the far search where there is one)");
  assert.equal(count(/^ {2}function farSearch\(x, y\) \{$/gm, source), far, "the far search, where there is one");
  return source
    .replace(/^ {2}function offer\(i, x, y\) \{$/m, (m) => `${m}\n    globalThis.__hf.offer(i);`)
    .replace(/^ {2}function weigh\(\) \{$/m, (m) => `${m}\n    globalThis.__hf.held(bestI, n);`)
    .replace(/^ {4}n = 0;$/gm, (m) => `${m} globalThis.__hf.beat();`)
    .replace(/^ {2}function farSearch\(x, y\) \{$/m, (m) => `${m}\n    globalThis.__hf.far();`);
}
const hf = { seen: new Set(), repeats: 0, heldRepeats: 0, offers: 0, far: 0, beats: 0, held(idx, k) { if (new Set(Array.from(idx).slice(0, k)).size !== k) this.heldRepeats += 1; }, offer(i) { this.offers += 1; if (this.seen.has(i)) this.repeats += 1; this.seen.add(i); }, beat() { this.seen = new Set(); this.beats += 1; }, farCall() { this.far += 1; } };
globalThis.__hf = { offer: (i) => hf.offer(i), beat: () => hf.beat(), far: () => hf.farCall(), held: (idx, k) => hf.held(idx, k) };
function hfReset() { hf.seen = new Set(); hf.repeats = 0; hf.heldRepeats = 0; hf.offers = 0; hf.far = 0; hf.beats = 0; }

async function hookedHead() {
  const here = new URL(".", import.meta.url);
  const dir = mkdtempSync(join(tmpdir(), "hf-far-"));
  const file = join(dir, "world-engine.hooked.mjs");
  try {
    const source = readFileSync(new URL("./world-engine.mjs", here), "utf8").replace(/from "\.\/([a-z-]+\.mjs)"/g, (m, f) => `from ${JSON.stringify(new URL(`./${f}`, here).href)}`);
    writeFileSync(file, hooked(source, { beats: 3, far: 1 }));
    return (await import(pathToFileURL(file).href)).buildHeightfield;
  } finally { try { unlinkSync(file); rmdirSync(dir); } catch { /* the temp folder is the OS's to sweep */ } }
}
function hookedMain() {
  const patched = hooked(mainKernel.toString(), { beats: 2, far: 0 });
  return (0, eval)(`(${patched})`)(DIALS);
}

test("in any one beat no candidate index is offered twice: near and far paths, ordinary fields and translated clouds", async () => {
  const build = await hookedHead();
  const fields = [];
  for (const [n, seed, spread] of [[65, 1, 3000], [300, 2, 9000], [1500, 3, 20000]]) fields.push({ name: `town ${n}`, controlPoints: town(n, seed, spread, 3) });
  fields.push({ name: "lattice with duplicates", controlPoints: [...Array.from({ length: 400 }, (_, i) => ({ x: (i % 20) * 50, y: Math.floor(i / 20) * 50, h: i })), ...Array.from({ length: 60 }, (_, i) => ({ x: 250, y: 250, h: 900 + i }))] });
  for (const off of [1e4, 1e6, 1e7, 1e9, 1e11, 1e13, 1e15]) for (const [ox, oy] of [[off, 0], [0, off], [off, off], [-off, -off]]) fields.push({ name: `cloud at ${ox},${oy}`, ox, oy, controlPoints: cloudAt(150, 400, ox, oy, 19) });
  let samples = 0, nearAnswers = 0;
  hfReset();
  for (const { name, controlPoints, ox = 0, oy = 0 } of fields) {
    const f = build({ controlPoints }).elevationAt;
    const slow = referenceHeightfield({ controlPoints });
    const u = rng(controlPoints.length * 31 + 5);
    const xs = controlPoints.map((c) => c.x), ys = controlPoints.map((c) => c.y);
    const lo = [Math.min(...xs), Math.min(...ys)], hi = [Math.max(...xs), Math.max(...ys)];
    for (let i = 0; i < 700; i += 1) {
      const r = u();
      let x, y;
      if (r < 0.45) { x = lo[0] + u() * (hi[0] - lo[0]); y = lo[1] + u() * (hi[1] - lo[1]); }
      else if (r < 0.6) { const c = controlPoints[Math.floor(u() * controlPoints.length)]; x = c.x; y = c.y; }
      else if (r < 0.8) { x = lo[0] + (u() * 3 - 1) * (hi[0] - lo[0]); y = lo[1] + (u() * 3 - 1) * (hi[1] - lo[1]); }
      else if (r < 0.95) { const a = u() * 2 * Math.PI, R = 30000 + u() * 170000; x = (lo[0] + hi[0]) / 2 + Math.cos(a) * R; y = (lo[1] + hi[1]) / 2 + Math.sin(a) * R; }
      else { x = ox + (u() - 0.5) * 1e5; y = oy + (u() - 0.5) * 1e5; }
      const farBefore = hf.far, repeatsBefore = hf.repeats;
      const a = f(x, y);
      samples += 1;
      if (hf.far === farBefore) nearAnswers += 1;
      if (hf.repeats !== repeatsBefore) assert.fail(`${name}: a candidate was offered twice in one beat at (${x}, ${y})`);
      if (hf.heldRepeats) assert.fail(`${name}: the held K has a repeated index at (${x}, ${y})`);
      if (!Object.is(a, slow(x, y))) assert.fail(`${name}: the hooked engine disagrees with the sort at (${x}, ${y})`);
    }
  }
  assert.ok(samples >= 20000 && nearAnswers > 3000 && hf.far > 3000, `${samples} samples: ${nearAnswers} answered by the ring walk, ${hf.far} by the far search, ${hf.offers} offers, ${hf.repeats} repeats, ${hf.heldRepeats} held sets with a repeat`);
});

test("the offer counter can fail: main's kernel, counted the same way, offers one point repeatedly in Bevel's cloud", () => {
  const build = hookedMain();
  const controlPoints = bevelCloud();
  const f = build({ controlPoints, k: 8, power: 2 }).elevationAt;
  hfReset();
  f(99999999966.26978, 18.36111723144477);
  const bevel = hf.repeats;
  hfReset();
  const u = rng(4);
  for (let i = 0; i < 200; i += 1) f(1e11 + u() * 100, u() * 100);
  assert.ok(bevel > 0 && hf.repeats > 100 && hf.heldRepeats > 100, `main repeated ${bevel} candidates at Bevel's sample, ${hf.repeats} over 200 inside samples, ${hf.heldRepeats} held sets with a repeat`);
  // and the same counter on main where its keys are exact sees nothing
  const g = build({ controlPoints: town(300, 8, 6000, 2) }).elevationAt;
  hfReset();
  for (let i = 0; i < 300; i += 1) g((u() - 0.5) * 8000, (u() - 0.5) * 8000);
  assert.equal(hf.repeats + hf.heldRepeats, 0, "main's own walk offers each index once where its keys do not alias");
});

// ── CELL INDEXES AT THE RING LIMIT, AND PAST 2^53: ONE CHILD PROCESS EACH ─────
//
// A ring loop that cannot count (gx + 1 === gx past 2^53) never returns, and a
// hang inside a test hangs the suite. So these cases run in a child node process
// with a hard timeout: a hang fails the test. The child builds the cloud, answers
// samples inside it, just outside it and far from it, and compares each with the
// sort's answer; the parent checks nothing came back different.
const CHILD = `
const { buildHeightfield } = await import(process.env.HF_ENGINE);
${rng.toString()}
${cloudAt.toString()}
${referenceHeightfield.toString()}
const spec = JSON.parse(process.env.HF_CASE);
const controlPoints = spec.controlPoints;
const f = buildHeightfield({ controlPoints, k: 8, power: 2 }).elevationAt;
const slow = referenceHeightfield({ controlPoints, k: 8, power: 2 });
let bad = 0, first = null;
for (const [x, y] of spec.samples) { const a = f(x, y), b = slow(x, y); if (!Object.is(a, b)) { bad += 1; first ??= [x, y, a, b]; } }
console.log(JSON.stringify({ total: spec.samples.length, bad, first }));
`;

function runChild(spec, timeoutMs = 30000) {
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", CHILD], {
    encoding: "utf8", timeout: timeoutMs, killSignal: "SIGKILL", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, HF_ENGINE: new URL("./world-engine.mjs", import.meta.url).href, HF_CASE: JSON.stringify(spec) },
  });
  return JSON.parse(out.trim().split("\n").pop());
}

test("cell indexes at the ring limit (2^19) and on to 2^64, inside, beside and far from the occupied span: each terminates and equals the sort", () => {
  const cases = [];
  for (const c of [2 ** 19 - 3, 2 ** 19 + 3, 2 ** 24, 2 ** 32 - 2, 2 ** 32 + 2, 2 ** 52 - 1000, 2 ** 53 - 1000, 2 ** 53 - 1, 2 ** 53, 2 ** 53 + 1000, 2 ** 54, 2 ** 60, 2 ** 64]) {
    for (const axes of ["x", "y", "xy"]) cases.push([c, axes]);
  }
  for (const [c, axes] of cases) {
    const base = cloudAt(128, 64, 0, 0, 3);
    const size = cellSize(base, 8);
    const ox = axes.includes("x") ? c * size : 0, oy = axes.includes("y") ? c * size : 0;
    const controlPoints = base.map((p) => ({ ...p, x: p.x + ox, y: p.y + oy }));
    const u = rng(c % 1e6 + axes.length);
    const samples = [];
    for (const p of controlPoints.slice(0, 20)) samples.push([p.x, p.y]);                                              // on a point
    for (let i = 0; i < 60; i += 1) samples.push([ox + u() * 64, oy + u() * 64]);                                      // inside the cloud
    for (let i = 0; i < 40; i += 1) samples.push([ox + (u() - 0.5) * 64 * 30, oy + (u() - 0.5) * 64 * 30]);            // beside it, a few cells to hundreds of cells off
    for (const d of [-1e6, 1e6]) samples.push([ox + d, oy + d], [ox + d, oy], [ox, oy + d]);                           // outside the span
    samples.push([0, 0], [-ox, -oy], [ox * 2, oy * 2], [ox / 2, oy / 2], [ox, 0], [0, oy]);                            // elsewhere on the plane
    const r = runChild({ controlPoints, samples });
    assert.equal(r.bad, 0, `cell index ${c} on ${axes}: ${r.bad} of ${r.total} differ from the sort, first ${JSON.stringify(r.first)}`);
  }
});

test("a child that does not return fails its test (the harness itself)", () => {
  // the control for the isolation: a child that sleeps past its timeout must throw
  assert.throws(() => execFileSync(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { timeout: 700, killSignal: "SIGKILL", stdio: "ignore" }), (e) => e.code === "ETIMEDOUT");
});

test("samples whose cell index straddles the ring limit are the sort's, and main's where main's keys are exact", () => {
  // cells of about 12 m: x from 2^19 cells less to 2^19 cells more
  for (const [n, width] of [[100, 100], [300, 3000]]) {
    const base = cloudAt(n, width, 0, 0, 29);
    const size = cellSize(base, 8);
    for (const mult of [0.97, 0.999, 1, 1.001, 1.03]) {
      const ox = mult * 2 ** 19 * size, oy = -mult * 2 ** 19 * size;
      const controlPoints = base.map((p) => ({ ...p, x: Math.round((p.x + ox) * 8) / 8, y: Math.round((p.y + oy) * 8) / 8 }));
      const fast = buildHeightfield({ controlPoints }).elevationAt;
      const slow = referenceHeightfield({ controlPoints });
      const main = mainBuildHeightfield({ controlPoints }).elevationAt;
      const u = rng(n + Math.round(mult * 1000));
      for (let i = 0; i < 400; i += 1) {
        const x = ox + (u() * 1.6 - 0.3) * width, y = oy + (u() * 1.6 - 0.3) * width;
        agree(fast, slow, x, y, `ring limit mult=${mult} n=${n}`);
        agree(fast, main, x, y, `ring limit against main mult=${mult} n=${n}`);   // main's keys are exact here (index far under 2^32)
      }
    }
  }
});

test("a cloud collapsed onto few doubles at 4e15 m: the stop rule's margin is gone there, so the field must not walk rings", () => {
  // at 4e15 the doubles are half a metre apart: 80 points in a 10 m box fall on 20
  // x values, the cell is the 1 m minimum, and the rounding in the ring walk's edge
  // (about the size of a cell) is far past its 1e-9-of-a-cell margin. Walking rings
  // here answers wrongly in about 1 sample in 200 (measured with the walk allowed up
  // to 2^52); the ring limit sends these to the occupied-cell search, which is exact.
  const u = rng(80);
  const q = (v) => Math.round(v * 8) / 8;
  const controlPoints = Array.from({ length: 80 }, () => { const p = { x: q(4e15 + u() * 10), y: q(4e15 + u() * 10), h: u() * 100 }; return p; });
  const fast = buildHeightfield({ controlPoints }).elevationAt;
  const slow = referenceHeightfield({ controlPoints });
  for (let i = 0; i < 6000; i += 1) agree(fast, slow, 4e15 + u() * 14 - 2, 4e15 + u() * 14 - 2, "collapsed cloud");
});

test("the file compared a great many samples against the sort", (t) => {
  t.diagnostic(`${checked} samples compared bit for bit (Object.is) against the stable-sort oracle`);
  assert.ok(checked > 100000, `only ${checked} samples were compared`);
});
