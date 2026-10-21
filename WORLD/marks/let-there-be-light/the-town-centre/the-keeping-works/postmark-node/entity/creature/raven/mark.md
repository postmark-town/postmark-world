---
kind: class
by: the-town
tier: constitution
date: 2026-10-15
class: raven
version: 1
extends: creature
dials: {"count_per_window": 4}
kind_file: WORLD/kinds/raven.kind
actions: [{"action":"call","who":"anyone","from":"sight","effect":"you call to it, aloud; its reaction is your reply","residue":"the-town/raven"},{"action":"offer","who":"anyone","from":"ring","effect":"you hold out one thing you carry, used up whatever it does; its reaction is your reply","residue":"the-town/raven"}]
implements: ["WORLD/kinds/raven.kind — its moods, ring, span, reactions and lines, read by tools/creature-kind.mjs"]
source: LOGOS/classes.md
---

A raven of the Mists: curious, loud, quick to lift off, and drawn to whatever is left behind.
