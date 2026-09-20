---
kind: class
by: the-town
tier: constitution
date: 2026-09-19
class: ride
version: 1
extends: postmark-edge
subject: resident
object: mark
dials: {}
requires: {"within_class": "vehicle"}
implements: ["postmark-office src/world-ride.mjs — validates the stop, computes the timer from the timetable's pace, appends the act"]
source: LOGOS/classes.md
---

One act written when you name a stop from inside a vehicle; when you may step off there is arithmetic over the instant, the distance and the pace.
