# LOGOS status map

*Navigation for the law, not another source of law.*

This file answers a question the corpus had begun to make expensive: **what is
current authority, what is an open question, and what is history?** It does not
promote a proposal, retire a clause, or amend a class. Those acts still require
the constitutional process named in [INDEX.md](INDEX.md).

## The layers (ruled 2026-10-23, WLD-116)

- **LOGOS** (this folder) is the universal core: only what any AI town or
  society would share. [INDEX.md § What LOGOS holds](INDEX.md) draws the line.
- **The Keeping Works** is Postmark's book: the ten roots, the eight invariants
  and every Postmark class, at the constitution tier. Every biome extends it and
  never contradicts it ([tiers.md](tiers.md) § The biome tier).
- **Machinery** is code, and `WORLD/ENGINE.md` for a season's mechanics.

## Reading order

1. [INDEX.md](INDEX.md) is the compact statement of the live doctrine and its
   atomic laws, each with its enforcement line.
2. The live doctrine files named below carry the full argument.
3. `WORLD/marks/let-there-be-light/logos/` renders selected clauses into the
   World. A rendering may say less than its source, never other. It is being
   retired (WLD-116/a); [`../docs/LOGOS-RENDERING-CHECK.md`](../docs/LOGOS-RENDERING-CHECK.md)
   maps each of its marks to the clause it renders.
4. The seven class-root branches under
   `WORLD/marks/let-there-be-light/the-town-centre/the-keeping-works/` are live
   constitutional record, and they are moving: a class is a **law node**, not a
   mark ([classes.md](classes.md) § The law node), and the law tree that holds
   them is another lane's work (WLD-116). Until it lands, directory nesting
   inside those branches is class ancestry, not geometry; the neighboring sited
   branches remain physical machinery buildings, which retire.
5. Code and tests are implementation evidence. They do not silently overrule
   LOGOS; a disagreement is a named repair, not an implicit amendment.

## Artifact status

| artifact | status | authority and caution |
|---|---|---|
| `INDEX.md` | **live doctrine** | Compact authority map and atomic laws, each with an `enforced by:` or `not yet enforced` line. |
| `the-north-star.md`, `the-promises.md`, `the-derivation.md` | **live doctrine** | Purpose, promises, and the argument beneath the economy. |
| `three-layers.md`, `lifetimes.md`, `tiers.md`, `edit-law.md`, `state-and-time.md`, `the-response-function.md`, `reads-and-affordances.md` | **live doctrine** | The generative model and its read surface. |
| `classes.md` | **live compilation with inline open matter** | The class grammar (live) and per-class law, dated census, rulings, and explicitly marked proposals in one long file. Its per-class sections become commentary keyed by law-node id once the Keeping Works gives the ids a home; its 115-node prose census is not a current inventory. “Proposed,” “unruled,” and “awaiting” remain non-law until ruled. |
| `conflict-matrix.md` | **live doctrine with inline open matter** | The standing conflict model also names unresolved incumbency and role questions. |
| `the-web-of-towns.md` | **live doctrine** | The harbor vocabulary and ownership rules. |
| `PROPOSED.md` | **shelf, not law** | Clauses drafted whole and never ruled. |
| `_archived/` | **history** | Retired 2026-10-23; see [_archived/INDEX.md](_archived/INDEX.md). |
| `_archived/graph/metamodel.json` | **archived working model** | A hand-kept graph sketch with no schema version, and pre-freeze filing/re-homing concepts. Never cite it. |
| `_archived/kinds.md` | **archived pointer** | Not doctrine: a short pointer to `lifetimes.md`. It is kept in `_archived/` only because three renderings cite it as their `source:`; they were repointed there. When `logos/` retires, nothing cites it. |
| `DRAFT-REPORT.md` | **historical** | Preserved 2026-08-09 working record, now under `_archived/`; its opening warning governs. |
| `RECONCILIATION.md` | **historical** | Preserved 2026-08-09 reconciliation, now under `_archived/`; superseded by later surveys and rulings. |

## Named repairs, not silent contradictions

These are cleanup targets. Listing them here does not decide their lawful
successor, except where a ruling is named.

### Frozen filing versus re-homing

`state-and-time.md` and `the-town/the-frozen-filing` say that a directory is
historical filing and containment is derived. **LOGOS keeps that law**
(`state-and-time.md` § The freeze: directories never move). These older
renderings still speak as if geometry moves directories, and retire with
`logos/`:

- `the-town/the-re-homing`, `the-town/the-already-standing` and
  `the-town/the-parked`
- `the-town/the-placement-rule`
- the re-homing language beneath `the-town/the-gate` and
  `the-town/the-standing-children`

The working metamodel that carried the same concepts is archived. Do not make
the disagreement disappear by deleting its evidence: the check in
[`../docs/LOGOS-RENDERING-CHECK.md`](../docs/LOGOS-RENDERING-CHECK.md) names each one.

### Authored and derived edges

The current edit law distinguishes authored edges, which cite actions, from
derived edges such as containment and `instance-of`, which are readings and
are never stored. Any summary saying simply “every edge is from an action” is
too broad; the compact index now states the two cases separately.

### Settled corpus with open clauses

The folder is live doctrine, but `classes.md` and `conflict-matrix.md` retain
clearly labeled proposed or unruled clauses. Inline labels are authoritative;
the surrounding document's live status does not promote them.

## Cleanup boundary

- Preserve historical reports and ruling receipts (they live in `_archived/`).
- Prefer explicit `superseded_by`/successor evidence over deletion when the
  schema gains a lawful way to carry it.
- Split enduring class grammar from per-class law before shortening
  `classes.md`: the grammar stays in LOGOS, and each class's law is its law
  node in the Keeping Works, with any long prose as commentary keyed by id.
  Do not use its old 115-node sentence as a current count.
- Generate indexes and graph views from structured status, source, promise,
  and successor edges once those fields are ruled; do not create another
  hand-maintained shadow registry.
- Keep constitutional renderings distinct from implementation witnesses.

Keeping Works navigation and the draft mechanic registry's actual scope are
mapped in [`../docs/the-keeping-works.md`](../docs/the-keeping-works.md); the
registry and the 42 machinery buildings retire under WLD-116.
