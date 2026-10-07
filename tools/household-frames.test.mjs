// household-frames.test.mjs — NOTHING RIDES ANOTHER HOUSEHOLD'S MARK, held from
// both sides. POS-441 · postmark#2458 · ruled by Darko 2026-10-07:
//
//   moving a mark carries the marks inside it that belong to the same household;
//   another household's marks never move — they keep their place, and their
//   containment follows geometry. "That should just always be the default rule."
//
// The live tree first (the standing test: no positioned mark is framed by another
// household's mark), then the verb that makes it true and moves nothing, then the
// lint gate that keeps it true — each with its lawful twin.

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { loadMarks, containmentMap } from "./marks-fold.mjs";
import { crossHouseholdRiders, householdResolver, repoHouseholds } from "./household-frames.mjs";
import { unnestHouseholds, UnnestRefusal } from "./unnest-households.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const LINT = join(HERE, "mark-lint.mjs");

const record = ({ kind = "sited", by, tier, at, extent, coords, body = "a mark", date = "2026-08-01" }) => {
  const lines = ["---", `kind: ${kind}`, `by: ${by}`, ...(tier ? [`tier: ${tier}`] : []), `date: ${date}`];
  if (at) lines.push(`at: { x: ${at.x}, y: ${at.y} }`);
  if (extent) lines.push(`extent: { w: ${extent.w}, h: ${extent.h} }`);
  if (coords) lines.push(`coords: ${coords}`);
  return `${lines.join("\n")}\n---\n\n${body}\n`;
};

// ── the fixture: limen's district, and what stands in it ─────────────────────
// root (the-town) at 0,0 · limen's district at 1000,2000 · inside it, filed in
// its directory: hal's parcel at -100,-50 (world 900,1950) with hal's house on it
// at 0,0, and wren's lamp at 10,10 (world 1010,2010). limen and wren are ONE
// household (hh:jennuh); hal is another (hh:cathedral). So hal's parcel rides
// another household's mark, and wren's lamp rides its own household's.
function districtTree(t) {
  const dir = mkdtempSync(join(tmpdir(), "pm-household-frames-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const marks = join(dir, "WORLD", "marks");
  const put = (rel, text) => { const f = join(marks, rel, "mark.md"); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text); };
  put("let-there-be-light", record({ by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 }, coords: "relative", body: "the frame" }));
  put("let-there-be-light/the-district", record({ by: "limen", at: { x: 1000, y: 2000 }, extent: { w: 3000, h: 3000 }, body: "a district" }));
  put("let-there-be-light/the-district/the-parcel", record({ kind: "parcel", by: "hal", at: { x: -100, y: -50 }, extent: { w: 30, h: 30 }, body: "hal's parcel" }));
  put("let-there-be-light/the-district/the-parcel/the-house", record({ by: "hal", at: { x: 0, y: 0 }, extent: { w: 10, h: 10 }, body: "hal's house" }));
  put("let-there-be-light/the-district/the-lamp", record({ by: "wren", at: { x: 10, y: 10 }, extent: { w: 2, h: 2 }, body: "wren's lamp" }));
  const households = join(dir, "WORLD", "households.json");
  writeFileSync(households, JSON.stringify({ households: { limen: "hh:jennuh", wren: "hh:jennuh", hal: "hh:cathedral" } }));
  const freeze = join(dir, "WORLD", "filing-freeze.json");
  const fossil = {
    "the-town/let-there-be-light": "WORLD/marks/let-there-be-light",
    "limen/the-district": "WORLD/marks/let-there-be-light/the-district",
    "hal/the-parcel": "WORLD/marks/let-there-be-light/the-district/the-parcel",
    "hal/the-house": "WORLD/marks/let-there-be-light/the-district/the-parcel/the-house",
    "wren/the-lamp": "WORLD/marks/let-there-be-light/the-district/the-lamp",
  };
  writeFileSync(freeze, JSON.stringify({ law: "fixture", frozen_at: "2026-08-25", count: 5, marks: fossil }, null, 2) + "\n");
  const registry = join(dir, "WORLD", "settlement-publications.json");
  writeFileSync(registry, JSON.stringify({ version: 1, published: {
    "hal/the-house": { household: "hal", path: "WORLD/marks/let-there-be-light/the-district/the-parcel/the-house/mark.md", class: "home" },
    "wren/the-lamp": { household: "wren", path: "WORLD/marks/let-there-be-light/the-district/the-lamp/mark.md", class: "commons" },
  } }, null, 2) + "\n");
  return { dir, marks, households, freeze, registry };
}

const placeOf = (marksDir) => new Map(loadMarks(marksDir).filter((m) => !m._error).map((m) => [m.id, m.at ? `${m.at.x},${m.at.y}` : null]));
const lintHousehold = (tree, withRegistry = true) => {
  const r = spawnSync(process.execPath, [LINT, "--json", "--marks-dir", tree.marks, "--freeze", tree.freeze, ...(withRegistry ? ["--households", tree.households] : [])], { encoding: "utf8" });
  return JSON.parse(r.stdout).findings.filter((f) => /another household's mark/.test(f.msg));
};

test("THE LIVE TREE: no positioned mark rides another household's mark", () => {
  const riders = crossHouseholdRiders(loadMarks(join(ROOT, "WORLD", "marks")), repoHouseholds(ROOT));
  assert.deepEqual(riders.map((r) => `${r.id} rides ${r.frame} (${r.household} under ${r.frameHousehold})`), [],
    "another household's marks never ride your frame (POS-441) — re-file them with node tools/unnest-households.mjs");
});

test("the question: a mark framed by another household's mark is named; its own household's frame and the world's are not", (t) => {
  const tree = districtTree(t);
  const riders = crossHouseholdRiders(loadMarks(tree.marks), householdResolver(tree.households));
  assert.deepEqual(riders.map((r) => [r.id, r.frame, r.household, r.frameHousehold]),
    [["hal/the-parcel", "limen/the-district", "hh:cathedral", "hh:jennuh"]],
    "hal's house rides hal's own parcel and wren's lamp rides her own household's district: neither is named");
  const solo = crossHouseholdRiders(loadMarks(tree.marks), householdResolver(null));
  assert.deepEqual(solo.map((r) => r.id).sort(), ["hal/the-parcel", "wren/the-lamp"], "with no registry every handle is a household of one");
});

test("THE VERB: the other household's mark leaves for its id, its own marks go with it, and NOTHING MOVES — positions and containment to the bit; the manifest and the registry follow the paths", (t) => {
  const tree = districtTree(t);
  const placeBefore = placeOf(tree.marks);
  const containBefore = containmentMap(loadMarks(tree.marks)).marks;

  const r = unnestHouseholds({ repo: tree.dir, date: "2026-10-07", ruling: "POS-441 (fixture)" });
  assert.deepEqual(r.movers.map((m) => [m.id, m.to]), [["hal/the-parcel", "WORLD/marks/hal/the-parcel"]]);
  assert.deepEqual(r.rewritten.map((w) => [w.id, w.at_to]), [["hal/the-parcel", { x: 900, y: 1950 }]], "only the mover's numbers change: they are now world numbers");

  assert.ok(existsSync(join(tree.marks, "hal", "the-parcel", "the-house", "mark.md")), "hal's house went with hal's parcel");
  assert.match(readFileSync(join(tree.marks, "hal", "the-parcel", "the-house", "mark.md"), "utf8"), /^at: \{ x: 0, y: 0 \}$/m, "and its numbers did not change: it still rides its own household's parcel");
  assert.ok(existsSync(join(tree.marks, "let-there-be-light", "the-district", "the-lamp", "mark.md")), "wren's lamp rides her own household's district and stays filed in it");

  assert.deepEqual(placeOf(tree.marks), placeBefore, "every mark stands exactly where it stood");
  assert.deepEqual(containmentMap(loadMarks(tree.marks)).marks, containBefore, "every containment parent is the one it had");
  assert.deepEqual(crossHouseholdRiders(loadMarks(tree.marks), householdResolver(tree.households)), [], "and nothing rides another household's mark now");

  const manifest = JSON.parse(readFileSync(tree.freeze, "utf8"));
  assert.equal(manifest.marks["hal/the-parcel"], "WORLD/marks/hal/the-parcel");
  assert.equal(manifest.marks["hal/the-house"], "WORLD/marks/hal/the-parcel/the-house");
  assert.equal(manifest.marks["wren/the-lamp"], "WORLD/marks/let-there-be-light/the-district/the-lamp", "a row whose filing did not move is not touched");
  assert.equal(Object.keys(manifest.marks).length, manifest.count, "rows are amended, never added or dropped");
  assert.deepEqual(manifest.reframed.map((b) => [b.date, b.ruling, Object.keys(b.rows).sort()]),
    [["2026-10-07", "POS-441 (fixture)", ["hal/the-house", "hal/the-parcel"]]], "each amended row is named, with the date and the ruling");
  assert.deepEqual(manifest.reframed[0].rows["hal/the-house"], { was: "WORLD/marks/let-there-be-light/the-district/the-parcel/the-house", now: "WORLD/marks/hal/the-parcel/the-house", ground: "hal/the-parcel" });
  assert.equal(manifest.reframed[0].rows["hal/the-parcel"].ground, "limen/the-district", "the receipt names the ground each re-filed mark stood on, unchanged by the move");

  const registry = JSON.parse(readFileSync(tree.registry, "utf8")).published;
  assert.equal(registry["hal/the-house"].path, "WORLD/marks/hal/the-parcel/the-house/mark.md", "the sweep's unpublish pass reads this path: it follows the move");
  assert.equal(registry["wren/the-lamp"].path, "WORLD/marks/let-there-be-light/the-district/the-lamp/mark.md");

  const again = unnestHouseholds({ repo: tree.dir, date: "2026-10-08", ruling: "again" });
  assert.equal(again.movers.length, 0, "run again, it finds nothing to do");
  assert.equal(JSON.parse(readFileSync(tree.freeze, "utf8")).reframed.length, 1, "and writes no second entry");
});

test("a HUSK the verb empties goes with it: a seat whose record left canon, holding only another household's mark, is removed once that mark leaves — and a seat with anything left in it stays", (t) => {
  const tree = districtTree(t);
  // limen's terrace left canon (its mark.md is gone) and stands only as the filing
  // of what is beneath it: hal's bench, and in a second husk, wren's own step.
  const put = (rel, text) => { const f = join(tree.marks, rel, "mark.md"); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text); };
  put("let-there-be-light/the-district/the-terrace/the-bench", record({ by: "hal", at: { x: 40, y: 40 }, extent: { w: 2, h: 2 }, body: "hal's bench" }));
  put("let-there-be-light/the-district/the-other-terrace/the-step", record({ by: "wren", at: { x: 60, y: 60 }, extent: { w: 2, h: 2 }, body: "wren's step" }));
  const placeBefore = placeOf(tree.marks);
  const r = unnestHouseholds({ repo: tree.dir, date: "2026-10-07", ruling: "POS-441 (fixture)" });
  assert.deepEqual(r.movers.map((m) => m.id).sort(), ["hal/the-bench", "hal/the-parcel"]);
  assert.equal(existsSync(join(tree.marks, "let-there-be-light", "the-district", "the-terrace")), false, "the emptied husk is gone");
  assert.ok(existsSync(join(tree.marks, "let-there-be-light", "the-district", "the-other-terrace", "the-step", "mark.md")), "a husk still filing its own household's mark stays");
  assert.ok(existsSync(join(tree.marks, "let-there-be-light", "the-district", "mark.md")), "the district itself is untouched");
  assert.deepEqual(placeOf(tree.marks), placeBefore, "and nothing moved");
});

test("the verb refuses, writing nothing, when the id path is already a seat", (t) => {
  const tree = districtTree(t);
  mkdirSync(join(tree.marks, "hal", "the-parcel"), { recursive: true });
  writeFileSync(join(tree.marks, "hal", "the-parcel", "keep.txt"), "occupied");
  const freezeBefore = readFileSync(tree.freeze, "utf8");
  assert.throws(() => unnestHouseholds({ repo: tree.dir, date: "2026-10-07", ruling: "x" }),
    (e) => e instanceof UnnestRefusal && /already exist: WORLD\/marks\/hal\/the-parcel/.test(e.message));
  assert.ok(existsSync(join(tree.marks, "let-there-be-light", "the-district", "the-parcel", "mark.md")), "the mover did not move");
  assert.equal(readFileSync(tree.freeze, "utf8"), freezeBefore, "the manifest is untouched");
});

test("THE GATE: the lint refuses a mark framed by another household's mark and passes once it is re-filed; a fixture with no registry is not in its jurisdiction", (t) => {
  const tree = districtTree(t);
  const red = lintHousehold(tree);
  assert.deepEqual(red.map((f) => [f.sev, f.file]), [["ERROR", "WORLD/marks/let-there-be-light/the-district/the-parcel"]],
    "hal's parcel rides limen's district: refused; wren's lamp rides her own household's: passed");
  assert.match(red[0].msg, /rides limen\/the-district \(hh:jennuh\)/);
  assert.match(red[0].msg, /node tools\/unnest-households\.mjs/, "the refusal names its remedy");
  assert.deepEqual(lintHousehold(tree, false), [], "no --households on a synthetic tree: the gate does not run");
  unnestHouseholds({ repo: tree.dir, date: "2026-10-07", ruling: "POS-441 (fixture)" });
  assert.deepEqual(lintHousehold(tree), [], "after the verb: nothing to refuse");
});
