// property-store.test.mjs — what the fold publishes for class space (LOGOS v2 part 2, W1).
//
//   - A CLASS's dials are its property nodes now, so no class row carries
//     `dials`; an INSTANCE's own dials still ride its row, as they always did
//     (WLD-73 B1: the wheelhouse and the dungeon's portal grounds read theirs off
//     the store).
//   - A property describes its class: under the conserved flow it conducts as
//     `describes`, never `contains` (WLD-73 S3), the way a predicate does.

import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fold, loadMarks } from "./marks-fold.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const serialized = (state) => JSON.parse(JSON.stringify(state));

test("an instance's own dials ride its store row; no class row carries any", () => {
  const state = serialized(fold({ marks: loadMarks(join(ROOT, "WORLD/marks")), terrain: { features: [], far_features: [] }, stakes: [] }));
  const row = (id) => state.marks.find((m) => m.id === id);
  for (const id of ["the-town/the-wheelhouse", "wright/the-candle-vault", "wright/the-cellar-door", "wright/the-lanternstep-parlor"]) {
    assert.ok(row(id), `${id} is in the store`);
    assert.ok(row(id).dials && Object.keys(row(id).dials).length, `${id} keeps its own dials on its row`);
  }
  const classRows = state.marks.filter((m) => m.kind === "class");
  assert.ok(classRows.length > 100);
  assert.deepEqual(classRows.filter((m) => m.dials !== undefined).map((m) => m.id), [], "a class's dials are its property rows");
});

test("a property conducts to its class as `describes`, never `contains`", () => {
  const marks = [
    { id: "the-town/thing", kind: "class", by: "the-town", household: "the-town", tier: "constitution", class: "thing", date: "2026-10-17", body: "A thing." },
    { id: "the-town/thing-portable", kind: "property", by: "the-town", household: "the-town", tier: "sovereign", parent: "the-town/thing",
      name: "portable", default: "true", date: "2026-10-17", body: "Whether a thing can be taken." },
  ];
  const stakes = [{ tick: 0, holder: "rei", mark: "the-town/thing-portable", n: 4, weight: 4 }];
  const state = serialized(fold({ marks, terrain: { features: [], far_features: [] }, stakes, fanup: "flow" }));
  const flow = state.fanup.flows.find((f) => f.from === "the-town/thing-portable" && f.to === "the-town/thing");
  assert.ok(flow, `the property's escrow flows to its class: ${JSON.stringify(state.fanup.flows)}`);
  assert.equal(flow.channel, "describes");
});
