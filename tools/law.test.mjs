// law.test.mjs — CLASSES ARE LAW NODES, NEVER MARKS (WLD-116).
//
// Three halves:
//   1. tools/law.mjs, pure: the one test of what is a class, the foundry table, the
//      rules between foundries (tier, authors, a name that is one class, the ladder
//      that runs down the chain and never up).
//   2. a TEST-ONLY fixture foundry (a biome's, extending the Keeping Works) read from
//      disk and held to the real lint as a subprocess: a biome class extending a
//      Keeping Works class RESOLVES; a contradiction is REFUSED. Standing up a second
//      foundry is configuration (a directory and a foundry.json), never code.
//   3. the live tree: the law is lawful, the marks hold no class, the fold carries no
//      class row, the derived law artifact is the tree's, and what retired is named.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, cpSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  KEEPING_WORKS, isClass, isLawNode, foundryOf, splitLaw, mergeLaw, classRoster, foundryTable, foundryChain,
  foundryExtends, lawProblems, inReadingOrder, ladderOf, FOUNDRY_TIERS, TIER_LADDER,
} from "./law.mjs";
import { loadLaw, loadWorld, lawStateOf, lawDirFor } from "./law-tree.mjs";
import { classIndex, classChain, propertyAt } from "./class-properties.mjs";
import { loadMarks, fold } from "./marks-fold.mjs";
import { putFoundry, putClass, putNode } from "./law-fixture.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const LINT = join(HERE, "mark-lint.mjs");
const REAL = join(ROOT, "WORLD", "marks", "let-there-be-light");
const SCRATCH = [];
const scratch = (prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); SCRATCH.push(d); return d; };
after(() => { for (const d of SCRATCH) rmSync(d, { recursive: true, force: true }); });

// ── 1. THE HELPER, PURE ─────────────────────────────────────────────────────

const keeping = { foundry: "the-keeping-works", tier: "constitution", extends: null, seat: "the-town/the-keeping-works", authors: ["the-town"] };
const pando = { foundry: "pando-peak", tier: "biome", extends: "the-keeping-works", authors: ["the-town"] };
const node = (id, over = {}) => ({ id, kind: "class", by: "the-town", tier: "constitution", foundry: "the-keeping-works", class: id.split("/")[1], ...over });

test("THE ONE TEST: a class is a law node of kind class in a foundry; a mark, a property and a stray are not", () => {
  assert.equal(isClass(node("the-town/thing")), true);
  assert.equal(isClass({ id: "a/b", kind: "sited", by: "a" }), false, "a mark is not a class");
  assert.equal(isClass({ id: "the-town/x", kind: "property", by: "the-town", foundry: KEEPING_WORKS }), false, "a property is law, not a class");
  assert.equal(isLawNode({ id: "the-town/x", kind: "property", by: "the-town", foundry: KEEPING_WORKS }), true);
  assert.equal(isClass(node("the-town/thing", { foundry: "pando-peak" })), true, "a second foundry's class is a class: the test names no foundry");
  // a record older than the law tree (a fixture, a store's snapshot) names none: the town's is read as the Keeping Works'
  assert.equal(foundryOf({ kind: "class", by: "the-town", class: "thing" }), KEEPING_WORKS);
  assert.equal(foundryOf({ kind: "class", by: "alice", class: "box" }), null, "a household's class named no foundry is no class");
  assert.equal(isClass({ kind: "class", by: "alice", class: "box" }), false);
});

test("splitLaw takes the law out of a mark list, in order, and mergeLaw keeps one of each id", () => {
  const list = [{ id: "a/x", kind: "sited", by: "a" }, node("the-town/thing"), { id: "a/y", kind: "sited", by: "a" }, { id: "the-town/p", kind: "property", by: "the-town" }];
  const { marks, law } = splitLaw(list);
  assert.deepEqual(marks.map((m) => m.id), ["a/x", "a/y"]);
  assert.deepEqual(law.map((m) => m.id), ["the-town/thing", "the-town/p"]);
  assert.deepEqual(mergeLaw([node("the-town/thing")], [node("the-town/thing", { body: "later" }), node("the-town/box")]).map((n) => n.id), ["the-town/thing", "the-town/box"]);
  assert.deepEqual([...classRoster(list)], ["thing"]);
});

test("THE FOUNDRY TABLE: a biome extends the Keeping Works; the book extends nothing; a cycle, a ghost parent and a headless foundry are named", () => {
  assert.deepEqual(foundryTable([keeping, pando]).problems, []);
  const { table } = foundryTable([keeping, pando]);
  assert.deepEqual(foundryChain(table, "pando-peak").names, ["pando-peak", "the-keeping-works"]);
  assert.equal(foundryExtends(table, "pando-peak", "the-keeping-works"), true);
  assert.equal(foundryExtends(table, "the-keeping-works", "pando-peak"), false, "never the reverse");
  const probs = (cfgs) => foundryTable(cfgs).problems.join("\n");
  assert.match(probs([keeping, { ...pando, extends: "nowhere" }]), /extends "nowhere", which is no foundry here/);
  assert.match(probs([keeping, { ...pando, extends: null }]), /biome tier and extends nothing/);
  assert.match(probs([{ ...keeping, extends: "pando-peak" }, pando]), /constitution tier and so extends nothing|closes on itself/);
  assert.match(probs([keeping, { ...pando, tier: "market" }]), /tier "market" is none of constitution \| biome/);
  assert.match(probs([keeping, { ...pando, foundry: "a", extends: "b" }, { ...pando, foundry: "b", extends: "a" }]), /closes on itself/);
  assert.deepEqual(FOUNDRY_TIERS, ["constitution", "biome"]);
  assert.deepEqual(TIER_LADDER.slice(-2), ["biome", "constitution"], "market < sovereignty < biome < constitution: one field, the shared language for global versus local");
});

test("THE RULES BETWEEN FOUNDRIES: tier, authors, one name, and a ladder that runs down", () => {
  const { table } = foundryTable([keeping, pando]);
  const rules = (nodes) => lawProblems(nodes, table).map((p) => `${p.rule}: ${p.id}`);
  // a clean pair: the town's book, and a biome class extending one of its classes
  assert.deepEqual(rules([node("the-town/thing"), node("the-town/pando-thing", { foundry: "pando-peak", tier: "biome", extends: "thing" })]), []);
  // tier biome is REFUSED in the Keeping Works; the biome foundry refuses constitution
  assert.deepEqual(rules([node("the-town/thing", { tier: "biome" })]), ["tier: the-town/thing"]);
  assert.deepEqual(rules([node("the-town/b", { foundry: "pando-peak", tier: "constitution" })]), ["tier: the-town/b"]);
  // only the foundry's authors declare in it
  assert.deepEqual(rules([node("alice/box", { by: "alice" })]), ["authors: alice/box"]);
  // a foundry nobody configured
  assert.deepEqual(rules([node("the-town/x", { foundry: "ghost" })]), ["foundry: the-town/x"]);
  // one name is one class: the same name in two foundries is refused unless one extends the other
  const stranger = { foundry: "sky-harbor", tier: "biome", extends: "the-keeping-works", authors: ["the-town"] };
  const t2 = foundryTable([keeping, pando, stranger]).table;
  const dup = [node("the-town/lamp", { foundry: "pando-peak", tier: "biome" }), node("the-town/lamp-b", { foundry: "sky-harbor", tier: "biome", class: "lamp" })];
  assert.equal(lawProblems(dup, t2).filter((p) => p.rule === "name").length, 1, "two biomes that do not extend one another cannot both declare lamp");
  // ...but a biome may REFINE a Keeping Works class of the same name at the same rung of the ladder
  const refine = [node("the-town/thing", { extends: "sited" }), node("the-town/thing-pando", { foundry: "pando-peak", tier: "biome", class: "thing", extends: "sited" })];
  assert.deepEqual(rules(refine), [], "a refinement keeps the rung: it extends what the book's class extends");
  // ...and not move it: that is a contradiction of the book
  const moved = [node("the-town/thing", { extends: "sited" }), node("the-town/thing-pando", { foundry: "pando-peak", tier: "biome", class: "thing", extends: "entity" })];
  assert.deepEqual(rules(moved), ["name: the-town/thing-pando"]);
  // the ladder runs down the chain, never up: the town never depends on a biome
  const up = [node("the-town/town-class", { extends: "pando-class" }), node("the-town/pando-class", { foundry: "pando-peak", tier: "biome" })];
  assert.deepEqual(rules(up), ["extends: the-town/town-class"]);
  // and a refining node is read FIRST, so the index answers for the nearer foundry
  assert.equal(inReadingOrder(refine, table)[0].id, "the-town/thing-pando");
});

test("THE LADDER ACROSS FOUNDRIES: label -> biome class -> town class, nearest first", () => {
  const nodes = [node("the-town/sited"), node("the-town/pando-hut", { foundry: "pando-peak", tier: "biome", extends: "sited" })];
  assert.deepEqual(ladderOf(nodes, "pando-hut").map((r) => `${r.class}@${r.foundry}`), ["pando-hut@pando-peak", "sited@the-keeping-works"]);
});

// ── 2. A SECOND FOUNDRY, STOOD UP BY CONFIGURATION (test-only) ───────────────

/** A fixture world: the root mark, the Keeping Works with a small class space, and (when asked) a biome foundry beside it. */
function world({ biome = true } = {}) {
  const dir = scratch("law-foundry-");
  const root = join(dir, "let-there-be-light");
  mkdirSync(root, { recursive: true });
  copyFileSync(join(REAL, "mark.md"), join(root, "mark.md"));
  cpSync(join(REAL, "logos"), join(root, "logos"), { recursive: true });
  putClass(dir, "postmark-node", "postmark-node");
  putClass(dir, "postmark-node/sited", "sited", { extends: "postmark-node" });
  putClass(dir, "postmark-node/sited/hut", "hut", { extends: "sited" });
  putNode(dir, "postmark-node/sited/hut/hut-warmth", "kind: property\nby: the-town\ntier: constitution\ndate: 2026-10-23\nname: warmth\ndefault: 3", "How warm a hut keeps its keeper.\n");
  if (biome) {
    putFoundry(dir, "pando-peak", { tier: "biome", extends: KEEPING_WORKS });
    putClass(dir, "pando-hut", "pando-hut", { extends: "hut", tier: "biome", foundry: "pando-peak", body: "A hut of the peak, thatched against the cold.\n" });
  }
  return { dir, root };
}
const lint = (dir) => {
  try { return { code: 0, out: execFileSync("node", [LINT, "--marks-dir", dir], { encoding: "utf8" }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout ?? "") + String(e.stderr ?? "") }; }
};
const pandoNode = (dir, rel, text, body = "A clause.\n") => putNode(dir, rel, text, body, { foundry: "pando-peak" });

test("THE FIXTURE FOUNDRY RESOLVES: a biome class extends a Keeping Works class, and the index answers across the line", () => {
  const { dir } = world();
  const { foundries, nodes, problems } = loadLaw(lawDirFor(dir));
  assert.deepEqual(problems, []);
  assert.deepEqual(foundries.map((f) => f.foundry), ["the-keeping-works", "pando-peak"], "ancestors first");
  assert.equal(nodes.find((n) => n.id === "the-town/pando-hut").foundry, "pando-peak");
  const idx = classIndex(nodes);
  assert.deepEqual(classChain(idx, "pando-hut").map((c) => `${c.class}@${c.foundry}`), ["pando-hut@pando-peak", "hut@the-keeping-works", "sited@the-keeping-works", "postmark-node@the-keeping-works"]);
  // a property declared by the book is the biome class's by inheritance, with its tier and where it came from
  const warmth = propertyAt(idx, "pando-hut", "warmth");
  assert.equal(warmth.value, 3);
  assert.equal(warmth.tier, "constitution");
  assert.equal(warmth.from, "hut");
});

test("THE FIXTURE FOUNDRY LINTS CLEAN, and its instance resolves through the helper", () => {
  const { dir, root } = world();
  mkdirSync(join(root, "a-peak-hut"), { recursive: true });
  writeFileSync(join(root, "a-peak-hut", "mark.md"), "---\nkind: pando-hut\nby: testerhh\ndate: 2026-10-23\nat: { x: 10, y: 10 }\nextent: { w: 4, h: 4 }\n---\n\nA hut on the peak.\n");
  const r = lint(dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /2 foundries/, "the lint holds both foundries");
  assert.doesNotMatch(r.out, /a-peak-hut: kind must be/, "kind: pando-hut names a class the law knows: the biome's");
  // the fold reads the same: the instance stands as a sited mark, and no class or property row reaches the state
  const { marks, law } = loadWorld(dir);
  const state = JSON.parse(JSON.stringify(fold({ marks, law, terrain: { features: [], far_features: [] }, stakes: [] })));
  const row = state.marks.find((m) => m.id === "testerhh/a-peak-hut");
  assert.ok(row, "the instance folds");
  assert.deepEqual(state.marks.filter((m) => m.kind === "class" || m.kind === "property"), [], "and the law is in no row");
});

test("A CONTRADICTION IS REFUSED: a biome class that shadows a constitution property of the book's class", () => {
  const { dir } = world();
  // the book says a hut's warmth is 3 and that is the town's word; the biome sets its own
  pandoNode(dir, "pando-hut/pando-hut-warmth", "kind: property\nby: the-town\ntier: constitution\ndate: 2026-10-23\nname: warmth\ndefault: 9", "A colder peak.\n");
  const r = lint(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /\[ERROR\][^\n]*pando-hut-warmth: the-town\/pando-hut \(foundry pando-peak\) redeclares hut's warmth, a constitution property of foundry the-keeping-works — a foundry extends the book it stands on and never contradicts it/);
});

test("A SOVEREIGN PROPERTY IS THE BIOME'S TO SET: shadowing one is no contradiction", () => {
  const { dir } = world();
  putNode(dir, "postmark-node/sited/hut/hut-draught", "kind: property\nby: the-town\ntier: sovereign\ndate: 2026-10-23\nname: draught\ndefault: 1", "How much wind a hut lets in.\n");
  pandoNode(dir, "pando-hut/pando-hut-draught", "kind: property\nby: the-town\ntier: sovereign\ndate: 2026-10-23\nname: draught\ndefault: 4", "More, on the peak.\n");
  const r = lint(dir);
  assert.equal(r.code, 0, r.out);
});

test("THE TOWN NEVER DEPENDS ON A BIOME: a Keeping Works class that extends a biome's is refused", () => {
  const { dir } = world();
  putClass(dir, "postmark-node/sited/lodge", "lodge", { extends: "pando-hut" });
  const r = lint(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /\[ERROR\][^\n]*lodge: [^\n]*extends "pando-hut", declared in pando-peak — a class extends its own foundry's classes or an ancestor foundry's, never a foundry that extends it/);
});

test("ONE NAME IS ONE CLASS: the same class name in a biome that is not a refinement of the book's is refused", () => {
  const { dir } = world();
  // a second class named hut in the biome, hung under another parent: a contradiction of the book's
  putClass(dir, "pando-hut-again", "hut", { extends: "postmark-node", tier: "biome", foundry: "pando-peak" });
  const r = lint(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /\[ERROR\][^\n]*the name "hut" is declared in the-keeping-works[^\n]*and in pando-peak|redeclares "hut" with extends "postmark-node"/);
});

test("TIER BIOME IS REFUSED IN THE KEEPING WORKS AND ON MARKS (for now)", () => {
  const a = world({ biome: false });
  putClass(a.dir, "postmark-node/sited/misfiled", "misfiled", { extends: "sited", tier: "biome" });
  const ra = lint(a.dir);
  assert.equal(ra.code, 1, ra.out);
  assert.match(ra.out, /\[ERROR\][^\n]*misfiled: [^\n]*carries tier: biome, but the-keeping-works holds constitution-tier classes — biome is refused in the-keeping-works/);
  const b = world({ biome: false });
  mkdirSync(join(b.root, "a-mark"), { recursive: true });
  writeFileSync(join(b.root, "a-mark", "mark.md"), "---\nkind: sited\nby: testerhh\ntier: biome\ndate: 2026-10-23\nat: { x: 1, y: 1 }\nextent: { w: 2, h: 2 }\n---\n\nA mark claiming the biome rung.\n");
  const rb = lint(b.dir);
  assert.equal(rb.code, 1, rb.out);
  assert.match(rb.out, /\[ERROR\][^\n]*a-mark: tier must be one of [^\n]*biome is a law tier and is refused on marks for now/);
});

test("A CLASS FILED AS A MARK IS REFUSED: law is not a mark", () => {
  const { dir, root } = world({ biome: false });
  mkdirSync(join(root, "a-misfiled-class"), { recursive: true });
  writeFileSync(join(root, "a-misfiled-class", "mark.md"), "---\nkind: class\nby: the-town\ntier: constitution\ndate: 2026-10-23\nclass: a-misfiled-class\n---\n\nA class standing on the ground.\n");
  const r = lint(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /\[ERROR\][^\n]*a-misfiled-class: kind: class is law, and law is not a mark: file it as a node\.md in a foundry/);
});

test("A FOUNDRY WITH NO CONFIG, AND AN AUTHOR THE FOUNDRY DOES NOT NAME, ARE REFUSED BY NAME", () => {
  const a = world({ biome: false });
  mkdirSync(join(a.dir, "_law", "ghost-foundry", "x"), { recursive: true });
  writeFileSync(join(a.dir, "_law", "ghost-foundry", "x", "node.md"), "---\nkind: class\nby: the-town\ntier: biome\ndate: 2026-10-23\nclass: x\n---\n\nA class in a foundry with no config.\n");
  assert.match(lint(a.dir).out, /\[ERROR\][^\n]*ghost-foundry[^\n]*foundry\.json is missing/);
  const b = world({ biome: false });
  putClass(b.dir, "postmark-node/sited/hers", "hers", { extends: "sited", by: "alice", tier: "constitution" });
  assert.match(lint(b.dir).out, /\[ERROR\][^\n]*hers: [^\n]*is by alice, but the-keeping-works is written by the-town only/);
});

// ── 3. THE LIVE TREE ────────────────────────────────────────────────────────

test("THE LIVE LAW IS LAWFUL: one foundry, constitution tier, every node the town's, no problem named", () => {
  const { foundries, nodes, problems, table } = loadLaw(join(ROOT, "WORLD", "law"));
  assert.deepEqual(problems, []);
  assert.deepEqual(foundries.map((f) => [f.foundry, f.tier, f.extends]), [[KEEPING_WORKS, "constitution", null]]);
  assert.ok(nodes.filter(isClass).length > 200, "the town's classes are all here");
  assert.ok(nodes.every((n) => n.by === "the-town" && n.foundry === KEEPING_WORKS));
  assert.ok(nodes.filter(isClass).every((n) => n.tier === "constitution"), "the book holds the constitution tier only");
  assert.ok(existsSync(join(ROOT, "WORLD", "marks", "let-there-be-light", "the-town-centre", "the-keeping-works", "mark.md")), "the seat stands as a plain landmark");
  assert.equal(foundries[0].seat, "the-town/the-keeping-works");
  assert.equal(table.size, 1);
});

test("THE THREE LANE-1 NODES STAND in the book, each under its parent", () => {
  const { nodes } = loadLaw(join(ROOT, "WORLD", "law"));
  const byClass = new Map(nodes.filter(isClass).map((n) => [n.class, n]));
  assert.equal(byClass.get("the-stamp-fractal")?.extends, "postmark-economy");
  assert.equal(byClass.get("the-stamp-fractal-root-case")?.extends, "the-stamp-fractal");
  assert.equal(byClass.get("the-media-household-wall")?.extends, "postmark-rules");
  for (const k of ["the-stamp-fractal", "the-stamp-fractal-root-case", "the-media-household-wall"]) {
    assert.ok(byClass.get(k), k);
    assert.ok(classRoster(nodes).has(byClass.get(k).extends), `${k}'s parent is a class`);
    assert.ok(byClass.get(k).body.length > 100, "and the 150-character cap is gone: the law node holds the whole clause");
  }
});

test("THE MARKS HOLD NO CLASS AND NO PROPERTY; THE FOLD CARRIES NONE; THE LAW ARTIFACT IS THE TREE'S", () => {
  const marks = loadMarks(join(ROOT, "WORLD", "marks"));
  assert.deepEqual(marks.filter((m) => m.kind === "class" || m.kind === "property").map((m) => m.id), [], "no class or property is filed as a mark");
  const state = JSON.parse(readFileSync(join(ROOT, "WORLD", "world-state.json"), "utf8"));
  assert.deepEqual(state.marks.filter((m) => m.kind === "class" || m.kind === "property").map((m) => m.id), [], "world-state.json carries no class or property row");
  const containment = JSON.parse(readFileSync(join(ROOT, "WORLD", "containment.json"), "utf8"));
  const text = JSON.stringify(containment);
  const law = loadLaw(join(ROOT, "WORLD", "law"));
  for (const n of law.nodes.slice(0, 40)) assert.equal(text.includes(`"${n.id}"`), false, `containment.json carries no row for ${n.id}`);
  assert.equal(readFileSync(join(ROOT, "WORLD", "INDEX.md"), "utf8").includes("| class |"), false, "INDEX.md lists no class");
  // the derived artifact is regenerated from the tree: stale means a fold was skipped
  const artifact = JSON.parse(readFileSync(join(ROOT, "WORLD", "law-state.json"), "utf8"));
  assert.deepEqual(artifact, JSON.parse(JSON.stringify(lawStateOf(law))), "WORLD/law-state.json is the tree's: run the fold");
});

test("WHAT RETIRED IS NAMED BY A DECLARING ACT, nothing is deleted, and the seat and Noe's predicate stand", () => {
  const act = JSON.parse(readFileSync(join(ROOT, "WORLD", "_archived", "2026-10-23-wld-116", "RETIRED.json"), "utf8"));
  assert.equal(act.act, "retire");
  assert.equal(Object.keys(act.rows).length, act.counts.total);
  assert.equal(act.counts.by_kind.sited, 42, "the 42 machinery buildings");
  assert.equal(act.counts.by_kind.predicate, 82, "their 77 fn: pointers, the four civic plaques and the works portal");
  const live = new Set([...loadMarks(join(ROOT, "WORLD", "marks")).map((m) => m.id), ...loadLaw(join(ROOT, "WORLD", "law")).nodes.map((n) => n.id)]);
  for (const [id, row] of Object.entries(act.rows)) {
    assert.equal(live.has(id), false, `${id} retired: it stands in no live tree`);
    assert.ok(existsSync(join(ROOT, row.now)), `${id} rests at ${row.now}: moved, never deleted`);
  }
  assert.ok(existsSync(join(ROOT, "WORLD", "_archived", "2026-10-23-wld-116", "machinery", "CODE_REGISTRY.draft.json")), "the code registry rests in the archive");
  for (const id of ["the-town/the-keeping-works", "noe/say-which-copy"]) assert.ok(live.has(id), `${id} is kept`);
  const marks = loadMarks(join(ROOT, "WORLD", "marks"));
  assert.equal(marks.find((m) => m.id === "noe/say-which-copy")._parentMarkId, "the-town/the-keeping-works", "Noe's predicate is re-parented to the seat, its id unchanged");
});
