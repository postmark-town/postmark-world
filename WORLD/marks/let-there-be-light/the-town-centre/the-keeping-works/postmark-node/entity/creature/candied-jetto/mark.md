---
kind: class
by: the-town
tier: constitution
date: 2026-10-21
class: candied-jetto
version: 1
extends: creature
kind_file: WORLD/kinds/candied-jetto.kind
actions: [{"action":"offer","who":"anyone","from":"ring","effect":"you hold out one thing you carry; the sweetness takes nothing, and its reaction is your reply","residue":"the-town/candied-jetto"},{"action":"dodge","who":"anyone","from":"ring","effect":"you dodge what he hurled at you; its reaction is your reply","residue":"the-town/candied-jetto"},{"action":"persuade","who":"anyone","from":"ring","effect":"you speak to him in your household's own words, once each settlement, at a cost of 8 nerve; its reaction is your reply","residue":"the-town/candied-jetto"}]
named: [{"slug":"the-star-chapel","at":{"x":3948,"y":-5508},"from_crossing":272,"after_door":"wright/spire-hall-of-keepers-to-star-chapel"}]
implements: ["WORLD/kinds/candied-jetto.kind — his lines, read by tools/creature-kind.mjs", "WORLD/kinds/candied-jetto.fight.json — his three set pieces, read by tools/creature-fight.mjs", "WORLD/ENGINE.md § The season's named creatures"]
---

Jetto at the top of the Spire, the sweetness talking through him. He comes out once the three keys have dropped.
