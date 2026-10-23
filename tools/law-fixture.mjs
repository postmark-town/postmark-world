// law-fixture.mjs — TEST-ONLY. Stand law nodes in a fixture world (WLD-116).
//
// Classes are law nodes, never marks, so a test that used to write a class as a
// mark.md under a fixture's the-keeping-works now files it as a node.md in a
// foundry. A fixture's marks directory carries its law inside itself, at _law/
// (tools/law-tree.mjs lawDirFor), so no test shares a law tree with another and
// nothing is written outside the scratch directory.
//
//   putFoundry(marksDir, "the-keeping-works")             the constitution foundry (the default)
//   putFoundry(marksDir, "pando-peak", { tier: "biome", extends: "the-keeping-works" })
//   putNode(marksDir, "bounty", "kind: class\n…", body)    file a node: <_law>/<foundry>/<rel>/node.md
//
// `rel` is the node's path under its foundry: a class nests its properties and
// subclasses by directory, as it did when it was filed as a mark. The id of a node
// is `by/<leaf>`, as ever.

import { mkdirSync, writeFileSync, existsSync, readFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURE_LAW_DIR, LIVE_LAW_DIR } from "./law-tree.mjs";
import { KEEPING_WORKS, NODE_FILE } from "./law.mjs";

const lawDirOf = (marksDir) => join(marksDir, FIXTURE_LAW_DIR);

export function putFoundry(marksDir, foundry = KEEPING_WORKS, cfg = {}) {
  const dir = join(lawDirOf(marksDir), foundry);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "foundry.json");
  if (!existsSync(file)) {
    const biome = cfg.tier === "biome";
    writeFileSync(file, JSON.stringify({
      foundry,
      tier: cfg.tier ?? "constitution",
      extends: cfg.extends ?? (biome ? KEEPING_WORKS : null),
      seat: cfg.seat ?? null,
      authors: cfg.authors ?? ["the-town"],
    }, null, 2) + "\n");
  }
  return dir;
}

/** File a law node. `text` is the frontmatter lines (or a whole `---` record); `body` follows. Returns the node's directory. */
export function putNode(marksDir, rel, text, body = "", { foundry = KEEPING_WORKS, cfg = {} } = {}) {
  const root = putFoundry(marksDir, foundry, cfg);
  const dir = join(root, ...String(rel).split("/"));
  mkdirSync(dir, { recursive: true });
  const record = /^---\r?\n/.test(text) ? text : `---\n${text.replace(/\n?$/, "\n")}---\n\n${body}`;
  writeFileSync(join(dir, "node.md"), record);
  return dir;
}

/** The class a fixture most often needs: `kind: class`, the town's, constitution tier, in the Keeping Works. */
export function putClass(marksDir, rel, name, { extends: ext, body = "A class.\n", date = "2026-08-11", extra = "", foundry = KEEPING_WORKS, tier = "constitution", by = "the-town" } = {}) {
  const lines = [`kind: class`, `by: ${by}`, `tier: ${tier}`, `date: ${date}`, `class: ${name}`];
  if (ext !== undefined) lines.push(`extends: ${ext}`);
  if (extra) lines.push(extra.replace(/\n$/, ""));
  return putNode(marksDir, rel, lines.join("\n"), body, { foundry });
}

/**
 * Copy named nodes of the LIVE law (this repository's WORLD/law/<foundry>/) into a
 * fixture world: each `rel` is a node's path under the foundry, and only its own
 * node.md comes (a class's properties and subclasses are named if the test needs
 * them). The foundry's config comes with the first.
 */
export function copyLiveLaw(marksDir, rels, { foundry = KEEPING_WORKS } = {}) {
  const live = join(LIVE_LAW_DIR, foundry);
  const root = putFoundry(marksDir, foundry, JSON.parse(readFileSync(join(live, "foundry.json"), "utf8")));
  for (const rel of rels) {
    const dir = join(root, ...String(rel).split("/"));
    mkdirSync(dir, { recursive: true });
    copyFileSync(join(live, ...String(rel).split("/"), NODE_FILE), join(dir, NODE_FILE));
  }
  return root;
}
