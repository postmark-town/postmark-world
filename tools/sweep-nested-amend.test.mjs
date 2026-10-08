// sweep-nested-amend.test.mjs — a NESTED amend is judged where it stands
// (POS-446, 2026-10-08).
//
// The sweep reads each candidate one file at a time, and a nested file's
// numbers are an offset from the mark that frames it. Admission judges in the
// world's frame, so a candidate handed over raw was judged at its offset — as
// if it stood beside the world's origin. lupi's door amends of
// `lupi/the-unworn-step` (S76, S78) were KEPT for "commons needs escrow > 0"
// that way, on her own parcel, while main's fold and the store's clearing both
// had the mark `home`. The store locked them; the file never received them.
//
//   1. an owner's amend of a mark nested on their own parcel publishes, `home`,
//      with no escrow — main's fold already says it is home;
//   2. a stranger's nested mark on open ground still needs escrow: framing it
//      exempts nothing that was not exempt;
//   3. a sketchbook that carries the frame AND its child frames the child on
//      the frame's NEW place.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { settlementSweep } from "./settlement-sweep.mjs";
import { withTool } from "./engine-files.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const record = ({ kind = "sited", by, tier, at, extent, body = "a mark", coords, date = "2026-07-28" }) => {
  const lines = ["---", `kind: ${kind}`, `by: ${by}`, ...(tier ? [`tier: ${tier}`] : []), `date: ${date}`];
  if (at) lines.push(`at: { x: ${at.x}, y: ${at.y} }`);
  if (extent) lines.push(`extent: { w: ${extent.w}, h: ${extent.h} }`);
  if (coords) lines.push(`coords: ${coords}`);
  return `${lines.join("\n")}\n---\n\n${body}\n`;
};

function crossingRepo(t, prefix) {
  const repo = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const put = (path, text) => { const full = join(repo, path); mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, text); return path; };
  mkdirSync(join(repo, "tools"), { recursive: true });
  for (const file of withTool("mark-lint.mjs")) cpSync(join(HERE, file), join(repo, "tools", file));
  put("WORLD/skeleton.json", JSON.stringify({ features: [], physics_registry: {} }, null, 2));
  const commit = (m) => git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", m);
  const seal = () => {
    git("init", "-q", "-b", "main");
    execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs")], { cwd: repo });
    git("add", "-A");
    commit("published main");
  };
  // A household's sketchbook: cut from main, its edits committed, main checked out again.
  const sketch = (household, edits) => {
    git("checkout", "-q", "-b", `draft/${household}`, "main");
    for (const [path, text] of edits) put(path, text);
    git("add", "-A");
    commit(`${household}: amend`);
    git("checkout", "-q", "main");
  };
  const stakesPath = `${repo}-stakes.json`;
  t.after(() => rmSync(stakesPath, { force: true }));
  const sweep = (stakes = []) => { writeFileSync(stakesPath, JSON.stringify(stakes)); return settlementSweep({ repo, stakesPath }); };
  const worldAt = (id) => JSON.parse(readFileSync(join(repo, "WORLD", "world-state.json"), "utf8")).marks.find((m) => m.id === id) ?? null;
  return { repo, git, put, seal, sketch, sweep, worldAt };
}

// The district sits far from the origin, so a file offset read as a world
// number lands somewhere else entirely — the Quay Reach, in lupi's case.
function town(c) {
  c.put("WORLD/marks/let-there-be-light/mark.md", record({ by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 }, coords: "relative", body: "the frame" }));
  c.put("WORLD/marks/let-there-be-light/the-quay/mark.md", record({ by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 100, h: 100 }, body: "the town's quay, at the origin" }));
  c.put("WORLD/marks/let-there-be-light/the-grove/mark.md", record({ by: "limen", at: { x: -1400, y: -3000 }, extent: { w: 600, h: 600 }, body: "a grove" }));
  const parcel = c.put("WORLD/marks/let-there-be-light/the-grove/the-den-parcel/mark.md", record({ kind: "parcel", by: "lupi", at: { x: -5, y: -43 }, extent: { w: 25, h: 25 }, body: "lupi's parcel" }));
  const step = c.put("WORLD/marks/let-there-be-light/the-grove/the-den-parcel/the-step/mark.md", record({ by: "lupi", at: { x: -3, y: 11 }, extent: { w: 2, h: 1 }, body: "the step, unworn", date: "2026-08-08" }));
  const stone = c.put("WORLD/marks/let-there-be-light/the-grove/the-stone/mark.md", record({ by: "hal", at: { x: 40, y: 40 }, extent: { w: 1, h: 1 }, body: "hal's stone in the grove" }));
  c.seal();
  return { parcel, step, stone };
}

test("POS-446 · an owner's amend of a mark nested on their own parcel publishes, home, with no escrow", (t) => {
  const c = crossingRepo(t, "postmark-nested-amend-");
  const { step } = town(c);
  assert.deepEqual(c.worldAt("lupi/the-step").at, { x: -1408, y: -3032 }, "the fold composes the step through the grove and the parcel");
  assert.equal(c.worldAt("lupi/the-step").tier, "home", "and main already says it is home");

  c.sketch("lupi", [[step, record({ by: "lupi", at: { x: -3, y: 11 }, extent: { w: 2, h: 1 }, body: "the step, crossed since", date: "2026-09-23T06:15:55.041Z" })]]);
  const out = c.sweep([]);
  assert.deepEqual(out.left_drafted.filter((r) => r.id === "lupi/the-step"), [], "the amend is not KEPT");
  assert.deepEqual(out.published.map((r) => [r.id, r.class, r.escrow]), [["lupi/the-step", "home", 0]],
    "it publishes as home: its view stands where main's fold puts it, on her own parcel");
  assert.match(readFileSync(join(c.repo, step), "utf8"), /crossed since/, "the file now says what the store says");
  assert.match(readFileSync(join(c.repo, step), "utf8"), /^at: \{ x: -3, y: 11 \}$/m, "the file keeps its own frame's numbers");
  assert.deepEqual(c.worldAt("lupi/the-step").at, { x: -1408, y: -3032 }, "and the step has not moved");
});

test("POS-446 · a stranger's nested mark on open ground still needs escrow — framing exempts nothing", (t) => {
  const c = crossingRepo(t, "postmark-nested-commons-");
  const { stone } = town(c);
  assert.equal(c.worldAt("hal/the-stone").tier, "market");
  c.sketch("hal", [[stone, record({ by: "hal", at: { x: 40, y: 40 }, extent: { w: 1, h: 1 }, body: "hal's stone, re-cut" })]]);
  const out = c.sweep([]);
  assert.deepEqual(out.published, []);
  assert.deepEqual(out.left_drafted.map((r) => [r.id, r.reason]), [["hal/the-stone", "commons needs escrow > 0"]]);
  const staked = c.sweep([{ holder: "hal", mark: "hal/the-stone", n: 1, weight: 1 }]);
  assert.deepEqual(staked.published.map((r) => [r.id, r.class]), [["hal/the-stone", "commons"]], "with a stamp behind it, it publishes");
});

test("POS-446 · a sketchbook carrying a frame and its child frames the child on the frame's new place", (t) => {
  const c = crossingRepo(t, "postmark-nested-family-");
  const { parcel, step } = town(c);
  // the parcel moves 100 m east inside the grove; the step rides it at the same offset, re-worded
  c.sketch("lupi", [
    [parcel, record({ kind: "parcel", by: "lupi", at: { x: 95, y: -43 }, extent: { w: 25, h: 25 }, body: "lupi's parcel" })],
    [step, record({ by: "lupi", at: { x: -3, y: 11 }, extent: { w: 2, h: 1 }, body: "the step, moved with the den" })],
  ]);
  const out = c.sweep([]);
  assert.deepEqual(out.left_drafted, [], "neither is KEPT");
  assert.deepEqual(out.published.map((r) => [r.id, r.class]).sort(), [["lupi/the-den-parcel", "home"], ["lupi/the-step", "home"]]);
  assert.deepEqual(c.worldAt("lupi/the-step").at, { x: -1308, y: -3032 }, "the step stands on the parcel's new place");
});
