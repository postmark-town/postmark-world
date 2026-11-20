# CORE-54 pictures: phone title clearance, small targets, and the crowded tap's chooser

Darko's picks (2026-11-20 08:48 EST): **"1. Buttons cover titles"**, **"4. Small targets"**. Wright 16:57:01Z ruling: "On a phone, a tap on crowded marks or conversation badges opens the existing chooser content in the phone column."

PRs (drafts): World https://github.com/postmark-town/postmark-world/pull/418 · Site https://github.com/postmark-town/postmark-site/pull/467

## What these are, and are NOT
- **Chromium headless EMULATION** (390x844, mobile + touch via CDP `Input.dispatchTouchEvent`, real presses, never `select()`), served from a built Site `dist-town`. **Not a physical phone, not Safari.**
- **INVENTED fixtures:** a stub office and a pinned clock (2026-11-14T21:05Z). Names like "Cave Interior, the Town Centre (INVENTED)" are the stub's. No production read or act, no private data.
- **scrollIntoView (labelled):** the conversation row is the last in a long chooser list, below the 844 px screen. The harness scrolled that row into view with `scrollIntoView` on the column's own row, then pressed it with a REAL touch (frame `after-c300-5`). That scroll is the harness's, not a claim about how a thumb scrolls.
- Frames are grouped by build; do not read one group's numbers off another's.

## Provenance (exact pins)
| Group | Build | Files |
|---|---|---|
| **after-c300** (integrated, final) | Site `3e2c8f68255627840b7c549e2d3fb826cf7aa32c` + World `c300834b6df81771c8962a19620f9b7e6195ecff` (origin/main `50fbbaf7` merged), `PUBLIC_CHANNEL=release npm run build` | `after-c300-*` |
| **before** (crowded press, nothing opens) | Site `3e2c8f68` + World `7fb7d58e8aecc2b5ce8cfbae3f88c1d5f6f2b218` (the first World head, before the chooser column existed) | `before-7fb7d58e-3e2c8f68-*`, `before-ab-7fb7d58e-*` |
| **targets** (unchanged paths, measured earlier) | Site `3e2c8f68` + World `0dae4132` | `targets-0dae4132-*` |
| **historical S181** (audit, what prod showed) | Site `6cbaf543` + World `e211e439` | `historical-S181-*` |

The `before-ab-7fb7d58e-*` frames are same-build A/B on the first head (cursor reach vs finger reach; the host's `--wv-chrome-bottom` withdrawn). The `historical-S181-*` frames differ from the after build in unrelated World/Site changes, so no CORE-54 number is read off them.

## Pick 1 (buttons cover titles), integrated after-frames
`after-c300-3` (mark column) and `after-c300-6` (conversation column): the title starts at y=146, below the Postmark pill (bottom 84) and the Time-travel pill (bottom 124); the kicker rides the top row (y 23 to 40) beside the 44x44 close; `titleOverlapsChrome` and `kickerOverlapsChrome` are false in every view (`capture-c300-chooser.log`). Falsifier, same build: `before-ab-7fb7d58e-phone-390-clearance-variable-withdrawn` (variable withdrawn: the overlap returns).

## Pick 4 (small targets) and the crowded tap
- **Crowded mark press** `after-c300-1` to `-2` to `-3`: a real press on a 24-mark pile opens the existing chooser in the phone column (title "Choose one", lead "24 marks and 1 conversation are here — which one?"), it **stays visible** (no automatic row click), and a deliberate real press on "The Composing Room" opens its column.
- **Badge press** `after-c300-4` (a press 18 px off the badge: 15 marks and 1 conversation) to `-5` (the labelled scroll) to `-6` (the conversation row, pressed for real, opens the WLD-215 conversation column with its speakers row intact). `-7` is a press on the badge centre.
- **Close** `after-c300-8`: a press 8 px left of the close's old box closes the chooser column (the close is now 44x44).
- **Edge tap** (measured on the 0dae4132 build, no source delta on that path): `before-ab-7fb7d58e-phone-390-cursor-20px-off-pip-misses` vs `targets-0dae4132-phone-390-finger-20px-off-pip-opens`: 20 px off a lone pip, a cursor misses and a finger opens "The Stone Cottage Creek"; at 24 px a finger misses too (the reach has an edge).
- **Before the change** `before-7fb7d58e-3e2c8f68-phone-390-crowded-press-nothing-opens`: a real press on a crowded pile selected nothing.
- Menu rows 44 px, tour buttons 44 px tall (`targets-0dae4132-*`); other measured hit areas (replay press 83x46, Time-travel arrows 44, step dot 20x45, map controls 39x43) are in the PR bodies.

## Desktop
`after-c300-9-desktop-1280`: `--wv-chrome-bottom` absent, rail + Telling + map as before (tour dismissed with Escape).

## Not shown / not claimed
+/- zoom buttons were not added (Wright: only "if you add"). Phone lists and the tour rewrite (WLD-220) are not part of this change.
