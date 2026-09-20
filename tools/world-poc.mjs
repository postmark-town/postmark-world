#!/usr/bin/env node
// world-poc.mjs — the spine proof-of-concept: open-your-eyes anywhere in the
// seeded world, zero deps. Assembles a `world` for world-verbs.mjs from real,
// extracted sources (WORLD/marks + skeleton), then tells what a
// standing agent sees. This is the README's recompute-it-yourself CLI: same
// loader, same fold, same assembly the office and browser use.
//
// SEPARATION OF CONCERNS: world-engine.mjs is a pure library that consumes
// real-coordinate marks. The heightfield's region control points live HERE,
// as clearly-labelled dials, so the engine stays general and the leans stay
// visible and movable.
//
// EXTRACTION OVER MIRRORS: household placements were read from
// seeding/manifest.json (itself extracted from the atlas's HOME_XY) until that
// file retired (postmark#3025); they come off the marks now, which is the
// record, so nothing needs to flow through from a re-derived atlas at all.
//
// (The run-01 legacy-fixture adapter that once lived here retired with
// `_archived/sims/` in the 2026-08-01 solidification pass.)
//
// Usage:
//   node tools/world-poc.mjs                 # tell the Origin view (default crossing)
//   node tools/world-poc.mjs --crossing 19   # a specific crossing (fog is its weather)
//   node tools/world-poc.mjs --json          # dump the structured fov instead of prose
//   node tools/world-poc.mjs --at 1500,4888  # stand somewhere else (e.g. the Waystation)

import { readFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { fold, loadMarks } from "./marks-fold.mjs"; // the ONE loader
import { assembleWorld } from "./world-build.mjs"; // the ONE assembly (shared with the browser)
import { orient, openYourEyes } from "./world-verbs.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : d; };
const has = (f) => process.argv.includes(f);

// ───────────────────────── DIALS local to the PoC ──────────────────────────
const DEFAULT_CROSSING = Number(arg("--crossing", 19)); // fog is the crossing's weather; 19 is foggy — see the report

// ── THE DENSIFICATION COMES OFF THE MARKS NOW (postmark#3025, 2026-09-20) ───
//
// A `homeBandControlPoints()` lived here: every placed home in
// `seeding/manifest.json` as a heightfield control point at its region's
// band-midpoint height, passed to `assembleWorld` as the `homeControlPoints`
// OVERRIDE. That file is a July build intermediate read off the atlas painting
// at 5 m/px, and it is deleted.
//
// Nothing replaces it, because `assembleWorld` already has the replacement and
// has been using it all along: with no override it calls
// `deriveHomeControlPoints(marks)`, which is what the BROWSER passes through —
// every sited mark at its nearest region anchor's height. So the terrain this
// CLI reports and the terrain the viewer draws were two different terrains,
// and the CLI's was the painting's. Measured on the fold at 5f042bb: 64
// manifest points against 525 derived ones, and the two heightfields differ at
// 4517 of 4575 sampled points, by up to 33.2 m. Dropping the override does not
// introduce that gap — it CLOSES it, onto the side the town actually looks at.

// ───────────────────────── build the world ─────────────────────────────────
// buildWorld — the DISK path. Reads + folds the marks, then hands the folded
// world-state and the skeleton to the shared assembleWorld (world-build.mjs) —
// the same function the browser calls, with no homeControlPoints override, so
// the home densification is the derived one the browser gets (see above).
// Default: the seeded canon tree, WORLD/marks, through the SHARED loadMarks.
export function buildWorld({ crossing = DEFAULT_CROSSING, marksDir = null, stakesPath = null, fanup = "legacy" } = {}) {
  const terrain = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8"));
  const placed = loadMarks(marksDir ?? join(ROOT, "WORLD/marks")); // SHARED nested loader; real coords
  const stakes = stakesPath ? JSON.parse(readFileSync(stakesPath, "utf8")) : [];

  // fold at this crossing (stakes take effect the crossing after they land)
  const state = fold({ marks: placed, terrain, stakes, tick: crossing + 1, fanup });

  // one assembly, disk data source, no override: the home densification is
  // derived from the marks, exactly as the browser derives it (see above)
  const world = assembleWorld({ worldState: state, skeleton: terrain });
  world.foldErrors = state.errors;
  // sandbox receipts ride to the caller (assembleWorld picks fields, so these
  // must be re-attached; absent under fanup:"legacy" by construction)
  world.fanup = state.fanup;
  world.terrain_weight = state.terrain_weight;
  return world;
}

// ───────────────────────── the sample telling ──────────────────────────────
function main() {
  const crossing = DEFAULT_CROSSING;
  const marksDir = arg("--marks-dir", null); // point at a nested tree (e.g. WORLD/marks) for the full-tree check
  const atArg = arg("--at", "0,0").split(",").map(Number);
  // name without coords — the opening line supplies the coordinate once (no duplication)
  const observer = { x: atArg[0], y: atArg[1], name: atArg[0] === 0 && atArg[1] === 0 ? "An agent at the Origin" : "An agent" };

  const world = buildWorld({ crossing, marksDir });
  if (world.foldErrors?.length) {
    console.error(`⚠ fold errors (${world.foldErrors.length}):`);
    for (const e of world.foldErrors.slice(0, 10)) console.error("  ", JSON.stringify(e));
  }

  const eyes = openYourEyes(observer, world, { crossing });
  if (has("--json")) { console.log(JSON.stringify(eyes.fov, null, 2)); return; }

  const o = orient(observer, world, { crossing });
  console.log("═══ orient ═══");
  console.log(`charter: ${o.charter.light}`);
  console.log(`you: ${o.you.name} @ (${o.you.at.x},${o.you.at.y}) · ${o.you.groundElevM} m · region ${o.you.region} · light ${o.you.light.level} · fog(crossing ${o.you.fog.crossing}) ${o.you.fog.thickness} ${o.you.fog.inFog ? "[in-fog]" : o.you.fog.aboveFog ? "[above-fog]" : "[clear]"}${o.you.light.inDarkness ? " [in-darkness]" : ""}`);
  if (o.you.standingOn) console.log(`standing on/near: ${o.you.standingOn.feature} (${o.you.standingOn.distM} m)`);
  console.log("\n═══ open-your-eyes ═══");
  console.log(eyes.tell());
}

if (fileURLToPath(import.meta.url) === (process.argv[1] || "").replace(/\\/g, "/").replace(/^([a-z]):/i, (s) => s.toUpperCase())
    || basename(process.argv[1] ?? "") === "world-poc.mjs") {
  main();
}
