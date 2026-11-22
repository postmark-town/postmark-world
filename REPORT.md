# WLD-220 FIX — frames at candidate a7f3314e64741e629e85bb78495058aa6c08285e

Branch wld-220-first-visit-tour; the FIX is on top of 064f368e178e7ba8b4c59d35c30bcaa7c610c5de. Main is NOT re-merged (no conflicts reported by the PR).
Fresh immutable frames (do not relabel the older after6-609c5bea3-* set; those are the superseded candidate): `fix-a7f3314e6-*.png`, 16 in all.
- normal: `fix-a7f3314e6-{phone-390x844,desktop-1440x900}-slide-0N.png` (5 + 5)
- shared fallback (marks step, picture refused): `fix-a7f3314e6-{phone-390x844,desktop-1440x900}-fallback-marks.png` (2)
- short modes, step 2 at the card area's top and at its end: `fix-a7f3314e6-{phone-844x390,desktop-1440x480}-step2-{top,end}.png` (4). Nothing overflowed at step 2 (scrollTop 0, scrollHeight == clientHeight), so top and end read alike: the card fits whole.
Bounds/readbacks: `fix-a7f3314e6-capture.jsonl`; script: `capture-fix.mjs`. Fixture: World page rig (spectator/server.mjs, signed in as nobody, tools/page-machine.mjs machine), Playwright Chromium emulation, real shelf except the two fallback frames.
Older before pins: base 82a765b6; phone 467ccbfdf; desktop 02b0c21a7; gallery 7065157613.
