// live-creatures.test.mjs — play fix 35: the office's living creatures on the
// World page. WLD-56 D5 (Darko 2026-10-15 12:09): the painted creatures stay
// inside the wall as the Mists' own life; the LIVE ones are drawn where they
// stand, join the nameplate and the column, and their answer to an act shows as
// a small note. The shapes below are the office's own answers, as read from the
// playground at 19:xx (GET /world/apex?find=creature and ?investigate=<id>).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isCreatureId, liveCreaturesFrom, creatureReactionLines, creatureColumnFacts, creatureGlyphSVG, creatureDiamond, CREATURE_GLYPH, WALKER_FRAME,
} from "../spectator/viewer.mjs";
import { creatureSilhouette } from "../spectator/mists-render.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
const FOUND = { found: { hits: [], creatures: [
  { id: "creature:wolf-251-play1", kind: "wolf", name: "a grey wolf", at: { x: 3698, y: -5500 }, fades_in: "11h 55m" },
  { id: "creature:raven-251-3", kind: "raven", name: "a raven", at: { x: 420, y: -4425 }, fades_in: "3h 54m" },
  { id: "the-town/not-a-creature", kind: "wolf", at: { x: 0, y: 0 } },
  { id: "creature:bat-251-9", kind: "bat", at: { x: "nowhere" } },
] } };
const INVESTIGATED = {
  kind: "creature", id: "creature:wolf-251-play1", name: "a grey wolf",
  what_it_is: "A wolf that came out of the Mists with the season.",
  presence: { now: { at: { x: 3698, y: -5500 }, state: "out of the Mists", moods: { fear: "1 of 3", curiosity: "1 of 3", hunger: "2 of 3" },
    out_since: "2026-10-15T23:06:07.245Z", fades_at: "2026-10-16T11:06:07.245Z", remembers: 1 } },
  reactions: { shown: 1, rows: [{ to: "visitor", verb: "say", reaction: "watch",
    line: "At the edge of the Mists a grey wolf stands perfectly still, watching visitor.", at: "2026-10-15T23:06:28.230Z" }] },
};

test("the living set is read from the office's find answer; anything not a creature with a point is left out", () => {
  const rows = liveCreaturesFrom(FOUND);
  assert.deepEqual(rows.map((c) => c.id), ["creature:wolf-251-play1", "creature:raven-251-3"]);
  assert.deepEqual(rows[0], { id: "creature:wolf-251-play1", kind: "wolf", name: "a grey wolf", x: 3698, y: -5500, fades_in: "11h 55m" });
  assert.deepEqual(liveCreaturesFrom(null), [], "no answer, no creatures");
  assert.ok(isCreatureId("creature:wolf-251-1") && !isCreatureId("creature:") && !isCreatureId("walker:visitor"));
});

test("an act's answer carries the creatures' lines, wherever the office put them", () => {
  const line = "At the edge of the Mists a grey wolf stands perfectly still, watching visitor.";
  assert.deepEqual(creatureReactionLines({ did: "say", result: { spoke: true, creatures: [{ id: "creature:wolf-251-play1", line }] } }), [line]);
  assert.deepEqual(creatureReactionLines({ creatures: [{ line }, { line: "  " }] }), [line], "an empty line says nothing");
  assert.deepEqual(creatureReactionLines({ did: "say", result: { spoke: true } }), [], "no creature answered, no note");
});

test("a creature's column: its kind, what it is doing, its moods as bars, when it came out and fades, and what it did lately", () => {
  const [wolf] = liveCreaturesFrom(FOUND);
  // CHANGED by play row 54: the times are the reader's own clock, never UTC (here, EDT)
  const { facts, lately, bars } = creatureColumnFacts(wolf, INVESTIGATED, { timeZone: "America/New_York" });
  const by = Object.fromEntries(facts.map((f) => [f.label, f.value]));
  assert.equal(by.kind, "wolf");
  assert.equal(by.doing, "out of the Mists");
  // CHANGED by play fix 41: the moods are BARS, one per mood, and the bare
  // "remembers" count (which repeated the lately rows) is gone
  assert.deepEqual(bars, [{ label: "fear", value: 1, max: 3 }, { label: "curiosity", value: 1, max: 3 }, { label: "hunger", value: 2, max: 3 }]);
  assert.equal(by.moods, undefined, "no moods line");
  assert.equal(by.remembers, undefined, "no bare count");
  assert.equal(by["out since"], "Oct 15, 7:06 PM");
  assert.equal(by.fades, "in 11h 55m (Oct 16, 7:06 AM)");
  assert.deepEqual(lately, [{ label: "lately", value: "At the edge of the Mists a grey wolf stands perfectly still, watching visitor. (Oct 15, 7:06 PM)" }]);
  // before its reading lands, the find row alone still says what it can
  assert.deepEqual(creatureColumnFacts(wolf, null).facts.map((f) => f.label), ["kind", "fades"]);
});

test("on the painting: a TOKEN, a pastel red diamond with the kind's silhouette inside (play fix 40; WLD-82)", () => {
  const [wolf] = liveCreaturesFrom(FOUND);
  const svg = creatureGlyphSVG({ creature: wolf, at: { x: 10, y: 20 }, silhouette: creatureSilhouette("wolf") });
  assert.match(svg, /^<g transform="translate\(10 20\)"><g class="ov-s">/, "held at a constant size on screen, as a walker is");
  assert.match(svg, /data-creature="creature:wolf-251-play1"/);
  // a diamond scaled from the walker's near token (the same area as its circle), and no legs
  assert.equal(CREATURE_GLYPH.size, WALKER_FRAME.near, "scaled from a resident's near token");
  const { points } = creatureDiamond(WALKER_FRAME.near);
  assert.equal(points, "0,-13.79 13.79,0 0,13.79 -13.79,0", "half-diagonal 11·√(π/2): the circle's area");
  assert.match(svg, new RegExp(`<polygon points="${points}" class="ov-creature-disc"/>`), "a diamond where a portrait sits");
  assert.match(svg, new RegExp(`<polygon points="${points}" class="ov-creature-ring"/>`), "and its rim");
  assert.doesNotMatch(svg, /ov-creature-leg|<line /, "no legs");
  // the silhouette is inside the diamond, clipped to it: no freeform art on the map
  assert.ok(svg.includes(creatureSilhouette("wolf").d), "the Mists' own wolf");
  assert.match(svg, new RegExp(`<clipPath id="wv-ct-creaturewolf-251-play1"><polygon points="${points}"/></clipPath>`));
  assert.doesNotMatch(svg, /ov-creature-pip/, "no pip beside the token; the token says what it is");
  assert.equal(creatureGlyphSVG({ creature: wolf, at: { x: "x", y: 0 } }), "", "no point, no drawing");
  assert.notEqual(creatureSilhouette("bat").d, creatureSilhouette("wolf").d, "each kind its own art");
  const SRC = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
  assert.match(SRC, /\.ov-creature-disc \{ fill:#f4b4ad;/, "pastel red");
  assert.doesNotMatch(SRC.match(/\.ov-creature-[a-z]+ \{[^}]*\}/g).join(" "), /stamp-violet|#aa8fd8|purple/, "never the stamps' purple");
});

test("[pin] the page reads the office's own keyless doors, draws over the paint, hides what the wall hides, and notes an act's answer", () => {
  assert.match(SOURCE, /fetch\(officeUrl\("\/world\/apex\?find=creature"\)/, "the living set: the apex's find focus");
  assert.match(SOURCE, /officeUrl\(`\/world\/apex\?investigate=\$\{encodeURIComponent\(id\)\}`\)/, "one creature whole: the investigate focus");
  assert.match(SOURCE, /stageTop\.appendChild\(creatureLayer\);/, "over the Mists' paint, which hazes the fringe");
  assert.match(SOURCE, /\.ov-creature-hit \{ fill:transparent; pointer-events:none; \}/, "the stage never takes the pointer from the map");
  assert.match(SOURCE, /if \(m && mistsHere\(\{ x: c\.x, y: c\.y \}, m\)\.inWall\) continue;/, "behind the wall stays the wall's (POS-466)");
  assert.match(SOURCE, /if \(sceneRoomId && !\(box && pointInRect\(c\.x, c\.y, box\)\)\) continue;/, "indoors, only the room's own");
  // CHANGED by row 86: the answer is said at each creature's token; the note only for one off the page
  assert.match(SOURCE, /const answered = creatureReactionLines\(raw\);\s*if \(answered\.length\) \{[\s\S]*?creatureSay\(r\.id, line\);[\s\S]*?if \(offPage\.length\) creatureNote\(offPage\);/, "every act's answer, through the one apex door");
  assert.match(SOURCE, /if \(isCreatureId\(id\)\) \{\s*if \(markInteraction\.getState\(\)\.selectedId === id\) \{ markInteraction\.select\(null\); return false; \}/, "selected like a face");
  assert.match(SOURCE, /regionColumnView\(selected\) \?\? creatureColumnView\(selected\) \?\? (residentColumnView\(selected\) \?\? )?markColumnView\(selected\)/, "and opens the column");
});
