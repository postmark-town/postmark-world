// unpublish-standing.test.mjs — the safety half of the re-derive, over the
// world's own registry and standing (postmark#3757; Darko, 2026-10-14).
//
// On 10-14 (world main 9988b669) eleven home marks stood under registry rows
// stored "commons" at their own paths, seven of them at exactly ✦1 (Wright's
// read of escrow_projection). The sweep trusted the stored class. Asked at ✦0
// now, the one rule keeps every one of them, and leaves WLD-51's rows (the
// cone stored home, the market marks at stale paths) exactly as they were.
// A row named here that a later settlement changes is reported, not failed.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rowClassOf, unpublishVerdict } from "./unpublish-verdict.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { published } = JSON.parse(readFileSync(join(ROOT, "WORLD", "settlement-publications.json"), "utf8"));
const tierOf = new Map(JSON.parse(readFileSync(join(ROOT, "WORLD", "world-state.json"), "utf8")).marks.map((m) => [m.id, m.tier]));
const atZero = (id) => unpublishVerdict(published[id], {
  escrow: 0,
  pathOnMain: () => existsSync(join(ROOT, published[id].path)),
  standing: () => tierOf.get(id) ?? null,
});

const ELEVEN = [
  "keith/the-garage", "alex-rowan/the-threadbound-house", "berthillon/chez-antoine-bedroom",
  "berthillon/chez-antoine-tall-windows", "cookie-of-garrison/the-chair-by-the-door", "errant/the-misfiled-annex",
  "quill-stem/the-chartreuse-den", "little-pica/the-nest-on-the-middle-terrace", "quill-stem/the-fitting-room",
  "quill-stem/candle-for-the-trail", "rei/the-white-flower-at-wrights-door",
];

test("the eleven home marks under commons rows are kept at ✦0, by name", (t) => {
  for (const id of ELEVEN) {
    const row = published[id];
    if (!row || row.class !== "commons" || rowClassOf(tierOf.get(id)) !== "home") { t.diagnostic(`${id}: no longer a commons row over a home mark; re-measure`); continue; }
    assert.equal(existsSync(join(ROOT, row.path)), true, `${id}: its path is on main, so only the walk keeps it`);
    assert.deepEqual(atZero(id), { unpublish: false, why: "walks-not-commons" }, id);
  }
});

test("WLD-51's rows are untouched: the cone stored home, the market marks at stale paths", (t) => {
  const cone = "berthillon/cone-peche-de-vigne-2026-08-27";
  if (published[cone]?.class === "home") assert.deepEqual(atZero(cone), { unpublish: false, why: "not-commons" });
  else t.diagnostic(`${cone}: changed since 9988b669; re-measure`);
  for (const id of ["lupi/rootwood-bookend", "limen/the-twice-rung-bells", "wright/a-trued-spinning-top-for-little-m"]) {
    if (published[id] && !existsSync(join(ROOT, published[id].path))) assert.deepEqual(atZero(id), { unpublish: false, why: "stale-path" }, id);
    else t.diagnostic(`${id}: changed since 9988b669; re-measure`);
  }
});

test("the invariant over the whole registry: at ✦0 the sweep takes only marks whose standing, walked now, is commons", () => {
  const taken = Object.keys(published).filter((id) => atZero(id).unpublish === true);
  const wrong = taken.filter((id) => rowClassOf(tierOf.get(id) ?? null) !== "commons" && tierOf.has(id));
  assert.deepEqual(wrong, [], "a mark that walks home or constitution would be taken");
  assert.ok(taken.length > 0, "the control: the rule still takes something (commons marks at ✦0 exist)");
});
