#!/usr/bin/env node
// stance-return-alone.test.mjs — RULING B (Darko, 2026-10-09, POS-362): a
// stance return takes the opposed mark alone.
//
//   node --test tools/stance-return-alone.test.mjs
//
// "When an opposition with standing returns a mark, the whole mark returns
// (never clipped, ruled 10:03). Its nested marks don't go with it. Each child
// keeps its world position and is reparented to the next mark that contains
// it, or to open ground … Grandchildren stay with their own parent. A child
// that itself overlaps the opposer's older ground isn't spared: it's a mark
// over their ground in its own right, so it awaits that household and can be
// opposed on its own." Over-limit parcel returns (R11, the `law` returns) are
// not covered and keep what they do today.
//
// THE LIVE SHAPE. limen/the-listening-grounds (1.6 km by 1.4 km, window 228)
// lies over auran/the-clearing-house-parcel (window 150), and auran opposed it.
// Here: a holder's older parcel at the grounds' west edge, the grounds over it,
// a FAR child of the grounds' own household well away from the parcel, a NEAR
// child of theirs over the parcel, a grandchild on the far child, the grounds'
// name, and the town's district around all of it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fold, loadMarks } from "./marks-fold.mjs";
import { STANCE_RETURNS_ALONE } from "./consent.mjs";

const terrain = { features: [] };
const sited = (id, by, x, y, w, h, extra = {}) => ({
  id: `${by}/${id}`, slug: id, by, household: by, kind: "sited", tier: "market",
  at: { x, y }, extent: { w, h }, date: "2026-09-20", body: id, ...extra,
});
const parcel = (id, by, x, y, extra = {}) => ({
  id: `${by}/${id}`, slug: id, by, household: by, kind: "parcel", tier: "market",
  at: { x, y }, extent: { w: 25, h: 25 }, date: "2026-08-01", body: id, ...extra,
});
const naming = (id, by, parent, value) => ({
  id: `${by}/${id}`, slug: id, by, household: by, kind: "naming", tier: "market",
  parent, slot: "name", value, date: "2026-09-20", body: value,
});
const stake = (holder, mark, n) => ({ holder, mark, n, weight: n, tick: 0 });
const markOf = (state, id) => state.marks.find((m) => m.id === id);
const standing = (state, id) => state.marks.some((m) => m.id === id);

const GROUNDS = "limen/the-listening-grounds";
const listening = ({ holderWord = true, nearWord = false } = {}) => [
  sited("district", "the-town", 0, 0, 5000, 5000, { tier: "constitution", date: "2026-07-01" }),
  parcel("the-clearing-house-parcel", "auran", -700, 0, {
    consent: { ...(holderWord ? { [GROUNDS]: "opposed" } : {}), ...(nearWord ? { "limen/the-near-hut": "opposed" } : {}) },
  }),
  sited("the-listening-grounds", "limen", 0, 0, 1600, 1400),
  sited("the-far-tower", "limen", 500, 300, 100, 100),          // well away from auran's parcel
  sited("the-near-hut", "limen", -700, 0, 40, 40),              // over auran's parcel (25 m, at -700,0)
  sited("the-bell", "limen", 510, 310, 10, 10),                 // on the far tower: a grandchild
  naming("the-listening-grounds-name", "limen", GROUNDS, "The Listening Grounds"),
];

test("the engine says it carries ruling B", () => {
  assert.equal(STANCE_RETURNS_ALONE, true);
});

test("RULING B · auran opposes the grounds: the whole mark returns alone; the far child and the near child stay where they stood, reparented to the town's district", () => {
  const before = fold({ marks: listening({ holderWord: false }), terrain, tick: 1, stakes: [] });
  assert.equal(markOf(before, "limen/the-far-tower").placementParent, GROUNDS, "the far tower stands inside the grounds");
  assert.equal(markOf(before, "limen/the-near-hut").placementParent, GROUNDS, "so does the near hut");

  const state = fold({ marks: listening(), terrain, tick: 1, stakes: [] });
  assert.equal(state.returned.length, 1, "one return: the grounds");
  const r = state.returned[0];
  assert.equal(r.mark, GROUNDS);
  assert.equal(r.authority, "parcel (absolute)");
  assert.equal(r.returned_from, "auran/the-clearing-house-parcel");
  assert.equal(r.state, "returned");
  assert.deepEqual(r.subtree, ["limen/the-listening-grounds-name"], "what leaves with it is its name, the mark continued");
  assert.deepEqual(r.stays, ["limen/the-far-tower", "limen/the-near-hut"], "its own children stay, by name");
  assert.equal(standing(state, GROUNDS), false, "the whole mark returns, never clipped");

  for (const id of ["limen/the-far-tower", "limen/the-near-hut"]) {
    const was = markOf(before, id), now = markOf(state, id);
    assert.ok(now, `${id} stands`);
    assert.deepEqual(now.at, was.at, `${id} keeps its world position`);
    assert.deepEqual(now.extent, was.extent);
    assert.equal(now.placementParent, "the-town/district", `${id} is reparented to the next mark that contains it`);
  }
  assert.equal(markOf(state, "limen/the-bell").placementParent, "limen/the-far-tower", "the grandchild stays with its own parent");
  assert.equal(standing(state, "auran/the-clearing-house-parcel"), true);
});

test("RULING B · with nothing else around it, a child that stays is reparented to open ground", () => {
  const marks = listening().filter((m) => m.id !== "the-town/district");
  const state = fold({ marks, terrain, tick: 1, stakes: [] });
  assert.equal(markOf(state, "limen/the-far-tower").placementParent, undefined, "open ground: no container is named");
  assert.equal(markOf(state, "limen/the-near-hut").placementParent, undefined,
    "the hut overlaps the parcel but is not inside it (40 m on a 25 m plot), so nothing contains it either");
});

test("RULING B · the fan-up edge is reparented too: a child's stamps reach the next container of its own household", () => {
  // limen's realm around the grounds: once the grounds leave, the tower's edge
  // runs to the realm (same household, structural), so its stamps flow there.
  const realm = sited("the-realm", "limen", 0, 0, 3000, 3000);
  const marks = [...listening(), realm];
  const stakes = [stake("s", "limen/the-far-tower", 4), stake("t", "limen/the-near-hut", 3)];
  const before = fold({ marks: [...listening({ holderWord: false }), realm], terrain, tick: 1, stakes });
  const after = fold({ marks, terrain, tick: 1, stakes });
  const weightOf = (s, id) => markOf(s, id)?.weight;
  assert.equal(weightOf(before, "limen/the-realm"), 7, "before: through the grounds into the realm");
  assert.equal(weightOf(after, "limen/the-realm"), 7, "after: the grounds are gone, and the children's edge runs straight to the realm");
  assert.equal(weightOf(after, "limen/the-far-tower"), 4);
  assert.equal(markOf(after, "limen/the-far-tower").placementParent, "limen/the-realm");
});

test("RULING B · the near child is not spared: auran's own word on it returns it in its own right; the far child still stands", () => {
  const state = fold({ marks: listening({ nearWord: true }), terrain, tick: 1, stakes: [] });
  const ids = state.returned.map((r) => r.mark).sort();
  assert.deepEqual(ids, [GROUNDS, "limen/the-near-hut"], "two returns, each on its own word");
  const hut = state.returned.find((r) => r.mark === "limen/the-near-hut");
  assert.equal(hut.returned_from, "auran/the-clearing-house-parcel");
  assert.equal(standing(state, "limen/the-near-hut"), false);
  assert.equal(standing(state, "limen/the-far-tower"), true);
});

test("R11 · a LAW return is untouched by ruling B: it takes its own household's subtree, sited children included, and names no `stays`", () => {
  const marks = listening({ holderWord: false });
  const state = fold({ marks, terrain, tick: 1, stakes: [], townWords: new Map([[GROUNDS, "opposed"]]), townLaws: new Map([[GROUNDS, "the-town/claim-cap"]]) });
  const r = state.returned.find((x) => x.mark === GROUNDS);
  assert.deepEqual([...r.subtree].sort(), ["limen/the-bell", "limen/the-far-tower", "limen/the-listening-grounds-name", "limen/the-near-hut"]);
  assert.equal("stays" in r, false);
  for (const id of r.subtree) assert.equal(standing(state, id), false, `${id} left with the law return`);
  // and the town's word alone (no law) is a stance return: ruling B
  const word = fold({ marks, terrain, tick: 1, stakes: [], townWords: new Map([[GROUNDS, "opposed"]]) });
  assert.deepEqual(word.returned.find((x) => x.mark === GROUNDS).subtree, ["limen/the-listening-grounds-name"]);
  assert.equal(standing(word, "limen/the-far-tower"), true);
});

test("RULING B · on a commons edge too: a backed parent's opposed word returns a weak child alone, and the child's own child stays", () => {
  const marks = [
    sited("estate", "a", 0, 0, 1000, 1000, { consent: { "b/shed": "opposed" } }),
    sited("shed", "b", 0, 0, 100, 100),
    sited("lamp", "b", 10, 10, 2, 2),
  ];
  const state = fold({ marks, terrain, tick: 1, stakes: [stake("s", "a/estate", 1000)] });
  const r = state.returned.find((x) => x.mark === "b/shed");
  assert.ok(r, "the estate's backed word returns the shed");
  assert.equal(r.authority, "commons edge (earned)");
  assert.deepEqual(r.subtree, []);
  assert.deepEqual(r.stays, ["b/lamp"]);
  assert.equal(markOf(state, "b/lamp").placementParent, "a/estate", "the lamp is reparented to the estate, the next mark around it");
});

// ── THE WORLD POSITION THROUGH A FILE FRAME ──────────────────────────────────
// A mark's file numbers are written relative to the frame that binds it
// (reparent-keep-world.mjs). The child is filed INSIDE the grounds' directory,
// its numbers relative to the grounds' centre. The return takes the grounds out
// of the fold, not off the disk, so the loader still composes the child through
// its frame: the child stands where it stood.

const record = ({ kind = "sited", by, tier, at, extent, body = "a mark", coords, date = "2026-09-20", consent = null }) => {
  const lines = ["---", `kind: ${kind}`, `by: ${by}`, ...(tier ? [`tier: ${tier}`] : []), `date: ${date}`];
  if (at) lines.push(`at: { x: ${at.x}, y: ${at.y} }`);
  if (extent) lines.push(`extent: { w: ${extent.w}, h: ${extent.h} }`);
  if (coords) lines.push(`coords: ${coords}`);
  if (consent) lines.push(`consent: ${JSON.stringify(consent)}`);
  return `${lines.join("\n")}\n---\n\n${body}\n`;
};

test("RULING B · a child FILED inside the returned mark's frame keeps its world position: the loader composes it, the fold keeps it", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pm-stance-alone-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const marksDir = join(dir, "WORLD", "marks");
  const put = (rel, text) => { const f = join(marksDir, rel, "mark.md"); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text); };
  put("let-there-be-light", record({ by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 }, coords: "relative", body: "the frame" }));
  put("let-there-be-light/the-clearing-house-parcel", record({ kind: "parcel", by: "auran", at: { x: 1300, y: 2000 }, extent: { w: 25, h: 25 }, date: "2026-08-01", consent: { "limen/the-listening-grounds": "opposed" } }));
  put("let-there-be-light/the-listening-grounds", record({ by: "limen", at: { x: 2000, y: 2000 }, extent: { w: 1600, h: 1400 } }));
  put("let-there-be-light/the-listening-grounds/the-far-tower", record({ by: "limen", at: { x: 500, y: 300 }, extent: { w: 100, h: 100 } }));
  const marks = loadMarks(marksDir).filter((m) => !m._error);
  const tower = marks.find((m) => m.id.endsWith("the-far-tower"));
  assert.ok(tower, "the tower loads");
  assert.deepEqual({ x: tower.at.x, y: tower.at.y }, { x: 2500, y: 2300 }, "composed through the grounds' frame: 2000+500, 2000+300");
  const state = fold({ marks, terrain, tick: 1, stakes: [] });
  const r = state.returned.find((x) => x.mark.endsWith("the-listening-grounds"));
  assert.ok(r, "the grounds are returned");
  assert.deepEqual(r.stays, [tower.id]);
  const now = markOf(state, tower.id);
  assert.ok(now, "the tower stands");
  assert.deepEqual({ x: now.at.x, y: now.at.y }, { x: 2500, y: 2300 }, "at the same world position");
  assert.equal(now.placementParent, marks.find((m) => m.id.endsWith("let-there-be-light")).id, "reparented to open ground: the world root");
});

// ── A PARCEL: the law return keeps what it did; a stance return reparents ────
// A parcel has no positioned child on the fan-up edge (that edge is sited in
// sited), so what a return of one changes is the PUBLISHED edge of the marks
// standing on it. R11's return (a limit) leaves that edge as it was; a stance
// return (the town opposing the plot) reparents it, as ruling B says.

test("R11 vs RULING B on a parcel: a mark on an over-limit plot keeps its placement under the law return, and is reparented under a stance return", () => {
  const marks = [
    sited("district", "the-town", 0, 0, 5000, 5000, { tier: "constitution", date: "2026-07-01" }),
    parcel("plot", "bo", 100, 100),
    sited("stall", "cy", 100, 100, 4, 4),
  ];
  const words = new Map([["bo/plot", "opposed"]]);
  const law = fold({ marks, terrain, tick: 1, stakes: [], townWords: words, townLaws: new Map([["bo/plot", "the-town/one-per-resident"]]) });
  assert.equal(standing(law, "bo/plot"), false);
  assert.equal(markOf(law, "cy/stall").placementParent, "bo/plot", "the law return keeps what it did");
  const stance = fold({ marks, terrain, tick: 1, stakes: [], townWords: words });
  assert.equal(standing(stance, "bo/plot"), false);
  assert.equal(markOf(stance, "cy/stall").placementParent, "the-town/district", "the stance return reparents what stood on it");
});
