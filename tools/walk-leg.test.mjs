#!/usr/bin/env node
// walk-leg.test.mjs — remainingWalkLeg (spectator/viewer.mjs), the one place the
// REMAINING leg of a walk is decided, and the 2D walk paths that now read it.
//   node --test tools/walk-leg.test.mjs
//
// WLD-144 (campaign postmark-3d, W4), on WLD-105's "no copies". 3D's trails used
// to keep their own copy of the core of walkPathsSVG; the helper is that core,
// exported. Bevel's condition (2026-11-02): it is the existing REMAINING segment,
// positionAt(departure, at) → departure.toward, never origin → position, and the
// 2D drawing must come out byte-for-byte as it did.
//
// ── WHAT HOLDS THE "NOTHING CHANGED" CLAIM ─────────────────────────────────
//
// walkPathsSVG is a closure inside mountViewer, so it cannot be called from
// outside. Two oracles stand in for it, both from World main 82e23532 (the base
// of this change), and both are invented-input only:
//
//   OLD_LEG        the inline guard + pair the closure computed before.
//   oldWalkPathsSVG  the closure's body as it stood on 82e23532, copied
//                  line for line (only its dependencies are passed in).
//
// And the NEW side is not a second copy: the test cuts the real `function
// walkPathsSVG() {…}` out of viewer.mjs as it is on this branch and runs THAT,
// with the same stubbed dependencies and the real exports. So a change to the
// closure in viewer.mjs is a change to what these tests run.
//
// The tests that read invented data only; no fixture file, no world state.
//
// ── THE CAN-FAIL FLIPS (each was run; see the PR body) ─────────────────────
//
//   drop `|| here.standing`  in remainingWalkLeg  → the standing cases red
//   drop `here.arrived ||`   in remainingWalkLeg  → the at-arrival / after cases red
//   `from: departure.from`   in remainingWalkLeg  → the direction cases and SVG red
//   swap leg.from / leg.to   in walkPathsSVG       → the SVG comparison reds
//   `window.x;` at viewer.mjs top level            → the import-purity test reds

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { currentDeparture, positionAt } from "./walk.mjs";
import { clipSegmentToBox, remainingWalkLeg } from "../spectator/viewer.mjs";

const VIEWER = join(dirname(fileURLToPath(import.meta.url)), "..", "spectator", "viewer.mjs");

// viewer.mjs's own escaper (its line 66), which the closure uses and does not export.
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── the oracles, from 82e23532 ─────────────────────────────────────────────

/** What the closure computed inline before: the guard, then the pair it clipped. */
function OLD_LEG(departure, at) {
  const now_ = positionAt(departure, at);
  if (!now_ || now_.arrived || now_.standing) return null;   // a finished walk is not a path
  return { from: now_, to: departure.toward };
}

/** walkPathsSVG exactly as 82e23532 had it; the closure's captures come in as `d`. */
function oldWalkPathsSVG(d) {
  const { mapCtx, departures, state, walkState, faceOf } = d;
  if (!mapCtx || !departures.length) return "";
  const handles = state.whoami?.handles ?? [];
  if (!handles.length) return "";
  const { originPx, mPerPx, full } = mapCtx;
  const box = {
    minX: (full.x - originPx.x) * mPerPx,
    minY: (full.y - originPx.y) * mPerPx,
    maxX: (full.x + full.w - originPx.x) * mPerPx,
    maxY: (full.y + full.h - originPx.y) * mPerPx,
  };
  const now = Number.isFinite(walkState.at) ? walkState.at : undefined;
  const px = (m) => ({ x: originPx.x + m.x / mPerPx, y: originPx.y + m.y / mPerPx });
  let s = "";
  for (const handle of handles) {
    const departure = currentDeparture(departures, handle);
    if (!departure) continue;
    const now_ = positionAt(departure, now);
    if (!now_ || now_.arrived || now_.standing) continue;   // a finished walk is not a path
    const seg = clipSegmentToBox(now_, departure.toward, box);
    if (!seg) continue;                                      // all of it is off the sheet
    const a = px(seg.from), b = px(seg.to);
    const colour = faceOf(handle).color ?? "#bfe4c6";
    s += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="wv-walk-path"`
      + ` stroke="${esc(colour)}" data-handle="${esc(handle)}"/>`;
  }
  return s;
}

// ── the new closure, cut out of viewer.mjs as it is on this branch ─────────

const SRC = readFileSync(VIEWER, "utf8");
const OPEN = "  function walkPathsSVG() {\n";
function closureSource() {
  const start = SRC.indexOf(OPEN);
  assert.ok(start >= 0, "viewer.mjs still has the walkPathsSVG closure");
  assert.equal(SRC.indexOf(OPEN, start + 1), -1, "exactly one walkPathsSVG closure");
  const end = SRC.indexOf("\n  }\n", start);
  assert.ok(end > start, "the closure ends where the cut expects");
  return SRC.slice(start, end + 4);
}
const NEW_SRC = closureSource();

/** The branch's real closure, built over the same kind of captures. */
function newWalkPathsSVG(d) {
  const make = new Function(
    "d",
    "const { mapCtx, departures, state, walkState, faceOf, esc, currentDeparture, positionAt, clipSegmentToBox, remainingWalkLeg } = d;\n"
    + NEW_SRC + "\nreturn walkPathsSVG();",
  );
  return make({ ...d, esc, currentDeparture, positionAt, clipSegmentToBox, remainingWalkLeg });
}

// ── invented inputs ────────────────────────────────────────────────────────
//
// pace 2 = 2,000 m per crossing, so the numbers are readable. A walk that starts
// at crossing 5 from (0,0) toward (4000,0) is 2 crossings long.

const dep = (o) => ({ handle: "ada", from: { x: 0, y: 0 }, toward: { x: 4000, y: 0 }, at: 5, targetExtent: null, pace: 2, ...o });

const CASES = {
  "mid-walk": [dep({}), 5.5],
  "before the start (the clock is behind the departure)": [dep({}), 3],
  "at the start exactly": [dep({}), 5],
  "one tick before arrival": [dep({}), 6.999],
  "at arrival": [dep({}), 7],
  "after arrival": [dep({}), 9],
  "a standing walker (toward is from)": [dep({ toward: { x: 0, y: 0 } }), 6],
  "a walk to a box, short of its edge": [dep({ targetExtent: { w: 1000, h: 1000 } }), 6.4],
  "a walk to a box, inside its ground (arrived by containment)": [dep({ targetExtent: { w: 1000, h: 1000 } }), 6.8],
  "a walk begun off the sheet (the seeding origin)": [dep({ from: { x: -94570, y: -94570 }, toward: { x: -30, y: 40 }, pace: undefined }), 5.5],
  "a diagonal, down and left": [dep({ from: { x: 3000, y: 2000 }, toward: { x: -500, y: -250 } }), 5.3],
  "a start already on the target's ground (arrived and standing)": [dep({ targetExtent: { w: 10000, h: 10000 } }), 6],
  // positionAt calls this standing and NOT arrived: the one way the two guards differ
  "a start on the target's ground under a NaN clock (standing, not arrived)": [dep({ targetExtent: { w: 10000, h: 10000 } }), NaN],
  "a non-finite toward (positionAt answers NaN, no leg is drawn)": [dep({ toward: { x: NaN, y: 0 } }), 5.5],
  "no departure at all": [null, 5.5],
};

test("remainingWalkLeg answers exactly what the closure computed inline, on every invented case", () => {
  for (const [name, [departure, at]] of Object.entries(CASES)) {
    const was = OLD_LEG(departure, at);
    const now = remainingWalkLeg(departure, at);
    assert.deepEqual(now, was, name);
    if (was) assert.equal(now.to, departure.toward, `${name}: to IS the departure's toward, not a copy`);
  }
});

test("the leg is the REMAINING segment: here → toward, never origin → here", () => {
  const d = dep({});
  const leg = remainingWalkLeg(d, 5.5);          // 0.5 crossing of 2,000 m = 1,000 m along
  assert.equal(leg.from.x, 1000);
  assert.equal(leg.from.y, 0);
  assert.deepEqual(leg.to, { x: 4000, y: 0 });
  assert.notDeepEqual({ x: leg.from.x, y: leg.from.y }, d.from, "it does not start at the origin");
  // before the start the walker is still at the origin, so the remaining leg is the whole walk
  const whole = remainingWalkLeg(d, 3);
  assert.deepEqual({ x: whole.from.x, y: whole.from.y }, { x: 0, y: 0 });
  assert.deepEqual(whole.to, { x: 4000, y: 0 });
});

test("no leg when there is nothing left to walk: arrived, standing, or no departure", () => {
  assert.equal(remainingWalkLeg(dep({}), 7), null, "arrived on the dot");
  assert.equal(remainingWalkLeg(dep({}), 99), null, "long arrived");
  assert.equal(remainingWalkLeg(dep({ toward: { x: 0, y: 0 } }), 6), null, "standing");
  const onGround = dep({ targetExtent: { w: 10000, h: 10000 } });
  assert.equal(positionAt(onGround, NaN).arrived, false, "(premise) the NaN clock leaves it not arrived…");
  assert.equal(positionAt(onGround, NaN).standing, true, "…but standing");
  assert.equal(remainingWalkLeg(onGround, NaN), null, "standing alone is enough for no leg");
  assert.equal(remainingWalkLeg(null, 6), null, "no departure");
  assert.equal(remainingWalkLeg(undefined, 6), null, "no departure (undefined)");
  assert.ok(remainingWalkLeg(dep({}), 6.9), "and a walk with ground left still has one");
});

test("a departure with no toward fails exactly as the inline logic failed (no new tolerance)", () => {
  const broken = dep({ toward: undefined });
  const caught = (f) => { try { f(); } catch (e) { return `${e.name}: ${e.message}`; } return null; };
  const was = caught(() => OLD_LEG(broken, 5.5));
  assert.ok(was, "the old logic throws on a departure with no toward (positionAt reads it)");
  assert.equal(caught(() => remainingWalkLeg(broken, 5.5)), was);
});

// ── the SVG, old against new ───────────────────────────────────────────────

// a painting 10,000 m across: origin pixel (100,100), 10 m a pixel, 1000 px a side
const mapCtx = { originPx: { x: 100, y: 100 }, mPerPx: 10, full: { x: 0, y: 0, w: 1000, h: 1000 } };
const FACES = { ada: { color: "#ff8800" }, bo: {}, cy: { color: `#"><x` }, dee: { color: "#112233" } };
const faceOf = (h) => FACES[h] ?? {};

function inputs(over = {}) {
  return {
    mapCtx,
    departures: [
      dep({ handle: "ada" }),
      dep({ handle: "bo", from: { x: 100, y: 3000 }, toward: { x: 5000, y: 3000 } }),
      dep({ handle: "cy", from: { x: 2000, y: 2000 }, toward: { x: 2000, y: -3000 } }),
      dep({ handle: "dee", from: { x: -94570, y: -94570 }, toward: { x: -30, y: 40 }, pace: undefined }),
      dep({ handle: "eli", from: { x: 10, y: 10 }, toward: { x: 10, y: 10 } }),
    ],
    state: { whoami: { handles: ["ada", "bo", "cy", "dee", "eli", "nobody-recorded"] } },
    walkState: { at: 5.5 },
    faceOf,
    ...over,
  };
}

function same(name, d, { expectLines } = {}) {
  const was = oldWalkPathsSVG(d), now = newWalkPathsSVG(d);
  assert.equal(now, was, `${name}: the SVG is byte-for-byte what 82e23532 drew`);
  if (expectLines !== undefined) assert.equal((was.match(/<line /g) ?? []).length, expectLines, `${name}: line count`);
  return now;
}

test("the new walkPathsSVG draws byte-equal SVG to the base's, on invented households", () => {
  const svg = same("mid-walk", inputs(), { expectLines: 4 });
  assert.match(svg, /data-handle="ada"/);
  assert.ok(!svg.includes('data-handle="eli"'), "the standing walker draws no line");
  assert.ok(!svg.includes("nobody-recorded"), "a handle with no departure draws no line");
  assert.ok(svg.includes("&quot;&gt;&lt;x"), "colour and handle still go through esc");

  same("before every start", inputs({ walkState: { at: 1 } }), { expectLines: 4 });
  same("everyone has arrived", inputs({ walkState: { at: 99 } }), { expectLines: 0 });
  same("a different instant", inputs({ walkState: { at: 6.25 } }), { expectLines: 4 });
  // the departure begins in the far future, so even positionAt's default clock (walkState.at not finite) is deterministic: still at the origin
  const future = { departures: [dep({ at: 1e9 })], state: { whoami: { handles: ["ada"] } } };
  same("no walk clock (at not finite)", inputs({ ...future, walkState: { at: NaN } }), { expectLines: 1 });
  same("no walk clock (at missing)", inputs({ ...future, walkState: {} }), { expectLines: 1 });
});

test("the new walkPathsSVG keeps the closure's early exits and its latest-departure-wins eligibility", () => {
  same("no map yet", inputs({ mapCtx: null }), { expectLines: 0 });
  same("no departures", inputs({ departures: [] }), { expectLines: 0 });
  same("no handles", inputs({ state: { whoami: { handles: [] } } }), { expectLines: 0 });
  same("no whoami", inputs({ state: {} }), { expectLines: 0 });
  // the latest departure per handle governs: ada's first walk is over, her second is under way
  const twice = inputs({
    departures: [dep({ handle: "ada", at: 1 }), dep({ handle: "ada", at: 5, toward: { x: 0, y: 4000 } })],
    state: { whoami: { handles: ["ada"] } },
  });
  const svg = same("latest wins", twice, { expectLines: 1 });
  assert.match(svg, /y2="500"/, "drawn toward the second departure's (0, 4000): 100 + 4000/10 = 500");
  // only the listed handles are drawn, in the listed order
  const order = same("handle order", inputs({ state: { whoami: { handles: ["cy", "ada"] } } }), { expectLines: 2 });
  assert.ok(order.indexOf('data-handle="cy"') < order.indexOf('data-handle="ada"'));
  // a household that holds no walker of anyone else's
  same("a stranger's handle", inputs({ state: { whoami: { handles: ["stranger"] } } }), { expectLines: 0 });
});

test("the new walkPathsSVG clips and projects as before (a walk from off the sheet, a leg wholly off it)", () => {
  const onlyDee = same("seeding origin", inputs({ state: { whoami: { handles: ["dee"] } } }), { expectLines: 1 });
  const m = onlyDee.match(/x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/);
  for (const v of m.slice(1).map(Number)) assert.ok(v >= 0 && v <= 1000, `clipped inside the painting: ${v}`);
  const off = inputs({
    departures: [dep({ from: { x: 20000, y: 20000 }, toward: { x: 30000, y: 20000 }, pace: 100 })],
    state: { whoami: { handles: ["ada"] } },
  });
  same("wholly off the sheet", off, { expectLines: 0 });
  same("a coloured walker", inputs({ state: { whoami: { handles: ["ada"] } } }), { expectLines: 1 });
  same("the default colour", inputs({ state: { whoami: { handles: ["bo"] } } }), { expectLines: 1 });
});

test("the cut-out closure really is the one that calls remainingWalkLeg", () => {
  assert.match(NEW_SRC, /remainingWalkLeg\(departure, now\)/);
  assert.match(NEW_SRC, /clipSegmentToBox\(leg\.from, leg\.to, box\)/);
  // and the inline guard is gone from it: one copy of the rule, in the helper
  assert.doesNotMatch(NEW_SRC, /\.arrived|\.standing|positionAt\(/);
});

// ── import purity ──────────────────────────────────────────────────────────

test("importing viewer.mjs touches no window or document", () => {
  const script = `
    for (const k of ["window", "document"]) {
      Object.defineProperty(globalThis, k, { configurable: true, get() { throw new Error("import touched " + k); } });
    }
    const m = await import(${JSON.stringify(pathToFileURL(VIEWER).href)});
    if (typeof m.remainingWalkLeg !== "function") throw new Error("remainingWalkLeg is not exported");
    // and the helper itself runs with them still booby-trapped
    const leg = m.remainingWalkLeg({ from: { x: 0, y: 0 }, toward: { x: 4000, y: 0 }, at: 5, targetExtent: null, pace: 2 }, 5.5);
    if (!leg || leg.from.x !== 1000) throw new Error("helper answered wrongly");
    console.log("pure");
  `;
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
  assert.equal(out.trim(), "pure");
});
