// reaction-bubbles.test.mjs — play row 86 (Darko 2026-10-16 19:59): "it would
// be really nice if the reaction of the creature could be like a little uh,
// action bubble that pops up anchored to the creature's actual token on the
// page. And it would be nice if the token did a little, like, jiggle when it
// happens." Each reaction is a bubble above its creature's token, tail
// pointing at it, for about 5 s; several at once never cover each other or a
// resident; the token jiggles ~350 ms, and not at all for reduced motion.
// Run: node --test tools/reaction-bubbles.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { layoutReactionBubbles, creatureGlyphSVG, REACTION_TAIL_PX } from "../spectator/viewer.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
const hit = (a, c) => a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h;

test("one bubble: above its token, the tail at the token", () => {
  const [b] = layoutReactionBubbles([{ el: "raven", anchor: { x: 400, y: 300 }, w: 160, h: 34 }], [], { width: 1200 });
  assert.equal(b.x, 320);
  assert.equal(b.y, 300 - 34 - REACTION_TAIL_PX);
  assert.equal(b.tailX, 80, "the tail points straight down at the token");
});

test("three answering one act: three bubbles, none covering another or a resident", () => {
  const V = { x: 380, y: 280, w: 22, h: 22 };   // the resident they answered, standing among them
  const bubbles = ["wolf", "bat", "raven"].map((el, i) => ({ el, anchor: { x: 400 + i * 8, y: 300 }, w: 180, h: 34 }));
  const out = layoutReactionBubbles(bubbles, [V], { width: 1200 });
  const boxes = out.map((o) => ({ x: o.x, y: o.y, w: 180, h: 34 }));
  for (let i = 0; i < boxes.length; i++) {
    assert.ok(!hit(boxes[i], V), `${out[i].el} clears the resident`);
    for (let j = i + 1; j < boxes.length; j++) assert.ok(!hit(boxes[i], boxes[j]), `${out[i].el} and ${out[j].el} do not overlap`);
  }
  for (const o of out) assert.ok(o.tailX >= 8 && o.tailX <= 172, "each tail stays on its bubble, pointing at its token");
});

test("a bubble at the pane's edge stays inside it, its tail still at the token", () => {
  const [b] = layoutReactionBubbles([{ el: "bat", anchor: { x: 20, y: 300 }, w: 160, h: 34 }], [], { width: 1200 });
  assert.equal(b.x, 4);
  assert.equal(b.tailX, 16);
});

test("the token jiggles: one class, ~350 ms, and none for reduced motion", () => {
  assert.match(creatureGlyphSVG({ creature: { id: "creature:raven-1", kind: "raven" }, at: { x: 1, y: 2 }, jiggling: true }), /class="ov-creature is-jiggling ov-creature-raven"/);
  assert.doesNotMatch(creatureGlyphSVG({ creature: { id: "creature:raven-1", kind: "raven" }, at: { x: 1, y: 2 } }), /is-jiggling/);
  assert.match(SOURCE, /\.ov-creature\.is-jiggling \{ animation:wv-creature-jiggle 350ms ease-out;/);
  assert.match(SOURCE, /@media \(prefers-reduced-motion: reduce\) \{ \.ov-creature\.is-jiggling \{ animation:none; \} \}/);
});

test("pins: your own act's answer and the 15 s read both say it at the token; the note only for one off the page", () => {
  assert.match(SOURCE, /if \(drawn\) \{ creatureSay\(r\.id, line\); reactionSeen\.set\(r\.id, Date\.now\(\) \+ 2000\); \}/);
  assert.match(SOURCE, /if \(offPage\.length\) creatureNote\(offPage\);/);
  assert.match(SOURCE, /if \(lines\.length\) creatureSay\(id, lines\[lines\.length - 1\]\);/, "the 15 s read (fix 54)");
  assert.match(SOURCE, /CREATURE_SAY_MS = 5000, CREATURE_JIGGLE_MS = 350/);
  assert.match(SOURCE, /say\.timer = setTimeout\(\(\) => \{ say\.el\.classList\.remove\("show"\); \}, CREATURE_SAY_MS\);\s*jiggleCreature\(id\);/);
  assert.match(SOURCE, /function positionPills\(\) \{\s*positionCreatureSays\(\);/, "it follows the camera");
});

test("in a crowd (the Town Centre's pile of residents), bubbles may cover a resident but never each other", () => {
  const crowd = Array.from({ length: 70 }, (_, i) => ({ x: 300 + (i % 10) * 24, y: 120 + Math.floor(i / 10) * 30, w: 22, h: 22 }));
  const bubbles = ["wolf", "bat", "raven"].map((el, i) => ({ el, anchor: { x: 400 + i * 6, y: 300 }, w: 240, h: 42 }));
  const out = layoutReactionBubbles(bubbles, crowd, { width: 1200 });
  const boxes = out.map((o) => ({ x: o.x, y: o.y, w: 240, h: 42 }));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!hit(boxes[i], boxes[j]), `${out[i].el} and ${out[j].el}`);
});
