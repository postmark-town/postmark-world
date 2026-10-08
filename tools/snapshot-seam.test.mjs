// snapshot-seam.test.mjs — THE ONE SEAM THAT LETS THE WORLD BE READ FROM A SNAPSHOT (POS-363).
//
// loadMarks of this repo's own WORLD/marks answers from the snapshot export that
// WORLD_SNAPSHOT names; every other directory is read from disk as before; an
// export of any other shape refuses rather than reading as an empty world.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  loadMarks, loadTreeMarks, loadSnapshot, snapshotFor, snapshotFromTree, SNAPSHOT_ENV, SNAPSHOT_ROOT_ENV, SNAPSHOT_FORMAT,
} from "./marks-fold.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = join(ROOT, "WORLD", "marks");

function withEnv(value, fn, root = ROOT) {
  const before = [process.env[SNAPSHOT_ENV], process.env[SNAPSHOT_ROOT_ENV]];
  const set = (k, v) => { if (v == null) delete process.env[k]; else process.env[k] = v; };
  set(SNAPSHOT_ENV, value); set(SNAPSHOT_ROOT_ENV, value == null ? null : root);
  try { return fn(); } finally { set(SNAPSHOT_ENV, before[0]); set(SNAPSHOT_ROOT_ENV, before[1]); }
}

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), "postmark-snapshot-seam-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("unset, the loader reads the tree: the seam changes nothing until it is asked to", () => {
  withEnv(null, () => {
    assert.equal(snapshotFor(LIVE), null);
    assert.equal(JSON.stringify(loadMarks(LIVE)), JSON.stringify(loadTreeMarks(LIVE)));
  });
});

test("set, the live tree answers from the snapshot, record for record, in the export's order", (t) => {
  const path = join(scratch(t), "snap.json");
  const doc = snapshotFromTree(LIVE, { settlement: "the tree, exported" });
  assert.equal(doc.format, SNAPSHOT_FORMAT);
  assert.ok(doc.marks.length > 100, "the live tree carries the town");
  // A snapshot the tree does not hold: one mark fewer, so the answer is provably the snapshot's.
  const dropped = doc.marks[0].id;
  writeFileSync(path, JSON.stringify({ ...doc, marks: doc.marks.slice(1) }));
  withEnv(path, () => {
    const read = loadMarks(LIVE);
    assert.equal(read.length, doc.marks.length - 1);
    assert.ok(!read.some((m) => m.id === dropped), "the loader answered from the snapshot, not the tree");
    assert.deepEqual(read.map((m) => m.id), doc.marks.slice(1).map((m) => m.id), "in the export's order");
  });
});

test("only the live tree is switched: a fixture directory is read from disk whatever the switch says", (t) => {
  const dir = scratch(t);
  mkdirSync(join(dir, "marks", "fixture-mark"), { recursive: true });
  writeFileSync(join(dir, "marks", "fixture-mark", "mark.md"), "---\nkind: sited\nby: ann\ndate: 2026-10-08\nat: { x: 1, y: 1 }\nextent: { w: 1, h: 1 }\n---\n\na fixture\n");
  const path = join(dir, "snap.json");
  writeFileSync(path, JSON.stringify({ format: SNAPSHOT_FORMAT, marks: [] }));
  withEnv(path, () => {
    assert.equal(snapshotFor(join(dir, "marks")), null);
    assert.deepEqual(loadMarks(join(dir, "marks")).map((m) => m.id), ["ann/fixture-mark"]);
    assert.deepEqual(loadMarks(LIVE), [], "while the live tree answers from the (empty) snapshot");
  });
});

test("an export of any other shape refuses, by name: a snapshot that cannot be read is never an empty world", (t) => {
  const dir = scratch(t);
  const wrong = join(dir, "wrong.json"), nomarks = join(dir, "nomarks.json");
  writeFileSync(wrong, JSON.stringify({ format: "something-else/1", marks: [] }));
  writeFileSync(nomarks, JSON.stringify({ format: SNAPSHOT_FORMAT }));
  assert.throws(() => loadSnapshot(wrong), /is not a postmark-world-snapshot\/1 export/);
  assert.throws(() => loadSnapshot(nomarks), /carries no marks array/);
  assert.throws(() => loadSnapshot(join(dir, "absent.json")), /could not be read as a snapshot export/);
  withEnv(wrong, () => assert.throws(() => loadMarks(LIVE), /WORLD_SNAPSHOT/));
});

test("each read is a fresh copy: a caller that stamps the records cannot change the next reader's", (t) => {
  const path = join(scratch(t), "snap.json");
  writeFileSync(path, JSON.stringify({ format: SNAPSHOT_FORMAT, marks: [{ id: "a/b", kind: "sited" }] }));
  const first = loadSnapshot(path);
  first[0].kind = "stamped";
  assert.equal(loadSnapshot(path)[0].kind, "sited");
});

test("the switch names the repo it stands for: without WORLD_SNAPSHOT_ROOT, or naming another repo, nothing is switched", (t) => {
  // The first parity run (POS-363) found the switch, inherited through the
  // environment, applied to FIXTURE repos that copy tools/: twelve files'
  // fixtures read the town's snapshot as their own tree.
  const path = join(scratch(t), "snap.json");
  writeFileSync(path, JSON.stringify({ format: SNAPSHOT_FORMAT, marks: [] }));
  assert.equal(snapshotFor(LIVE, { [SNAPSHOT_ENV]: path }), null, "no root named: no switch");
  assert.equal(snapshotFor(LIVE, { [SNAPSHOT_ENV]: path, [SNAPSHOT_ROOT_ENV]: join(ROOT, "..", "some-fixture-repo") }), null, "another repo named: no switch");
  assert.equal(snapshotFor(LIVE, { [SNAPSHOT_ENV]: path, [SNAPSHOT_ROOT_ENV]: ROOT }), path, "this repo named: the switch");
  withEnv(path, () => assert.ok(loadMarks(LIVE).length > 100, "a root naming another repo leaves this tree read from disk"), join(ROOT, "..", "elsewhere"));
});

test("the parity run reads TAP per test, nested, and names each test whose verdict differs", async () => {
  const { tapVerdicts, difference, filesReadingTheTree } = await import("./snapshot-parity.mjs");
  const tree = tapVerdicts(["# Subtest: a", "    ok 1 - inner", "ok 1 - a", "ok 2 - b", "not ok 3 - c", "ok 4 - d # SKIP no clone"].join("\n"));
  assert.deepEqual([...tree], [["a > inner", "ok"], ["a", "ok"], ["b", "ok"], ["c", "not ok"], ["d", "skip"]]);
  const snap = tapVerdicts(["# Subtest: a", "    not ok 1 - inner", "ok 1 - a", "ok 2 - b", "not ok 3 - c", "ok 4 - d # SKIP no clone", "ok 5 - e"].join("\n"));
  assert.deepEqual(difference(tree, snap), [{ test: "a > inner", tree: "ok", snapshot: "not ok" }, { test: "e", tree: "absent", snapshot: "ok" }]);
  const found = filesReadingTheTree([
    ["tools/a.test.mjs", "loadMarks(join(ROOT, 'WORLD', 'marks'))"],
    ["tools/b.test.mjs", "loadMarks(dir); m._dir.includes('x')"],
    ["tools/c.test.mjs", "nothing about the world"],
  ]);
  assert.deepEqual(found, { reads: ["tools/a.test.mjs", "tools/b.test.mjs"], filing: ["tools/b.test.mjs"] });
});
