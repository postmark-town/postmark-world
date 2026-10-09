#!/usr/bin/env node
// rehearsal-baseline.mjs — THE SKETCHBOOKS MAIN ITSELF REFUSES, SET ASIDE BEFORE
// THE REHEARSAL JUDGES A PULL REQUEST.
//
//   node tools/rehearsal-baseline.mjs --base <sha> --scratch <dir> [--repo <world>] [--max <n>] [--out <json>]
//
// WHY (POS-371). The crossing rehearsal (`.github/workflows/crossing-rehearsal.yml`)
// sweeps every `draft/*` sketchbook this repository carries over the pull
// request's merged tree, and one refusal anywhere refuses the whole run. From
// 2026-09-26 every world pull request went red that way, on whatever the
// stalest sketchbook could not do: first a duplicate `neth/warm-stone` a draft
// carried into the publish, then, from world#157's un-nesting, `draft/angelus-novus`
// (last written 2026-09-11) failing to rebase an amend of a mark main had moved.
// Neither was the pull request's doing, and both were red on main's own tree.
// A check that is red on every pull request is a check nobody reads, and the
// one real refusal hides in it.
//
// WHAT THIS DOES. It asks main the same question first. A throwaway clone of
// this checkout is put at the pull request's BASE, and the base's own
// `rehearsal-stakes.mjs` and `settlement-sweep.mjs` (the base's code, over the
// base's tree, over the same sketchbooks) run there. When that sweep refuses
// and the refusal names a sketchbook, the sketchbook is set aside and main is
// asked again, until main sweeps clean. The set-aside refs are then deleted
// from THIS checkout (local remote-tracking refs, nothing on any remote), so the
// rehearsal that follows judges the pull request over the sketchbooks main can
// carry. What a pull request does to a sketchbook main could carry still
// refuses it by name, and so does anything the pull request's own tree does.
//
// WHAT THIS IS NOT. It does not change what the crossing refuses: the sweep's
// code is not touched, and the base's verdict is read from the base's own code
// so a pull request that makes the sweep stricter is still judged by it. It
// does not touch any resident's branch: the refs it deletes are the runner's
// local copies. It reads no environment of its own (the children inherit the
// runner's, as the sweep always has).
//
// HOW A REFUSAL IS PUT ON A SKETCHBOOK. A refusal that carries `branch` (every
// rebase-phase refusal) names it. A lint refusal names files, not branches: a
// sketchbook is charged with a lint error when its own diff from the base
// touches the error's mark directory, or, for a duplicate id, adds a mark of
// that leaf slug. A refusal no sketchbook can be charged with is MAIN's own,
// and that is exit 1, never a set-aside: the crossing would refuse for everyone.
//
// Exit 0: main sweeps (with the set-aside named). Exit 1: main itself refuses,
// or more than --max sketchbooks refuse on it (that wants a person, not a longer
// list). Exit 2: the baseline could not be measured, which is never a pass.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SWEEP_SENTINEL = "SETTLEMENT-SWEEP-REFUSAL"; // settlement-sweep.mjs § REFUSAL_SENTINEL
const DRAFT_REMOTE = "refs/remotes/origin/draft/";
export const DEFAULT_MAX = 5;

const git = (cwd, args) => execFileSync("git", ["-C", cwd, ...args], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024,
});

class Unmeasured extends Error {}

/** The sweep's own refusal line, parsed; null when the sweep left none. */
export function parseRefusal(stderr) {
  const line = String(stderr).split(/\r?\n/).reverse().find((l) => l.startsWith(`${SWEEP_SENTINEL} `));
  if (!line) return null;
  try { return JSON.parse(line.slice(SWEEP_SENTINEL.length + 1)); } catch { return null; }
}

/** `draft/<household>` for every sketchbook the clone carries. */
export function sketchbooks(repo) {
  return git(repo, ["for-each-ref", "--format=%(refname)", DRAFT_REMOTE])
    .split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .map((ref) => `draft/${ref.slice(DRAFT_REMOTE.length)}`).sort();
}

/**
 * The sketchbooks a refusal is charged to, read off the refusal and the
 * sketchbooks' own diffs from the base. An empty list means main's own.
 */
export function chargedWith(refusal, repo, base) {
  if (!refusal) return [];
  if (refusal.branch) return [String(refusal.branch).replace(/^origin\//, "")];
  if (refusal.phase !== "lint" || !Array.isArray(refusal.errors)) return [];
  const charged = new Set();
  const books = sketchbooks(repo);
  const diffOf = new Map();
  const changed = (book) => {
    if (!diffOf.has(book)) {
      let names = [];
      try {
        names = git(repo, ["diff", "--name-only", "--no-renames", `${base}...origin/${book}`, "--", "WORLD/marks/"])
          .split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      } catch { /* no merge base with main: it is charged with nothing here */ }
      diffOf.set(book, names);
    }
    return diffOf.get(book);
  };
  for (const error of refusal.errors) {
    const dir = String(error?.file ?? "").replace(/\\/g, "/").replace(/\/mark\.md$/, "");
    const dup = /duplicate id "([^"]+)"/.exec(String(error?.msg ?? ""));
    const leaf = dup ? dup[1].split("/").pop() : null;
    for (const book of books) {
      const names = changed(book);
      if (dir.startsWith("WORLD/") && names.some((n) => n.startsWith(`${dir}/`))) charged.add(book);
      else if (leaf && names.some((n) => n.endsWith(`/${leaf}/mark.md`))) charged.add(book);
    }
  }
  return [...charged].sort();
}

/** A throwaway clone of `repo` at `base`, carrying every sketchbook but the set-aside. */
export function cloneAtBase(repo, dir, base, aside) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dirname(dir), { recursive: true });
  execFileSync("git", ["clone", "--quiet", "--no-checkout", "--no-tags", repo, dir], { stdio: ["ignore", "pipe", "pipe"] });
  git(dir, ["fetch", "--quiet", "--no-tags", repo, `+${DRAFT_REMOTE}*:${DRAFT_REMOTE}*`]);
  try { git(dir, ["cat-file", "-e", `${base}^{commit}`]); }
  catch { throw new Unmeasured(`the base ${base} is not reachable in a clone of ${repo}, so main cannot be asked anything`); }
  for (const book of aside) git(dir, ["update-ref", "-d", `${DRAFT_REMOTE}${book.slice("draft/".length)}`]);
  git(dir, ["checkout", "--quiet", "-B", "main", base]);
  return dir;
}

/** The base's own stakes and the base's own sweep, run in the clone. */
function baseSweep(clone, stakesPath) {
  if (!existsSync(stakesPath)) {
    const s = spawnSync(process.execPath, [join(clone, "tools", "rehearsal-stakes.mjs"), "--repo", clone, "--out", stakesPath], {
      cwd: clone, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
    if (s.status !== 0) throw new Unmeasured(`the base's stakes could not be derived (exit ${s.status}): ${String(s.stderr).trim().slice(-400)}`);
  }
  const r = spawnSync(process.execPath, [join(clone, "tools", "settlement-sweep.mjs"), "--repo", clone, "--stakes", stakesPath, "--json"], {
    cwd: clone, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024,
  });
  if (r.error) throw new Unmeasured(`the base's sweep could not be run: ${r.error.message}`);
  return { ok: r.status === 0, refusal: parseRefusal(r.stderr), tail: String(r.stderr).trim().slice(-600) };
}

/**
 * Ask main until it sweeps clean, setting aside each sketchbook it refuses on.
 * `run(aside)` sweeps main over every sketchbook but `aside`; `charge(refusal)`
 * names the sketchbooks a refusal belongs to. Both are injectable so the loop
 * is testable without a world.
 */
export function setAsideLoop({ run, charge, max = DEFAULT_MAX }) {
  const aside = [];
  for (;;) {
    const verdict = run(aside.map((row) => row.branch));
    if (verdict.ok) return { ok: true, aside, runs: aside.length + 1 };
    const named = charge(verdict.refusal).filter((b) => !aside.some((row) => row.branch === b));
    if (!named.length) {
      return {
        ok: false, aside, runs: aside.length + 1, main_refuses: true,
        cause: verdict.refusal?.cause ?? verdict.tail ?? "the sweep failed and left no refusal line",
        phase: verdict.refusal?.phase ?? "unknown",
      };
    }
    for (const branch of named) {
      aside.push({ branch, phase: verdict.refusal?.phase ?? "unknown", cause: String(verdict.refusal?.cause ?? "").split(/\r?\n/)[0].slice(0, 240) });
    }
    if (aside.length > max) {
      return {
        ok: false, aside, runs: aside.length, too_many: true,
        cause: `${aside.length} sketchbooks refuse on main itself (more than ${max}); that wants a person, not a longer set-aside`,
      };
    }
  }
}

/** Delete the set-aside sketchbooks' refs from the checkout the rehearsal will sweep. Local refs only. */
export function setAside(repo, aside) {
  for (const { branch } of aside) {
    const leaf = branch.slice("draft/".length);
    for (const ref of [`${DRAFT_REMOTE}${leaf}`, `refs/heads/draft/${leaf}`]) {
      try { git(repo, ["update-ref", "-d", ref]); } catch { /* absent is the same as deleted */ }
    }
  }
}

function main(argv) {
  const opt = (name, fallback = null) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
  const repo = resolve(opt("--repo", join(HERE, "..")));
  const base = opt("--base");
  const scratch = opt("--scratch") ? resolve(opt("--scratch")) : null;
  const max = Number(opt("--max", DEFAULT_MAX));
  const out = opt("--out");
  if (!base || !scratch || !Number.isInteger(max) || max < 0) {
    console.error("usage: rehearsal-baseline.mjs --base <sha> --scratch <dir> [--repo <world>] [--max <n>] [--out <json>]");
    process.exit(2);
  }
  const clone = join(scratch, "main-at-base");
  const stakesPath = join(scratch, "base-stakes.json");
  let result;
  try {
    rmSync(stakesPath, { force: true });
    result = setAsideLoop({
      max,
      run: (aside) => baseSweep(cloneAtBase(repo, clone, base, aside), stakesPath),
      charge: (refusal) => chargedWith(refusal, clone, base),
    });
  } catch (error) {
    console.error(`::error::rehearsal-baseline: main could not be measured — ${String(error?.message ?? error)}. That is never a pass.`);
    process.exit(2);
  }
  const report = { base, ...result, carried: null };
  if (result.ok) {
    setAside(repo, result.aside);
    report.carried = sketchbooks(repo).length;
  }
  if (out) writeFileSync(resolve(out), JSON.stringify(report, null, 2) + "\n");
  for (const row of result.aside) {
    console.log(`::warning::set aside ${row.branch}: it refuses on main ${base.slice(0, 8)} already (${row.phase}), so it is not this pull request's to answer. ${row.cause}`);
  }
  if (!result.ok) {
    console.error(`::error::${result.too_many ? "" : "main itself would refuse, with no sketchbook to set aside: "}${result.cause}`);
    process.exit(1);
  }
  console.log(`baseline: main ${base.slice(0, 8)} sweeps after ${result.runs} run(s); ${result.aside.length} sketchbook(s) set aside, ${report.carried} carried into the rehearsal`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main(process.argv.slice(2));
