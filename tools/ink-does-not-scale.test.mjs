// INK DOES NOT SCALE WITH THE CAMERA, AND A HUNG PICTURE FILLS ITS EXTENT
// (2026-09-20, Keemin's screenshot: a region's border drawn thick at near, a
// picture floating in a pale band inside its own frame — "keep the border size
// under control").
//
// The viewBox is the camera (`svg.setAttribute("viewBox", …)`), so any stroke
// set in viewBox units grows with every zoom step: measured on prod at near,
// scale 4.5×, `.wv-tg-region`'s 1.4-unit edge drew 6.4 px. The walkers, the
// highlight box and the placed-art frame already carried
// `vector-effect:non-scaling-stroke`; the mark blocks, the region wash and the
// room's frame, wall, rule and door did not. This pins that every DRAWN line
// among them is screen-pixel ink, and that sceneArtSVG fills its box the way
// placedArtSVG has since 09-13.
//
// Source-shape on purpose: the stylesheet lives inside viewer.mjs as a template
// string and no DOM is stood up here; the render-side receipt is the headless
// probe in Wright's paperwork (strokePx constant across zoom steps).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sceneArtSVG } from "../spectator/viewer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "..", "spectator", "viewer.mjs"), "utf8");

const INK = [
  ".wv-ph-extent {", ".wv-ph-extent.c-portal-ground {", ".wv-ph-threshold {", ".wv-ph-door-leaf {",
  ".wv-ph-door-swing {", ".wv-scene-art-frame {", ".wv-scene-rule {", ".wv-scene-wall {", ".wv-tg-region {",
];

/** the one CSS rule that starts with this selector, up to its closing brace */
function ruleOf(selector) {
  const i = SRC.indexOf(`\n${selector}`);
  assert.ok(i >= 0, `no rule for ${selector}`);
  const j = SRC.indexOf("}", i);
  return SRC.slice(i, j + 1);
}

test("every drawn-line class on the ground and in the room is screen-pixel ink", () => {
  for (const sel of INK) {
    const rule = ruleOf(sel);
    assert.match(rule, /vector-effect:non-scaling-stroke/, `${sel} scales with the camera:\n${rule}`);
  }
});

test("the can-fail control: a rule without the property is caught by the same reader", () => {
  // `.wv-tg-water` is deliberately left scaling (the atlas's own craft, out of
  // this change's scope) — so the reader must be able to say so.
  assert.doesNotMatch(ruleOf(".wv-tg-water {"), /non-scaling-stroke/);
});

test("a hung scene picture fills its extent (slice), never a letterbox inside its frame", () => {
  const px = (p) => ({ x: p.x * 2, y: p.y * 2 });
  // the same shape overlay-houses.test.mjs hangs: a sited, pictured piece of furniture
  const chair = { id: "rei/the-mending-basket", kind: "sited", tier: "market",
    at: { x: 10, y: 10 }, extent: { w: 4, h: 3 }, image: "https://media.postmark.town/media/rei/x.jpg" };
  const art = sceneArtSVG(chair, px);
  assert.ok(art.length > 0, "the chair hangs its picture");
  assert.match(art, /preserveAspectRatio="xMidYMid slice"/, art);
  assert.doesNotMatch(art, /xMidYMid meet/);
});
