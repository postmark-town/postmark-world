#!/usr/bin/env node
// unnest-households.mjs — THE UN-NESTING VERB: another household's marks stop
// riding yours, and nothing moves.
// POS-441 · postmark#2458 · ruled by Darko 2026-10-07 ("That should just always
// be the default rule"): moving a mark carries the marks inside it that belong
// to the same household; another household's marks never move — they keep their
// place, and their containment follows geometry.
//
//   node tools/unnest-households.mjs [--repo <dir>] [--households <file>]
//                                    [--date YYYY-MM-DD] [--ruling <text>] [--dry-run]
//
// EXIT: 0 done (or nothing to do) · 1 REFUSED — nothing past the named step was
// written, and the tree is git's to restore · 2 a bad argument.
//
// ── WHAT IT DOES ─────────────────────────────────────────────────────────────
//
// The 08-25 fossil filed marks inside other marks, whoever owned them, and a
// nested file's numbers are an offset from its frame — so every such mark rides
// its frame (marks-fold.mjs § the frame). The ruling keeps that for a household's
// own marks and ends it for everyone else's. For every positioned mark whose
// binding frame is ANOTHER household's (household-frames.mjs, the one question):
//
//   1. its directory moves to its id path, WORLD/marks/<by>/<slug>/ — gate B's
//      layout, where the world is its frame — and its own subtree moves with it
//      (its household's children and the predicates on it keep their frame);
//   2. the reparent verb (reparent-keep-world.mjs § keepWorldAcross) rewrites its
//      numbers so it composes to exactly the place it held — "A STRUCTURAL EDIT
//      NEVER MOVES ANYTHING";
//   3. THE FALSIFIER, read back off the tree and independent of the verb's own
//      proof: every record keeps its world position and ring to the bit, every
//      containment parent is unchanged, and no positioned record is left framed
//      by another household's mark. Any difference REFUSES (exit 1);
//   4. the path-keyed records follow the paths: WORLD/filing-freeze.json's rows
//      for every fossil whose filing moved are amended BY NAME, each listed with
//      where it was and where it is under a dated `reframed` entry — a decision
//      about a named, closed set, never a regeneration (the lint's own grace-
//      cohort precedent, mark-lint.mjs § 6); and WORLD/settlement-publications.json
//      gets the new `path` of every registered mark that moved, because the
//      sweep's unpublish pass reads that path (`hasObject(main:entry.path)`) and a
//      stale one would silently keep a zero-stake commons published.
//
// Run once on the ruling date over the whole tree, and again by hand whenever the
// standing test (tools/household-frames.test.mjs) reds or the lint's household
// warning (mark-lint.mjs § 6c) appears in a crossing's receipt — a household that
// splits in the registry can turn a same-household frame into another household's.

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks, containmentMap } from "./marks-fold.mjs";
import { snapshotWorld, keepWorldAcross } from "./reparent-keep-world.mjs";
import { crossHouseholdRiders, householdResolver } from "./household-frames.mjs";

export class UnnestRefusal extends Error {
  constructor(message, detail = {}) { super(message); this.name = "UnnestRefusal"; this.detail = detail; }
}

const posix = (p) => String(p).replace(/\\/g, "/");
const ringKey = (r) => (Array.isArray(r) && r.length
  ? JSON.stringify(r.map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.y]))) : null);

// A JSON file rewritten in the spelling it was read in (the sweep's `null, 2`
// plus a final newline, and the working tree's line endings), so the diff is the
// rows that changed and nothing else.
function rewriteJson(file, value) {
  const was = readFileSync(file, "utf8");
  const eol = was.includes("\r\n") ? "\r\n" : "\n";
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`.replace(/\n/g, eol));
}

/**
 * The verb. `repo` is a world tree. Returns the receipt, or throws UnnestRefusal.
 * `dryRun` plans and writes nothing.
 */
export function unnestHouseholds({ repo, households = null, date, ruling, dryRun = false }) {
  const marksDir = join(repo, "WORLD", "marks");
  const freezePath = join(repo, "WORLD", "filing-freeze.json");
  const registryPath = join(repo, "WORLD", "settlement-publications.json");
  const credOf = householdResolver(households ?? join(repo, "WORLD", "households.json"));
  const filedAt = (rec) => "WORLD/marks/" + posix(relative(marksDir, rec._dir));

  const recsBefore = loadMarks(marksDir).filter((r) => !r._error);
  const movers = crossHouseholdRiders(recsBefore, credOf)
    // deepest first, so a mover inside another mover's directory leaves before its container does
    .sort((a, b) => posix(b.rec._dir).split("/").length - posix(a.rec._dir).split("/").length || (a.id < b.id ? -1 : 1));
  const plan = movers.map((m) => ({ id: m.id, frame: m.frame, from: filedAt(m.rec), to: `WORLD/marks/${m.by}/${m.rec.slug}` }));

  // Every destination is checked before anything is written: an id path that is
  // already a directory is another record's seat (or the same id twice, which is
  // the lint's error to report), and the verb does not guess between them.
  const taken = plan.filter((p) => existsSync(join(repo, p.to)));
  if (taken.length) throw new UnnestRefusal(`${taken.length} id path(s) already exist: ${taken.map((p) => p.to).join(", ")}`, { taken });
  if (dryRun || !movers.length) return { dryRun, movers: plan, rewritten: [], paths_changed: [], manifest_rows: [], unfrozen_rows: [], registry_rows: [] };

  const before = snapshotWorld(marksDir);
  const containBefore = new Map(containmentMap(recsBefore).marks.map((m) => [m.id, m.parent]));
  const pathBefore = new Map(recsBefore.map((r) => [r.id, filedAt(r)]));

  for (const m of movers) {
    const to = join(marksDir, m.by, m.rec.slug);
    mkdirSync(dirname(to), { recursive: true });
    renameSync(m.rec._dir, to);
  }
  // A HUSK this emptied goes with it (the sweep's own second pass, 2026-09-16):
  // a seat whose record left canon stood only as the filing of the marks under
  // it, and when those were another household's and have left, nothing is
  // beneath it. `rmdirSync` removes an EMPTY directory and nothing else, walking
  // up only while each one is empty.
  for (const m of movers) {
    for (let seat = dirname(m.rec._dir); posix(seat).startsWith(posix(marksDir) + "/"); seat = dirname(seat)) {
      if (!existsSync(seat) || readdirSync(seat).length) break;
      rmdirSync(seat);
    }
  }
  const rewritten = keepWorldAcross(marksDir, before);

  // ── THE FALSIFIER ──────────────────────────────────────────────────────────
  const recsAfter = loadMarks(marksDir).filter((r) => !r._error);
  const afterById = new Map(recsAfter.map((r) => [r.id, r]));
  const lost = [], moved = [];
  for (const [id, was] of before) {
    const now = afterById.get(id);
    if (!now) { lost.push(id); continue; }
    if (!was.at) continue;
    if (!now.at || now.at.x !== was.at.x || now.at.y !== was.at.y || ringKey(now.points) !== ringKey(was.points))
      moved.push({ id, was: was.at, now: now.at ?? null });
  }
  const containAfter = new Map(containmentMap(recsAfter).marks.map((m) => [m.id, m.parent]));
  const reparented = [...containBefore].filter(([id, p]) => containAfter.get(id) !== p).map(([id, p]) => ({ id, was: p, now: containAfter.get(id) ?? null }));
  const still = crossHouseholdRiders(recsAfter, credOf).map((r) => r.id);
  if (lost.length || moved.length || reparented.length || still.length) {
    throw new UnnestRefusal(
      `the un-nesting would change the world: ${lost.length} lost, ${moved.length} moved, ${reparented.length} re-parented, ${still.length} still riding another household — nothing past the moves was written; restore the tree from git`,
      { lost, moved: moved.slice(0, 20), reparented: reparented.slice(0, 20), still },
    );
  }

  // ── the path-keyed records follow the paths ───────────────────────────────
  // Each moved filing is recorded with the GROUND it stood on (its containment
  // parent, which the falsifier above just proved unchanged), so a reader that
  // used to key an allowance on a mark's filing can key it on this receipt.
  const pathsChanged = recsAfter.filter((r) => pathBefore.get(r.id) !== filedAt(r))
    .map((r) => ({ id: r.id, was: pathBefore.get(r.id), now: filedAt(r), ground: containAfter.get(r.id) ?? null }));
  const manifest = JSON.parse(readFileSync(freezePath, "utf8"));
  const isFossilRow = (p) => manifest.marks?.[p.id] !== undefined && manifest.marks[p.id] === p.was;
  const manifestRows = pathsChanged.filter(isFossilRow);
  const unfrozenRows = pathsChanged.filter((p) => !isFossilRow(p));
  if (pathsChanged.length) {
    for (const p of manifestRows) manifest.marks[p.id] = p.now;
    const receipt = (rows) => Object.fromEntries(rows.map((p) => [p.id, { was: p.was, now: p.now, ground: p.ground }]));
    manifest.reframed = [...(Array.isArray(manifest.reframed) ? manifest.reframed : []), {
      date, ruling,
      why: "another household's marks never ride your frame: each fossil filed inside another household's mark was re-filed at its id with its world place kept exactly (tools/unnest-households.mjs); its household's own marks and the predicates on it moved with it, keeping their frame. These rows are amended by name, never regenerated. `ground` is each mark's containment parent, unchanged by the move.",
      rows: receipt(manifestRows),
      // marks born after the freeze have no fossil row, but their filing moved by
      // the same act, and the act's receipt names them too
      ...(unfrozenRows.length ? { unfrozen: receipt(unfrozenRows) } : {}),
    }];
    rewriteJson(freezePath, manifest);
  }
  const registryRows = [];
  if (existsSync(registryPath)) {
    const registry = JSON.parse(readFileSync(registryPath, "utf8"));
    for (const p of pathsChanged) {
      const entry = registry.published?.[p.id];
      if (entry && entry.path === `${p.was}/mark.md`) { entry.path = `${p.now}/mark.md`; registryRows.push(p.id); }
    }
    if (registryRows.length) rewriteJson(registryPath, registry);
  }

  return { dryRun, movers: plan, rewritten, paths_changed: pathsChanged, manifest_rows: manifestRows, unfrozen_rows: unfrozenRows, registry_rows: registryRows };
}

// ── the command ──────────────────────────────────────────────────────────────
if (resolve(process.argv[1] ?? "") === resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const opt = (name, def = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
  const repo = resolve(opt("--repo", join(dirname(fileURLToPath(import.meta.url)), "..")));
  const date = opt("--date", new Date().toISOString().slice(0, 10));
  const ruling = opt("--ruling", "POS-441 (Darko, 2026-10-07): moving a mark carries the marks inside it that belong to the same household; another household's marks never move. \"That should just always be the default rule.\"");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { console.error(`--date ${date}: YYYY-MM-DD`); process.exit(2); }
  try {
    const r = unnestHouseholds({ repo, households: opt("--households"), date, ruling, dryRun: args.includes("--dry-run") });
    console.log(`${r.dryRun ? "DRY RUN · " : ""}${r.movers.length} mark(s) framed by another household's mark`);
    for (const m of r.movers) console.log(`  ${m.id}  (rode ${m.frame})  ${m.from} -> ${m.to}`);
    if (!r.dryRun && r.movers.length)
      console.log(`numbers rewritten by the reparent verb: ${r.rewritten.length} · paths changed: ${r.paths_changed.length} · manifest rows amended: ${r.manifest_rows.length} (+${r.unfrozen_rows.length} post-freeze filings named) · registry paths: ${r.registry_rows.length} · positions changed: 0 (checked)`);
  } catch (e) {
    if (!(e instanceof UnnestRefusal)) throw e;
    console.error(`REFUSED: ${e.message}`);
    console.error(JSON.stringify(e.detail, null, 1).slice(0, 4000));
    process.exit(1);
  }
}
