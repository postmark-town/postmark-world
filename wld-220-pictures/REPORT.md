# WLD-220 pictures: the first-visit World tour, before and after

Darko 2026-11-20: the tour is "stale ... too much superfluous information ... straight and to the point for someone visiting the page for the first time". Wright 2026-11-21 04:29Z queued it as a draft with whole-frame 390 and 1440 before/after pictures. This is a first DRAFT for Darko's look, not a final shape ruling.

PR (draft): https://github.com/postmark-town/postmark-world/pull/421

## Pins
- **BEFORE** = `postmark-world` `origin/main` **82a765b6fb789d7b738a2a418b2ef164a414defe** (a detached `git worktree` of that commit; the 8-slide deck as shipped).
- **AFTER** = branch `wld-220-first-visit-tour` head **216770a5ae1b908f444f45507c231df769b6e0f6** (main 82a765b6 + the tour commit 8e6256659 + a page-test settle fix 216770a5a). The only product file changed is `spectator/viewer.mjs` (the deck and one renderer line).

## Fixture and limits (read before the pictures)
- **Fixture:** the World repo's own existing page rig: `spectator/server.mjs` serving that tree's public `WORLD/` snapshot, `tools/page-machine.mjs`'s set machine (16 cores, held clock), `?lite=0`, Playwright Chromium. The page is the **standalone viewer** (its own left rail), not the Site's `/world/` page and not production. Signed in as **nobody**: a spectator, no key, no resident act, no sign-in. ATLAS_ORIGIN pointed nowhere. The scene is the repo's snapshot (public record), not an invented office; the same tree, same fixture, same script for before and after, so the only difference between the two sets is the deck.
- **Phone = Chromium emulation** (390x844, `isMobile`, `hasTouch`, taps by Playwright's touch). Not a physical phone, not Safari. Desktop = 1440x900, cursor.
- Frames are WHOLE viewports (`fullPage:false`), every slide, in order, taken after the card has glided to its step. Actual bounds of the card, the dots, skip/back/next per slide are in `capture-before.jsonl` / `capture-after.jsonl` (every slide before and after has the card and every control wholly on the screen and inside the card).
- Capture script: `capture-tour.mjs` (this folder). It started its own server and browser, ended them on every exit, and printed their PIDs and that none was alive after.

## What changed
Eight slides (45 to 80 words each) become **three short shared steps** (32 to 36 words each): **1 Welcome to the world** (what this living painting is) / **2 Look around** (how: drag and scroll/click on a desktop, drag and tap on a phone, the fit button and the search) / **3 Where to go next** (the conversations lens, and the `?` that brings the tour back). The phone gets its own wording for steps 2 and 3 (`phoneBody`): it is told drag and tap, never a scroll wheel, a hover or a cursor, and only controls that are drawn. Greeting semantics are untouched (a spectator every load, a resident once, `?` reopens); `tourStep`, `tourProgress`, the stage helpers and the exported constants are intact.

## Before (8 slides) and after (3 slides), phone then desktop
Files: `before-phone-390x844-slide-01.png` .. `-08.png`, `before-phone-390x844-closed.png`; `after-phone-390x844-slide-01.png` .. `-03.png`, `after-phone-390x844-closed.png`; the same names with `desktop-1440x900` for the desktop.

## What was cut, and where it is said now (named, not hidden)
The greeting no longer teaches: **the three claim colours, stamps, Act As, the Telling, the walk desk**, or the resident count. These are not in the first-visit deck, by design (a visitor should look before reading law). Where each is reachable today, as far as I found: the Telling and Act As are controls on the desktop rail with their own labels; a mark's column shows its tier and, where a stamp count exists, a tooltip ("stamps staked behind it"); stamps have a Site page, `/docs/stamps/`, which the World page does not link; **claim colours, Act As and the Telling have no longer explanation reachable from the page** that I could find. That is the one specific gap this draft returns (see the hand-in); I did not invent a road or a URL.

## Not part of this change
No auth, read, backend or geometry change; no resident-specific second tour; no new design variants; the tour's controls' sizes are CORE-54's (a separate open PR, not on this main).
