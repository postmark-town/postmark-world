// creature-far-token.test.mjs — play fix 49 (Darko, playground 2026-10-15
// 21:10): "a creature icon that replaces any specific art for creatures the
// same way that the blank resident kind of replaces any resident profile
// pictures at far zoom." At far a creature is the plain token, pastel red, no
// kind's silhouette; the silhouette shows only at the zooms where a resident's
// picture shows (mid and near).
//
// WLD-82 (RULED by Darko 2026-10-19 17:07–17:09): the token is a DIAMOND at
// every zoom, never the resident's circle on two legs, with the kind's art
// inside at the near zoom. The falsifier: a creature and a walking resident at
// one standpoint draw different shapes at both the far and the near zoom.
// Run: node --test tools/creature-far-token.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { creatureGlyphSVG, creatureDiamond, walkerFrameSVG, CREATURE_GLYPH, WALKER_FRAME } from "../spectator/viewer.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
const wolf = { id: "creature:wolf-1", kind: "wolf", name: "a grey wolf" };
const at = { x: 100, y: 200 };
const sil = { d: "M 10 10 L 90 90 Z" };
// the shape a token's body is drawn in: its disc (or frame) element and its legs
const shapeOf = (svg) => ({
  body: (svg.match(/<(circle|polygon)[^>]*class="(?:ov-creature-disc|wv-walker-frame)"/) ?? [])[1] ?? null,
  legs: (svg.match(/<line [^>]*class="(?:ov-creature-leg|wv-walker-leg)"/g) ?? []).length,
});

test("far: the plain token, a diamond with no silhouette even when one is handed in", () => {
  const svg = creatureGlyphSVG({ creature: wolf, at, silhouette: sil, plain: true });
  assert.match(svg, /class="ov-creature is-plain ov-creature-wolf"/);
  assert.doesNotMatch(svg, /ov-creature-art|clipPath/);
  assert.match(svg, new RegExp(`<polygon points="${creatureDiamond(WALKER_FRAME.far).points}" class="ov-creature-disc"/>`), "scaled from the walker's far size");
  assert.equal(CREATURE_GLYPH.plainSize, WALKER_FRAME.far);
});

test("mid and near: the full token, the same diamond with the kind's silhouette inside", () => {
  const svg = creatureGlyphSVG({ creature: wolf, at, silhouette: sil });
  assert.doesNotMatch(svg, /is-plain/);
  assert.match(svg, /class="ov-creature-art"/);
  assert.match(svg, new RegExp(`<polygon points="${creatureDiamond(WALKER_FRAME.near).points}" class="ov-creature-disc"/>`));
});

test("FALSIFIER (WLD-82): a creature and a walking resident at one standpoint draw different shapes, far and near", () => {
  const far = { creature: shapeOf(creatureGlyphSVG({ creature: wolf, at, plain: true })), resident: shapeOf(walkerFrameSVG({ at, handle: "someone", moving: true })) };
  const near = { creature: shapeOf(creatureGlyphSVG({ creature: wolf, at, silhouette: sil })),
    resident: shapeOf(walkerFrameSVG({ at, handle: "someone", moving: true, art: { monogram: "S", color: "#888888" } })) };
  for (const [zoom, t] of Object.entries({ far, near })) {
    assert.equal(t.resident.body, "circle", `${zoom}: the resident is round`);
    assert.equal(t.resident.legs, 2, `${zoom}: on two legs`);
    assert.equal(t.creature.body, "polygon", `${zoom}: the creature is a diamond`);
    assert.equal(t.creature.legs, 0, `${zoom}: with no legs`);
  }
});

test("the diamond holds the circle's area at each tier (neither body reads as the bigger one)", () => {
  for (const size of [WALKER_FRAME.far, WALKER_FRAME.near]) {
    const { h } = creatureDiamond(size);
    assert.ok(Math.abs(2 * h * h - Math.PI * (size / 2) ** 2) < 0.2, `size ${size}`);
  }
});

test("pins: the painting asks for the plain token exactly at the far tier", () => {
  assert.match(SOURCE, /const plain = tier === "far";\s*out \+= creatureGlyphSVG\(\{ creature: c, at: px\(\{ x: c\.x, y: c\.y \}\), silhouette: plain \? null : creatureSilhouette\(c\.kind\),/);
  assert.match(SOURCE, /if \(tier === "far"\) \{\s*for \(const w of bodies\)/, "the tier where the walker goes blank");
});
