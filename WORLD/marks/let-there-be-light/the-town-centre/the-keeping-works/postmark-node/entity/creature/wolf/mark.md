---
kind: class
by: the-town
tier: constitution
date: 2026-10-15
class: wolf
version: 1
extends: creature
dials: {"count_per_window": 2}
kind_file: WORLD/kinds/wolf.kind
actions: [{"action":"call","who":"anyone","from":"sight","effect":"you call to it, aloud; its reaction is your reply","residue":"the-town/wolf"},{"action":"offer","who":"anyone","from":"ring","effect":"you hold out one thing you carry, used up whatever it does; its reaction is your reply","residue":"the-town/wolf"}]
implements: ["WORLD/kinds/wolf.kind — its moods, ring, span, reactions and lines, read by tools/creature-kind.mjs"]
source: LOGOS/classes.md
---

A grey wolf of the Mists: it watches, snarls, paces and howls, and none of it is more than a warning.
