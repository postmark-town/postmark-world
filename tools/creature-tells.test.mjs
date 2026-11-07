// creature-tells.test.mjs — a telling kind's lines (POS-712, lupi's shape B;
// WORLD/ENGINE.md § The season's named creatures). The office seals and tells;
// this is the world's half: `fragments`, `fragment_words`, and told.now /
// told.answered in the conditions of a kind that tells.
//
// THE CAN-FAIL FLIPS (each reds a case below): let a kind that does not tell read
// told.*; let fragments stand on a Mists kind; let one come without the other.

import { test } from "node:test";
import assert from "node:assert/strict";
import { FRAGMENTS_MAX, TOLD_FIELDS, allowedReactions, parseKind, scopeOf, startState } from "./creature-kind.mjs";

const KIND = `kind: test-bird
name: a test bird
ring_m: 60
finishable: true
fragments: 3
fragment_words: Amber, brass, cinder, dusk
moods:
  fear: 0..3 = 1 | calm | uneasy | frightened | terrified
reaction stare "it stares": when true says It stares at {actor}.
reaction tell "it leans close": when told.now says It leans close to {actor}.
reaction bow "it bows its head": when told.answered says It bows its head to {actor}.
reaction peck "it pecks the one who forgets": when act.verb == "call" and told.asks says It pecks at {actor}.
`;

test("a telling kind: its count and its public list, one word each, and its lines keyed on told.now and told.answered", () => {
  const k = parseKind(KIND);
  assert.equal(k.fragments, 3);
  assert.deepEqual(k.fragment_words, ["amber", "brass", "cinder", "dusk"]);
  assert.deepEqual([...TOLD_FIELDS], ["told.now", "told.answered", "told.asks"]);
  const menu = (told) => allowedReactions(k, scopeOf(startState(k), { verb: "walk", distance_m: 5, ...(told ? { told } : {}) })).map((r) => r.name);
  assert.deepEqual(menu(null), ["stare"]);
  assert.deepEqual(menu({ now: true }), ["stare", "tell"]);
  assert.deepEqual(menu({ answered: true }), ["stare", "bow"]);
  const call = (told) => allowedReactions(k, scopeOf(startState(k), { verb: "call", distance_m: 5, told })).map((r) => r.name);
  assert.deepEqual(call({ asks: true }), ["stare", "peck"], "the one who forgets");
  assert.deepEqual(call({ answered: true }), ["stare", "bow"]);
});

test("refused: told.* in a kind that does not tell, fragments on a Mists kind, one without the other, a bad word or count", () => {
  const plain = KIND.replace("fragments: 3\n", "").replace(/^fragment_words:.*\n/m, "");
  assert.throws(() => parseKind(plain), /told\.now", which a creature cannot know/);
  assert.throws(() => parseKind(KIND.replace("finishable: true\n", "")), /fragments: belong to a finishable kind/);
  assert.throws(() => parseKind(KIND.replace("fragments: 3\n", "")), /come together/);
  assert.throws(() => parseKind(KIND.replace("dusk", "dusk light")), /one word of letters/);
  assert.throws(() => parseKind(KIND.replace("dusk", "amber")), /listed twice/);
  assert.throws(() => parseKind(KIND.replace("fragments: 3", `fragments: ${FRAGMENTS_MAX + 1}`)), /a whole number from 1 to/);
  assert.throws(() => parseKind(KIND.replace("fragment_words: Amber, brass, cinder, dusk", "fragment_words: amber")), /at least two words/);
});
