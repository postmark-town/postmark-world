// no-clump.test.mjs — play row 55, as RULED (Darko 2026-10-16 17:36): "we're
// not doing any kind of no clumping rule … The tokens should stay in their
// correct geometric positions. And we already have code … that asks you which
// one did you mean to click on." So no token is moved, at any zoom, and a click
// on a pile opens the chooser with every token in it, creatures named as
// creatures. (The seating fix 55 first shipped drifted as he zoomed: its ring
// was in screen pixels.)
// Run: node --test tools/no-clump.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { creatureGlyphSVG, chooserLeadLine, contestedMarksAtPoint, MARK_SNAP_RADIUS_PX, walkerHoverId } from "../spectator/viewer.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
// The glyph layer is the source from `liveCreatureGlyphs` up to the next sibling in `mountViewer`'s scope,
// `creatureColumnView`. (It used to end at the nameplate closure, which WLD-144 W3 hoisted to a top-level export
// far above; ending there would now slice backwards to "".) The range is asserted ordered and non-empty below.
const LAYER_START = SOURCE.indexOf("  function liveCreatureGlyphs(px, tier) {");
const LAYER_END = SOURCE.indexOf("  function creatureColumnView(id) {");
const layer = SOURCE.slice(LAYER_START, LAYER_END);

test("the glyph layer's source range is found, ordered and non-empty", () => {
  assert.ok(LAYER_START >= 0, "the layer's start marker is in the source");
  assert.ok(LAYER_END > LAYER_START, "its end marker comes after its start (a later sibling in the same scope)");
  assert.ok(layer.length > 0 && layer.includes("creatureGlyphSVG"), "the range holds the glyph loop");
  assert.ok(layer.includes("return rings + out;"), "and the whole function, to its return");
  assert.ok(!layer.includes("function creatureColumnView"), "and stops short of the next function");
});

test("a stacked trio draws at its true points: one place, three tokens, nothing moved", () => {
  const at = { x: 380.2, y: -537 };
  for (const kind of ["wolf", "raven", "bat"])
    assert.match(creatureGlyphSVG({ creature: { id: `creature:${kind}-253-play1`, kind }, at }), /^<g transform="translate\(380\.2 -537\)">/);
  assert.match(layer, /out \+= creatureGlyphSVG\(\{ creature: c, at: px\(\{ x: c\.x, y: c\.y \}\),/, "the token's own point, from the record");
  assert.doesNotMatch(SOURCE, /seatCreatureTokens|seats\.get\(/, "no seating anywhere");
  assert.doesNotMatch(layer, /markerScale|walkState\.walkers/, "nothing on screen moves a creature");
});

test("the chooser offers every clickable under the cursor, no kind special-cased (Darko 17:37)", () => {
  // the live trio stacked at one point beside darko: all three are under the cursor
  const darko = { id: walkerHoverId("darko"), x: 752, y: 630 };
  const trio = ["wolf", "raven", "bat"].map((k) => ({ id: `creature:${k}-253-play1`, x: 760, y: 630 }));
  const away = { id: "creature:wolf-252-play2", x: 760 + MARK_SNAP_RADIUS_PX + 30, y: 630 };
  const here = contestedMarksAtPoint({ x: 760, y: 630 }, [darko, ...trio, away]);
  assert.deepEqual([...here].sort(), [darko.id, ...trio.map((t) => t.id)].sort(), "darko and all three");
  assert.ok(!here.includes(away.id), "a token that is not under the cursor is not offered");
});

test("the chooser names creatures as creatures", () => {
  assert.equal(chooserLeadLine(["creature:wolf-1", "creature:bat-1", "creature:raven-1"]), "3 creatures are here — which one?");
  assert.equal(chooserLeadLine([walkerHoverId("visitor"), "creature:wolf-1", "creature:bat-1"]), "1 resident and 2 creatures are here — which one?");
  assert.equal(chooserLeadLine([walkerHoverId("visitor"), "creature:wolf-1", "the-town/a-stone"]), "1 resident, 1 creature and 1 mark are here — which one?");
  assert.equal(chooserLeadLine(["the-town/a", "the-town/b"]), "2 marks are stacked here — which one?", "a pile of marks reads as it always did");
});

test("pins: the people click takes what is under the cursor, the same snap every mark uses", () => {
  assert.match(SOURCE, /clickablesAtPoint\(\{ x: e\.clientX, y: e\.clientY \},\s*\{ people: \[\.\.\.screenWalkerCandidates\(\), \.\.\.screenCreatureCandidates\(\)\], marks: screenMarkCandidates\(\) \}\)/);
  assert.doesNotMatch(SOURCE, /tokenPileAtPoint/, "no pile grown past the cursor");
});

test("pins: the chooser files creatures under their own label, never \"other marks\"", () => {
  assert.match(SOURCE, /isCreature: isCreatureId \}\);/);
  assert.match(SOURCE, /section\("creatures", groups\.creatures\)/);
});
