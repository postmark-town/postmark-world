// staked-is-your-households.test.mjs — WLD-95, RULED (Darko 2026-10-20 22:19).
// The map's ✦ "staked" badge means YOUR HOUSEHOLD HAS STAMPS STAKED ON THIS: it
// shows only to a signed-in reader whose household holds escrow on the mark,
// and none to a reader signed out. It sits on the mark's own pip, never in a
// pill beside it, as every state badge does; pins draw at their anchors, with
// no fan. The column and the nameplate keep the mark's general ✦ figure.
// Run: node --test tools/staked-is-your-households.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MARK_ICONS, markStates, markIcons } from "../spectator/mark-icons.mjs";
import { householdStakeOn, overlayPipSVG, pipBadgesSVG, OVERLAY_PIP_R, PIP_BADGE } from "../spectator/viewer.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
const sited = (extra = {}) => ({ id: "h/m", kind: "sited", at: { x: 0, y: 0 }, ...extra });
const portfolio = { backed: [
  { id: "the-town/fair-stall", holder: "rei", stamps: 3 },
  { mark: "the-town/fair-stall", holder: "kai", stamps: 2 },   // a housemate's position: household grain
  { id: "the-town/fair-gate", holder: "rei", stamps: 0 },      // a position taken back
] };

test("the badge's line says the new meaning", () => {
  assert.equal(MARK_ICONS.staked.meaning, "Staked: your household has stamps staked on this.");
});

test("the household's stake is the stamps its open positions hold on the mark, and nothing for a reader signed out", () => {
  assert.equal(householdStakeOn("the-town/fair-stall", { signedIn: true, portfolio }), 5, "every resident's position");
  assert.equal(householdStakeOn("the-town/fair-gate", { signedIn: true, portfolio }), 0, "a taken-back position holds none");
  assert.equal(householdStakeOn("the-town/elsewhere", { signedIn: true, portfolio }), 0);
  assert.equal(householdStakeOn("the-town/fair-stall", { signedIn: false, portfolio }), 0, "signed out, never");
  assert.equal(householdStakeOn("the-town/fair-stall", { signedIn: true, portfolio: null }), 0);
});

test("on the map the ✦ answers the household's stake, not the mark's weight", () => {
  assert.deepEqual(markStates(sited(), { weight: 147, ownStake: 0 }), [], "a heavy mark your household has not backed wears no ✦");
  assert.deepEqual(markStates(sited(), { weight: 0, ownStake: 5 }), [{ key: "staked", own: 5 }]);
  const [icon] = markIcons(sited(), { ownStake: 5 }).filter((i) => i.key === "staked");
  assert.equal(icon.meaning, "Staked: your household has 5 stamps staked on this.");
  assert.equal(icon.count, undefined, "no general figure rides on it");
  assert.equal(markIcons(sited(), { ownStake: 1 }).find((i) => i.key === "staked").meaning, "Staked: your household has 1 stamp staked on this.");
});

test("the column and the nameplate keep the general ✦ figure", () => {
  assert.deepEqual(markStates(sited(), { weight: 12 }), [{ key: "staked", count: 12 }]);
  assert.equal(markIcons(sited(), { weight: 12 }).find((i) => i.key === "staked").meaning, "Staked: ✦ 12 behind it.");
  for (const fn of ["markNameplateHTML", "columnFor", "regionColumn", "parcelColumn"]) {
    const body = SOURCE.match(new RegExp(`function ${fn}\([^)]*\) \{[\s\S]*?\n  \}\n`))?.[0];
    if (body) assert.doesNotMatch(body, /map: true/, `${fn} asks the general figure`);
  }
  assert.match(SOURCE, /function markNameplateHTML\(id\) \{[\s\S]*?const icons = iconsOf\(full\);/);
});

test("the states sit on the pip's own rim, inside its scaled group, the first at its top right", () => {
  assert.equal(pipBadgesSVG([]), "");
  const svg = overlayPipSVG({ at: { x: 10, y: 20 }, id: "h/m", badges: [{ key: "staked", meaning: "m" }, { key: "inside", meaning: "n" }] });
  assert.match(svg, /^<g transform="translate\(10 20\)"><g class="ov-s">/, "one group: the pip and its states move and scale together");
  const seats = [...svg.matchAll(/<g transform="translate\((-?[\d.]+) (-?[\d.]+)\)"><circle r="[\d.]+" class="ov-badge-bg"\/>/g)]
    .map((m) => [Number(m[1]), Number(m[2])]);
  assert.equal(seats.length, 2, "one disc per state");
  for (const [x, y] of seats) assert.ok(Math.abs(Math.hypot(x, y) - OVERLAY_PIP_R) < 0.01, "on the rim, never beside it");
  assert.ok(seats[0][0] > 0 && seats[0][1] < 0, "the first at the top right");
  assert.ok(PIP_BADGE.r < OVERLAY_PIP_R / 2, "a badge, smaller than the pip it sits on");
  assert.equal((svg.match(/class="ov-ic ic-/g) ?? []).length, 2, "each wears its glyph, its meaning on hover");
});

test("pins: the map asks the household's stake, draws the states on the pip, and fans nothing", () => {
  const loop = SOURCE.slice(SOURCE.indexOf("    for (const m of drawn) {\n      const p = px(m.at);"), SOURCE.indexOf("    // THE TOWN'S HOUSES ARE ALWAYS ON THE MAP."));
  assert.ok(loop.length > 200);
  assert.match(loop, /iconsOf\(full, insideNow, \{ map: true \}\)/);
  assert.match(loop, /badges: what \? icons\.slice\(1\) : icons,/, "the pip carries its states");
  assert.doesNotMatch(loop, /placePill\(/, "and no pill beside it");
  assert.match(SOURCE, /const states = iconsOf\(parcel, insideNow, \{ map: true \}\)/, "a parcel's card wears the map's ✦ too");
  assert.match(SOURCE, /function markPillHTML\(id\) \{[\s\S]*?const icons = iconsOf\(full, null, \{ map: true \}\);/, "the pill the pip opens into agrees with it");
  assert.match(SOURCE, /\.\.\.\(map \? \{ ownStake: householdStakeOn\(full\.id, \{ signedIn: !!pmKey\(\), portfolio: state\.portfolio \}\) \} : \{\}\),/);
  assert.doesNotMatch(SOURCE, /coLocatedMarkIds\(drawn\)/, "no fan");
  assert.doesNotMatch(loop, /fanOffsetPx|\bfan\b/);
});
