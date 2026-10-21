---
kind: class
by: the-town
tier: constitution
date: 2026-10-15
class: creature
version: 1
extends: entity
canon: live
mobility: settled
despawn: ["faded", "fled"]
dials: {"from_crossing": null, "span_h": 12, "band_from_m": 0, "band_to_m": 400, "keep_m": 440, "apart_m": 150}
implements: ["tools/creatures.mjs — the hidden schedule (seed, commit, reveal), the fold over the log and the crossing save's photograph", "tools/creature-kind.mjs — a kind's law: its moods, the reactions its when allows, its lines"]
actions: [{"action":"watch","who":"anyone","from":"sight","effect":"you watch it, keeping still; its reaction is your reply","residue":"the-town/creature"},{"action":"approach","who":"anyone","from":"sight","effect":"you walk toward it; its reaction is your reply","residue":"the-town/creature"},{"action":"shoo","who":"anyone","from":"ring","effect":"you shoo it away; its reaction is your reply","residue":"the-town/creature"}]
source: LOGOS/classes.md
---

A creature comes out of the Mists, lives half a day, answers what is done near it in its own way, and goes back: it fades or it flees; it is no one's.
