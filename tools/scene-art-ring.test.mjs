// scene-art-ring.test.mjs — a ringed mark wears its picture in its ring at street zoom (POS-662).
//
//   node --test tools/scene-art-ring.test.mjs
//
// Darko 2026-10-16 20:47 on prod: "ringed marks like errant/black-water-pool don't
// draw cropped to their ring". The far and mid tiers hang a picture through
// placedArtSVG, whose caller hands it the ring; the street-zoom pass
// (sceneArtSVG) painted the whole extent rectangle, so errant/the-unfinished-
// margin's 14-point shore showed as a 1300 × 255 m box over the sea. Both written
// forms of a ring reach the page as one array (the fold parses `[[x,y]…]` and
// "x,y x,y"), and polygonOf is the one ring reader after it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRecord } from "./marks-fold.mjs";
import { polygonOf } from "./geometry.mjs";
import { sceneArtSVG } from "../spectator/viewer.mjs";

const IMAGE = "https://media.postmark.town/media/errant/pool.png";
const record = (points) => parseRecord(`---
kind: sited
by: errant
date: 2026-10-09T14:09:05.061Z
at: { x: 2245, y: 5651.5 }
extent: { w: 230, h: 87 }
points: ${points}
image: ${IMAGE}
---

A dark brackish pool.
`, "WORLD/marks/errant/black-water-pool/mark.md");
const RING = [[2140, 5625], [2190, 5608], [2260, 5610], [2320, 5625], [2360, 5650], [2335, 5680], [2270, 5695], [2200, 5688], [2150, 5665], [2130, 5645]];
const ARRAY_FORM = JSON.stringify(RING);
const STRING_FORM = RING.map(([x, y]) => `${x},${y}`).join(" ");
const px = (p) => ({ x: (p.x - 2000) * 2, y: (p.y - 5500) * 2 });   // any linear camera
const mark = (points) => ({ id: "errant/black-water-pool", kind: "sited", ...record(points) });
const ringAttr = (svg, sel) => svg.match(new RegExp(`<${sel}[^>]*points="([^"]+)"`))?.[1] ?? null;

test("both written forms of a ring reach the painter as the same array, through the one reader", () => {
  const a = polygonOf(mark(ARRAY_FORM)), b = polygonOf(mark(STRING_FORM));
  assert.equal(a.length, 10);
  assert.deepEqual(a, b, "the [[x,y]…] form and the \"x,y x,y\" form are one ring");
});

for (const [form, points] of [["the [[x,y]…] form", ARRAY_FORM], ["the \"x,y x,y\" form", STRING_FORM]]) {
  test(`street zoom: a ringed mark's picture is clipped to its ring and framed by it (${form})`, () => {
    const m = mark(points);
    const svg = sceneArtSVG(m, px);
    const want = polygonOf(m).map(px).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    assert.match(svg, /class="wv-scene-mark-art wv-scene-mark-art-ringed"/);
    assert.equal(ringAttr(svg, "clipPath[^>]*><polygon"), want, "the clip is the ring");
    assert.match(svg, /<image [^>]*clip-path="url\(#wv-scene-art-clip-errantblack-water-pool\)"/, "and the picture wears it");
    assert.match(svg, new RegExp(`<polygon points="${want.replace(/\./g, "\\.")}" fill="none" class="wv-scene-art-frame"/>`), "the frame is the ring's line");
    assert.doesNotMatch(svg, /<rect /, "no rectangle frame");
    // the picture's box is the ring's own box, so `slice` fills the ring
    const xs = polygonOf(m).map(px).map((p) => p.x), ys = polygonOf(m).map(px).map((p) => p.y);
    assert.match(svg, new RegExp(`x="${Math.min(...xs).toFixed(1)}" y="${Math.min(...ys).toFixed(1)}" width="${(Math.max(...xs) - Math.min(...xs)).toFixed(1)}"`));
  });
}

test("a mark with no ring is painted exactly as before: its extent rectangle, no clip", () => {
  const m = { id: "errant/a-stall", kind: "sited", by: "errant", at: { x: 2245, y: 5651.5 }, extent: { w: 20, h: 10 }, image: IMAGE, body: "b" };
  const svg = sceneArtSVG(m, px);
  assert.equal(svg,
    `<g class="wv-scene-mark-art" data-id="errant/a-stall" pointer-events="none">`
    + `<image href="/shelf/errant/pool.png" x="470.0" y="293.0" width="40.0" height="20.0" preserveAspectRatio="xMidYMid slice"/>`
    + `<rect x="470.0" y="293.0" width="40.0" height="20.0" fill="none" class="wv-scene-art-frame"/>`
    + `</g>`);
});

test("the picture never takes a click (pointer-events none), so its hit area is never a rectangle over the ring", () => {
  assert.match(sceneArtSVG(mark(ARRAY_FORM), px), /^<g class="wv-scene-mark-art wv-scene-mark-art-ringed" data-id="errant\/black-water-pool" pointer-events="none">/);
});
