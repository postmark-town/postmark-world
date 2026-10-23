// property-rails.test.mjs — the meta-class's rails over class space, as the gate runs them
// (LOGOS v2 part 2, W1; LOGOS/classes.md § The meta-class: "admissible param bounds …,
// slot naming grammar, collision rules, and the locks").
//
// Each case builds a throwaway tree (the world root and a small Keeping Works, whose
// classes and properties are LAW NODES in a foundry beside the marks, WLD-116),
// runs tools/mark-lint.mjs on it as a real subprocess, and reads the finding by
// name. The live tree's own answer is the suite's other half: the lint's CLEAN
// over WORLD/marks.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, cpSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { putFoundry } from "./law-fixture.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LINT = join(HERE, "mark-lint.mjs");
const REAL = join(HERE, "..", "WORLD", "marks", "let-there-be-light");
const SCRATCH = [];
after(() => { for (const d of SCRATCH) rmSync(d, { recursive: true, force: true }); });

const fm = (fields, body) =>
  `---\n${Object.entries(fields).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n\n${body}\n`;
// a record under a fixture's _law/ is a law node (node.md); anywhere else, a mark (mark.md)
const node = (dir, fields, body = "A clause of the fixture's class space, long enough to read.") => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, /[\\/]_law[\\/]/.test(dir) ? "node.md" : "mark.md"), fm(fields, body));
  return dir;
};
// a class carries its FOUNDRY's tier: constitution in the Keeping Works, biome in a biome's
const cls = (dir, name, ext, by = "the-town") =>
  node(join(dir, name), { kind: "class", by, tier: by === "the-town" ? "constitution" : "biome", date: "2026-10-17", class: name, extends: ext });
/** A biome foundry that a household writes in (its config is the permission), extending the Keeping Works. */
const householdFoundry = (dir, name, author) => {
  const root = putFoundry(dir, name, { tier: "biome", extends: "the-keeping-works", authors: ["the-town", author] });
  return root;
};
const prop = (dir, slug, { name, tier, dflt, of }) =>
  node(join(dir, slug), { kind: "property", by: "the-town", tier, date: "2026-10-17", name, of, default: dflt });

/** The world root, the Keeping Works, and thing with holder → capacity → min/max, flat with of:. */
function tree() {
  const dir = mkdtempSync(join(tmpdir(), "rails-")); SCRATCH.push(dir);
  const root = join(dir, "let-there-be-light");
  mkdirSync(root, { recursive: true });
  copyFileSync(join(REAL, "mark.md"), join(root, "mark.md"));
  cpSync(join(REAL, "logos"), join(root, "logos"), { recursive: true });
  const works = putFoundry(dir); // the Keeping Works' foundry: WORLD/law/the-keeping-works, here <dir>/_law/the-keeping-works
  const thing = cls(works, "thing", undefined);
  prop(thing, "thing-holder", { name: "holder", tier: "sovereign", dflt: "false" });
  prop(thing, "thing-capacity", { name: "capacity", tier: "sovereign", dflt: 30, of: "the-town/thing-holder" });
  prop(thing, "thing-capacity-min", { name: "min", tier: "constitution", dflt: 1, of: "the-town/thing-capacity" });
  prop(thing, "thing-capacity-max", { name: "max", tier: "constitution", dflt: 120, of: "the-town/thing-capacity" });
  prop(thing, "thing-take-requires-welcome", { name: "take_requires_welcome", tier: "constitution", dflt: "false" });
  prop(thing, "thing-portable", { name: "portable", tier: "sovereign", dflt: "true" });
  return { dir, root, works, thing };
}
const lint = (dir) => {
  try { return { code: 0, out: execFileSync("node", [LINT, "--marks-dir", dir], { encoding: "utf8" }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout ?? "") + String(e.stderr ?? "") }; }
};

test("the control: thing's holder → capacity → min/max, flat with of:, lints clean", () => {
  const { dir } = tree();
  const r = lint(dir);
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /ERROR/);
});

test("a default stands within its own bounds, and the bounds are in order", () => {
  const t = tree();
  prop(t.thing, "thing-capacity", { name: "capacity", tier: "sovereign", dflt: 121, of: "the-town/thing-holder" });
  assert.match(lint(t.dir).out, /\[ERROR\][^\n]*thing-capacity: holder → capacity's default 121 is above its max 120 in the-town\/thing/);
  const u = tree();
  prop(u.thing, "thing-capacity-min", { name: "min", tier: "constitution", dflt: 200, of: "the-town/thing-capacity" });
  assert.match(lint(u.dir).out, /holder → capacity's bounds are out of order in the-town\/thing: min 200 > max 120/);
});

test("BY PATH (WLD-73 S2): a subclass's default stands within the bounds it inherits", () => {
  // a town subclass that sets capacity 500 and no max of its own is held to thing's 120
  const t = tree();
  const crate = cls(t.thing, "a-crate", "thing");
  prop(crate, "a-crate-holder", { name: "holder", tier: "constitution", dflt: "true" });
  prop(crate, "a-crate-capacity", { name: "capacity", tier: "sovereign", dflt: 500, of: "the-town/a-crate-holder" });
  assert.match(lint(t.dir).out, /a-crate-capacity: holder → capacity's default 500 is above its max 120 \(thing's\) in the-town\/a-crate/);
  // the Candy Bag's shape passes: its own max 200 over thing's 120
  const u = tree();
  const bag = cls(u.thing, "a-bag", "thing");
  prop(bag, "a-bag-holder", { name: "holder", tier: "constitution", dflt: "true" });
  prop(bag, "a-bag-capacity", { name: "capacity", tier: "sovereign", dflt: 200, of: "the-town/a-bag-holder" });
  prop(bag, "a-bag-capacity-max", { name: "max", tier: "constitution", dflt: 200, of: "the-town/a-bag-capacity" });
  assert.doesNotMatch(lint(u.dir).out, /ERROR/);
});

test("BY PATH (WLD-73 S1): the lock reaches a child — a household's holder → capacity → max is refused", () => {
  const t = tree();
  const box = cls(householdFoundry(t.dir, "alices-foundry", "alice"), "alices-box", "thing", "alice");
  prop(box, "alices-box-holder", { name: "holder", tier: "sovereign", dflt: "true" });
  prop(box, "alices-box-capacity", { name: "capacity", tier: "sovereign", dflt: 40, of: "the-town/alices-box-holder" });
  prop(box, "alices-box-capacity-max", { name: "max", tier: "constitution", dflt: 400, of: "the-town/alices-box-capacity" });
  const out = lint(t.dir).out;
  assert.match(out, /alices-box-capacity-max: alice\/alices-box redeclares thing's holder → capacity → max, a constitution property/);
  assert.doesNotMatch(out, /alices-box-capacity: [^\n]*redeclares/, "capacity is sovereign: the maker's to set");
});

test("G9 as amended (WLD-73 B2): no property name may be a class's name, but the eight grandfathered keep theirs", () => {
  const t = tree();
  cls(t.works, "lantern", undefined);
  prop(t.thing, "thing-lantern", { name: "lantern", tier: "sovereign", dflt: "false" });
  assert.match(lint(t.dir).out, /thing-lantern: property name "lantern" is a class's name/);
  // a grandfathered id keeps its clashing name (the office reads it verbatim)
  const u = tree();
  cls(u.works, "stakeable", undefined);
  const mark = cls(u.works, "mark", undefined);
  prop(mark, "mark-stakeable-slot", { name: "stakeable", tier: "constitution", dflt: "mark-mode" });
  assert.doesNotMatch(lint(u.dir).out, /mark-stakeable-slot: property name/);
});

test("of: names a property of the same class, or it is refused by name", () => {
  const t = tree();
  prop(t.thing, "thing-open", { name: "open", tier: "sovereign", dflt: "true", of: "the-town/no-such-property" });
  assert.match(lint(t.dir).out, /thing-open: of: "the-town\/no-such-property" names no property/);
  const u = tree();
  const resident = cls(u.works, "resident", undefined);
  prop(resident, "resident-holder", { name: "holder", tier: "constitution", dflt: "true" });
  prop(u.thing, "thing-open", { name: "open", tier: "sovereign", dflt: "true", of: "the-town/resident-holder" });
  assert.match(lint(u.dir).out, /thing-open: of: the-town\/resident-holder is another class's property/);
});

test("no two properties of one node share a name", () => {
  const t = tree();
  prop(t.thing, "thing-portable-again", { name: "portable", tier: "sovereign", dflt: "false" });
  assert.match(lint(t.dir).out, /two properties of the-town\/thing share the name "portable"/);
});

test("the naming grammar: lowercase words joined by _ or -", () => {
  const t = tree();
  prop(t.thing, "thing-bad-name", { name: "Bad Name", tier: "sovereign", dflt: "1" });
  assert.match(lint(t.dir).out, /property name "Bad Name" breaks the naming grammar/);
});

test("THE LOCKS (settled 2026-10-17, WLD-73 G6): a town subclass may set a constitution value; a household's may not", () => {
  // the town's own subclass sets its own bound above thing's: the Candy Bag's 200
  const t = tree();
  const bag = cls(t.thing, "halloween-candy-bag", "thing");
  prop(bag, "halloween-candy-bag-take-requires-welcome", { name: "take_requires_welcome", tier: "constitution", dflt: "true" });
  const r = lint(t.dir);
  assert.doesNotMatch(r.out, /redeclares/, "the town's subclass shadows a constitution value: constitution is the town's word");
  // a household's subclass may shadow only a sovereign property
  const u = tree();
  const box = cls(householdFoundry(u.dir, "alices-foundry", "alice"), "alices-box", "thing", "alice");
  prop(box, "alices-box-take-requires-welcome", { name: "take_requires_welcome", tier: "constitution", dflt: "true" });
  prop(box, "alices-box-portable", { name: "portable", tier: "sovereign", dflt: "false" });
  const out = lint(u.dir).out;
  assert.match(out, /alices-box-take-requires-welcome: alice\/alices-box redeclares thing's take_requires_welcome, a constitution property/);
  assert.doesNotMatch(out, /alices-box-portable: [^\n]*redeclares/, "a sovereign property is the maker's to set");
});

test("no two kinds share a name, and a class's name is its own slug", () => {
  const t = tree();
  node(join(t.works, "a-second-thing"), { kind: "class", by: "the-town", tier: "constitution", date: "2026-10-17", class: "thing" });
  const out = lint(t.dir).out;
  assert.match(out, /a-second-thing: class: "thing" is not its own slug "a-second-thing"/);
  assert.match(out, /two kinds share the name "thing"/);
});

test("a mark path past 180 characters is refused, naming the path (Windows MAX_PATH)", () => {
  const t = tree();
  let d = t.thing;
  for (let i = 0; i < 4; i++) d = join(d, `a-very-long-folder-name-for-the-path-rule-${i}`);
  prop(d, "thing-deep", { name: "deep", tier: "sovereign", dflt: "1" });
  assert.match(lint(t.dir).out, /\[ERROR\][^\n]*thing-deep: the mark path [^\n]+ is \d+ characters; the most is 180/);
});

test("a flat field must be a declared property: an advisory, one per class and field", () => {
  const t = tree();
  for (const n of [1, 2])
    node(join(t.root, `a-lantern-${n}`), { kind: "sited", by: "jetto", date: "2026-10-17", at: "{ x: 0, y: 0 }", extent: "{ w: 1, h: 1 }", class: "thing", portable: "false", glow: "amber" }, "A pocket lantern.");
  const out = lint(t.dir).out;
  assert.match(out, /\[WARN\][^\n]*flat field glow: is no declared property of thing \(2 mark\(s\) of thing carry it/);
  assert.doesNotMatch(out, /flat field portable:/, "portable is thing's own property");
  assert.doesNotMatch(out, /\[ERROR\][^\n]*a-lantern/, "an advisory, never a refusal");
});

test("G13 (settled 2026-10-17): a place is lawful on a class under sited or post, and refused anywhere else", () => {
  const rooted = (townExtends) => {
    const t = tree();
    cls(t.works, "postmark-node", undefined);
    cls(t.works, "mark", "postmark-node");
    cls(t.works, "sited", "mark");
    cls(t.works, "post", "postmark-node");
    cls(t.works, "idea", "post");
    cls(t.works, "entity", "postmark-node");
    cls(t.works, "town", townExtends);
    node(join(t.root, "a-harbor-charter"), { kind: "sited", by: "the-town", tier: "constitution", date: "2026-08-18", at: "{ x: 10, y: 10 }", extent: "{ w: 5, h: 5 }", class: "town" }, "A harbor town's charter.");
    node(join(t.root, "a-placed-idea"), { kind: "sited", by: "jetto", date: "2026-10-01", at: "{ x: 20, y: 20 }", extent: "{ w: 1, h: 1 }", class: "idea" }, "A thought planted in the ground it is of.");
    return lint(t.dir);
  };
  const under = rooted("entity");
  assert.match(under.out, /\[ERROR\][^\n]*a-harbor-charter: a town stands at a place, but town is not under sited \(its chain: town → entity → postmark-node\)/);
  assert.doesNotMatch(under.out, /a-placed-idea: [^\n]*stands at a place/, "an idea may stand anywhere (founder-ruled 2026-09-01): post's chain is lawful");
  const sited = rooted("sited");
  assert.doesNotMatch(sited.out, /stands at a place, but/, "with town under sited, its charters stand lawfully");
});

test("G13 in the new form (W2): kind: town under entity is refused; under sited it stands", () => {
  const rooted = (townExtends) => {
    const t = tree();
    cls(t.works, "postmark-node", undefined);
    cls(t.works, "mark", "postmark-node");
    cls(t.works, "sited", "mark");
    cls(t.works, "entity", "postmark-node");
    cls(t.works, "town", townExtends);
    node(join(t.root, "a-harbor-charter"), { kind: "town", by: "the-town", tier: "constitution", date: "2026-08-18", at: "{ x: 10, y: 10 }", extent: "{ w: 5, h: 5 }" }, "A harbor town's charter.");
    return lint(t.dir).out;
  };
  const under = rooted("entity");
  assert.match(under, /a-harbor-charter: kind: town names a class whose instances do not stand in the record/);
  assert.match(under, /a-harbor-charter: a town stands at a place, but town is not under sited/);
  assert.doesNotMatch(rooted("sited"), /a-harbor-charter: [^\n]*(do not stand|stands at a place, but)/);
});
