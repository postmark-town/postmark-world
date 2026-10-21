// creature-kind-encounter.test.mjs — a finishable kind's words (creature-kind.mjs § A FINISHABLE KIND).
//
// The kind below is a TEST FIXTURE, not a creature: its words are placeholders.
// Every number in it is the fixture's; a real kind's numbers are its own file's.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RING_VERBS, AFFORDED_VERBS, ENCOUNTER_VERBS, PRESS_ON, PRESS_MAX, EASE_BY, LINE_SLOTS,
  parseKind, startState, scopeOf, allowedReactions, applyEffects, voiceLine,
} from "./creature-kind.mjs";

const HEAD = `kind: test-keeper
name: a test keeper
ring_m: 40
what: >
  A fixture for the encounter's words.
moods:
  temper: 0..3 = 1 | calm | stirred | angry | wild
`;
const FIXTURE = `${HEAD}finishable: true
resolve: 20
strike: 4
ease: 3 mine

reaction bristle "it bristles": when act.verb == "strike" and self.resolve > 4 does press 2 on striker loudest ; self.temper +1 says It bristles at {actor} and turns on {target}.
reaction sag "it sags": when act.verb == "strike" and self.resolve <= 4 does press 1 says It sags, and still it snaps at {target}.
reaction regard "it regards you": when act.verb == "watch" and ease.mine < 2 does ease +1 says It regards {actor}.
reaction settle "it settles": when act.verb == "watch" and ease.mine == 2 and ease.first_m >= 10 does ease +1 says It settles under {actor}'s gaze.
reaction startle "it starts": when act.verb != "watch" and act.verb != "strike" does ease reset ; press 1 says It starts, and glares at {target}.
reaction yield "it yields": when act.verb == "shield" does finish says It yields to {actor}.
`;

test("a finishable kind reads whole: the switch, resolve and strike, ease, and its effects", () => {
  const k = parseKind(FIXTURE);
  assert.equal(k.finishable, true);
  assert.equal(k.resolve, 20);
  assert.equal(k.strike, 4);
  assert.deepEqual(k.ease, { target: 3, by: "mine" });
  const fx = Object.fromEntries(k.reactions.map((r) => [r.name, r.effects]));
  assert.deepEqual(fx.bristle, [{ do: "press", n: 2, on: ["striker", "loudest"] }, { do: "add", mood: "temper", by: 1 }]);
  assert.deepEqual(fx.sag, [{ do: "press", n: 1, on: [...PRESS_ON] }], "a press with no `on` may land on anyone the menu holds");
  assert.deepEqual(fx.regard, [{ do: "ease", by: 1 }]);
  assert.deepEqual(fx.startle, [{ do: "ease", reset: true }, { do: "press", n: 1, on: [...PRESS_ON] }]);
  assert.deepEqual(fx.yield, [{ do: "finish" }]);
  assert.deepEqual(parseKind(`${HEAD}finishable: true\nease: 3 households\nreaction a "a": when true says A.\n`).ease, { target: 3, by: "households" });
  const bare = parseKind(`${HEAD}finishable: true\nreaction a "a": when true does finish says A.\n`);
  assert.equal(bare.resolve, undefined, "a kind may be finishable by its reactions alone");
});

test("the encounter's words are frozen, and its verbs are neither the ring's nor the afforded", () => {
  assert.deepEqual(ENCOUNTER_VERBS, ["strike", "steady", "shield"]);
  assert.deepEqual(PRESS_ON, ["actor", "striker", "shielder", "loudest", "alone"]);
  assert.equal(PRESS_MAX, 2);
  assert.deepEqual(EASE_BY, ["mine", "households"]);
  assert.ok(LINE_SLOTS.includes("target"));
  for (const list of [ENCOUNTER_VERBS, PRESS_ON, EASE_BY, LINE_SLOTS]) assert.ok(Object.isFrozen(list));
  for (const v of ENCOUNTER_VERBS) assert.ok(!RING_VERBS.includes(v) && !AFFORDED_VERBS.includes(v), v);
});

test("a Mists kind uses none of it: each line, effect, verb and field is refused, naming why", () => {
  const mists = (extra, reaction = `reaction a "a": when true says A.`) => () => parseKind(`${HEAD}${extra}\n${reaction}\n`);
  assert.throws(mists("resolve: 20\nstrike: 4"), /resolve: belongs to a finishable kind/);
  assert.throws(mists("ease: 3 mine"), /ease: belongs to a finishable kind/);
  assert.throws(mists("", `reaction a "a": when true does press 1 says A.`), /press 1" is refused: only a finishable kind/);
  assert.throws(mists("", `reaction a "a": when true does finish says A.`), /only a finishable kind can be finished/);
  assert.throws(mists("", `reaction a "a": when true does ease +1 says A.`), /"ease \+1" is refused: only a finishable kind/);
  assert.throws(mists("", `reaction a "a": when act.verb == "strike" says A.`), /act\.verb is never "strike" here: only a finishable kind/);
  assert.throws(mists("", `reaction a "a": when self.resolve > 1 says A.`), /reads "self\.resolve", which a creature cannot know/);
  assert.throws(mists("", `reaction a "a": when ease.mine > 1 says A.`), /reads "ease\.mine", which a creature cannot know/);
  assert.throws(mists("finishable: no"), /finishable: is true or absent/);
});

test("a finishable kind's numbers are held to their bounds at parse", () => {
  const fin = (extra, reaction = `reaction a "a": when true says A.`) => () => parseKind(`${HEAD}finishable: true\n${extra}\n${reaction}\n`);
  assert.throws(fin("resolve: 20"), /resolve: and strike: come together/);
  assert.throws(fin("strike: 2"), /resolve: and strike: come together/);
  assert.throws(fin("resolve: 2.5\nstrike: 1"), /resolve: must be a whole number/);
  assert.throws(fin("resolve: 0\nstrike: 1"), /resolve: must be a whole number from 1/);
  assert.throws(fin("resolve: 10\nstrike: 11"), /strike: must be a whole number from 1 to 10/);
  assert.throws(fin("ease: 3 everyone"), /ease: is "<n> mine" or "<n> households"/);
  assert.throws(fin("ease: 0 mine"), /ease: must be a whole number from 1/);
  assert.throws(fin("", `reaction a "a": when true does press 3 says A.`), /presses 3: a press is 1 to 2 nerve/);
  assert.throws(fin("", `reaction a "a": when true does press 0 says A.`), /presses 0/);
  assert.throws(fin("", `reaction a "a": when true does press 1 on bystander says A.`), /presses "bystander", which is not one of/);
  assert.throws(fin("", `reaction a "a": when true does press 1 on actor actor says A.`), /names someone twice/);
  assert.throws(fin("", `reaction a "a": when true does ease +1 says A.`), /fills an ease the kind does not declare/);
  assert.throws(fin("", `reaction a "a": when true does ease +1x says A.`), /cannot read the effect "ease \+1x"/);
  assert.throws(fin("", `reaction a "a": when true does flee says A.`), /a finishable kind never flees/);
  assert.throws(fin("", `reaction a "a": when true says It turns on {target}.`), /\{target\} needs a press among its effects/);
  assert.throws(() => parseKind(FIXTURE.replace("temper: 0..3", "resolve: 0..3").replaceAll("self.temper", "self.resolve")), /no mood or flag named resolve/);
});

test("the menu reads the window the office hands it: resolve left, and the actor's ease", () => {
  const k = parseKind(FIXTURE), s = startState(k);
  const menu = (verb, encounter) => allowedReactions(k, scopeOf(s, { verb, distance_m: 5 }, {}, encounter)).map((r) => r.name);
  assert.deepEqual(menu("strike", { resolve: 20 }), ["bristle"]);
  assert.deepEqual(menu("strike", { resolve: 4 }), ["sag"], "worn low, it sags");
  assert.deepEqual(menu("watch", { ease: { mine: 0 } }), ["regard"]);
  assert.deepEqual(menu("watch", { ease: { mine: 2, first_m: 4 } }), [], "stillness needs its span");
  assert.deepEqual(menu("watch", { ease: { mine: 2, first_m: 12 } }), ["settle"]);
  assert.deepEqual(menu("say", {}), ["startle"]);
  assert.deepEqual(menu("shield", {}), ["startle", "yield"]);
  const sc = scopeOf(s, { verb: "walk" });
  assert.deepEqual(sc.ease, { mine: 0, all: 0, first_m: 0 }, "no window handed: every number reads 0");
  assert.equal(Object.hasOwn(sc.self, "resolve"), false, "no resolve handed: self.resolve is unset, never a guess");
});

test("applyEffects changes only moods and flags: a press and an ease are the office's to apply, and a finish is only said", () => {
  const k = parseKind(FIXTURE), s = startState(k);
  const bristle = k.reactions.find((r) => r.name === "bristle");
  assert.deepEqual(applyEffects(k, s, bristle.effects), { state: { moods: { temper: 2 }, flags: [] }, fled: false, finished: false });
  const yieldR = k.reactions.find((r) => r.name === "yield");
  assert.deepEqual(applyEffects(k, s, yieldR.effects), { state: { moods: { temper: 1 }, flags: [] }, fled: false, finished: true });
});

test("a press's line names whom it landed on, filled by code as plain text", () => {
  const k = parseKind(FIXTURE);
  const bristle = k.reactions.find((r) => r.name === "bristle");
  assert.equal(voiceLine(bristle, { actor: "kai", target: "ren" }), "It bristles at kai and turns on ren.");
  assert.equal(voiceLine(bristle, { actor: "kai", target: "$& {actor}" }), "It bristles at kai and turns on $& {actor}.");
  assert.equal(voiceLine(bristle, { actor: "kai" }), "It bristles at kai and turns on kai.", "no target handed: the actor");
});

test("the ring and the actor in it: counts and the actor's own, read only by a finishable kind; \"only <verb>\" on a per-resident ease", () => {
  const k = parseKind(`${HEAD}finishable: true
ease: 3 mine only watch
reaction party "it sees a party": when ring.households >= 2 and actor.housemates == 0 says It sees {actor} came alone into a crowd.
reaction worn "it sees the worn": when actor.nerve <= 2 and not actor.struck and ring.residents > 1 says It looks at {actor}.
`);
  assert.deepEqual(k.ease, { target: 3, by: "mine", only: "watch" });
  const s0 = startState(k);
  const menu = (enc) => allowedReactions(k, scopeOf(s0, { verb: "say", distance_m: 5 }, {}, enc)).map((r) => r.name);
  assert.deepEqual(menu({ ring: { residents: 3, households: 2 }, actor: { housemates: 0, nerve: 6 } }), ["party"]);
  assert.deepEqual(menu({ ring: { residents: 3, households: 1 }, actor: { housemates: 2, nerve: 2, struck: false } }), ["worn"]);
  assert.deepEqual(menu({}), [], "no window handed: every count reads 0");
  assert.throws(() => parseKind(`${HEAD}reaction a "a": when ring.residents > 1 says A.\n`), /reads "ring\.residents", which a creature cannot know/);
  assert.throws(() => parseKind(`${HEAD}finishable: true\nease: 3 households only call\nreaction a "a": when true says A.\n`), /"only <verb>" belongs to an ease each resident fills/);
  assert.throws(() => parseKind(`${HEAD}finishable: true\nease: 3 mine only dance\nreaction a "a": when true says A.\n`), /only "dance" is not a verb/);
});
