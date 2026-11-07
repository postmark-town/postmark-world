#!/usr/bin/env node
// migrate-town-constitution-frames.mjs — one-shot: re-write the file numbers of
// the records whose FRAME ORIGIN changes when every town mark stands at the
// constitution (POS-702; Darko, 2026-10-19 09:59: "By definition, the
// constitutional marks are the ones that are belonging to the town"), so that
// every one of them composes to EXACTLY the world position it already held.
//
//   node tools/migrate-town-constitution-frames.mjs --dry     # the plan, nothing written
//   node tools/migrate-town-constitution-frames.mjs           # rewrite
//   node tools/migrate-town-constitution-frames.mjs --ref origin/main
//
// WHY ANY FILE CHANGES AT ALL. Under the tier binding (marks-fold.mjs §
// frameOriginOf) a record's numbers are written against its nearest positioned
// ancestor whose rank is at least its own. the-town/the-long-run-harbor carried
// no `tier:` line, so it stood as market (rank 1) and could not frame the quay
// and the three vessels filed in it (constitution, rank 3): their numbers were
// written against the frame above. Once the harbor stands as constitution it
// binds them, and numbers written for the old frame would put the quay and the
// ships 220 m east and 160 m north. This moves paper so the town does not move.
//
// It is migrate-one-walk-frames.mjs's derivation, re-pointed: the set is
// DERIVED, never listed (a record is in it exactly when the ancestor whose
// centre its numbers are written against changes), and the world positions
// come from the PRE-RULING tree loaded with its OWN tools/marks-fold.mjs at a
// git ref. Nothing else is touched, no `tier:` line is added or removed.

import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { loadMarks, worldToFile, ringToFile, ringToWorld, fileToWorld, standingRank, WORLD_ROOT_SLUG } from "./marks-fold.mjs";
import { markStanding } from "./mark-standing.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const REF = opt("--ref", "origin/main");
const MARKS_DIR = opt("--marks-dir", join(ROOT, "WORLD/marks"));
const DRY = args.includes("--dry");

const die = (msg, fix) => { console.error(`migrate-town-constitution-frames: ${msg}${fix ? `\n  ${fix}` : ""}`); process.exit(1); };
const run = (cmd, argv, o = {}) => {
  const r = spawnSync(cmd, argv, { cwd: ROOT, encoding: "buffer", ...o });
  if (r.error) throw new Error(`${cmd} could not be run (${r.error.code ?? r.error.message})`);
  if (r.status !== 0) throw new Error(`${cmd} ${argv.join(" ")} exited ${r.status}: ${String(r.stderr ?? "").trim()}`);
  return r.stdout;
};

// ── the before-side: the pre-ruling tree, loaded with the pre-ruling loader ──
let scratch = null;
let before;
try {
  scratch = mkdtempSync(join(tmpdir(), "town-constitution-frames-"));
  try {
    run("git", ["archive", "-o", join(scratch, "ref.tar"), REF, "WORLD/marks", "tools"]);
    run("tar", ["-xf", "ref.tar"], { cwd: scratch });
  } catch (e) { die(`could not read the tree at ${REF}`, e.message); }

  let refMod;
  try { refMod = await import(pathToFileURL(join(scratch, "tools/marks-fold.mjs")).href); }
  catch (e) { die(`the tree at ${REF} has no loadable tools/marks-fold.mjs`, e.message); }
  // The before-side must be the PRE-RULING standing: a ref whose own walk
  // still reads a town mark with no `tier:` line as market.
  const refStanding = await import(pathToFileURL(join(scratch, "tools/mark-standing.mjs")).href);
  if (refStanding.markStanding({ id: "the-town/probe", by: "the-town", kind: "sited" }, new Map()) === "constitution")
    die(`the standing rule at ${REF} already stands every town mark at the constitution`,
      "there is no before-side to read: point --ref at a commit from before POS-702 landed.");

  before = refMod.loadMarks(join(scratch, "WORLD/marks")).filter((m) => !m._error);
  if (!before.length) die(`the tree at ${REF} loaded no marks`);
} finally {
  if (scratch && existsSync(scratch)) rmSync(scratch, { recursive: true, force: true });
}

// ── the new frame origin, over the world positions the before-side states ────
// Written against the OLD tree's composed centres on purpose: they are the
// positions this migration exists to preserve, so every origin it computes is
// the one the new loader will compute once the rewrite has landed.
const byId = new Map();
for (const m of before) if (!byId.has(m.id)) byId.set(m.id, m);
const root = before.find((m) => m.slug === WORLD_ROOT_SLUG);
const worldCentre = root?.at ? { x: root.at.x, y: root.at.y } : { x: 0, y: 0 };

const boundOrigin = (rec) => {
  const continued = rec.kind === "predicated" || rec.kind === "naming";
  const rank = standingRank(rec, byId);
  const walked = new Set([rec]);
  let p = rec._parentMarkId ? byId.get(rec._parentMarkId) : null;
  while (p && !walked.has(p)) {
    walked.add(p);
    if (p.at && (continued || standingRank(p, byId) >= rank)) return { x: p.at.x, y: p.at.y };
    p = p._parentMarkId ? byId.get(p._parentMarkId) : null;
  }
  return { ...worldCentre };
};

// ── the working tree: where the files actually are ───────────────────────────
const now = loadMarks(MARKS_DIR);
const dirOf = new Map();
const fileAtOf = new Map();
for (const rec of now) { if (!dirOf.has(rec.id)) { dirOf.set(rec.id, rec._dir); fileAtOf.set(rec.id, rec._fileAt); } }

const AT_RE = /^at: .*$/m;
const POINTS_RE = /^points: .*$/m;
const num = (n) => String(n);
const ringText = (ring) => ring.map((p) => (Array.isArray(p) ? `${num(p[0])},${num(p[1])}` : `${num(p.x)},${num(p.y)}`)).join(" ");
const same = (a, b) => a.x === b.x && a.y === b.y;

const plan = [];
const problems = [];
for (const rec of before) {
  if (!rec._fileAt) continue;                     // predicated/naming carry no position
  if (rec === root) continue;                     // the root IS the frame
  const origin = boundOrigin(rec);
  if (same(origin, rec._origin)) continue;        // the same ancestor binds it as before — nothing moves on paper

  const dir = dirOf.get(rec.id);
  if (!dir) { problems.push(`${rec.id}: no directory in the working tree — the before-side and this tree disagree about what exists`); continue; }
  const wtFileAt = fileAtOf.get(rec.id);
  if (!wtFileAt || !same(wtFileAt, rec._fileAt))
    { problems.push(`${rec.id}: the working file says ${wtFileAt?.x},${wtFileAt?.y} but ${REF} says ${rec._fileAt.x},${rec._fileAt.y} — this record has been edited since; rewriting it would compose against a number nobody checked`); continue; }

  // the whole promise, checked per record before a byte is written: the numbers
  // this writes must compose BACK to the exact position the world already held.
  // The transform is not universally invertible in doubles (coords-frame.test.mjs
  // keeps the case), so it is verified, never assumed.
  const at = worldToFile(rec.at, origin);
  if (!same(fileToWorld(at, origin), rec.at))
    { problems.push(`${rec.id}: ${rec.at.x},${rec.at.y} does not survive re-framing on ${origin.x},${origin.y} in doubles — refusing to move a mark by rounding`); continue; }

  let points = null;
  if (Array.isArray(rec.points) && rec.points.length) {
    points = ringToFile(rec.points, origin);
    if (JSON.stringify(ringToWorld(points, origin)) !== JSON.stringify(rec.points))
      { problems.push(`${rec.id}: the points ring does not survive re-framing on ${origin.x},${origin.y} in doubles`); continue; }
  }

  const file = join(dir, "mark.md");
  let text = readFileSync(file, "utf8");
  if (!AT_RE.test(text)) { problems.push(`${rec.id}: carries a position but has no "at:" line to rewrite`); continue; }
  text = text.replace(AT_RE, `at: { x: ${num(at.x)}, y: ${num(at.y)} }`);
  if (points) {
    if (!POINTS_RE.test(text)) { problems.push(`${rec.id}: carries a ring but has no "points:" line`); continue; }
    text = text.replace(POINTS_RE, `points: ${ringText(points)}`);
  }
  plan.push({ rec, file, text, at, origin, ring: points?.length ?? 0 });
}

if (problems.length) die(`${problems.length} record(s) cannot be re-framed`, problems.join("\n  "));

// ── report, then write ───────────────────────────────────────────────────────
const rel = (p) => p.replace(/\\/g, "/").replace(/^.*\/(WORLD\/marks\/)/, "$1");
console.log(`${before.filter((m) => m._fileAt).length} positioned record(s) at ${REF}; ${plan.length} change frame when the town's own marks stand at the constitution.\n`);
for (const p of plan) {
  const parent = byId.get(p.rec._parentMarkId);
  console.log(`  ${p.rec.id}  [${p.rec.kind}, wrote "tier: ${p.rec.tier}", stands as ${markStanding(p.rec, byId)}]`);
  console.log(`    filed in ${p.rec._parentMarkId ?? "(the root)"} [stands as ${parent ? markStanding(parent, byId) : "—"}]`);
  console.log(`    ${rel(p.file)}`);
  console.log(`    framed on ${p.rec._origin.x},${p.rec._origin.y} -> ${p.origin.x},${p.origin.y}`);
  console.log(`    at: ${p.rec._fileAt.x},${p.rec._fileAt.y} -> ${p.at.x},${p.at.y}${p.ring ? `   (+ a ${p.ring}-point ring)` : ""}`);
  console.log(`    world position, before and after: ${p.rec.at.x},${p.rec.at.y}\n`);
}
if (!plan.length) { console.log("nothing to re-frame — every record is already written against the ancestor that binds it."); process.exit(0); }
if (DRY) { console.log(`--dry: nothing written.`); process.exit(0); }
for (const p of plan) writeFileSync(p.file, p.text);
console.log(`wrote ${plan.length} record(s).
Prove it moved nothing:  node tools/one-walk-falsifier.mjs --ref ${REF}`);
