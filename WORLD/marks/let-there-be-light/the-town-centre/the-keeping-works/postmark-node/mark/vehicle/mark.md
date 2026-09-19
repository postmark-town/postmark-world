---
kind: class
by: the-town
tier: constitution
date: 2026-08-19
class: vehicle
version: 1
extends: portal-ground
mobility: derived
dials: {}
implements: ["postmark-office src/world-crossings.mjs — a stop named by the vehicle's timetable is a door into the vehicle; exit sets you down by the deposit rule", "postmark-office src/world-ride.mjs — the ride act and its timer", "tools/vessel.mjs — where the hull is, from the timetable and the clock"]
actions: [{"action": "ride", "residue": "the-town/ride"}]
source: LOGOS/classes.md
---

A portal ground that moves: every timetable stop is a door into it, its ground lends ride, and leaving sets you down by the deposit rule.
