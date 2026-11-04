// creature-fight.test.mjs — a creature whose fight runs in set pieces: its fight
// file, and the kind file's half (creature-kind.mjs § fight:, FIGHT_FIELDS).
//
// The fight below is a TEST FIXTURE, not a creature's: its words are placeholders.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SET_PIECES, FLINCH_VERBS, parseFight } from "./creature-fight.mjs";
import { AFFORDED_VERBS, FIGHT_FIELDS, parseKind, scopeOf, startState, allowedReactions } from "./creature-kind.mjs";

const FIGHT = {
  sanity_max: 30,
  pieces: [
    { piece: "feint", looks: "It glows.", throws: "a ball of sparks", aims_at: "loudest", flinch_nerve: 3, held: 2, held_by: { watch: 3 },
      answer_min: 30, ends: { hit_points_at: 0.5, sanity_at: 0.5, after_h: 4 } },
    { piece: "disguise", looks: "It looks entirely ordinary.", surrender: "You win. Go home.", admits: "Fine. You saw." },
    { piece: "unbreakable", looks: "It blazes.", persuade: { low: 3, high: 8, nerve: 8, story: ["wait like everyone else"] } },
  ],
  restores: "snack",
};
const text = (over = {}) => JSON.stringify({ ...FIGHT, ...over });
const piece = (name, over) => ({ ...FIGHT, pieces: FIGHT.pieces.map((p) => (p.piece === name ? { ...p, ...over } : p)) });

test("a fight file reads whole: its pieces in order, each one's numbers and words, the class it restores", () => {
  const f = parseFight(text());
  assert.deepEqual(f.order, ["feint", "disguise", "unbreakable"]);
  assert.equal(f.sanity_max, 30);
  assert.deepEqual(f.pieces[0].ends, { hit_points_at: 0.5, sanity_at: 0.5, after_h: 4 });
  assert.deepEqual(f.pieces[0].held_by, { watch: 3 });
  assert.equal(f.pieces[1].surrender, "You win. Go home.");
  assert.deepEqual(f.pieces[2].persuade, { low: 3, high: 8, nerve: 8, story: ["wait like everyone else"] });
  assert.equal(f.restores, "snack");
  assert.deepEqual([...SET_PIECES], ["feint", "disguise", "unbreakable"]);
  assert.deepEqual([...FLINCH_VERBS], ["dodge", "walk", "exit"]);
});

test("a fight file is refused whole on anything it cannot read", () => {
  const bad = (t, re) => assert.throws(() => parseFight(t), re);
  bad("{", /not JSON/);
  bad(text({ sanity_max: 0 }), /sanity_max/);
  bad(text({ pieces: [] }), /at least one set piece/);
  bad(text({ pieces: [{ piece: "riddle", looks: "x" }] }), /is one of feint, disguise, unbreakable/);
  bad(text({ pieces: [FIGHT.pieces[1], FIGHT.pieces[1]] }), /given twice/);
  bad(text({ pieces: [FIGHT.pieces[2], FIGHT.pieces[0]] }), /unbreakable is the last/);
  bad(JSON.stringify(piece("feint", { aims_at: "everyone" })), /aims_at/);
  bad(JSON.stringify(piece("feint", { held_by: { dodge: 3 } })), /dodge flinches; it never holds/);
  bad(JSON.stringify(piece("feint", { ends: { hit_points_at: 2, sanity_at: 0.5, after_h: 4 } })), /hit_points_at/);
  bad(JSON.stringify(piece("disguise", { surrender: "" })), /surrender: says something/);
  bad(JSON.stringify(piece("disguise", { admits: "You saw, {name}." })), /names no slot/);
  bad(JSON.stringify(piece("unbreakable", { persuade: { low: 5, high: 3, nerve: 8, story: ["x"] } })), /persuade.high/);
  bad(JSON.stringify(piece("unbreakable", { persuade: { low: 3, high: 8, nerve: 8, story: [] } })), /persuade.story/);
  bad(text({ restores: "Not A Slug" }), /restores/);
  assert.equal(parseFight(text({ restores: undefined })).restores, undefined, "a fight may restore nothing");
});

const HEAD = `kind: test-fighter
name: a test fighter
ring_m: 40
what: >
  A fixture.
moods:
  mood: 0..3 = 1 | a | b | c | d
`;

test("a kind fights in set pieces with fight:, its hit points, and reactions that read the fight", () => {
  const k = parseKind(`${HEAD}finishable: true
resolve: 40
strike: 2
fight: test-fighter.fight.json
ending: It is itself again. {names} were there.
reaction cackle "it cackles": when fight.flinched says Ha! Only sparks.
reaction calm "it calms": when fight.held and fight.sanity >= 10 says Oh. You stayed.
reaction fine "nothing is wrong": when fight.piece == "disguise" says Nothing is wrong here.
reaction glance "it laughs off a blow": when act.verb == "strike" and fight.piece == "unbreakable" says That tickles.
reaction listen "it listens": when act.verb == "persuade" says Say that again.
reaction duck "it sees you duck": when act.verb == "dodge" says Duck all you like.
reaction stood "it sees a friend shielded": when act.verb == "shield" says {actor} stood in front of {ally}.
`);
  assert.equal(k.fight, "test-fighter.fight.json");
  assert.ok(AFFORDED_VERBS.includes("dodge") && AFFORDED_VERBS.includes("persuade"));
  assert.deepEqual([...FIGHT_FIELDS], ["fight.piece", "fight.sanity", "fight.flinched", "fight.held"]);
  const menu = (act, fight) => allowedReactions(k, scopeOf(startState(k), act, {}, { fight })).map((r) => r.name);
  assert.deepEqual(menu({ verb: "walk" }, { piece: "feint", flinched: true }), ["cackle"]);
  assert.deepEqual(menu({ verb: "say" }, { piece: "feint", held: true, sanity: 12 }), ["calm"]);
  assert.deepEqual(menu({ verb: "say" }, { piece: "disguise" }), ["fine"]);
  assert.deepEqual(menu({ verb: "strike" }, { piece: "unbreakable" }), ["glance"]);
  assert.deepEqual(menu({ verb: "persuade" }, { piece: "unbreakable" }), ["listen"]);
  assert.deepEqual(menu({ verb: "strike" }, undefined), [], "absent, the fight reads empty");
});

test("fight: needs a finishable kind with hit points, never an ease or a menu, and only it reads fight.*", () => {
  const bad = (t, re) => assert.throws(() => parseKind(`${HEAD}${t}reaction r "r": when true says Hm.\n`), re);
  bad("fight: f.json\n", /belongs to a finishable kind/);
  bad("finishable: true\nfight: f.txt\nresolve: 4\nstrike: 2\n", /names a fight file/);
  bad("finishable: true\nfight: fightxjson\nresolve: 4\nstrike: 2\n", /names a fight file/); // the dot before json is a dot
  bad("finishable: true\nfight: f.json\n", /needs resolve: and strike:/);
  bad("finishable: true\nfight: f.json\nresolve: 4\nstrike: 2\nease: 3 mine\n", /never an ease: or a tempts:/);
  assert.throws(() => parseKind(`${HEAD}finishable: true\nresolve: 4\nstrike: 2\nreaction r "r": when fight.held says Hm.\n`), /a creature cannot know/);
});
