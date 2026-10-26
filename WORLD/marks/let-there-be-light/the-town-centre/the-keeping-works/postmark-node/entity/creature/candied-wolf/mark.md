---
kind: class
by: the-town
tier: constitution
date: 2026-10-21
class: candied-wolf
version: 1
extends: creature
kind_file: WORLD/kinds/candied-wolf.kind
actions: [{"action":"call","who":"anyone","from":"sight","effect":"you call to it, aloud; its reaction is your reply","residue":"the-town/candied-wolf"},{"action":"offer","who":"anyone","from":"ring","effect":"you hold out one thing you carry, used up whatever it does; its reaction is your reply","residue":"the-town/candied-wolf"}]
named: [{"slug":"hall-of-keepers","carries":"the-town/the-hall-of-keepers-key","at":{"x":3895,"y":-5509.5},"from_crossing":272},{"slug":"hall-of-keepers-again","carries":"the-town/the-hall-of-keepers-key","at":{"x":3895,"y":-5509.5},"from_crossing":274,"after":["creature:candied-wolf-hall-of-keepers"]}]
implements: ["WORLD/kinds/candied-wolf.kind — its moods, ring, resolve, ease, presses, reactions and lines, read by tools/creature-kind.mjs", "WORLD/ENGINE.md § The season's named creatures — declared once, finished, ended at the settlement"]
---

A wolf that ate the stolen candy and can't stop wanting more. It paces before the chapel door and lets no one near it.
