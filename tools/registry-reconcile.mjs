#!/usr/bin/env node
// registry-reconcile.mjs — a stale publication-registry row follows its mark's
// FILE, and nothing else (postmark#3757).
//
// `WORLD/settlement-publications.json` is the sweep's record of what it
// published: per mark, the household, the path it filed and the class it
// judged at admission. Only the sweep writes a row, when it publishes or
// unpublishes. Any other act that moves a published file leaves the row
// behind: the hand filings of 10-03/10-04 (8260eaaf, 49e9a92f, world #140)
// re-filed four predicates and naming marks under their declared parents, and
// kinofire's fireplace and firepit went on naming a root path that no longer
// existed, so the sweep's rule could not reach them while the doorstep warned
// of a sweep.
//
// PATHS ONLY. This verb never writes `class`. The stored class is the
// admission's verdict, and it is no longer what keeps a mark: the sweep walks
// each mark's standing at the crossing (unpublish-verdict.mjs, the safety
// half, postmark-world#208), and a mark that walks home or constitution is
// never unpublished whatever its row says. A second copy of standing written
// into the data would be two sources of truth, which is the bug (Darko,
// 10-14). Since WLD-51's G2 (Darko, 2026-10-15 12:59) the stored class decides
// in neither direction: a home row whose mark walks market is taken at ✦0 too.
//
// NO ROW IS HELD ANY MORE. This verb used to hold back a stale row stored
// commons whose mark walks commons, because repointing it made a ✦0 market mark
// sweepable that the stale path hid. Darko ruled the 13 such rows on 10-14
// 14:51: "just take them ... the sweep reaches them like any other ✦0 commons
// mark". So every stale row follows its file, and the sweep judges it there.
//
// A row whose mark no longer stands and has no filing is removed. A row whose
// mark stands but whose filing cannot be found (or is found twice) is left as
// it is and listed as unresolved.
//
//   node tools/registry-reconcile.mjs            # dry run: what would change
//   node tools/registry-reconcile.mjs --write    # write the safe repairs
//
// Run it after any act that moves a published mark's file, and whenever
// tools/registry-paths.test.mjs reds.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks } from "./marks-fold.mjs";

export const REGISTRY_REL = "WORLD/settlement-publications.json";

/**
 * The plan, pure.
 * @param published  the registry's `published` map.
 * @param filingOf   `(id) => "WORLD/marks/…/mark.md" | null` — where the mark is filed now (null: none, or ambiguous).
 * @param tierOf     `(id) => tier | undefined` — the mark's derived standing on main; undefined when it does not stand.
 * @param pathExists `(path) => boolean` — is a registered path in the tree? A row whose path is, is left alone.
 * @returns `{ repairs, removed, unresolved }`, each a list of `{ id, from, to?, why }` in registry order.
 */
export function reconcilePlan(published, { filingOf, tierOf, pathExists }) {
  const repairs = [], removed = [], unresolved = [];
  for (const [id, row] of Object.entries(published ?? {})) {
    const from = { path: row.path, class: row.class };
    if (pathExists(row.path)) continue;   // not stale: the sweep's walk judges it at every crossing
    const tier = tierOf(id);
    const filed = filingOf(id);
    if (tier === undefined) {
      if (filed) unresolved.push({ id, from, why: "filed but not standing in world-state.json: a fold error or a stale state; left as it is" });
      else removed.push({ id, from, why: "the mark no longer stands and has no filing" });
      continue;
    }
    if (!filed) { unresolved.push({ id, from, why: "the mark stands but no single filing answers to its id; left as it is" }); continue; }
    const to = { path: filed, class: from.class };   // the class is never written: see the header
    repairs.push({ id, from, to, walks: tier, why: "path" });
  }
  return { repairs, removed, unresolved };
}

/** Apply a plan to the registry document; returns a new document. Unresolved rows are untouched. */
export function applyPlan(doc, plan) {
  const published = { ...doc.published };
  for (const r of plan.repairs) published[r.id] = { ...published[r.id], path: r.to.path };
  for (const r of plan.removed) delete published[r.id];
  return { ...doc, published };
}

/** The repo's own inputs: the tree's filings by id, and world-state.json's derived tiers. */
export function reconcileRepo(repo) {
  const marksDir = join(repo, "WORLD", "marks");
  const filings = new Map();
  for (const rec of loadMarks(marksDir)) {
    if (rec._error || !rec.id || !rec._dir) continue;
    const path = `WORLD/marks/${relative(marksDir, rec._dir).split("\\").join("/")}/mark.md`;
    filings.set(rec.id, filings.has(rec.id) ? null : path);   // two filings for one id: ambiguous
  }
  const state = JSON.parse(readFileSync(join(repo, "WORLD", "world-state.json"), "utf8"));
  const tiers = new Map((state.marks ?? []).map((m) => [m.id, m.tier]));
  const doc = JSON.parse(readFileSync(join(repo, REGISTRY_REL), "utf8"));
  const plan = reconcilePlan(doc.published, {
    filingOf: (id) => filings.get(id) ?? null, tierOf: (id) => tiers.get(id), pathExists: (path) => existsSync(join(repo, path)),
  });
  return { doc, plan };
}

if (resolve(process.argv[1] ?? "") === resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const opt = (name, def = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
  const repo = resolve(opt("--repo", join(dirname(fileURLToPath(import.meta.url)), "..")));
  const write = args.includes("--write");
  const { doc, plan } = reconcileRepo(repo);
  const line = (r) => `  ${r.id}  [${r.from.class}${r.walks ? `, walks ${r.walks}` : ""}] ${r.from.path}${r.to ? `  ->  ${r.to.path}` : ""}  (${r.why})`;
  console.log(`${write ? "" : "DRY RUN · "}${Object.keys(doc.published).length} registry rows`);
  console.log(`repaired: ${plan.repairs.length}`); plan.repairs.forEach((r) => console.log(line(r)));
  console.log(`removed: ${plan.removed.length}`); plan.removed.forEach((r) => console.log(line(r)));
  console.log(`unresolved: ${plan.unresolved.length}`); plan.unresolved.forEach((r) => console.log(line(r)));
  if (write && (plan.repairs.length || plan.removed.length))
    writeFileSync(join(repo, REGISTRY_REL), `${JSON.stringify(applyPlan(doc, plan), null, 2)}\n`);
}
