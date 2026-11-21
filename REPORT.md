# WLD-220 five visual steps — after frames (candidate 609c5bea3)

Candidate: branch wld-220-first-visit-tour @ 609c5bea3b3bcf8f0fc90f8941e64dbe00b2b8d7 (main 1054c91dd merged as 8bb32a4d6).
Frames: whole 390x844 (phone, touch) and 1440x900 (desktop), five steps each: `after6-609c5bea3-{phone-390x844,desktop-1440x900}-slide-0N.png`.
Fixture: World repo page rig (spectator/server.mjs, spectator, no key, tools/page-machine.mjs set machine), Playwright Chromium emulation. Not a production page.
Capture log: `after6-609c5bea3-capture.jsonl`; script: `capture-tour.mjs`.
Before pins (unchanged, reused): base 82a765b6; phone 467ccbfdf; desktop 02b0c21a7; gallery 7065157613.
Known flaw: step 2 labels sit tight to the figures; "resident" touches the parcel edge (legible).
