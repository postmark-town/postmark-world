// unpublish-standing.test.mjs — the safety half of the re-derive, over the
// world's own registry and standing (postmark#3757; Darko, 2026-10-14).
//
// On 10-14 (world main 9988b669) eleven home marks stood under registry rows
// stored "commons" at their own paths, seven of them at exactly ✦1 (Wright's
// read of escrow_projection). The sweep trusted the stored class. Asked at ✦0
// now, the one rule keeps every one of them. WLD-51's ruling 2 then reached the
// other rows: the cone, stored home and walking market, is taken at ✦0 (G2,
// Darko 2026-10-15 12:59), and so are the 13 market marks whose rows named
// stale paths (Darko 2026-10-14 14:51, "just take them"; repointed 10-15).
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

const THE_13 = [
  "vermillion/pando-peak-library-shelf", "lysander/the-lake-signed-the-book", "scree/the-cairn-on-the-scree",
  "spark-the-builder/puzzle-1-smoothing", "spark-the-builder/puzzle-2-five-strands", "spark-the-builder/puzzle-3-the-other-builder",
  "limen/the-amber-haze", "limen/the-twice-rung-bells", "wright/a-trued-spinning-top-for-little-m", "lupi/rootwood-bookend",
  "orion-by-the-fire/for-the-caterpillar-at-one-month", "lucien/little-moon-for-little-m", "little-pica/the-nest",
];

test("WLD-51 ruling 2 reaches its rows: at ✦0 the cone (stored home, walking market) and the 13 are taken from where they are filed", (t) => {
  const cone = "berthillon/cone-peche-de-vigne-2026-08-27";
  if (published[cone]?.class === "home" && tierOf.get(cone) === "market")
    assert.deepEqual(atZero(cone), { unpublish: true, why: "commons-unbacked", path: published[cone].path }, "G2: standing decides in both directions");
  else t.diagnostic(`${cone}: no longer a home row over a market mark; re-measure`);
  for (const id of THE_13) {
    if (!published[id] || tierOf.get(id) !== "market") { t.diagnostic(`${id}: no longer a row over a market mark; re-measure`); continue; }
    assert.equal(existsSync(join(ROOT, published[id].path)), true, `${id}: its row names its file now`);
    assert.deepEqual(atZero(id), { unpublish: true, why: "commons-unbacked", path: published[id].path }, id);
  }
});

test("the invariant over the whole registry: at ✦0 the sweep takes only marks whose standing, walked now, is commons", () => {
  const taken = Object.keys(published).filter((id) => atZero(id).unpublish === true);
  const wrong = taken.filter((id) => rowClassOf(tierOf.get(id) ?? null) !== "commons" && tierOf.has(id));
  assert.deepEqual(wrong, [], "a mark that walks home or constitution would be taken");
  assert.ok(taken.length > 0, "the control: the rule still takes something (commons marks at ✦0 exist)");
});
