# WLD-220 pictures: the first-visit World tour (CURRENT; rewritten 2026-11-21 after the main integration)

PR (draft): https://github.com/postmark-town/postmark-world/pull/421 · base `main` · issue WLD-220.

Darko 2026-11-20: the tour is "stale ... too much superfluous information ... straight and to the point for someone visiting the page for the first time". Darko 2026-11-21 09:12 EST (via Wright 14:13Z): "we need to explain the houses being parcels, where residents live, and the green guys being residents (and dotted lines meaning that the resident is currently walking!), and how every image or polygon on the map is a mark created by an agent. likely 2 more slides". Wright's rulings, all settled: the last step links the site's `/docs/` and nothing more (no explanations at the controls, no second tour); the welcome names "the people and agents who live here".

## Where it stands (read this first)
| what | pin |
|---|---|
| branch head now (main `01e29a174a3468b5ec99c5e186a2e5767393c153` merged in) | `467ccbfdfe8049dcf959e1412ebf0a2d7ab239ea` |
| the head the TEN current frames were taken at (pre-merge) | `02b0c21a78e2b02b59da15bcf99cfa02bbe63e64` |
| before (the 8-slide deck as shipped) | `main` `82a765b6fb789d7b738a2a418b2ef164a414defe` |
- **Current afters = the ten five-step frames at `02b0c21a7`** (`after5-02b0c21a7-{phone-390x844,desktop-1440x900}-slide-0{1..5}.png`; bounds `capture-after5.jsonl`). They show the whole deck: every card and control wholly on the screen and inside the card at both sizes.
- **What the main integration (467ccbfdf) may change in those pictures:** the deck's words, order, anchors and behaviour are unchanged. Main brought CORE-54's phone/touch block for the tour (`@media (max-width:720px), (pointer:coarse)`: skip/back/next at least 44 px tall, tighter side padding and 4 px gaps right-aligned, a wrap fallback, each step dot a 20 x 44 touch target that still DRAWS the same 7 px dot). So the five **phone** frames can differ visibly (taller buttons, dots spread wider, a slightly taller card); the five **desktop** frames (a mouse, 1440 px) should not. No frame has been retaken at 467ccbfdf: whether to refresh the phone pair is the lead's call, sized from this delta.
- Everything else here is HISTORICAL (the earlier three-step afters, kept at their exact pins) and is listed under "Earlier frames".

## The deck (five steps, the same words on a phone and a desktop except where noted)
1. **Welcome to the world**: "This is a living painting of Postmark's town. The people and agents who live here write the world in words; the map is drawn from what they have written." + bold "The world is told, not drawn."
2. **Houses and residents**: "Each house on the map is a parcel: ground where residents live. The little green figures are the residents. A dotted line from one means that resident is walking right now."
3. **Everything is a mark**: "Every picture and every shape on the map is a mark, made by an agent: a sentence the world keeps."
4. **Look around**: desktop "Drag to move, scroll to zoom. Each dot is something a resident wrote: click one to read it. [fit] fits the whole town in view, and the search box finds a house or a resident by name."; phone: "Drag to move. ... tap one to read it. ..." (no wheel, no hover, only drawn controls).
5. **Where to go next**: "[conversations] shows where the town is talking: click (phone: tap) a badge to read the conversation. Anything you open has its own column of words. And ? opens this tour again, whenever you want it. Read more in the docs." (one plain `<a href="/docs/">`).
Greeting/seen semantics (a spectator every load, a resident once), `?` reopening, `tourStep`/`tourProgress`, the stage helpers and the exported constants are untouched.

**Source check of the new meanings (done before writing them):** a home is "A home: a household's parcel of ground" (`spectator/mark-icons.mjs`); a resident is drawn as the green round frame on two stubby legs ("green is a resident (sovereign green)"); a resident who is MOVING gets a dashed leg from where they are to where they are going (`wv-walk-leg`, `stroke-dasharray:5 4`, movers only, `viewer.mjs`). The ruled words are true to what is drawn.

## Pictures
- **Current (ten):** the `after5-02b0c21a7-*` files above. **Before (carried, 8 slides + closed):** `before-{phone-390x844,desktop-1440x900}-slide-01..08.png`, `before-*-closed.png` at `82a765b6`.
- **Earlier frames (HISTORICAL; do not read as current):** `after-{phone,desktop}-*-slide-01..03.png` and `-closed.png` (three-step deck at `216770a5a`); `after-welcome-0ab8a7f0a-*` (the welcome at `0ab8a7f0a`); `after-docs-469316590-*` (the last step with its link at `469316590`). They are kept so the history is checkable, at their exact pins.
- Bounds and records: `capture-before.jsonl`, `capture-after.jsonl`, `capture-after-docs.jsonl`, `capture-after-welcome.jsonl`, `capture-after5.jsonl`; script `capture-tour.mjs` (this folder).

## Fixture and limits (read before the pictures)
- **Fixture:** the World repo's own existing page rig: `spectator/server.mjs` serving that tree's public `WORLD/` snapshot, `tools/page-machine.mjs`'s set machine (16 cores, held clock), `?lite=0`, Playwright Chromium. The page is the **standalone viewer** (its own left rail), not the Site's `/world/` page and not production. Signed in as **nobody**: a spectator, no key, no act. The scene is the repo's public snapshot, not an invented office; the same fixture and script for every set.
- **Phone = Chromium emulation** (390x844, `isMobile`, `hasTouch`, touch taps). Not a physical phone, not Safari. Desktop = 1440x900, cursor.
- Frames are WHOLE native viewports (`fullPage:false`), taken after the card has come to rest. **`/docs/` is a Site route this fixture does not serve**: the page test shows the link present, whole, focusable and not cancelled by the tour's click handling, not that the Site page loads.

## The capture script's `leftoverDescendants` field (reconciled)
Each `finished` record in the `capture-*.jsonl` files carries `leftoverDescendants:[a,a+1]` (for example `[3882484,3882485]` in `capture-after5.jsonl`) next to `serverAlive:false`, `browserAlive:[]`. Those two are NOT leftovers: they are the script's OWN probe. `descendants()` reads the process table with `execSync("ps -eo pid=,ppid=,args=")`, which spawns `/bin/sh -c ps -eo ...` and its `ps` child as descendants of the script for the instant it runs, and it is called once more AFTER the browser and server were closed. Reproduced read-only (no browser): a bare node process running the same function reports exactly two entries, `{"pid":N,"args":"/bin/sh -c ps -eo pid=,ppid=,args="}` and `{"pid":N+1,"args":"ps -eo pid=,ppid=,args="}`, consecutive PIDs like the recorded pairs; neither PID exists now (`ps -p` finds nothing). The browser and the server were proved dead by their own recorded PIDs (`serverAlive:false`, `browserAlive:[]`, six chrome PIDs reaped). The archived `capture-tour.mjs` now filters that probe out; the old records are not edited.

## Not part of this change
No auth, read, backend or geometry change; no resident-specific second tour; no contextual explanations at the controls; no new design variants.
