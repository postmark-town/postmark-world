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
| **tour fit AFTER** (lead fix, 20:01Z) | Site `3e2c8f68` + World `cd21332c3b7f8be5cd48c749a010116f1ec1a996` (House-installed, `PUBLIC_CHANNEL=release npm run build` exit 0) | `after-cd21332c-*` |
| **targets** (unchanged paths, measured earlier) | Site `3e2c8f68` + World `0dae4132` | `targets-0dae4132-*` (its `tour-buttons` frame is the clipped **BEFORE** for the tour fit; c300 carried the same CSS) |
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

## Tour fit at 390 px (lead fix, World `cd21332c3`)
- **BEFORE** `targets-0dae4132-phone-390-tour-buttons.png` (the same CSS as c300): with the enlarged targets, "next" spilled past the card and was clipped at the screen's right edge (8 dots x 20 px + skip/back/next ~192 px > the 332 px inside the 370 px card).
- **AFTER** `after-cd21332c-phone-390-tour-first-frame-fits.png`, one real touch on Next, then `after-cd21332c-phone-390-tour-after-real-next-press.png`. ACTUAL bounds (`after-cd21332c-tour-bounds.jsonl`, `getBoundingClientRect`), step 1: viewport 390x844; card x 10 to 380 (w 370); inner content x 30 to 362; all **8 dots** 20x44 at x 30 to 190; **skip** x 216.4 to 260.4 (44x44), **back** x 264.4 to 311.2 (46.8x44), **next** x 315.2 to 362.0 (46.8x44); one row; `allInsideCard`, `allInsideInner`, `allInsideViewport` all true; max right edge 362 (inside the card's 380 and the viewport's 390); minimum button 44 wide x 44 tall; dot target 20x44 (kept). One real Next press: kicker "The World · 1 / 8" to "The World · 2 / 8" ("A mark is one sentence the world keeps"), the same bounds still inside at step 2 (max right 366, card 14 to 384).
- Words, step order and behaviour are unchanged (WLD-220's); only padding, gaps and a wrap fallback changed, in one media block.

## Desktop
`after-c300-9-desktop-1280`: `--wv-chrome-bottom` absent, rail + Telling + map as before (tour dismissed with Escape).

## Not shown / not claimed
+/- zoom buttons were not added (Wright: only "if you add"). Phone lists and the tour rewrite (WLD-220) are not part of this change.
