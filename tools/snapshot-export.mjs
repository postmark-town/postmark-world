#!/usr/bin/env node
// snapshot-export.mjs — A TREE'S MARKS, WRITTEN AS A SNAPSHOT EXPORT (POS-421).
//
//   node tools/snapshot-export.mjs --out <file> [--repo <world>] [--ref <commit>]
//
// The crossing rehearsal judges a pull request as a snapshot pair (POS-363's
// seam, `harm-gate.mjs --snapshot-before/--snapshot-after`): main as the merge
// sees it, and the merged tree after the pull request's own sweep. This writes
// either side. With `--ref`, the marks are read from a scratch extraction of
// WORLD/ at that commit (the gate's own discipline, `harm-gate.mjs § marksAt`),
// so the working tree is never touched; without it, from the working tree.
//
// The export is `snapshotFromTree`'s: the records the tree's loader returns, in
// the loader's order, plus `ref`, the commit it was read at (the full sha, or
// "the working tree at <sha>"). The gate prints `ref` as its base, so the run
// says which main a verdict was measured against.
//
// It reads no environment. Exit 0 written; 2 could not export, never a pass.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { snapshotFromTree } from "./marks-fold.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const git = (repo, args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** The snapshot export of `repo`'s marks at `ref`, or of its working tree when `ref` is null. */
export function exportSnapshot(repo, ref = null) {
  if (!ref) {
    const head = git(repo, ["rev-parse", "HEAD"]);
    return snapshotFromTree(join(repo, "WORLD", "marks"), { ref: `the working tree at ${head}` });
  }
  const sha = git(repo, ["rev-parse", "--verify", `${ref}^{commit}`]);
  const dir = mkdtempSync(join(tmpdir(), "postmark-snapshot-export-"));
  try {
    const archive = join(dir, "world.tar");
    execFileSync("git", ["-C", repo, "archive", "--format=tar", `--output=${archive}`, sha, "--", "WORLD"], { stdio: ["ignore", "pipe", "pipe"] });
    execFileSync("tar", ["-xf", "world.tar"], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
    return snapshotFromTree(join(dir, "WORLD", "marks"), { ref: sha });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main(argv) {
  const opt = (name, fallback = null) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
  const repo = resolve(opt("--repo", join(HERE, "..")));
  const out = opt("--out");
  if (!out) { console.error("usage: snapshot-export.mjs --out <file> [--repo <world>] [--ref <commit>]"); process.exit(2); }
  let doc;
  try { doc = exportSnapshot(repo, opt("--ref")); }
  catch (e) { console.error(`snapshot-export: could not export — ${String(e?.stderr || e?.message || e).trim().slice(0, 400)}`); process.exit(2); }
  writeFileSync(resolve(out), JSON.stringify(doc) + "\n");
  console.log(`snapshot-export: ${doc.marks.length} mark(s) at ${doc.ref}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main(process.argv.slice(2));
