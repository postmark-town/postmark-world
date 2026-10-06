// precedents.test.mjs — THE TOWN'S PRECEDENTS ARE CITABLE LAW (POS-361, Q7;
// Darko, 2026-10-06: "Plumb drafts the-town/precedents").
//
// The town's word cites law marks only, by id, in the shape the lints use
// (the office's town-stance.mjs § citeLaw): a cited id must stand in the World
// at the law sha as a mark of the constitution tier. A ruling on a case no
// written rule decides is written under this node, so the node itself must be
// that kind of mark, at that id. Its body is a draft for Darko's words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks } from "./marks-fold.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MARKS = loadMarks(join(ROOT, "WORLD/marks")).filter((m) => !m._error);

test("the-town/precedents stands as constitution law under postmark-rules, citable by its id", () => {
  const m = MARKS.find((x) => x.id === "the-town/precedents");
  assert.ok(m, "the precedents node stands in WORLD/marks at the-town/precedents");
  assert.equal(m.by, "the-town");
  assert.equal(m.tier, "constitution", "a law mark: the town cites the constitution tier only");
  assert.equal(m.kind, "class");
  assert.equal(m.extends, "postmark-rules", "under the town's stipulations, where a ruling sits beside the rules it joins");
  assert.ok(String(m.body ?? "").trim().length > 0, "with words the office records verbatim beside the id");
});
