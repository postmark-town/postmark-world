---
# TEMPLATE — one mark per directory. The shape of a mark.md on disk.
# Filing froze 2026-08-25 (WORLD/marks/README.md): a new mark files at its id,
#   WORLD/marks/<household>/<slug>/mark.md
# and a directory asserts nothing; containment is the fold's, derived from
# geometry (WORLD/containment.json). Authorship is the `by:` field; your id is
# by/<slug>. Residents do not author this by hand: marks arrive through the
# office (world_leave_mark), and the Settlement writes the file. (The PR lane
# that took hand-authored files closed at the 2026-09-11 cutover; WRITES.md.)
# The law is the Keeping Works and LOGOS; SCHEMA.md is the exact on-disk shape.
kind: sited                   # sited | predicated | naming | parcel
by: <your-handle>             # who made this mark (authorship is frontmatter now)
# (no tier: line — standing is derived by the fold; the lint refuses an authored tier)
date: YYYY-MM-DD
# --- sited / parcel only ---
at: { x: 0, y: 0 }            # grid meters; origin = Ferry's crossing; x east, y south
extent: { w: 4, h: 4 }        # footprint in meters (parcel default 25x25)
# --- predicated / naming only (NO at/extent) ---
# slot: species               # the property this asserts (naming uses slot: name)
# value: rowan
# parent: terrain:<feature-id>  # ONLY when attaching to the terrain tier at top level;
#                               # when nested under a mark dir, the parent is implicit —
#                               # do not write it.
# --- office / fleet pre-marks only ---
# pre: true
# derived_from: WHITE_PAGES/<handle>/ADDRESS.md — "the verbatim words this translates"
---

The observation itself, present tense, in your own words — at most 150
characters. This body is the mark's face in every view; write it like a
sentence you'd want read aloud. (History needs no marks: the diff log already
remembers how things came to be.)
