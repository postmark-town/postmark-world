// edge-sentence.test.mjs — WLD-109: the terms' sentence in plain English.
//
// A door with terms answers "<mark> forms <a|an> <edge> edge back at you on entry
// — <consequence>. Entering means accepting it; say so, or stay outside." The
// article was fixed at "an" ("an bell edge", "an latch edge"), and a consequence
// that ended in its own stop got a second one ("It opens.."). The article is read
// off the edge word, and no stop is added after one that is already there. The
// World page's terms sheet says the same two things the same way.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { adjudicate, edgeArticle, endsInStop } from "./enter-exit.mjs";

const door = (entry) => ({ id: "a-house/the-door", kind: "sited", by: "a-house", at: { x: 0, y: 0 }, extent: { w: 2, h: 2 }, entry: { word: "neutral", ...entry } });
const because = (entry) => adjudicate(door(entry), { accepted: false }).because;

test("the article is read off the edge word: a consonant takes a, a vowel takes an", () => {
  assert.equal(because({ edge: "knock", consequence: "it opens" }),
    "a-house/the-door forms a knock edge back at you on entry — it opens. Entering means accepting it; say so, or stay outside.");
  assert.equal(because({ edge: "aboard", consequence: "aboard when she sails" }),
    "a-house/the-door forms an aboard edge back at you on entry — aboard when she sails. Entering means accepting it; say so, or stay outside.");
  assert.deepEqual(["bell", "latch", "aboard", "Oath", "  edge", ""].map(edgeArticle), ["a", "a", "an", "an", "an", "a"]);
});

test("a consequence that ends in its own stop gets no second one; one without gets the sentence's", () => {
  assert.equal(because({ edge: "latch", consequence: "You lean on the old gate. It opens." }),
    "a-house/the-door forms a latch edge back at you on entry — You lean on the old gate. It opens. Entering means accepting it; say so, or stay outside.");
  assert.match(because({ edge: "bell", consequence: "Are you sure?" }), /— Are you sure\? Entering/);
  assert.match(because({ edge: "bell", consequence: "Mind the step!" }), /— Mind the step! Entering/);
  assert.match(because({ edge: "bell", consequence: "It says \"Welcome.\"" }), /— It says "Welcome\." Entering/);
  assert.match(because({ edge: "bell", consequence: "it opens" }), /— it opens\. Entering/);
  assert.doesNotMatch(because({ edge: "latch", consequence: "It opens." }), /\.\./, "never a double stop");
});

test("with no consequence, the sentence closes after 'on entry'", () => {
  assert.equal(because({ edge: "oath" }), "a-house/the-door forms an oath edge back at you on entry. Entering means accepting it; say so, or stay outside.");
});

test("endsInStop: . ! or ?, before any closing quotes or brackets", () => {
  assert.deepEqual(["It opens.", "Really?", "Go!", "He said \"go.\"", "(as told.)", "it opens", "", "a list:"].map(endsInStop),
    [true, true, true, true, true, false, false, false]);
});

test("the World page's terms sheet says it the same way (spectator/viewer.mjs)", () => {
  const src = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
  assert.match(src, /Crossing forms \$\{edgeArticle\(edge\)\} <b>/, "the sheet reads the article off the edge");
  assert.match(src, /consequence && endsInStop\(consequence\) \? "" : "\."/, "and adds no stop after the consequence's own");
  assert.doesNotMatch(src, /Crossing forms an <b>/, "the fixed article is gone");
});
