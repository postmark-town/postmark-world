// engine-files.mjs — the files that must TRAVEL TOGETHER for the world engine
// to run in a copied tree.
//
// Several fixtures build a throwaway repo and run `marks-fold.mjs` or
// `mark-lint.mjs` inside it as a real subprocess (which is the point: they test
// the tool a resident's crossing actually runs, not an in-process stand-in).
// Each of them used to carry its OWN hand-written list of files to copy, eight
// copies of the same fact — so the day marks-fold.mjs gained an import, six
// fixtures failed with ERR_MODULE_NOT_FOUND in a temp directory and none of
// them was wrong about anything the world does.
//
// One list, imported. Add a module to the engine's import graph and add it
// here; there is no second place that has to be found.

export const ENGINE_FILES = [
  "geometry.mjs",
  "mark-standing.mjs",
  "marks-fold.mjs",
  "determination.mjs",
  "consent.mjs",
  // joined 2026-08-24, when the heads-up list became fold-derived state: the
  // fold now emits WORLD/region-outsiders.{json,md} beside world-state.json, so
  // this module travels with it. Exactly the case the note above describes —
  // marks-fold gained an import and six fixtures went ERR_MODULE_NOT_FOUND in a
  // temp directory, and the one list is why that cost one line instead of eight.
  "region-outsiders.mjs",
  // joined 2026-10-07 (POS-441): the lint's household gate asks the one question
  // household-frames.mjs holds, so the gate's fixtures carry it.
  "household-frames.mjs",
  // joined 2026-10-10 (POS-449): a mark's first-laid instant, read by both
  // marks-fold.mjs and consent.mjs, so neither imports the other for it.
  "claim-instant.mjs",
  // joined 2026-10-13 (WLD-5): the lint's portal rules are portals.mjs's, one
  // definition beside the passage's, and portals.mjs reads the entry law from
  // enter-exit.mjs.
  "portals.mjs",
  "enter-exit.mjs",
  // joined 2026-10-17 (LOGOS v2 part 2): a class's properties are nodes of their
  // own now, and the lint's property rails read them through one helper.
  "class-properties.mjs",
  // joined with W2: what a record is and how it stands, in either form
  "mark-kind.mjs",
];

// Fixtures that additionally exercise the gate or the sketchbook wall name the
// tool they are testing on top of the engine.
export const withTool = (...names) => [...ENGINE_FILES, ...names];
