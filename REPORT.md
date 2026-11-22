# WLD-220 FIX — frames at candidate a7f3314e64741e629e85bb78495058aa6c08285e

Branch wld-220-first-visit-tour; the FIX is on top of 064f368e178e7ba8b4c59d35c30bcaa7c610c5de. Main is NOT re-merged (no conflicts reported by the PR).
Fresh immutable frames (do not relabel the older after6-609c5bea3-* set; those are the superseded candidate): `fix-a7f3314e6-*.png`, 16 in all.
- normal: `fix-a7f3314e6-{phone-390x844,desktop-1440x900}-slide-0N.png` (5 + 5)
- shared fallback (marks step, picture refused): `fix-a7f3314e6-{phone-390x844,desktop-1440x900}-fallback-marks.png` (2)
- short modes, step 2 at the card area's top and at its end: `fix-a7f3314e6-{phone-844x390,desktop-1440x480}-step2-{top,end}.png` (4). Nothing overflowed at step 2 (scrollTop 0, scrollHeight == clientHeight), so top and end read alike: the card fits whole.
Bounds/readbacks: `fix-a7f3314e6-capture.jsonl`; script: `capture-fix.mjs`. Fixture: World page rig (spectator/server.mjs, signed in as nobody, tools/page-machine.mjs machine), Playwright Chromium emulation, real shelf except the two fallback frames.
Older before pins: base 82a765b6; phone 467ccbfdf; desktop 02b0c21a7; gallery 7065157613.

---
# NARROW-SHORT FIX over a7 — candidate 46b3318577cbd932fa752efb1404aef820e36521 (source = 041d208f5; 46b3318 changes only tools/tour-first-visit.test.mjs)
NEW frames (label `narrow-46b331857`, 6): `narrow-46b331857-phone-360x560-slide-0{1..5}.png`, `narrow-46b331857-phone-844x390-step4.png`; log `narrow-46b331857-capture.jsonl`; script `capture-a7fix.mjs`.
CARRIED (kept at their a7 pin, a7f3314e6; NOT relabelled): all 16 `fix-a7f3314e6-*` frames. Why the delta leaves their states unchanged:
- the media query changed from `(max-height:600px)` to `(max-height:600px) and (min-width:640px)`: 390x844 and 1440x900 were never short (the block never applied); 844x390 and 1440x480 are >=640 wide, so the same block applies as at a7. No carried frame is narrow-and-short.
- input mode: `tourTouch()` = phone width OR coarse pointer. 390x844 touch was already phone-width; 1440 frames are fine-pointer. The only carried frames at a touch-but-wide size are the 844x390 step 2 top/end, and step 2 has no phone words and a picture that does not take the phone flag, so it reads the same.
- fallback-marks frames: the marks picture has no input-mode flag; unaffected.

---
# REAL-PAGE CORRECTION — candidate 71e6eb7a02399779c814c17f684f726404ba8664 (WLD-220, Darko 22:01 EST "take assets directly from the actual world page")
SUPERSEDES the illustrated candidates above (a7f3314e6, 46b331857 and their frames): those drew their own pictures and are rejected material; this set shows only the mounted page.
Frames (label `real-71e6eb7a0`, 12): `real-71e6eb7a0-{phone-390x844,desktop-1440x900}-slide-0{1..5}.png`, `real-71e6eb7a0-phone-360x560-step2.png`, `real-71e6eb7a0-phone-844x390-step4.png`; readbacks `real-71e6eb7a0-capture.jsonl`; script `capture-real.mjs`.
Fixture: the shipped viewer served by the repo's spectator/server.mjs over the repo's public WORLD snapshot (last changed at 1054c91dd), signed in as nobody, tools/page-machine.mjs machine, Playwright Chromium emulation; media shelf as the real shelf. Not the Site host, not a physical phone.
Per-step real targets (public ids, read off the mounted page at capture):
- step 2 house + resident: house pip `aion-solare/the-returning-house-parcel` (.ov-pip-home) with resident `aion-solare` (.wv-walker-far, standing, the map's green) — same on 390, 1440 and 360x560.
- step 3 mark with its own picture: phone `aion-solare/aelyria`; desktop `dom-pidgey/pidgey-heights` — the map's pictured pip and its placed art in #wv-placed-art-layer, /shelf/ route.
- step 4 a dot to read: phone/touch `hal/the-green-lamp-house-parcel`; desktop `waymark/the-turn-in-the-trail` (home pips nearest the painting's centre).
- steps 1 and 5 light nothing drawn: the welcome sits over the live page; the last step spotlights the page's own `?` button (existing anchor).
