// containment-committed.test.mjs — WORLD/containment.json is the fold's own answer over this tree.
//
// The file is fold output, regenerated at every crossing ("This file is
// regenerated from the ground at every fold and is the only place containment
// is answered"). A change that adds marks commits it beside them, written by the
// fold's own function and never by hand (WLD-73 B3, 2026-10-17; the precedent is
// 1fa16e5a, f03bbc20 and e3be4f5d). This pins the committed copy to
// containmentMap(loadMarks(WORLD/marks)), byte for byte as the fold writes it,
// so a tree and its map can't part in a commit.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks, containmentMap } from "./marks-fold.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("the committed WORLD/containment.json is containmentMap over this tree, as the fold writes it", () => {
  const committed = readFileSync(join(ROOT, "WORLD/containment.json"), "utf8").replace(/\r\n/g, "\n");
  const derived = JSON.stringify(containmentMap(loadMarks(join(ROOT, "WORLD/marks"))), null, 2) + "\n";
  if (committed === derived) return;
  const a = JSON.parse(committed), b = JSON.parse(derived);
  const am = new Map(a.marks.map((m) => [m.id, JSON.stringify(m)]));
  const differ = b.marks.filter((m) => am.get(m.id) !== JSON.stringify(m)).map((m) => m.id);
  assert.fail(`WORLD/containment.json (${a.count} rows) is not the fold's map of this tree (${b.count} rows); ${differ.length} row(s) differ, e.g. ${differ.slice(0, 5).join(", ")} — regenerate it with the fold's containmentMap, never by hand`);
});
