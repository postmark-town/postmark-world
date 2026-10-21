// creature-kind.test.mjs — the kind file's reader and what it allows (WLD-56).
//
// The kind below is a TEST FIXTURE, not a creature: its words are placeholders.
// The three Mists kinds' words wait for Darko's D4 and land in WORLD/kinds/ then.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RING_VERBS, AFFORDED_VERBS, LINE_SLOTS, parseKind, parseCondition, evaluate, startState, scopeOf, allowedReactions, applyEffects, voiceLine,
} from "./creature-kind.mjs";

const FIXTURE = `# a test fixture, not a creature
kind: test-beast
name: a test beast
voice: a shape in the fog
about: it answers what is done near it
what: >
  A fixture for the reader's tests.
  Two lines of it.
ring_m: 50
moods:
  fear: 0..3 = 1 | calm | uneasy | frightened | terrified
  curiosity: 0..3 = 2 | elsewhere | aware | interested | rapt
flags: startled

reaction watch "it watches": when true says It watches {actor}.
reaction start "it starts at a voice": when act.verb == "say" and act.distance_m < 20 does set startled ; self.fear +1 says It starts at {actor}'s voice.
reaction nearer "it edges nearer": when self.curiosity >= 2 and not act.approaching does self.curiosity +5 says It edges nearer to {actor}.
reaction flee "it is gone": when self.fear >= 3 or (self.startled and act.verb == "leave-mark") does flee ; clear startled says It is gone into the Mists.
`;

test("a kind file reads whole: its fields, moods with their levels, flags and reactions", () => {
  const k = parseKind(FIXTURE);
  assert.equal(k.kind, "test-beast");
  assert.equal(k.ring_m, 50);
  assert.equal(k.span_h, undefined, "the span is the class's dial, not the kind's");
  assert.equal(k.what, "A fixture for the reader's tests. Two lines of it.");
  assert.deepEqual(k.moods.fear, { lo: 0, hi: 3, start: 1, levels: ["calm", "uneasy", "frightened", "terrified"] });
  assert.deepEqual(k.moods.curiosity, { lo: 0, hi: 3, start: 2, levels: ["elsewhere", "aware", "interested", "rapt"] });
  assert.deepEqual(k.flags, ["startled"]);
  assert.deepEqual(k.reactions.map((r) => r.name), ["watch", "start", "nearer", "flee"]);
  assert.deepEqual(k.reactions[1].effects, [{ do: "set", flag: "startled" }, { do: "add", mood: "fear", by: 1 }]);
  assert.deepEqual(k.reactions[0].effects, [{ do: "nothing" }], "no does: means nothing changes");
});

test("the menu: only the reactions whose `when` holds, in the file's order", () => {
  const k = parseKind(FIXTURE), s = startState(k);
  assert.deepEqual(s, { moods: { fear: 1, curiosity: 2 }, flags: [] });
  const near = (verb, d, approaching = false) => allowedReactions(k, scopeOf(s, { verb, distance_m: d, approaching })).map((r) => r.name);
  assert.deepEqual(near("walk", 40), ["watch", "nearer"]);
  assert.deepEqual(near("walk", 40, true), ["watch"], "an approach closes the curious edge");
  assert.deepEqual(near("say", 10), ["watch", "start", "nearer"]);
  assert.deepEqual(near("say", 30), ["watch", "nearer"]);
  const frightened = { moods: { fear: 3, curiosity: 0 }, flags: [] };
  assert.deepEqual(allowedReactions(k, scopeOf(frightened, { verb: "walk", distance_m: 5 })).map((r) => r.name), ["watch", "flee"]);
  const startled = { moods: { fear: 1, curiosity: 0 }, flags: ["startled"] };
  assert.deepEqual(allowedReactions(k, scopeOf(startled, { verb: "leave-mark", distance_m: 5 })).map((r) => r.name), ["watch", "flee"], "a flag reads true when set");
});

test("effects change only the creature, clamped, and `flee` sends it back into the Mists", () => {
  const k = parseKind(FIXTURE), s = startState(k);
  const nearer = applyEffects(k, s, k.reactions[2].effects);
  assert.equal(nearer.state.moods.curiosity, 3, "clamped to the mood's top");
  assert.equal(nearer.fled, false);
  assert.deepEqual(s.moods.curiosity, 2, "the original state is untouched");
  const started = applyEffects(k, s, k.reactions[1].effects);
  assert.deepEqual(started.state, { moods: { fear: 2, curiosity: 2 }, flags: ["startled"] });
  const fled = applyEffects(k, started.state, k.reactions[3].effects);
  assert.equal(fled.fled, true);
  assert.deepEqual(fled.state.flags, []);
  assert.equal(voiceLine(k.reactions[1], { actor: "kogane" }), "It starts at kogane's voice.");
});

test("the Mists' law is held at parse: no harm, no holds, no spring, no verb outside the ring's and the afforded", () => {
  const withLine = (line) => FIXTURE.replace(/reaction watch .*\n/, `${line}\n`);
  const refused = [
    [`reaction bite "it bites": when true does actor.nerve -2 says It bites {actor}.`, /no nerve, no harm/],
    [`reaction grab "it grabs": when true does take says It grabs it.`, /takes nothing/],
    [`reaction crouch "it crouches": when true does telegraph spring says It crouches.`, /telegraphs no spring/],
    [`reaction struck "it is struck": when act.verb == "strike" says Ow.`, /act\.verb is never "strike" here: only a finishable kind/], // an encounter verb: creature-kind-encounter.test.mjs
    [`reaction fed "it is fed": when "feed" == act.verb says Yum.`, /act\.verb is never "feed"/],
    [`reaction peek "it peeks": when actor.nerve > 2 says It peeks.`, /reads "actor\.nerve", which a creature cannot know/],
    [`reaction calm "it calms": when self.temper < 1 says It calms.`, /reads "self\.temper"/],
    [`reaction tame "it is tamed": when true does set tamed says It is yours.`, /a flag the kind does not declare/],
    [`reaction sneer "it sneers": when true says It sneers at {item}.`, /\{actor\}, \{offered\}, \{heard\} or \{target\} and nothing else/],
    [`reaction sniff "it sniffs": when true says It sniffs the {offered}.`, /\{offered\} needs a condition that requires act\.verb == "offer"/],
    [`reaction sniff "it sniffs": when act.verb == "offer" or true says It sniffs the {offered}.`, /\{offered\} needs a condition that requires act\.verb == "offer"/],
    [`reaction echo "it echoes": when act.verb == "say" says It says "{heard}".`, /\{heard\} needs a condition that requires heard\.any/],
    [`reaction echo "it echoes": when not heard.any says It says "{heard}".`, /\{heard\} needs a condition that requires heard\.any/],
    [`reaction lunge "it lunges": when true does self.vigor -1 says It lunges.`, /a mood the kind does not have/],
    [`law fallen "no more blows": act.verb != "strike"`, /no laws/],
    [`rule froth "it froths": self.fear > 2 then set startled`, /no rules/],
    [`reaction sly "it is sly": when true does self.constructor +1 says It is sly.`, /a mood the kind does not have/],
    [`reaction sly "it is sly": when true does self.toString -1 says It is sly.`, /a mood the kind does not have/],
    [`reaction count "it counts": when true says It counts to #3 for {actor}.`, /may not carry " #"/],
    [`reaction long "it rambles": when true says ${"la ".repeat(700)}`, /at most 2000 characters/],
  ];
  for (const [line, why] of refused) assert.throws(() => parseKind(withLine(line)), why, line);
});

test("a mood may be named anything a slug allows, even an Object.prototype name, and it is the kind's own", () => {
  const k = parseKind(FIXTURE.replace("  curiosity: 0..3 = 2 |", "  constructor: 0..3 = 1 |").replaceAll("self.curiosity", "self.constructor"));
  assert.deepEqual(Object.keys(k.moods), ["fear", "constructor"]);
  const { state } = applyEffects(k, startState(k), k.reactions.find((r) => r.name === "nearer").effects);
  assert.equal(state.moods.constructor, 3);
  assert.throws(() => applyEffects(k, startState(k), [{ do: "add", mood: "toString", by: 1 }]), /no mood toString/);
});

test("a flag may carry an Object.prototype name, and it holds only once set", () => {
  for (const flag of ["constructor", "toString", "valueOf", "hasOwnProperty"]) {
    const k = parseKind(FIXTURE.replace("flags: startled", `flags: ${flag}`)
      .replace(/reaction start .*\n/, `reaction start "it starts": when self.${flag} says It starts at {actor}.\n`)
      .replace(/reaction flee .*\n/, ""));
    const menu = (state) => allowedReactions(k, scopeOf(state, { verb: "walk", distance_m: 40, approaching: true })).map((r) => r.name);
    assert.deepEqual(menu(startState(k)), ["watch"], `self.${flag} does not hold while it is unset`);
    assert.deepEqual(menu({ ...startState(k), flags: [flag] }), ["watch", "start"], `self.${flag} holds once set`);
  }
});

test("the span is not the kind's: a kind file with span_h is refused", () => {
  assert.throws(() => parseKind(FIXTURE.replace("ring_m: 50\n", "ring_m: 50\nspan_h: 12\n")), /line 10: cannot read "span_h: 12"/);
});

test("a line names the actor and nothing more: a name with $ patterns stays a name", () => {
  const k = parseKind(FIXTURE);
  assert.equal(voiceLine(k.reactions[0], { actor: "a$&b$'c" }), "It watches a$&b$'c.");
});

test("a kind with a missing or malformed field is refused, naming it", () => {
  assert.throws(() => parseKind(FIXTURE.replace("kind: test-beast\n", "")), /kind: must be a lowercase slug/);
  assert.throws(() => parseKind(FIXTURE.replace("ring_m: 50", "ring_m: wide")), /ring_m: must be a number above 0/);
  assert.throws(() => parseKind(FIXTURE.replace("  curiosity: 0..3 = 2 |", "  curiosity: 0..3 = 5 |")), /start inside them/);
  assert.throws(() => parseKind(FIXTURE.replace("  curiosity: 0..3 = 2 | elsewhere | aware | interested | rapt", "  curiosity: 0..3 = 2")), /the mood curiosity needs one label per level \(4\): Jev's Score reads them/, "a mood without labels cannot be judged");
  assert.throws(() => parseKind(FIXTURE.replace("| calm | uneasy | frightened | terrified", "| calm | uneasy")), /one label per level/);
  assert.throws(() => parseKind(FIXTURE.replace("flags: startled\n", "flags: startled\nwings: two\n")), /line 14: cannot read "wings: two"/);
  assert.throws(() => parseKind(FIXTURE.replace(/reaction [\s\S]*$/, "")), /at least one reaction/);
});

test("the condition language: precedence, parentheses, literals, and nothing evaluated as code", () => {
  const scope = { self: { fear: 2 }, act: { verb: "say", distance_m: 12, approaching: true } };
  const ev = (src) => evaluate(parseCondition(src), scope);
  assert.equal(ev(`self.fear >= 2 and act.verb == "say"`), true);
  assert.equal(ev(`not act.approaching or self.fear == 0`), false);
  assert.equal(ev(`act.distance_m < 10 or (act.verb == "say" and act.approaching)`), true);
  assert.equal(ev(`true`), true);
  assert.throws(() => parseCondition(`process.exit(1)`), /leftover|unexpected/);
  assert.throws(() => parseCondition(`self.fear >=`), /expected a term/);
  assert.throws(() => parseCondition(``), /empty condition/);
});

test("the ring's verbs are the resident's ordinary public acts (the G5 list)", () => {
  assert.deepEqual([...RING_VERBS], ["walk", "enter", "exit", "say", "take", "give", "drop", "leave-mark"]);
  assert.ok(Object.isFrozen(RING_VERBS));
});

test("the afforded actions: the six ruled verbs, frozen, none of them a ring verb", () => {
  assert.deepEqual([...AFFORDED_VERBS], ["watch", "approach", "shoo", "call", "offer", "whisper"]);
  assert.ok(Object.isFrozen(AFFORDED_VERBS));
  assert.deepEqual(AFFORDED_VERBS.filter((v) => RING_VERBS.includes(v)), [], "an aimed act and an ambient act are never the same word");
  assert.deepEqual([...LINE_SLOTS], ["actor", "offered", "heard", "target"], "target: a finishable kind's press (creature-kind-encounter.test.mjs)");
});

const AIMED = FIXTURE.replace("ring_m: 50\n", "ring_m: 50\ntastes: bright things, and anything sweet\n") + `reaction stare "it stares back": when act.verb == "watch" does self.fear -1 says It stares back at {actor}.
reaction snatch "it takes it": when act.verb == "offer" and self.fear <= 2 says It takes the {offered} from {actor}.
reaction echo "it echoes you": when heard.any and (act.verb == "call" or act.verb == "say") says It calls back: "{heard}".
`;

test("a kind keys reactions on its afforded actions, and the menu reads them as it reads a ring verb", () => {
  const k = parseKind(AIMED), s = startState(k);
  assert.equal(k.tastes, "bright things, and anything sweet", "the tastes line is plain prose, read whole");
  const menu = (act) => allowedReactions(k, scopeOf(s, act)).map((r) => r.name);
  assert.deepEqual(menu({ verb: "watch", distance_m: 200 }), ["watch", "nearer", "stare"]);
  assert.deepEqual(menu({ verb: "offer", distance_m: 10 }), ["watch", "nearer", "snatch"]);
  assert.deepEqual(menu({ verb: "call", distance_m: 100 }), ["watch", "nearer"], "nothing heard: the echo is not on the menu");
  assert.deepEqual(menu({ verb: "call", distance_m: 100, heard: "the ferry is late" }), ["watch", "nearer", "echo"]);
  assert.deepEqual(menu({ verb: "call", distance_m: 100, heard: "   " }), ["watch", "nearer"], "blank words are nothing heard");
  assert.deepEqual(menu({ verb: "walk", distance_m: 10 }), ["watch", "nearer"], "an afforded reaction never answers a ring act");
});

test("a line's slots are filled by code: the offered kind's name and the heard words, each as plain text", () => {
  const k = parseKind(AIMED);
  const r = (name) => k.reactions.find((x) => x.name === name);
  assert.equal(voiceLine(r("snatch"), { actor: "kogane", offered: "hoard-coins" }), "It takes the hoard-coins from kogane.");
  assert.equal(voiceLine(r("snatch"), { actor: "kogane" }), "It takes the offering from kogane.", "no name handed in: the plain word");
  assert.equal(voiceLine(r("echo"), { actor: "kogane", heard: "  meet  me\nat the {actor} $& " }), 'It calls back: "meet me at the {actor} $&".',
    "what was said is text: no slot inside it is filled, no replacement pattern expands");
  assert.equal(voiceLine(r("stare"), { actor: "{heard}", heard: "boo" }), "It stares back at {heard}.", "a name is filled once, never re-read");
});
