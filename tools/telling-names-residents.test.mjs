// telling-names-residents.test.mjs — THE FALSIFIER FOR POS-393 (inside WLD-29).
//
// The telling is the town's own voice. A resident's mark is NAMED in it, by its
// author and its id, and never quoted: its body is read by focus, where it
// arrives in its own field (Darko 2026-10-13 21:11 EDT, ruling B). A body enters
// the telling in four places: the establishing line, the "You are within"
// clause, the band lines and the horizon lines. Each is held here, on a REAL
// fold of synthetic marks; the town's own marks stay told, as narration.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fold } from "./marks-fold.mjs";
import { buildHeightfield } from "./world-engine.mjs";
import { openYourEyes, residentMarkNamed, TELLING_TOWN } from "./world-verbs.mjs";

const flatHF = buildHeightfield({ controlPoints: [{ x: 0, y: 0, h: 5 }, { x: 10000, y: 0, h: 5 }, { x: 0, y: 10000, h: 5 }, { x: -10000, y: 0, h: 5 }] });
const light = { dawn_pole_m: { x: 5000, y: -5000 }, dark_pole_m: { x: -5000, y: 5000 } };

// Residents' bodies, each distinctive enough to find. None may reach the telling.
const SAYS = {
  eve: "Eve's cottage, with the blue door and the crooked chimney.",
  mal: "Mal's noticeboard, three pins and a torn timetable.",
  ivo: "Ivo's meadow, long grass running down to the brook.",
  zed: "Zed's beacon tower, whitewashed and very tall.",
};
const SITED = (id, by, x, y, w, body, extra = {}) => ({ id, by, household: by, kind: "sited", tier: by === TELLING_TOWN ? "constitution" : "market", at: { x, y }, extent: { w, h: w }, date: "2026-09-01T00:00:00Z", body, ...extra });
const PARCEL = (id, by, x, y, w, body) => ({ id, by, household: by, kind: "parcel", tier: "market", at: { x, y }, extent: { w, h: w }, date: "2026-08-01T00:00:00Z", body });

function worldOf(marks, terrain = { far_features: [], features: [], elevation: {} }) {
  const f = fold({ marks, terrain: { features: [] }, stakes: [], tick: 1, households: {} });
  assert.deepEqual(f.errors, [], "the fixture folds clean");
  return { ...f, terrain, heightfield: flatHF, light, fogCeilingM: 22 };
}

const TOWN_CENTRE = SITED("the-town/the-town-centre", TELLING_TOWN, 0, 0, 4000, "The Town Centre, where the ferry lands.");
const TOWN_WELL = SITED("the-town/the-well", TELLING_TOWN, 40, 0, 8, "The town well, cold and deep.");
const EVE_PARCEL = PARCEL("eve/parcel", "eve", 0, 0, 30, SAYS.eve);
const MAL_NOTICE = SITED("mal/notice", "mal", 60, 0, 10, SAYS.mal);
const told = (w, at = { x: 0, y: 0 }) => openYourEyes(at, w, { crossing: 0 }).tell();
const noResidentWords = (t, where) => {
  for (const [by, body] of Object.entries(SAYS)) assert.ok(!t.includes(body) && !t.includes(body.slice(0, 24)), `${where}: ${by}'s words are in the town's telling:\n${t}`);
};

test("POS-393 · the spine and the bands: a resident's mark is named by author and id, never quoted; the town's own marks stay told", () => {
  const t = told(worldOf([TOWN_CENTRE, TOWN_WELL, EVE_PARCEL, MAL_NOTICE]));
  noResidentWords(t, "spine + bands");
  // the establishing line is the town's root, told as narration
  assert.ok(t.startsWith("The Town Centre, where the ferry lands."), t.split("\n")[0]);
  // "You are within": eve's parcel is named, with its id
  assert.match(t, /You are within a mark by eve \[eve\/parcel\]\./);
  // the band line names mal's mark; its tag carries the id and weight as before
  const malLine = t.split("\n").find((l) => l.includes("[mal/notice,"));
  assert.ok(malLine, t);
  assert.match(malLine, /^ {2}· \d+ m [NSEW]{1,3} — a mark by mal +\[mal\/notice, ✦\d+\]$/, malLine);
  // the town's own mark keeps its body in the band
  assert.match(t, /— The town well, cold and deep\. +\[the-town\/the-well, ✦\d+\]/);
});

test("POS-393 · the establishing line: a root that is a resident's mark is named, never quoted", () => {
  // no town mark contains the standpoint: ivo's ground is the root of the spine
  const IVO = SITED("ivo/meadow", "ivo", 5000, 5000, 400, SAYS.ivo);
  const t = told(worldOf([IVO, TOWN_WELL]), { x: 5000, y: 5000 });
  noResidentWords(t, "establishing line");
  assert.equal(t.split("\n")[0], "a mark by ivo [ivo/meadow]");
});

test("POS-393 · the horizon: a resident's far mark with no skeleton label is named, never quoted; a labelled horizon keeps the town's label", () => {
  const ZED = { ...SITED("zed/beacon", "zed", 9000, 0, 50, SAYS.zed), far: true };
  const PEAK = { ...SITED("the-town/pando-peak", TELLING_TOWN, -9000, 0, 50, "Pando Peak."), far: true, feature: "pando-peak" };
  const terrain = { far_features: [{ id: "pando-peak", label: "Pando Peak", height_m: 900 }], features: [], elevation: {} };
  const t = told(worldOf([TOWN_CENTRE, ZED, PEAK], terrain));
  noResidentWords(t, "horizon");
  const horizon = t.split("\n").filter((l) => /~\d+ km, /.test(l));
  assert.ok(horizon.some((l) => /a mark by zed \[zed\/beacon\] \(/.test(l)), `zed's far mark is named:\n${t}`);
  assert.ok(horizon.some((l) => /Pando Peak \(/.test(l)), `the town's labelled horizon is told:\n${t}`);
});

test("POS-393 · the naming itself: author and id only, and an id-less author still says whose", () => {
  assert.equal(residentMarkNamed({ id: "eve/parcel", by: "eve", body: SAYS.eve }), "a mark by eve [eve/parcel]");
  assert.equal(residentMarkNamed({ id: "eve/parcel" }, { withId: false }), "a mark by eve", "the author comes from the id when `by` is absent (the radial's entries carry no `by`)");
});
