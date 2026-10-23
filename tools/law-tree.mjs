// law-tree.mjs — THE LAW TREE, READ FROM DISK (WLD-116). The file half of
// tools/law.mjs (which is pure and holds every rule).
//
//   WORLD/law/<foundry>/foundry.json     the foundry's configuration
//   WORLD/law/<foundry>/<class>/node.md  a law node; a class nests its properties
//                                        and its subclasses by directory, as it did
//                                        when it was filed as a mark
//
// A foundry is a directory here. Standing up another is a new directory and a
// new foundry.json: nothing in this file, the lint, the fold or the readers names
// a foundry. The ids are the ids the records had as marks (`by/slug`, the leaf
// directory is the slug), so a stake, an `extends`, an `implements` and a fossil
// row still mean what they meant.
//
// A directory that begins with `_` is an archive and holds nothing live.
//
//   loadFoundries(lawDir)  [{ foundry, tier, extends, seat, authors, dir, _error? }], ancestors first
//   loadLaw(lawDir)        { foundries, nodes, problems }: the nodes in reading order
//   lawDirFor(marksDir)    the law tree beside a marks tree (WORLD/marks -> WORLD/law)
//   loadWorld(marksDir)    { marks, law, foundries, problems }: both trees, read together

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { walkMarks, loadMarks } from "./marks-fold.mjs";
import { FOUNDRY_FILE, NODE_FILE, foundryTable, foundryChain, lawProblems, inReadingOrder } from "./law.mjs";

/** A marks directory that is not WORLD/marks (a test's fixture world, a snapshot unpacked) carries its law inside itself, here. Nothing in the live tree is named this. */
export const FIXTURE_LAW_DIR = "_law";

/** The law tree that stands beside a marks tree: WORLD/marks -> WORLD/law; or inside it, at _law/, for a fixture world. */
export const lawDirFor = (marksDir) => {
  const root = resolve(String(marksDir));
  const inside = join(root, FIXTURE_LAW_DIR);
  return isDir(inside) ? inside : join(dirname(root), "law");
};

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

/** Every foundry under a law directory, ancestors before the foundries that extend them. */
export function loadFoundries(lawDir) {
  const out = [];
  if (!existsSync(lawDir)) return out;
  for (const name of readdirSync(lawDir).sort()) {
    const dir = join(lawDir, name);
    if (name.startsWith("_") || !isDir(dir)) continue;
    const file = join(dir, FOUNDRY_FILE);
    if (!existsSync(file)) { out.push({ foundry: name, dir, _error: `${FOUNDRY_FILE} is missing — a foundry is a directory under WORLD/law/ with its config` }); continue; }
    let cfg;
    try { cfg = JSON.parse(readFileSync(file, "utf8")); }
    catch (e) { out.push({ foundry: name, dir, _error: `${FOUNDRY_FILE} is not JSON (${e.message})` }); continue; }
    if (cfg.foundry !== name) { out.push({ foundry: name, dir, _error: `${FOUNDRY_FILE} names foundry ${JSON.stringify(cfg.foundry)}, but the directory is ${name}` }); continue; }
    out.push({ ...cfg, dir });
  }
  const table = foundryTable(out.filter((f) => !f._error)).table;
  return out.sort((a, b) => foundryChain(table, a.foundry).names.length - foundryChain(table, b.foundry).names.length || (a.foundry < b.foundry ? -1 : 1));
}

/**
 * The law: every foundry and every node in it. `problems` is the config's and
 * the rules' own findings as [{ foundry?, id?, msg }]; the nodes come back even
 * when a problem is named (the lint reports, it never refuses to read).
 */
export function loadLaw(lawDir) {
  const foundries = loadFoundries(lawDir);
  const problems = foundries.filter((f) => f._error).map((f) => ({ foundry: f.foundry, msg: f._error }));
  const good = foundries.filter((f) => !f._error);
  const { table, problems: cfgProblems } = foundryTable(good);
  for (const msg of cfgProblems) problems.push({ msg });
  const nodes = [];
  for (const f of good) {
    for (const entry of readdirSync(f.dir).sort()) {
      const p = join(f.dir, entry);
      if (entry.startsWith("_") || !isDir(p)) continue;
      walkMarks(p, null, nodes, { file: NODE_FILE, extra: { foundry: f.foundry, _law: true } });
    }
    // a foundry's own node.md at its root is not a thing: a foundry holds classes, it is not one
  }
  for (const p of lawProblems(nodes.filter((n) => !n._error), table)) problems.push({ id: p.id, rule: p.rule, msg: p.msg });
  return { foundries, table, nodes: inReadingOrder(nodes, table), problems };
}

/**
 * The law artifact, WORLD/law-state.json: the foundries and every law node as the
 * loader reads them (the record's own fields, no loader internals), in id order so a
 * fold's diff shows what the law did and never what the walk order was. DERIVED:
 * the tree is the source, and this is regenerated at every fold.
 */
export function lawStateOf({ foundries, nodes }) {
  const keep = (n) => Object.fromEntries(Object.entries(n).filter(([k]) => !k.startsWith("_") && k !== "household" && k !== "slug"));
  const good = (nodes ?? []).filter((n) => !n._error);
  return {
    law: "Classes are law nodes, never marks. This file is derived from WORLD/law/<foundry>/ at every fold and is read by what cannot read the tree; the tree is the source and this is regenerated, never hand-kept.",
    source: "tools/law.mjs, WORLD/law/<foundry>/foundry.json (WLD-116)",
    foundries: (foundries ?? []).filter((f) => !f._error).map(({ foundry, tier, extends: ext, seat, authors }) => ({ foundry, tier, extends: ext ?? null, seat: seat ?? null, authors: authors ?? [] })),
    count: good.length,
    nodes: good.map(keep).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
}

/** Both trees beside each other: { marks, law, foundries, table, problems }. */
export function loadWorld(marksDir) {
  const lawDir = lawDirFor(marksDir);
  const { foundries, table, nodes, problems } = loadLaw(lawDir);
  return { marks: loadMarks(marksDir), law: nodes, foundries, table, problems };
}

/** THIS repository's own law tree, for the readers that mean the live law (a test, a tool run from here). */
export const LIVE_LAW_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "WORLD", "law");
export const loadLiveLaw = () => loadLaw(LIVE_LAW_DIR).nodes;

/** The marks and the law nodes of a world in ONE list: for a reader that wants every record the tree holds (a test, an audit, a fold that splits them itself). */
export function loadRecords(marksDir) {
  const { marks, law } = loadWorld(marksDir);
  return [...marks, ...law];
}
