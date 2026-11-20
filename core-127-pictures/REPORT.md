# CORE-127 · World viewer filters · before/after pictures (desktop 1280 and phone 390)

All people, marks, households and the huge hall are INVENTED fixtures made for these pictures (acting resident "rig-actor" / household "rig-house", another household "other-house", a huge "legal" mark "invented/the-huge-hall", one draft). Nothing is production data; no production read, act or key.

## Pins (what is what)
- **World base (before):** `postmark-town/postmark-world` main `6928feab01d8082222c7341dd0348561e034c8da`, exported with `git archive` (spectator/, WORLD/, tools/), served read-only.
- **World candidate (after):** branch `core-127-viewer-filters` head `865e4e201` (PR #417; full sha in the PR), same export.
- **Site host:** `postmark-site` `train/2026-w48` `0afbc5c1dcb06ced8b4e1c38e362b263613330cb`, pool tree site-2, `npm run build` -> `dist-town/`. Its `/world/` page and chrome (the ☰ Postmark button, the Time travel pill, the sign-in/act-as panel) are the real Site's.
- **Installed module of that Site (NOT what is shown):** `postmark-world@47ad6380d` (the floor in package-lock). With that module the Site build stopped in its own `world-engine-island` hook ("the viewer imports 1 module(s) this build did not stage: /world-engine/spectator/circle-reader.mjs", plus "47ad6380d is not one of the settlements the town's record names"). I did not run an install to move the pin. The page HTML in `dist-town/world/` was generated before the failure; `/world-engine/**` was therefore served from the exact-SHA World exports above (the way `/var/tmp/core-54/shots/lib.mjs` overlays do). So these are NOT a branch build of the Site and NOT the installed module: they are the Site page + chrome at 0afbc5c1 with the viewer files of base / candidate served over `/world-engine/`. The spectator/index.html of the locked module and of main are byte-identical (diffed).
- `/WORLD/*` and the stub office (`/ops/whoami`, `/world/my-marks`, `/world/state`, `/world/apex`) come from the invented fixture.
- Browser: headless Chromium (Playwright), desktop 1280x900, phone 390x844 mobile+touch. The tour is suppressed by the viewer's own `pm_world_tour_seen:<handle>` key; no drawer, tour or column covers the target in any picture.

## Pictures (this directory)
Before (main `6928feab`): `before-desktop-1280-1-unfiltered.png`, `before-phone-390-1-unfiltered.png` — no Filters control; the huge hall's outline and every household's marks are in the map and the Telling list (desktop).
After (candidate `865e4e201`):
1. `after-*-1-unfiltered.png` — the Filters opener is present; nothing chosen = today's view, the same marks and list.
2. `after-*-2-panel-open.png` — my marks + parcels + under 80 m chosen; the popover (desktop) / sheet (390) is open, with the map still readable.
3. `after-*-3-filtered-chips.png` — "2 of 24 shown", chips my marks / parcels / under 80 m; the huge hall, the big orchard (over 80 m), other households' marks and the draft are gone from the map AND the Telling list; the household's two parcels remain.
4. `after-*-4-size-chip-removed.png` — the "under 80 m" chip removed (my marks + parcels remain).
5. `after-*-5-cleared.png` — clear all: identical to picture 1.
`*-states.json` has the DOM facts behind each picture (drawn pips, listed cards, chips, strip text).

## Limits
- The huge hall's stand-in picture (an existing public image) did not load offline; it shows as its outline.
- On a phone the Telling/Lately are not reachable (existing behaviour, `.wv-nav,.wv-view` hidden at <=720 px), so the 390 pictures show the map half only; the list half is shown on desktop.
- At 390 the Site's ☰ Postmark button sits under the Filters row and the Time travel pill floats above the map: that is the existing Site chrome (CORE-54's lane); nothing here touches it.
- Test results (this phase, run-heavy, 2G cap, one at a time): `viewer-display-filter` 6/6; `viewer-interior` 36/36, `viewer-occupancy` 16/16, `viewer-walk-hover` 5/5, `viewer-root-enter` 6/6, `enter-affordance` 14/14, `viewer-reconverge-exports` 11/11, `viewer-suites-in-ci` 3/3. `candle-boundary` and the sweep were not run (broad, held).
