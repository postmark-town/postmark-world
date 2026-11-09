// settlement-test-world.mjs — the world the suite reads is the CANDIDATE world, not the last crossing's snapshot
// (WLD-119; the S131 lesson, world#309 and #310).
//
//   node tools/settlement-test-world.mjs          # `npm test` runs it first (package.json § pretest)
//
// THE GAP. WORLD/world-state.json is the fold's output, written by the settlement sweep and by nothing a pull
// request does. A pull request that adds or changes marks is tested (suite.yml → `npm test`) against the
// PREVIOUS crossing's fold: its marks are in WORLD/marks, and absent from the state some fifty test files read.
// At the next sweep the state moves, and a test that read the stale one is red where it was green. S131: world#309's
// seven sweets passed merge CI, then the 18:00Z sweep folded them and two tests (the creatures' keep, the Lately
// rail) went red and held the town back.
//
// THE FIX, THE SMALLEST THAT USES WHAT THE CROSSING USES. Before the tests, fold this tree the way the sweep's final
// fold does (`node tools/marks-fold.mjs --stakes <stakes>`, tools/settlement-sweep.mjs, the call after its lint) and
// put the result where the tests read it, WORLD/world-state.json. The fold runs in a SCRATCH copy of tools/ and
// WORLD/, so it writes nothing else: the committed containment map, INDEX and region-outsiders stay as the pull
// request committed them, and their own guards (tools/containment-committed.test.mjs) keep judging the pull request's
// bytes, not ours. The prepared state is a generated file in the runner's checkout, never committed: a developer's
// `npm test` rewrites it, and `git checkout WORLD/world-state.json` puts the committed one back.
//
// WHAT IT IS, SAID PLAINLY (the receipt says it too). It is a PUBLIC GIT COMPOSITE, not the crossing's store-mode
// input: the stakes are rehearsal-stakes.mjs's, rebuilt from the escrow the last crossing committed into this very
// tree (`n` per holder, no breadth bonus: marks' `weight` / `weight_parts` can differ from a real crossing's), and
// no pending claim or sketchbook is folded. It answers "the committed marks plus this change, folded as the sweep
// folds", and claims nothing about a live settlement.
//
// A TREE THAT HAS JUST BEEN SWEPT IS LEFT ALONE. The hourly shadow rehearsal (Office deploy/settlement-shadow.sh) sweeps with
// the crossing's actual stakes, then runs `npm test` in that same clone: the world the sweep produced is exactly what its suite
// must read, and re-preparing it from the n-only composite would overwrite a real result with an approximation. So the CLI
// prepares only a STALE world (`stalenessOf`): the tree carries a mark the state lacks, the state carries one the tree lacks,
// or a shared mark's own words differ (kind, by, date, at, extent, body). A swept tree is consistent by construction (the sweep's
// fold reads the same marks), so it is kept as it is and the receipt says so; the required PR/CI route has the stale kind of
// world (a PR that adds or changes marks after the last crossing), and is prepared automatically.
//
// IT FAILS, IT NEVER FALLS BACK. Any refusal (no state to derive stakes from, a mark the loader cannot read, a fold
// that exits non-zero, a prepared state that does not hold every mark of the tree) throws, the CLI exits 2, and
// `npm test` stops before a single test runs. WORLD/world-state.json is written LAST and only from a fold that
// finished, so a refused run leaves the committed file exactly as it was, and says so.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deriveRehearsalStakes } from "./rehearsal-stakes.mjs";
import { loadMarks } from "./marks-fold.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, "..");
export const STATE_REL = "WORLD/world-state.json";
export const REFUSAL_SENTINEL = "SETTLEMENT-TEST-WORLD-REFUSAL";
export const COMPOSITE = "public git composite (the committed marks plus this change, folded as the sweep folds; the stakes are the last crossing's committed escrow, not a store read)";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const git = (repo, args) => { try { return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };

/** What the world a test reads must hold: every mark of the tree, and no mark the tree does not carry. */
export function missingFromState(repo, state = JSON.parse(readFileSync(join(repo, STATE_REL), "utf8"))) {
  const inTree = new Set(loadMarks(join(repo, "WORLD", "marks")).map((m) => m.id));
  const inState = new Set((state.marks ?? []).map((m) => m.id));
  return { notInState: [...inTree].filter((id) => !inState.has(id)).sort(), notInTree: [...inState].filter((id) => !inTree.has(id)).sort() };
}

/** The fields of a mark the fold copies from the loader's record verbatim (measured: 0 differences on a swept tree). */
export const COPIED_FIELDS = ["kind", "by", "date", "at", "extent", "body"];
const wordsOf = (m) => JSON.stringify(COPIED_FIELDS.map((k) => m?.[k] ?? null));

/**
 * Is the committed world-state stale against this tree's marks? `stale: true` when the state is absent or unreadable (so the
 * preparation refuses visibly), or the tree and the state disagree on which marks exist or on a shared mark's own words.
 */
export function stalenessOf(repo) {
  const statePath = join(resolve(repo), STATE_REL);
  let state;
  try { state = JSON.parse(readFileSync(statePath, "utf8")); } catch (e) { return { stale: true, why: `${STATE_REL} is absent or unreadable`, added: [], removed: [], changed: [] }; }
  const tree = loadMarks(join(resolve(repo), "WORLD", "marks"));
  const inState = new Map((state.marks ?? []).map((m) => [m.id, m]));
  const inTree = new Map(tree.map((m) => [m.id, m]));
  const added = [...inTree.keys()].filter((id) => !inState.has(id)).sort();
  const removed = [...inState.keys()].filter((id) => !inTree.has(id)).sort();
  const changed = [...inTree].filter(([id, m]) => inState.has(id) && wordsOf(m) !== wordsOf(inState.get(id))).map(([id]) => id).sort();
  return { stale: Boolean(added.length || removed.length || changed.length), why: null, added, removed, changed };
}

/**
 * Fold `repo` as the sweep's final fold does, in a scratch copy, and write the result to the repo's
 * WORLD/world-state.json. Returns the receipt. Throws on any refusal, having written nothing.
 */
export function prepareCandidateWorld({ repo = ROOT, scratchParent = tmpdir() } = {}) {
  repo = resolve(repo);
  const statePath = join(repo, STATE_REL);
  const before = existsSync(statePath) ? readFileSync(statePath, "utf8") : null;
  // the committed fold's escrow, reconciled against its own marks (refuses an empty or disagreeing picture)
  const { rows, totalN, marksWithEscrow } = deriveRehearsalStakes(repo);
  const scratch = mkdtempSync(join(scratchParent, "wld119-world-"));
  for (const dir of ["tools", "WORLD"]) cpSync(join(repo, dir), join(scratch, dir), { recursive: true });
  const stakes = join(scratch, "stakes.json");
  writeFileSync(stakes, JSON.stringify(rows, null, 1) + "\n");
  try {
    execFileSync(process.execPath, [join(scratch, "tools", "marks-fold.mjs"), "--stakes", stakes], { cwd: scratch, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    const said = String(e.stderr ?? e.message).trim().split("\n");
    throw new Error(`the fold of this tree exited ${e.status ?? "abnormally"}: ${[...said.slice(0, 4), ...(said.length > 5 ? ["…"] : []), ...said.slice(-1)].join(" | ").slice(0, 500)}`);
  }
  const prepared = readFileSync(join(scratch, STATE_REL), "utf8");
  const state = JSON.parse(prepared);
  const gap = missingFromState(repo, state);
  if (gap.notInState.length || gap.notInTree.length)
    throw new Error(`the prepared world does not match this tree's marks (${gap.notInState.length} missing from it, e.g. ${gap.notInState.slice(0, 3).join(", ") || "none"}; ${gap.notInTree.length} it holds that the tree does not, e.g. ${gap.notInTree.slice(0, 3).join(", ") || "none"})`);
  const was = before ? JSON.parse(before) : { marks: [] };
  const wasById = new Map((was.marks ?? []).map((m) => [m.id, JSON.stringify(m)]));
  const added = state.marks.filter((m) => !wasById.has(m.id)).map((m) => m.id);
  writeFileSync(statePath, prepared);   // last, and only from a fold that finished
  const stateCommit = git(repo, ["log", "-1", "--format=%H %cI", "--", STATE_REL]);
  return {
    kind: COMPOSITE,
    world: { head: git(repo, ["rev-parse", "HEAD"]), head_date: git(repo, ["log", "-1", "--format=%cI"]) },
    as_of: { stakes_from_the_fold_committed_in: stateCommit, note: "the crossing whose committed fold the stakes come from; no live clock, no store read" },
    stakes: { rows: rows.length, stamps: totalN, marks_with_escrow: marksWithEscrow, weights: "n only (no breadth bonus), so marks' weight can differ from a real crossing's" },
    folded: { marks: state.marks.length, parcels: state.parcels?.length ?? null, fold_errors: state.errors?.length ?? null },
    state_file: { path: STATE_REL, committed_sha256: before ? sha256(before) : null, prepared_sha256: sha256(prepared) },
    candidate_contribution: { marks_not_in_the_committed_state: added.length, first: added.slice(0, 5) },
    not_touched: ["WORLD/containment.json", "WORLD/INDEX.md", "WORLD/region-outsiders.json", "WORLD/region-outsiders.md"],
  };
}

function main() {
  const repo = resolve(process.argv[2] ?? ROOT);
  try {
    const stale = stalenessOf(repo);
    if (!stale.stale) {
      console.log(`settlement-test-world: NOT re-prepared: the world this tree holds is already folded from its marks (a tree the sweep has just produced is read as it is, not overwritten by the n-only composite)`);
      console.log(`settlement-test-world: receipt ${JSON.stringify({ prepared: false, reason: "state and marks agree (kind, by, date, at, extent, body)", state_file: { path: STATE_REL } })}`);
      return;
    }
    const receipt = prepareCandidateWorld({ repo });
    console.log(`settlement-test-world: prepared ${receipt.folded.marks} marks (${receipt.candidate_contribution.marks_not_in_the_committed_state} not in the committed state; stale: ${stale.added.length} added, ${stale.removed.length} removed, ${stale.changed.length} changed) as a ${receipt.kind}`);
    console.log(`settlement-test-world: receipt ${JSON.stringify({ prepared: true, ...receipt, stale: { added: stale.added.slice(0, 5), removed: stale.removed.slice(0, 5), changed: stale.changed.slice(0, 5) } })}`);
  } catch (error) {
    const why = String(error?.message ?? error);
    console.error(`settlement-test-world: REFUSED — ${why}\n  ${STATE_REL} was left as it was; the suite does not run on a stale or half-made world.`);
    console.error(`${REFUSAL_SENTINEL} ${JSON.stringify({ cause: why, repo })}`);
    process.exit(2);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();
