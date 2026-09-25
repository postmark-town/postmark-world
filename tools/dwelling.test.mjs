// tools/dwelling.mjs — the ONE answer to "which mark is this parcel's dwelling"
// (POS-200). The rule's own layers are tested where they were written
// (tools/home-image-backfill.test.mjs, which imports it through the tool); this
// file holds what moving it made newly true: the published fold's spelling of
// the record, and the two readers agreeing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { asDwellingRecord, dwellingsByParcel, dwellingContext, homeMarkFor } from "./dwelling.mjs";
import { homeMarkFor as toolHomeMarkFor } from "./home-image-backfill.mjs";
import { loadMarks } from "./marks-fold.mjs";

test("the backfill tool reads the SAME function, not a copy of it", () => {
  assert.equal(toolHomeMarkFor, homeMarkFor);
});

test("a published row is spelled the rule's way at one boundary: placementParent → _parentMarkId, the id's leaf → slug, by ?? household", () => {
  const row = { id: "rei/the-house", kind: "sited", household: "rei", placementParent: "rei/the-house-parcel" };
  const r = asDwellingRecord(row);
  assert.equal(r._parentMarkId, "rei/the-house-parcel");
  assert.equal(r.slug, "the-house");
  assert.equal(r.by, "rei");
  assert.equal(row._parentMarkId, undefined, "the row handed in is untouched");
  assert.equal(asDwellingRecord({ id: "x/y" })._parentMarkId, null);
});

test("dwellingsByParcel answers with the caller's OWN row, and null for a refusal or a parcel with no place", () => {
  const P = { id: "h/p", kind: "parcel", by: "h", at: { x: 0, y: 0 } };
  const H = { id: "h/house", kind: "sited", by: "h", placementParent: "h/p", at: { x: 0, y: 0 } };
  const out = dwellingsByParcel([P, H, { id: "h/q", kind: "parcel", by: "h" }]);
  assert.equal(out.get("h/p"), H, "the very object handed in, so its picture and id are the caller's");
  assert.equal(out.get("h/q"), null, "no centre, no answer");
  const A = { ...H, id: "h/a", at: { x: 5, y: 5 } }, B = { ...H, id: "h/b", at: { x: -5, y: 5 } };
  assert.equal(dwellingsByParcel([P, A, B]).get("h/p"), null, "two children, neither at the centre: the refusal");
});

// THE TWO READERS ON THE TOWN'S OWN RECORD. The tool walks the directory
// (`_parentMarkId`); the viewer holds the published fold, whose placementParent
// is containment. They are different edges (see the header of dwelling.mjs),
// so they may differ in HOW MUCH they can say — the directory refuses a house
// filed outside the parcel it stands in — but never in WHICH house: the day a
// parcel has two different dwellings depending on who asks, this goes red.
test("on the committed record, the viewer's answer and the tool's never name two different dwellings", () => {
  const state = JSON.parse(readFileSync(new URL("../WORLD/world-state.json", import.meta.url), "utf8"));
  const loader = loadMarks(fileURLToPath(new URL("../WORLD/marks", import.meta.url))).filter((m) => !m._error);
  const ctx = dwellingContext(loader);
  const viewer = dwellingsByParcel(state.marks);
  let both = 0;
  const conflicts = [];
  for (const p of loader.filter((m) => m.kind === "parcel" && m.at)) {
    if (!viewer.has(p.id)) continue;
    const t = homeMarkFor(p, ctx).mark?.id ?? null;
    const v = viewer.get(p.id)?.id ?? null;
    if (t && v) { both++; if (t !== v) conflicts.push(`${p.id}: tool ${t}, viewer ${v}`); }
  }
  assert.deepEqual(conflicts, []);
  assert.ok(both > 50, `the comparison must cover the town, not a corner of it (${both} parcels answered by both)`);
});
