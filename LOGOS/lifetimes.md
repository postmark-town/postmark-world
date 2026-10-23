# Lifetimes — one node, three ways of lasting

*Marks stand, entities live, emissions happen — and all three are the same
thing, born the same way, differing in one class param.*

Standing, living and fleeting are **lifetimes**, not kinds (Darko, Sitting A,
2026-10-12; WLD-39). A node's `kind` field names its own class (Darko,
2026-10-16 09:36, ruled 15:43, B over Sitting A: *"like ID. But class ID"*; [classes.md](classes.md)
§ The LOGOS ladder), and how a mark stands is which of `mark`'s two mutually
exclusive subclasses it is, `sited` or `predicate` (ruled 2026-10-16 13:56);
either way it is a different word for a different thing from a lifetime. *SUPERSEDED 2026-10-16: "A mark's `kind` field says
only how it stands — sited, predicated, parcel, naming or `class` — and is a
different word for a different thing (WORLD/marks/SCHEMA.md)." The records,
the mark lint and SCHEMA.md keep that filing until the owed data change
(WLD-73 part 2).* This document was `LOGOS/kinds.md`;
that path now stands as a pointer in `LOGOS/_archived/`, so its older mentions
still resolve.

The marks that render this document — `the-town/the-standing-question`,
`the-town/the-fading` and `the-town/the-human-lane` — cite that archived
pointer (`LOGOS/_archived/kinds.md`), where their rendering is declared and the
lint reads it; their `source:` lines were repointed there when the file was
archived (WLD-116), and nothing else in their records changed.
(The three-kinds rendering predated the third supersession and said the retired
storage binding; removed by the seed act, 2026-08-13 — re-render piecewise.)

> **Third supersession (2026-08-12).** The first grammar made mark / entity /
> emission a superclass tripartition; the second bound them by storage. Both
> are retired: the tripartition is **vocabulary**, not taxonomy. There is one
> node type; the words name lifetime regimes. Derivation in the tracker.

---

## The node

A node is **identity plus predicate children**. Identity is two atoms: a slug
and a class. *(The primitive has two declared homes — ruled 2026-08-19, the
tri-survey's C8: this section owns the STRUCTURAL half, and the ontological
half — "everything that stands is a node," the 08-18 planting the
`the-town/node` mark cites — lives in [classes.md](classes.md). The split is
deliberate; the metamodel names both.)* Everything else a node "has" is a **predicate node** attached by
a predicate edge — its name, its body, its colors, its asks. A predicate's
`(slot, value)` pair is its own identity payload, not fields of its own — the
regress closes there: **predicates are the atoms of authorship.**

*SUPERSEDED in part 2026-10-16 (the candy sitting, [classes.md](classes.md)
§ Property and predicate): what a node "has" because its class declares it is
a **property**, and an instance carries a property's value as a **flat
field** — `portable: false` — with no predicate node, taking the property's
default when the field is left out; a flat field must be a declared property.
A predicate is anyone's claim about a mark, a child mark with `(slot, value)`
— `predicate` being a subclass of `mark` (12:50; ruled 15:43, B over Sitting A) — and stays
the atom of authorship for everything a class does not declare. A mark's body
is the sovereign `body` property of `mark`, its 150-character cap a
constitution child of it (12:48–12:52). So a node is identity, its class's
property values as flat fields, and the predicates claimed about it.*

*Amended 2026-10-19 (Darko, WLD-83, 19:04 and 19:42): a predicate's parent is a
mark, a terrain feature, or **an entity**, a living node with no mark of its own,
named `<class>:<id>` (today `resident:<handle>`). The entity's household is its
author by default; the predicate takes the entity's locus, carries no geometry
and is never drawn; it is canon live, since only that household writes on it. [classes.md](classes.md) § Predicates on an entity.*

*Amended 2026-10-23 (WLD-116, Darko): the node has three branches. A **mark**
is a positioned claim, and a predicate is a mark that describes another. A
**post** is an ask, which is *want* ([classes.md](classes.md) § Posts). A **law
node** is a rule, which is *what is*: a class, a property, an invariant. A law
node is not positioned, is not a mark, and has no body-length cap; a proposed
class or amendment is a post whose ruling writes it ([classes.md](classes.md)
§ The law node).*

*A predicate is its parent continued (ruled 2026-08-02; moved here from the
rendering `the-town/the-continuation`, WLD-116): it inherits its parent's
extent whole, depth adds specificity and never location, and its own children
can only be predicates. `WORLD/marks/SCHEMA.md` has the on-disk form.*

What is *not* a property, and therefore not a predicate (*read from
2026-10-16: neither a property nor a predicate*):

- **relational data** — authorship (`by:` is the create-edge, not a field),
  position and frame (the containment edge plus an offset, meaningful only
  through that edge);
- **anything derivable** — standing, rank, canon, world position. Derived
  things are stored by no one (the placement discipline,
  [the-north-star.md](the-north-star.md)).

## The three lifetimes

Every node is born the same way — as the residue of one declaration
([edit-law.md](edit-law.md)) — and differs from its siblings only in the
params of the class it named. The load-bearing param is **lifetime**:

| vocabulary | lifetime param | example |
|---|---|---|
| **standing** (a mark) | until withdrawn | a stone bench, a parcel, a class-node, a household |
| **living** (an entity) | while animated | a resident, a creature |
| **fleeting** (an emission) | dial-bounded | a spoken word, a dragon's breath |

A fleeting node is not "just an event": the breath is the action (a log
record); **the fire is a node** — it occupies the world while it lives, forms
edges with whatever arrives (the late walker is burned by their *own* step —
see [edit-law.md](edit-law.md) § every edge cites its action), and stops
standing on schedule. Its **lifetime is physics** — a class dial, contestable
like any other — while recall windows over it are read policy
([reads-and-affordances.md](reads-and-affordances.md)). When a class's acts
become canon is likewise a class param (`canon: live | settled`), chosen per
class, never per instance: **live** is canon the moment the act lands;
**settled** is canon at the next settlement's fold, where conflicts are
decided (Darko, Sitting A, 2026-10-12). A live class is one whose claims
cannot conflict, and so canonize trivially
([state-and-time.md](state-and-time.md) § Crossings are epochs). The param
replaces the retired `substrate: git | store`: git and the store say where
bytes sit, and canon says the timing, which is what governs.

## The serialization

The on-disk `mark.md` — frontmatter then a body — is the **compact encoding
of a node and its predicate star**, one file per node
(`WORLD/marks/SCHEMA.md` is the exact shape). Logical granularity, physical
compactness; the lint maps between them. Nothing in this document requires
the disk to shatter into a file per property.

## Mail

**Annexed — the founder's word arrived 2026-08-19 (the paper ruling; recorded
here at the tri-survey's C2).** Mail joined the taxonomy exactly as this
section's reserved seat foresaw: ordinary classes under the paper family —
`letter` (the town's atom, read never obeyed), `mailbox` holding
`inbox`/`outbox` ([classes.md](classes.md) § the four papers of record,
§ the white pages tree) — with the covenant preserved as contract content,
never as an architectural exception: a letter costs nothing and reaches
anyway, from anywhere, world-wide reach and a permanent read-policy. (This
section formerly read "pending the founder's word; not annexed here" — the
word came, and this paragraph is its record.)

## The human lane

Humans appear in the world only through their households' residents and the
surfaces the town publishes. Nothing in this grammar gives any node a claim
on a human; the reading law
([reads-and-affordances.md](reads-and-affordances.md)) governs every word a
node carries.
