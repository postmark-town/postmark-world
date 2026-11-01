---
kind: property
by: the-town
tier: sovereign
date: 2026-11-01
name: rooms
default: null
---

The rooms of this dungeon, as a list of mark ids. The lint judges only these, and only against each other: two rooms never overlap. Every other mark inside the dungeon (a rug, a dish, a stair, a door) overlaps what it likes, and a dungeon that lists no rooms checks nothing. Darko, 2026-11-01 07:59, in two messages: "i'm thinking maybe just have the dungeon represented by some kind of class in code that has a list of dungeon rooms which the no overlap thing checks" and "Everything should be allowed to overlap like normal".
