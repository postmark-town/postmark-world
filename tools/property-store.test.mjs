// property-store.test.mjs — what the fold publishes for class space (LOGOS v2 part 2, W1; WLD-116).
//
//   - A CLASS's dials are its property nodes, and classes and properties are LAW
//     NODES now, never marks (WLD-116): the fold's state carries no class row and no
//     property row, and no law node carries `dials`. An INSTANCE's own dials still
//     ride its row, as they always did (WLD-73 B1: the wheelhouse and the dungeon's
//     portal grounds read theirs off the store).
//   - A property describes its class, and neither stands in the fold: a stake on a
//     law node earns no row and no flow (it was conducted as `describes` while the
//     property was a mark; WLD-73 S3).

import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fold, loadMarks } from "./marks-fold.mjs";
import { loadLaw } from "./law-tree.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const serialized = (state) => JSON.parse(JSON.stringify(state));

test("an instance's own dials ride its store row; no class row exists, and no law node carries any", () => {
  const law = loadLaw(join(ROOT, "WORLD/law")).nodes;
  const state = serialized(fold({ marks: loadMarks(join(ROOT, "WORLD/marks")), law, terrain: { features: [], far_features: [] }, stakes: [] }));
  const row = (id) => state.marks.find((m) => m.id === id);
  for (const id of ["the-town/the-wheelhouse", "wright/the-candle-vault", "wright/the-cellar-door", "wright/the-lanternstep-parlor"]) {
    assert.ok(row(id), `${id} is in the store`);
    assert.ok(row(id).dials && Object.keys(row(id).dials).length, `${id} keeps its own dials on its row`);
  }
  assert.deepEqual(state.marks.filter((m) => m.kind === "class" || m.kind === "property").map((m) => m.id), [], "classes and properties are law, not marks: the fold publishes none");
  assert.ok(law.filter((n) => n.kind === "class").length > 100, "and the law holds them");
  assert.deepEqual(law.filter((n) => n.dials !== undefined).map((n) => n.id), [], "a class's dials are its property nodes");
});

test("a property and its class are law, and a stake on one earns no row and no flow", () => {
  const law = [
    { id: "the-town/thing", kind: "class", by: "the-town", household: "the-town", tier: "constitution", foundry: "the-keeping-works", class: "thing", date: "2026-10-17", body: "A thing." },
    { id: "the-town/thing-portable", kind: "property", by: "the-town", household: "the-town", tier: "sovereign", foundry: "the-keeping-works", parent: "the-town/thing",
      name: "portable", default: "true", date: "2026-10-17", body: "Whether a thing can be taken." },
  ];
  const stakes = [{ tick: 0, holder: "rei", mark: "the-town/thing-portable", n: 4, weight: 4 }];
  const state = serialized(fold({ marks: [], law, terrain: { features: [], far_features: [] }, stakes, fanup: "flow" }));
  assert.deepEqual(state.marks.map((m) => m.id), [], "no row for either");
  assert.equal(state.fanup.flows.some((f) => f.from === "the-town/thing-portable" || f.to === "the-town/thing"), false, "and no flow runs to a class");
});
