// one-pip.test.mjs — play fix 48 (Darko, playground 2026-10-15 21:10): "the
// icon for the Starforge Spire, the dungeon icon, does not match up with the
// pips for sited marks … the same exact mechanism that we use for dungeon and
// for all other icons … for marks." A mark wearing its picture used to stand
// its dot down and hang its icons (what it is included) in a corner pill on its
// ground. Now every mark with an icon wears the one pip: the dot with its icon,
// the pill on hover (fix 37, which opens only from a visible pip), the ringed
// selected state (fix 46).
// Run: node --test tools/one-pip.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
const loop = SOURCE.slice(SOURCE.indexOf("    for (const m of drawn) {\n      const p = px(m.at);"), SOURCE.indexOf("    // THE TOWN'S HOUSES ARE ALWAYS ON THE MAP."));

test("the what-icon always goes inside the pip, picture or no picture", () => {
  assert.ok(loop.length > 200, "the pip loop is where it was");
  assert.match(loop, /inner: what \? iconSVG\(what, /);
  assert.doesNotMatch(loop, /what && !isPictured/);
});

test("the dot stands down for a picture only where it carries no icon (far and mid keep Keemin's 09-18 rule)", () => {
  assert.match(loop, /const isPictured = pictured\.has\(m\.id\) && !what;/);
});

test("no corner pill, and no pill beside it: a mark's states sit on its own pip (WLD-95)", () => {
  assert.doesNotMatch(SOURCE, /cornerOf/);
  assert.equal((loop.match(/placePill\(/g) ?? []).length, 0, "the pill beside the pip is gone (WLD-95)");
  assert.match(loop, /badges: what \? icons\.slice\(1\) : icons,/);
});

test("the hover pill opens from that pip: visiblePip passes over only pictured and home pips", () => {
  assert.match(SOURCE, /if \(c\.classList\.contains\("ov-pip-home"\) \|\| c\.classList\.contains\("ov-pip-pictured"\)\) continue;/);
});
