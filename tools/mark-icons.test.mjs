// mark-icons.test.mjs — what a mark is and what state it is in, as icons
// (Darko, playground sitting 2026-10-15). The vocabulary is closed; every icon is
// read from the record through the world's own readers; idea and bounty get none.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MARK_ICONS, markWhat, markStates, markIcons, creatureClassesOf, thingClassesOf, iconSVG, iconsHTML, MARK_ICON_CSS,
} from "../spectator/mark-icons.mjs";
import { overlayPipSVG, iconPillSVG } from "../spectator/viewer.mjs";
import { instanceClassOf } from "./mark-kind.mjs"; // either form (LOGOS v2 W2)

const sited = (extra = {}) => ({ id: "h/m", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 4, h: 4 }, ...extra });
const tok = (c) => String(c ?? "").trim().toLowerCase();

test("the vocabulary is closed: eight things a mark can be, a ninth glyph for a conversation (which is no mark), six states, and no idea or bounty", () => {
  const what = Object.entries(MARK_ICONS).filter(([, d]) => d.kind === "what").map(([k]) => k);
  const state = Object.entries(MARK_ICONS).filter(([, d]) => d.kind === "state").map(([k]) => k);
  assert.deepEqual(what, ["place", "home", "thing", "door", "dungeon", "stairs", "vehicle", "creature", "conversation"]);
  assert.equal(markWhat(sited({ class: "conversation" }), { cls: "conversation" }), "place", "a conversation is never what a MARK is: markWhat never answers it (POS-779)");
  assert.deepEqual(state, ["yours", "locked", "consent", "staked", "inside", "soon"]);
  for (const [key, def] of Object.entries(MARK_ICONS)) {
    assert.ok(def.meaning.length > 10 && def.meaning.length < 90, `${key} says what it means in one line`);
    assert.match(def.d, /^M /, `${key} is a path`);
  }
  assert.equal(markWhat(sited({ class: "idea" }), { cls: "idea" }), null, "an idea wears no icon");
  assert.equal(markWhat(sited({ class: "bounty" }), { cls: "bounty" }), null, "nor a bounty");
});

test("LOGOS v2 W2: a mark whose kind names its class is read as the sited mark it was", () => {
  const w2 = (kind, extra = {}) => ({ id: "h/m", kind, at: { x: 0, y: 0 }, extent: { w: 4, h: 4 }, ...extra });
  for (const cls of ["thing", "dungeon", "stairs", "vehicle"]) {
    const m = w2(cls);
    assert.equal(instanceClassOf(m), cls, `the kind names the class (${cls})`);
    assert.equal(markWhat(m, { cls: tok(instanceClassOf(m)) }), markWhat(sited({ class: cls }), { cls }),
      `kind: ${cls} reads as the sited mark of class ${cls}`);
  }
  assert.equal(markWhat(w2("thing"), { cls: "thing" }), "thing", "not null: a W2 mark still wears its icon");
  // ⚑ THE FLIP: restore `if (mark.kind !== "sited") return null;` in markWhat → red.
});

test("what a mark is, read from the record", () => {
  assert.equal(markWhat({ id: "h/p", kind: "parcel" }), "home");
  assert.equal(markWhat(sited()), "place", "a plain sited mark is a place");
  assert.equal(markWhat(sited({ class: "thing" }), { cls: "thing" }), "thing");
  assert.equal(markWhat(sited({ class: "dungeon" }), { cls: "dungeon" }), "dungeon");
  assert.equal(markWhat(sited({ class: "stairs" }), { cls: "stairs" }), "stairs",
    "a stair is a portal by its class's law, and is still called stairs");
  assert.equal(markWhat(sited({ entry: { word: "welcomed", into: "h/room" } })), "door", "a law that carries `into` is a door");
  assert.equal(markWhat(sited({ class: "portal-ground" }), { cls: "portal-ground" }), "door", "and so is a portal-ground");
  assert.equal(markWhat(sited({ class: "thing", entry: { into: "h/inside" } }), { cls: "thing" }), "door", "a door outranks a thing");
  assert.equal(markWhat(sited({ class: "vehicle" }), { cls: "vehicle" }), "vehicle");
  const creatures = creatureClassesOf([
    { kind: "class", class: "creature" },
    { kind: "class", class: "wolf", extends: "creature" },
    { kind: "class", class: "lamp", extends: "thing" },
  ], tok);
  assert.deepEqual([...creatures].sort(), ["creature", "wolf"], "the creature classes are the record's own");
  assert.equal(markWhat(sited({ class: "wolf" }), { cls: "wolf", creatureClasses: creatures }), "creature");
  assert.equal(markWhat({ id: "the-town/wolf", kind: "class", class: "wolf" }, { cls: "wolf", creatureClasses: creatures }), null,
    "a class's declaration is not an instance of it");
  assert.equal(markWhat({ id: "h/p/slot", kind: "predicated" }), null, "a predicate is nothing on its own");
});

test("the state badges, in their fixed order, and the stairs' promise is not a lock", () => {
  const stairs = sited({ class: "stairs" });
  assert.deepEqual(markStates(stairs).map((s) => s.key), ["soon"], "the stairs class's answer is coming soon");
  assert.deepEqual(markStates(sited({ entry: { word: "opposed", consequence: "No." } })).map((s) => s.key), ["locked"]);
  assert.deepEqual(markStates(sited({ entry: { word: "neutral", edge: "within" } })).map((s) => s.key), ["consent"]);
  assert.deepEqual(markStates(sited(), { yours: true, weight: 12, inside: 2 }),
    [{ key: "yours" }, { key: "staked", count: 12 }, { key: "inside", count: 2 }]);
  assert.deepEqual(markStates(sited(), { weight: 0, inside: 0 }), [], "nothing true, nothing drawn");
  const icons = markIcons(sited({ class: "vehicle", entry: { word: "welcomed", edge: "aboard" } }), { cls: "vehicle", weight: 3, inside: 1 });
  assert.deepEqual(icons.map((i) => i.key), ["vehicle", "consent", "staked", "inside"], "what first, then the states");
  assert.equal(icons.find((i) => i.key === "staked").meaning, "Staked: ✦ 3 behind it.", "a count is said in the meaning");
  assert.equal(icons.find((i) => i.key === "inside").meaning, "People inside: 1 person is inside it now.");
});

test("the real record: the Spire, its doors and stairs, and the Post Office", () => {
  const state = JSON.parse(readFileSync(new URL("../WORLD/world-state.json", import.meta.url), "utf8"));
  const byId = new Map(state.marks.map((m) => [m.id, m]));
  const creatures = creatureClassesOf(state.marks, tok);
  assert.ok(creatures.has("wolf") && creatures.has("raven") && creatures.has("bat"), "the record's creature classes");
  const keys = (id) => markIcons(byId.get(id), { cls: tok(instanceClassOf(byId.get(id))), creatureClasses: creatures }).map((i) => i.key);
  for (const [id, want] of [
    ["the-town/the-post-office", ["vehicle", "consent"]],
    ["wright/the-cellar-door", ["door", "consent"]],
  ]) assert.deepEqual(keys(id), want, id);
  // the Spire rides the playground's scenario, so it is asked only where it stands
  if (byId.has("darko/the-starforge-spire")) {
    assert.deepEqual(keys("darko/the-starforge-spire"), ["dungeon"]);
    assert.deepEqual(keys("darko/spire-gilded-doors"), ["door"]);
    assert.deepEqual(keys("darko/spire-the-little-spiral"), ["stairs", "soon"]);
  }
});

test("one drawing, three surfaces: the map's SVG, the nameplate's spans, the CSS masks", () => {
  const svg = iconSVG({ key: "door", meaning: "A <door>" }, { x: 2, y: 3, size: 9 });
  assert.match(svg, /<title>A &lt;door&gt;<\/title>/, "the map's icon says its meaning on hover, escaped");
  assert.match(svg, new RegExp(MARK_ICONS.door.d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "with the one path");
  assert.equal(iconSVG({ key: "nope" }), "", "an unknown key draws nothing");
  const html = iconsHTML([{ key: "staked", label: "staked", meaning: "Staked: ✦ 3 behind it.", count: 3 }]);
  assert.match(html, /title="Staked: ✦ 3 behind it\."/);
  assert.match(html, /class="wv-ic ic-staked"/);
  assert.match(html, /<span class="wv-icn">3<\/span>/, "a count rides beside its icon");
  for (const key of Object.keys(MARK_ICONS))
    assert.match(MARK_ICON_CSS, new RegExp(`\\.wv-ic\\.ic-${key} \\{ --wv-ic:url\\("data:image/svg\\+xml,`), `${key} has its mask`);
});

test("on the map: the glyph is cut into the dot, replacing the doorway; states ride in a pill", () => {
  const bare = overlayPipSVG({ at: { x: 1, y: 2 }, id: "h/m", classes: "t-market c-portal-ground" });
  assert.match(bare, /ov-pip-door/, "without an icon a portal-ground keeps its doorway");
  const inner = iconSVG({ key: "door" }, { x: -7, y: -7, size: 14, ink: "var(--night)" });
  const withIcon = overlayPipSVG({ at: { x: 1, y: 2 }, id: "h/m", classes: "t-market c-portal-ground", inner });
  assert.doesNotMatch(withIcon, /ov-pip-door/, "with one, the door glyph is the doorway");
  assert.match(withIcon, /<circle [^>]*class="ov-pip t-market c-portal-ground" data-id="h\/m"/, "and the dot is untouched");
  assert.match(withIcon, /class="ov-ic-in"/);
  assert.equal(iconPillSVG([], { at: { x: 0, y: 0 } }), "", "no states, no pill");
  const pill = iconPillSVG([{ key: "staked", meaning: "m" }, { key: "inside", meaning: "n" }], { at: { x: 5, y: 6 }, dx: 13, dy: -6.5 });
  assert.match(pill, /^<g transform="translate\(5 6\)"><g class="ov-s">/, "sized by the camera like a pip");
  assert.equal((pill.match(/class="ov-ic /g) ?? []).length, 2, "one glyph per state");
});

test("[pin] the plate wears what the mark is before its name and its states after; a mark with no icon keeps the dot", () => {
  const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
  const fn = SOURCE.match(/function markNameplateHTML\(id\) \{[\s\S]*?\n  \}\n/)[0];
  assert.ok(fn.indexOf("wv-np-what") < fn.indexOf("wv-np-name") && fn.indexOf("wv-np-name") < fn.indexOf("wv-np-icons"),
    "icon, name, states");
  assert.match(fn, /: `<span class="wv-np-dot \$\{markClasses\(full\)\}" aria-hidden="true"><\/span>`/, "the dot when there is no icon");
});

test("one resident icon: the walker's token, in sovereign green; a creature is a red diamond (WLD-82); never the stamps' purple (play fix 43)", () => {
  assert.notEqual(MARK_ICONS.inside.d, MARK_ICONS.creature.d, "a creature never wears a resident's body (WLD-82)");
  assert.equal(MARK_ICONS.creature.d, "M 8 1.6 L 14.4 8 L 8 14.4 L 1.6 8 Z", "a diamond: four points, no legs");
  assert.ok(MARK_ICONS.inside.fill && MARK_ICONS.creature.fill, "filled, as the token's frame is on the map");
  assert.match(MARK_ICONS.inside.d, /^M 3\.4 6\.6 a 4\.6 4\.6/, "a round frame…");
  assert.equal((MARK_ICONS.inside.d.match(/ Z/g) ?? []).length, 3, "…and two stubby legs");
  assert.match(MARK_ICONS_CSS_OF("inside"), /color:var\(--green, #84c98f\)/, "a resident is green");
  assert.match(MARK_ICONS_CSS_OF("creature"), /color:#e6948c/, "a creature is red");
  for (const key of ["inside", "creature"]) assert.doesNotMatch(MARK_ICONS_CSS_OF(key), /stamp-violet|#aa8fd8/, `${key} is never purple`);
});
function MARK_ICONS_CSS_OF(key) { return MARK_ICON_CSS.split("\n").find((l) => l.startsWith(`.wv-ic.ic-${key} `)) ?? ""; }

test("the door is a door (play row 71, Darko 19:00): upright, with a knob; never the plan view's swing", () => {
  const d = MARK_ICONS.door.d;
  assert.match(d, /^M 4 13\.5 V 2\.5 H 12 V 13\.5 Z /, "the door itself, standing");
  assert.doesNotMatch(d, /A 10 10/, "no swing arc");
  assert.notEqual(d, MARK_ICONS.dungeon.d);
  assert.notEqual(d, MARK_ICONS.stairs.d);
});

test("a kind of thing is a thing (LOGOS v2 part 2, POS-678): the Halloween bowl read 'A place'", () => {
  const tok = (c) => String(c ?? "").trim().toLowerCase();
  // the file's `extends`, and the fold's `parent` (which drops extends), each followed to a fixed point
  const things = thingClassesOf([
    { id: "the-town/thing", kind: "class", class: "thing" },
    { id: "the-town/halloween-candy-bowl", kind: "class", class: "halloween-candy-bowl", extends: "thing" },
    { id: "the-town/a-deep-bowl", kind: "class", class: "a-deep-bowl", parent: "the-town/halloween-candy-bowl" },
    { id: "the-town/portal-ground", kind: "class", class: "portal-ground", extends: "sited" },
  ], tok);
  assert.deepEqual([...things].sort(), ["a-deep-bowl", "halloween-candy-bowl", "thing"]);
  const bowl = { id: "h/a-bowl", kind: "halloween-candy-bowl", at: { x: 0, y: 0 }, extent: { w: 1, h: 1 } };
  assert.equal(markWhat(bowl, { cls: "halloween-candy-bowl", thingClasses: things }), "thing");
  assert.equal(markWhat(bowl, { cls: "halloween-candy-bowl" }), "place", "with no lineage in hand, the old answer stands");
  assert.equal(markIcons(bowl, { cls: "halloween-candy-bowl", thingClasses: things })[0].meaning,
    "A thing: an object in the world, not ground to stand on.");
});

test("POS-779: a conversation has its own glyph in the family, in the map's gray-white", () => {
  assert.equal(MARK_ICONS.conversation.kind, "what");
  assert.match(MARK_ICONS.conversation.d, /^M 2\.5 3\.5 H 13\.5/, "a speech bubble");
  assert.notEqual(MARK_ICONS.conversation.d, MARK_ICONS.place.d);
  assert.match(MARK_ICONS_CSS_OF("conversation"), /color:#cfd6dd/, "gray-white (Darko 2026-10-24)");
  const svg = iconSVG({ key: "conversation" }, { x: -6, y: -6, size: 12, ink: "#2b323a" });
  assert.match(svg, /class="ov-ic ic-conversation"/);
  assert.match(svg, /voices within earshot/);
});
