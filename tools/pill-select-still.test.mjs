// pill-select-still.test.mjs — play fix 46 (Darko, playground 2026-10-15 20:36):
// "a weird effect of the icon expanding into the name on click and unclick,
// which we don't need because that already happens on hover." Hover owns the
// pill's unfold and fold. A click selects the pill already open under the
// pointer (it takes its ring); an unselect leaves the pill in its real hover
// state, open if pointed at, a dot at once if not. Measured in a browser
// (before: a fold and an unfold on each click; after: the width never moves on
// select or unselect, and hover in and out still animate); here the pins.
// Run: node --test tools/pill-select-still.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
const body = (name) => {
  const i = SOURCE.indexOf("  function " + name + "(");
  assert.ok(i >= 0, name);
  return SOURCE.slice(i, SOURCE.indexOf("\n  }\n", i));
};

test("a still pill opens with its transition off, and closes at once", () => {
  assert.match(SOURCE, /\.wv-pill\.is-still \{ transition:none; \}/);
  const set = body("setPill");
  assert.match(set, /function setPill\(role, id, \{ still = false \} = \{\}\)/);
  assert.match(set, /if \(still \|\| el\.hidden \|\| !el\.classList\.contains\("is-open"\)\) \{ el\.classList\.remove\("is-open"\); el\.hidden = true;/);
  assert.match(set, /if \(still\) \{\s*\/\/[^\n]*\n\s*el\.classList\.add\("is-still", "is-open"\);\s*void el\.offsetWidth;\s*el\.classList\.remove\("is-still"\);\s*return;/);
});

test("the selected role never unfolds or folds; hover keeps its animation", () => {
  const render = body("renderPills");
  assert.match(render, /setPill\("selected", sel, \{ still: true \}\);/);
  assert.match(render, /setPill\("hover", hov, \{ still: swap \}\);/);
  // the unfold is still there for hover: a fresh pill restarts from the dot
  assert.match(body("setPill"), /if \(fresh\) \{ el\.classList\.remove\("is-open"\); void el\.offsetWidth; \}\s*el\.classList\.add\("is-open"\);/);
});

test("a mark changing role keeps its own pill element", () => {
  const render = body("renderPills");
  assert.match(render, /const swap = \(!!sel && showing\(hovEl\) === sel\) \|\| \(!!hov && showing\(selEl\) === hov\);/);
  assert.match(render, /if \(swap\) \{ pillEls\.set\("selected", hovEl\); pillEls\.set\("hover", selEl\); \}/);
  // the swap happens before either role is set, so the moved pill is never "fresh"
  assert.ok(render.indexOf("if (swap)") < render.indexOf('setPill("selected"'));
});
