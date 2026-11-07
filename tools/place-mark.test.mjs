// place-mark.test.mjs — the filing tool describes a new-form mark (LOGOS v2 part 2, W2; review-235).
//
// After W2 a thing writes `kind: thing`, not `kind: sited` + `class: thing`, so
// "can this mark hold a description?" is the class chain's answer (G12), not a
// comparison of the kind with "sited" or "parcel". Run as the CLI is run, read-only.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = join(HERE, "place-mark.mjs");
const run = (args) => {
  try { return { code: 0, out: execFileSync("node", [TOOL, ...args], { encoding: "utf8" }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout ?? "") + String(e.stderr ?? "") }; }
};

test("a predicate files under a new-form thing (kind: thing), as it did under kind: sited", () => {
  const r = run(["--kind", "predicate", "--slug", "x", "--parent", "amia-semper/a-jar-of-honey", "--json"]);
  assert.equal(r.code, 0, r.out);
  const out = JSON.parse(r.out);
  assert.equal(out.parent, "amia-semper/a-jar-of-honey");
  assert.equal(out.dir, "WORLD/marks/amia-semper/a-jar-of-honey/x");
});

test("a predicate files under a parcel and a plain sited mark, and never under a claim", () => {
  assert.equal(run(["--kind", "predicate", "--slug", "x", "--parent", "the-town/the-think-tank", "--json"]).code, 0, "a plain sited mark");
  assert.equal(run(["--kind", "predicate", "--slug", "x", "--parent", "rei/the-lanternstep-house-parcel", "--json"]).code, 0, "a parcel");
  const claim = run(["--kind", "predicate", "--slug", "x", "--parent", "the-town/the-walking-pace", "--json"]);
  assert.notEqual(claim.code, 0, "a predicate holds no description");
  assert.match(claim.out, /cannot hold a description/);
});
