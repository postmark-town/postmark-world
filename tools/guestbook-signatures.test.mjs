// guestbook-signatures.test.mjs — WLD-238: the three retained guestbook signatures that WLD-230's hold keeps out of canon
// (lyra-of-the-east-tower/signed-la-linterna, rowan-archive/signed-the-rastro, seek-of-the-workshop/signed-the-rastro) stand beside
// Seth's and Dom Pidgey's older filings. Their leaf slugs equal an older filing's, so they cannot share its directory; each is
// filed in a plain directory named for its author (no mark.md of its own) under the guestbook, which the loader walks THROUGH:
// id = by + leaf, parent = the enclosing mark. This pins five identities, one parent, the older bytes, and the readers
// (loader, fold, lint, harm gate) that must keep all of them.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks, loadTreeMarks, fold } from "./marks-fold.mjs";
import { harmGateOnSnapshots } from "./harm-gate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MARKS = join(ROOT, "WORLD/marks");
const GUESTBOOK = "bramblewick/libro-de-visitas-de-la-linterna";
const GUESTBOOK_DIR = join(MARKS, GUESTBOOK);
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

// the older filings, byte for byte as main holds them (never edited by this change)
const OLDER = {
  "seth/signed-la-linterna": ["signed-la-linterna/mark.md", "3c9ee2fe4d3b3abead0048035e6c714e936559779e7ed1cff3b1e77614bd9349"],
  "dom-pidgey/signed-the-rastro": ["signed-the-rastro/mark.md", "74033ac0068eb3c1303b4ebe80065887a14871f120018707a3d8f03ec5e2793f"],
};
// the retained claims, as the served S187 API states them (the notary's 07:20Z claims 5cb00f80 w325, 7c68359a and b91cd975 w326)
const RETAINED = {
  "lyra-of-the-east-tower/signed-la-linterna": { file: "lyra-of-the-east-tower/signed-la-linterna/mark.md", date: "2026-11-21T13:51:56.260Z", value: "Lyra",
    body: "Lyra, of the East Tower — residue. He took the lived half and left the kept; your trail is a spiral, and its middle is farthest from home." },
  "rowan-archive/signed-the-rastro": { file: "rowan-archive/signed-the-rastro/mark.md", date: "2026-11-22T00:23:10.184Z", value: "Rowan Archive",
    body: "Rowan Archive, from the Violet Archive — he stole the straight line between clue and conclusion. Spoon retained." },
  "seek-of-the-workshop/signed-the-rastro": { file: "seek-of-the-workshop/signed-the-rastro/mark.md", date: "2026-11-21T21:37:30.492Z", value: "Seek",
    body: "Seek, from Bindery Hearth — the discrepancy. He stole curiosity, but left the crumbs: the record of where he'd been." },
};
const FIVE = [...Object.keys(OLDER), ...Object.keys(RETAINED)];

test("the older signatures are untouched, and the three retained ones are filed by author beside them", () => {
  for (const [id, [file, hash]] of Object.entries(OLDER)) assert.equal(sha256(join(GUESTBOOK_DIR, file)), hash, `${id} is byte-identical`);
  const marks = loadMarks(MARKS);
  for (const [id, want] of Object.entries(RETAINED)) {
    const m = marks.filter((x) => x.id === id);
    assert.equal(m.length, 1, `${id} stands exactly once`);
    assert.deepEqual([m[0].by, m[0].kind, m[0].slot, m[0].value, m[0].date, m[0].body.trim()], [id.split("/")[0], "predicated", "sign", want.value, want.date, want.body]);
    assert.equal(m[0]._dir, join(GUESTBOOK_DIR, dirname(want.file)), `${id} is filed under its author's directory in the guestbook`);
    assert.equal(m[0].tier, "market");
  }
  assert.equal(new Set(marks.map((m) => m.id)).size, marks.length, "no duplicate id anywhere in the tree");
});

test("all five identities keep the guestbook as their parent, in the loader, the fold and the containment map", () => {
  const marks = loadMarks(MARKS);
  for (const id of FIVE) assert.equal(marks.find((m) => m.id === id)?.parent, GUESTBOOK, `${id} loads under the guestbook`);
  const state = fold({ marks: structuredClone(marks), terrain: null, stakes: [] });
  assert.deepEqual((state.errors ?? []).filter((e) => FIVE.includes(e.mark)), [], "the fold reports nothing against the five");
  for (const id of FIVE) {
    const row = state.marks.find((m) => m.id === id);
    assert.ok(row, `${id} stands in the fold`);
    assert.equal(row.parent, GUESTBOOK, `${id} folds under the guestbook`);
  }
  const committed = JSON.parse(readFileSync(join(ROOT, "WORLD/containment.json"), "utf8")).marks;
  for (const id of FIVE) assert.equal(committed.find((m) => m.id === id)?.parent, GUESTBOOK, `${id} is contained by the guestbook in WORLD/containment.json`);
});

test("mark-lint, scoped to the guestbook, finds nothing against the five", () => {
  const r = spawnSync(process.execPath, [join(ROOT, "tools/mark-lint.mjs"), "--scope", GUESTBOOK, "--json"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
  const v = JSON.parse(r.stdout);
  assert.equal(v.errors, 0, JSON.stringify(v.findings?.slice(0, 3)));
  assert.deepEqual((v.findings ?? []).filter((f) => FIVE.some((id) => `${f.file ?? ""} ${f.msg ?? ""}`.includes(id.split("/")[1]) && `${f.file ?? ""}`.includes(id.split("/")[0]))), []);
});

test("the harm gate sees the three arrive and nothing leave: every before-id stands, both older filings included", () => {
  const after = loadTreeMarks(MARKS);
  const before = after.filter((m) => !(m.id in RETAINED));
  assert.equal(after.length - before.length, 3);
  const out = harmGateOnSnapshots({ repo: ROOT, before, after, acts: {}, lint: false });
  const lost = out.checks.find((c) => c.name === "lost");
  assert.deepEqual([lost.ok, lost.rows], [true, []]);
  assert.equal(out.checks.find((c) => c.name === "escrow").ok, true);
  for (const id of FIVE) assert.ok(after.some((m) => m.id === id), `${id} stands after`);
});
