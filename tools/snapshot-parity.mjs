#!/usr/bin/env node
// snapshot-parity.mjs — THE SUITE ON THE TREE AND ON A SNAPSHOT, SIDE BY SIDE (POS-363).
//
//   node tools/snapshot-parity.mjs [--snapshot <export>] [--files <a,b,…>] [--concurrency <n>] [--json <file>]
//
// Runs each test file twice, once reading the tree and once with WORLD_SNAPSHOT
// naming a snapshot export (the loader's one seam, marks-fold.mjs § THE
// SNAPSHOT SEAM), and compares the two runs test by test: which pass, which
// fail. The claim it checks is "identical pass and fail on the tree and on the
// snapshot at one settlement", so the tree must be checked out at the
// settlement the export was sealed from.
//
//   --snapshot  the export to read; default: one built from this tree
//               (snapshotFromTree), which proves the seam and nothing about the store
//   --files     the test files; default: every tools/*.test.mjs that reads the live
//               tree's marks (the loader, or WORLD/marks by path) — see filesReadingTheTree
//
// THE FILING-PATH TESTS. A test that reads a record's filing (`_dir`, `_path`,
// the freeze's filing map) asks the tree a question a snapshot has no answer
// to: a snapshot carries no directory. Those are listed separately
// (`filing_path`), because they retire with POS-365 (git becomes the
// settlement's printout, and a filing path stops being a fact about the World).
//
// EXIT: 0 every file passes and fails alike both ways · 1 a difference, named ·
// 2 could not run.

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { snapshotFromTree, SNAPSHOT_ENV, SNAPSHOT_ROOT_ENV } from "./marks-fold.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const READS_LOADER = /\bloadMarks\s*\(/;
const READS_TREE = /WORLD\/marks|["']WORLD["']\s*,\s*["']marks["']/;
// A record's FILING, read off the loader's records (`_dir`, `_path`) or the freeze's
// filing map. Measured on S99 (POS-363): the two live-tree files that differ because
// a snapshot carries no directory both read `_dir`. Writing mark.md into a fixture is not this.
const READS_FILING = /\b_dir\b|\b_path\b|frozenFiling|filedPath/;

/** Every test file that reads the live tree's marks, and which of them also read filings by path. PURE over the sources. */
export function filesReadingTheTree(sources) {
  const reads = [], filing = [];
  for (const [file, text] of sources) {
    if (/snapshot-(seam|parity)\.test\.mjs$/.test(file)) continue;
    if (!READS_LOADER.test(text) && !READS_TREE.test(text)) continue;
    reads.push(file);
    if (READS_FILING.test(text)) filing.push(file);
  }
  return { reads: reads.sort(), filing: filing.sort() };
}

/** A TAP run's verdict per test: `Map(name -> "ok" | "not ok")`, subtests included by their nesting. PURE. */
export function tapVerdicts(tap) {
  // A subtest's verdict line comes BEFORE its parent's, so the parents are read
  // off the `# Subtest: <name>` lines node's TAP writes ahead of each test.
  const out = new Map();
  const stack = [];
  for (const line of String(tap).split(/\r?\n/)) {
    const sub = /^(\s*)# Subtest: (.*)$/.exec(line);
    if (sub) { const d = sub[1].length / 4; stack.length = d; stack[d] = sub[2]; continue; }
    const m = /^(\s*)(ok|not ok) \d+ - (.*?)(?:\s+#\s+(SKIP|TODO).*)?$/.exec(line);
    if (!m) continue;
    const depth = m[1].length / 4;
    const name = [...stack.slice(0, depth), m[3]].join(" > ");
    out.set(name, m[4] ? m[4].toLowerCase() : m[2]);
  }
  return out;
}

/** The difference between two runs of one file: tests whose verdict differs, and tests only one run has. PURE. */
export function difference(tree, snap) {
  const rows = [];
  for (const [name, v] of tree) if (snap.get(name) !== v) rows.push({ test: name, tree: v, snapshot: snap.get(name) ?? "absent" });
  for (const [name, v] of snap) if (!tree.has(name)) rows.push({ test: name, tree: "absent", snapshot: v });
  return rows;
}

function runFile(file, env) {
  return new Promise((ok) => {
    const child = spawn(process.execPath, ["--test", "--test-reporter=tap", file], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", () => {});
    child.on("close", (code) => ok({ code, tap: out }));
  });
}

async function main(argv) {
  const opt = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const scratch = mkdtempSync(join(tmpdir(), "postmark-snapshot-parity-"));
  try {
    let snapshot = opt("--snapshot");
    if (!snapshot) {
      snapshot = join(scratch, "tree-snapshot.json");
      writeFileSync(snapshot, JSON.stringify(snapshotFromTree(join(ROOT, "WORLD", "marks"), { settlement: "this tree, exported" })));
    }
    const sources = readdirSync(HERE).filter((n) => n.endsWith(".test.mjs")).map((n) => [`tools/${n}`, readFileSync(join(HERE, n), "utf8")]);
    const found = filesReadingTheTree(sources);
    const files = opt("--files") ? opt("--files").split(",").map((s) => s.trim()).filter(Boolean) : found.reads;
    const n = Math.max(1, Number(opt("--concurrency", 2)));
    const base = { ...process.env }; delete base[SNAPSHOT_ENV]; delete base[SNAPSHOT_ROOT_ENV];
    const results = [];
    let next = 0;
    await Promise.all(Array.from({ length: n }, async () => {
      while (next < files.length) {
        const file = files[next++];
        const tree = await runFile(file, base);
        const snap = await runFile(file, { ...base, [SNAPSHOT_ENV]: snapshot, [SNAPSHOT_ROOT_ENV]: ROOT });
        const rows = difference(tapVerdicts(tree.tap), tapVerdicts(snap.tap));
        const counts = (m) => ({ tests: m.size, fail: [...m.values()].filter((v) => v === "not ok").length });
        results.push({ file, filing_path: found.filing.includes(file), tree: counts(tapVerdicts(tree.tap)), snapshot: counts(tapVerdicts(snap.tap)), differ: rows });
        console.error(`snapshot-parity: ${rows.length ? "DIFFER" : "same  "} ${file}${rows.length ? ` — ${rows.length}: ${rows.slice(0, 3).map((r) => `${r.test} (tree ${r.tree}, snapshot ${r.snapshot})`).join("; ")}` : ""}`);
      }
    }));
    results.sort((a, b) => a.file.localeCompare(b.file));
    const differing = results.filter((r) => r.differ.length);
    const summary = {
      snapshot: relative(ROOT, snapshot) || snapshot, files: results.length, same: results.length - differing.length,
      differ: differing.map((r) => r.file), filing_path: found.filing,
      tests: results.reduce((a, r) => a + r.tree.tests, 0), results,
    };
    if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify(summary, null, 1) + "\n");
    console.error(`snapshot-parity: ${summary.same}/${summary.files} file(s) pass and fail alike on the tree and the snapshot (${summary.tests} tests); ${found.filing.length} read filings by path and retire with POS-365`);
    // The exit CODE, never process.exit() here: an exit inside the try ends the
    // process before `finally` runs, and the scratch export was left behind on
    // every run (Wright's review of world#165).
    process.exitCode = differing.length ? 1 : 0;
    return summary;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((e) => { console.error(`snapshot-parity: could not run — ${e?.message ?? e}`); process.exit(2); });
}
