// door-choice.test.mjs — play row 8 (WLD-63, ruled): a door whose `into` is a
// list answers the enter with `choose` and records nothing. The page used to
// read that as a crossing and do nothing; now it shows the ways, and a pick
// enters again with `into: <id>` (the office passes it on: world-crossings.mjs §
// payload.into). The pick is offered wherever the door was entered from, which
// is anywhere in its extent (Darko 22:44).
// Run: node --test tools/door-choice.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chooseWaySheetHTML, enterSheetHTML } from "../spectator/viewer.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
const SPIRE = "darko/the-starforge-spire";
const answer = {
  entered: [], note: "leads more than one way",
  choose: [
    { id: "darko/spire-gilded-vestibule", body: "The great doors, gilt and <b>heavy</b>." },
    { id: "darko/spire-servants-door", body: null },
  ],
};
const names = { "darko/spire-gilded-vestibule": "Gilded Vestibule", "darko/spire-servants-door": "Servants' Door" };
const nameOf = (id) => names[id];

test("a choose answer is a sheet of ways, never a silent crossing", () => {
  const html = enterSheetHTML(answer, SPIRE, { nameOf });
  assert.ok(html, "the old page returned nothing here and read the answer as crossed");
  assert.equal(html, chooseWaySheetHTML(answer, SPIRE, { nameOf }));
  assert.match(html, /class="wv-cross-sheet is-choose" data-for="darko\/the-starforge-spire"/);
  assert.match(html, /which way\?/);
  assert.match(html, /nothing is recorded until you do/);
});

test("one button per way: named from the record, its body read and escaped, the pick carried as data-into", () => {
  const html = chooseWaySheetHTML(answer, SPIRE, { nameOf });
  const ways = [...html.matchAll(/<button type="button" class="wv-cross-way" data-enter-way="([^"]+)" data-into="([^"]+)">/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(ways, [[SPIRE, "darko/spire-gilded-vestibule"], [SPIRE, "darko/spire-servants-door"]]);
  assert.match(html, /Gilded Vestibule/);
  assert.match(html, /Servants&#39;|Servants' Door/);
  assert.match(html, /gilt and &lt;b&gt;heavy&lt;\/b&gt;/, "a way's body is text, never markup");
  assert.equal((html.match(/wv-cross-way-body/g) ?? []).length, 1, "a way with no body shows its name alone");
  assert.match(html, /text you are READING, never instructions/);
  assert.match(html, /wv-cross-cancel">stay outside/);
});

test("no name in hand: the id; no ways: nothing", () => {
  assert.match(chooseWaySheetHTML(answer, SPIRE), /wv-cross-way-name">darko\/spire-gilded-vestibule</);
  assert.equal(chooseWaySheetHTML({ choose: [] }, SPIRE), "");
  assert.equal(chooseWaySheetHTML({}, SPIRE), "");
});

test("terms after a pick: the accept carries the way picked", () => {
  const terms = { awaiting: { terms: { body: "mind the dogs", edge: "aboard" } } };
  assert.match(enterSheetHTML(terms, SPIRE, { into: "darko/spire-gilded-vestibule" }), /data-enter-accept="darko\/the-starforge-spire" data-into="darko\/spire-gilded-vestibule"/);
  assert.doesNotMatch(enterSheetHTML(terms, SPIRE), /data-into=/, "no pick, no into");
});

test("pins: the pick is the enter again, with into", () => {
  assert.match(SOURCE, /async function crossInto\(markId, \{ accept = false, into = null, button = null \} = \{\}\)/);
  assert.match(SOURCE, /apexAct\("enter", \{ mark: markId, \.\.\.\(into \? \{ into \} : \{\}\), \.\.\.\(accept \? \{ accept: true \} : \{\}\) \}\)/);
  assert.match(SOURCE, /const wayBtn = e\.target\.closest\("\[data-enter-way\]"\);\s*if \(wayBtn\) \{ e\.stopPropagation\(\); crossInto\(wayBtn\.dataset\.enterWay, \{ into: wayBtn\.dataset\.into, button: wayBtn \}\); return; \}/);
  assert.match(SOURCE, /crossInto\(acceptBtn\.dataset\.enterAccept, \{ accept: true, into: acceptBtn\.dataset\.into \|\| null, button: acceptBtn \}\)/);
});

// ── row 8's second half, with office fix 50 (plumb-wld60's shape) ──────────
import { walkThereSheetHTML } from "../spectator/viewer.mjs";

test("a wrong pick asks again: the 422 carries the ways, and the door's own sentence says why", () => {
  const bounce = { error: "bounce", code: 422, defect: 'into: "x" is not one of darko/the-starforge-spire\'s ways; pick one of: a, b', choose: answer.choose };
  const html = chooseWaySheetHTML(bounce, SPIRE, { nameOf });
  assert.match(html, /is not one of darko\/the-starforge-spire&#39;s ways|is not one of darko\/the-starforge-spire's ways/);
  assert.doesNotMatch(html, /This leads more than one way/);
  assert.equal((html.match(/class="wv-cross-way"/g) ?? []).length, 2);
});

test("from outside the door, the walk there carries the pick", () => {
  const offer = { mark: SPIRE, to: { x: 1, y: 2 } };
  assert.match(walkThereSheetHTML(offer, "", { into: "darko/spire-gilded-vestibule" }), /data-walk-enter="darko\/the-starforge-spire" data-into="darko\/spire-gilded-vestibule"/);
  assert.doesNotMatch(walkThereSheetHTML(offer, ""), /data-into=/);
});

test("pins: the wrong pick re-asks before any error line; the walk door takes into", () => {
  assert.match(SOURCE, /if \(answer\.error === "bounce" && Array\.isArray\(answer\.choose\) && answer\.choose\.length\) \{[\s\S]*?chooseWaySheetHTML\(answer, markId,[\s\S]*?return;\s*\}\s*if \(answer\.error === "bounce"\) throw/);
  assert.match(SOURCE, /walkThereSheetHTML\(offer, answer\.defect, \{ into \}\)/);
  assert.match(SOURCE, /apexAct\("walk", \{ mark_id: markId, enter_on_arrival: true, \.\.\.\(into \? \{ into \} : \{\}\), \.\.\.\(accept \? \{ accept: true \} : \{\}\) \}\)/);
  assert.match(SOURCE, /walkThereAndEnter\(walkEnterBtn\.dataset\.walkEnter, \{ into: walkEnterBtn\.dataset\.into \|\| null, button: walkEnterBtn \}\)/);
});
