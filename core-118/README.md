# CORE-118: entering the town root keeps the town

REPRODUCED ON A LOCAL FIXTURE; the prod report is Darko's. Nothing here is a production run, act, key or session.

Real local viewer (`spectator/server.mjs` from this repo) in headless Chromium (desktop 1280, phone 390 emulation), an INVENTED resident (`rig-actor`) acting-as, a stub office that answers the page's reads, and an INVENTED enter/exit ledger the page re-reads. Same fixture before and after; only the viewer differs (before = world main `777276be9`, after = this branch).

- `before-root-*`: the ledger holds an accepted enter of the world-root (`the-town/let-there-be-light`): the viewer mounts the root as a slate room ("Let There Be Light … step outside"); the town's ground, painting and people are gone.
- `after-root-*`: the same ledger: the town scene stays.
- `before-none-*` / `after-room-*` (and `before-room-*`): controls. No entry draws the town; an ordinary mark (`the-town/the-town-centre`) still draws its room with its exit, before and after, unchanged.
- `*-states.json`: what the page read (room ground/wall drawn, room card, exit button, town images, bodies drawn, no horizontal overflow, no page errors).

Limits: local, invented resident, ledger and stub office; headless emulation, not a physical phone; the town's painting comes from this clone's published record. The root-card hover (POS-1110/hover repair) and the 20-second act delay are other issues.
