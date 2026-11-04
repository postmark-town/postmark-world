# The logos/ rendering check

*WLD-116, lane 1, item 7. Prep for retiring the lowercase `WORLD/marks/let-there-be-light/logos/` tree (Darko 2026-10-23: /a stands). This check retires nothing. Measured against postmark-world `main` at d9fc5dac plus this branch's LOGOS text.*

## Result

The tree holds **86 marks**. 25 cite a `source:` and are held to it both ways by `tools/mark-lint.mjs` § 9; **61 cite none**, so no lint ever looked at them. Each of the 61 was read against `LOGOS/` and the standing logos beside it (`WORLD/ENGINE.md`, `WORLD/marks/SCHEMA.md`, `READS.md`, `WRITES.md`).

| outcome | marks | what happens |
|---|---:|---|
| matched | 20 | a LOGOS clause already says it; nothing to move |
| MOVED to LOGOS | 5 | law that stood only here, now in LOGOS (this PR) |
| covered outside LOGOS | 5 | stated in SCHEMA.md or ENGINE.md, which are Postmark's disk format and machinery; nothing to move |
| OWED | 4 | Postmark-specific law found only here; it is not LOGOS (the universal core), so it is handed to the Keeping Works (lane 2) or ENGINE.md with its sentence below |
| dropped | 4 | contradicted by a ruled LOGOS clause or dead pre-freeze machinery; not carried |
| code pointer | 23 | a `fn:` predicate with a `mechanic_draft:` (no code reads it); no law of its own |

**Contradictions: two families, as the audit said, and LOGOS keeps one side.** `the-re-homing`, `the-parked`, `the-placement-rule` (and the re-homing language that STATUS.md names beneath `the-gate` and `the-standing-children`) say a mark's directory moves to match its containment. `the-frozen-filing` says it never does. **LOGOS keeps `the-frozen-filing`**, because `state-and-time.md` § The freeze (ruled 2026-08-25) says directories never move and the re-home pass was deleted. The re-homing marks retire with `logos/`. They are not carried anywhere.

## What changed in LOGOS because of this check

- `LOGOS/lifetimes.md` § The node: a predicate is its parent continued (from `the-continuation`).
- `LOGOS/reads-and-affordances.md` § Disclosure, and the forecast: `the-disclosure` and `the-forecast`.
- `LOGOS/state-and-time.md`: the record stays prose, bytes live behind one door, byte accounting is machinery (from `the-media` and `the-byte-accounting`).
- `LOGOS/classes.md`: the logos portal's passage now says the quarter retires.

## OWED: law found only in logos/ that is Postmark's

These are not LOGOS under the 2026-10-23 line (a society that has never heard of Postmark would not need them). They are written here so nothing is lost when `logos/` retires. The destination is for lane 2 or a follow-up; neither is in this PR.

- **`the-fractal`, `the-root-case`** (Keeping Works, `postmark-economy`): *every stamp interaction the town offers as a whole it offers at every node: weight, equity, asks and ballots recurse down the containment tree. The town's economy is the root node's own instance: the root's weight is every stake fanned up, its equity every keeping record, its pots the town's own.*
- **`the-household-grain`** (Keeping Works, a media law node): *media is a household's own: one wall per household, one size for all; the uploading hand rides every row, and no other house writes on your wall.*
- **`the-sounding`** (`WORLD/ENGINE.md`): *still water is told from the crossable; a leg either finds a named crossing or turns back.* The four `fn:` pointers under it name `tools/water.mjs`.

## The 61 unsourced marks

| mark | date | its claim | the LOGOS clause it renders | action |
|---|---|---|---|---|
| `the-town/the-continuation` | 2026-08-02 | a predicate inherits its parent's extent completely | [lifetimes.md](../LOGOS/lifetimes.md) § The node (new paragraph); also `WORLD/marks/SCHEMA.md` § the continuation law | **MOVED to LOGOS** — LOGOS only passed it by (classes.md § Predicates on an entity). One sentence added. |
| `the-town/the-disclosure` | 2026-08-18 | refuse or disclose absent inputs; never quietly substitute | [reads-and-affordances.md](../LOGOS/reads-and-affordances.md) § Disclosure, and the forecast (new) | **MOVED to LOGOS** — No LOGOS clause said it. |
| `the-town/the-drawn-land` | 2026-08-01 | root and terrain come by extraction | `WORLD/marks/SCHEMA.md` § The root and terrain are generated, not hand-typed | **covered outside LOGOS** — Postmark disk format, not universal law. |
| `the-town/the-entry` | 2026-08-18 | an entry is written once; the anchor derives | [classes.md](../LOGOS/classes.md) § The rules (consent-at-thresholds: entry law) and § The two constitutionalities (entry-law, exit-law); [edit-law.md](../LOGOS/edit-law.md) § The constitutive flip | **matched** — Residue with no clause: "the light has no outside" (the world root contains everything). Nothing is lost; it is a consequence of the root. |
| `the-town/the-fold` | 2026-08-01 | canon is what the fold publishes at the crossing | [INDEX.md](../LOGOS/INDEX.md) atom 15; [conflict-matrix.md](../LOGOS/conflict-matrix.md) § Market and canon | **matched** |
| `the-town/the-canon-fold` | 2026-08-01 | canon is computed fresh each time | [state-and-time.md](../LOGOS/state-and-time.md) § The log is the only stored truth ("same log, same derivation, same world, on any clone"); INDEX atom 8 | **matched** |
| `the-town/the-canon-computation` | 2026-08-01 | tools/marks-fold.mjs::fold | none: names `tools/marks-fold.mjs::fold` | **code pointer, no law** |
| `the-town/the-mark-loader` | 2026-08-01 | tools/marks-fold.mjs::loadMarks | none: names `tools/marks-fold.mjs::loadMarks` | **code pointer, no law** |
| `the-town/the-placement-rule` | 2026-08-01 | tools/marks-fold.mjs::placementParent | contradicted by [state-and-time.md](../LOGOS/state-and-time.md) § The freeze (a new mark files at its id; containment is derived) | **dropped (contradicted)** — Member of the re-homing family; see below. Its `fn:placementParent` still exists in code, but the directory it decides is no longer a claim. |
| `the-town/the-class-rule` | 2026-08-09 | one walk decides a mark's standing | [INDEX.md](../LOGOS/INDEX.md) atom 11; [tiers.md](../LOGOS/tiers.md) § Tier is not a field | **matched** |
| `the-town/the-class-walk` | 2026-08-01 | tools/mark-standing.mjs::markStanding | none: names `tools/mark-standing.mjs::markStanding` | **code pointer, no law** — Its body (a guest at a doorstep stays a market guest) is the welcome default in tiers.md § Conferral. |
| `the-town/the-geometry-primitives` | 2026-08-01 | one shape, one containment test | `WORLD/ENGINE.md` § Laws honored ("ONE `loadMarks` and ONE `contains`") | **covered outside LOGOS** — Machinery. |
| `the-town/the-containment-test` | 2026-08-01 | tools/geometry.mjs::contains | none: names `tools/geometry.mjs::contains` | **code pointer, no law** — The 99% overlap is stated in `WORLD/marks/SCHEMA.md` § The one tree. |
| `the-town/the-forecast` | 2026-08-18 | a forecast is a reading, never a judgment | [reads-and-affordances.md](../LOGOS/reads-and-affordances.md) § Disclosure, and the forecast (new) | **MOVED to LOGOS** — No LOGOS clause said it. |
| `the-town/the-fractal` | 2026-08-23 | the whole's stamp interactions stand at every node | none in LOGOS. The principle is named in `postmark-blueprints` `documentation/the-idea-lifecycle.md` | **OWED to the Keeping Works / ENGINE.md** — Postmark stamp economy: every stamp interaction offered to the whole is offered at every node. Belongs to the Keeping Works (`postmark-economy`). |
| `the-town/the-root-case` | 2026-08-23 | the town's economy is the root node's own instance | none in LOGOS | **OWED to the Keeping Works / ENGINE.md** — Same: the town's economy is the root node's own instance. Keeping Works. |
| `the-town/the-gap` | 2026-08-18 | nodes speak first; machinery closes the gap | [three-layers.md](../LOGOS/three-layers.md) § The binding channels (the gap is a named entry on the cleanup list); [conflict-matrix.md](../LOGOS/conflict-matrix.md) § Trueing | **matched** |
| `the-town/the-gate` | 2026-08-01 | no malformed mark enters; an edge cannot lie | [edit-law.md](../LOGOS/edit-law.md) § The constitutive flip (admissibility is judged at the gate; an edge cannot lie) | **matched** — The malformed-mark check itself is `tools/mark-lint.mjs`, machinery. Its "a mark whose containment lies is refused" is the pre-freeze check, repealed by state-and-time.md § The freeze, so that phrase is stale, not law. |
| `the-town/the-initiator` | 2026-08-18 | enabled is the law's answer; what cannot begin is hidden | [reads-and-affordances.md](../LOGOS/reads-and-affordances.md) § Verbs show only when usable | **matched** |
| `the-town/the-logos-portal` | 2026-08-18 | the-town/node | [classes.md](../LOGOS/classes.md) (the 2026-08-18 portal passage) | **matched** — The portal retires with `logos/`; classes.md now says so beside the passage. |
| `the-town/the-media` | 2026-08-24 | bytes live behind one door; the record stays prose | [state-and-time.md](../LOGOS/state-and-time.md) § The log is the only stored truth (new paragraph: the record stays prose; bytes live behind one door) | **MOVED to LOGOS** — The law "the doors have been quoting from a file header" had no LOGOS home. |
| `the-town/the-byte-accounting` | 2026-08-24 | quotas are machinery, never record | same paragraph of state-and-time.md (byte accounting is machinery, never record) | **MOVED to LOGOS** |
| `the-town/the-household-grain` | 2026-08-24 | a household's wall is its own | none in LOGOS. `WRITES.md` and the office door carry the wall | **OWED to the Keeping Works / ENGINE.md** — One wall per household, one size for all, the uploading hand on every row. Postmark's choice: a media law node in the Keeping Works. |
| `the-town/the-one-claim` | 2026-08-02 | one mark carries one claim | [classes.md](../LOGOS/classes.md) § Property and predicate (`body`, with its constitution child `character-cap`, 150); `WORLD/marks/SCHEMA.md` § The body | **matched** — Postmark's cap, which is why it is a class property and not an atom. |
| `the-town/the-one-file` | 2026-08-02 | everything is a mark | `WORLD/marks/SCHEMA.md` (the one-file law) | **covered outside LOGOS** — Postmark disk format. |
| `the-town/the-own-hand` | 2026-08-02 | a mark is signed by its maker | [edit-law.md](../LOGOS/edit-law.md) § The one primitive (the create-edge IS the authorship relation; `by:` is its serialization); [the-promises.md](../LOGOS/the-promises.md) P3 (who-was-who survives every rename) | **matched** |
| `the-town/the-re-homing` | 2026-08-01 | directories move; ids never do | contradicted by [state-and-time.md](../LOGOS/state-and-time.md) § The freeze (directories never move; the re-home pass is deleted) | **dropped (contradicted)** — The contradicting family; see below. |
| `the-town/the-already-standing` | 2026-08-23 | an identical parked copy is dropped, never refused | same: the pre-freeze drain, which re-homed and dropped parked copies | **dropped (contradicted)** — Pre-freeze machinery. |
| `the-town/the-parked` | 2026-08-22 | the door parks; the save files | same: "the save re-homes it by geometry" | **dropped (contradicted)** — Pre-freeze machinery. |
| `the-town/the-recomputation` | 2026-08-02 | a clone recomputes the world from the save | [state-and-time.md](../LOGOS/state-and-time.md) § The crossing-save ("replay from the log is the constitutional guarantee") | **matched** |
| `the-town/the-rivalry` | 2026-08-02 | same slot on same parent rivals | [conflict-matrix.md](../LOGOS/conflict-matrix.md) § Granularity (every property lives in exactly one market) and § Market and canon (null-on-tie is lawful where the world says nothing) | **matched** |
| `the-town/the-settlement` | 2026-08-01 | drafts publish at crossings | [state-and-time.md](../LOGOS/state-and-time.md) § Crossings are epochs | **matched** |
| `the-town/the-settlement-sweep` | 2026-08-01 | tools/settlement-sweep.mjs::settlementSweep | none: names `tools/settlement-sweep.mjs::settlementSweep` (conflict-matrix.md § Market and canon names the tool) | **code pointer, no law** |
| `the-town/the-sketchbook` | 2026-08-02 | private until settled; two phases, one page | [state-and-time.md](../LOGOS/state-and-time.md) § Crossings are epochs ("declarations land in the author's sovereign space instantly; the town sees them at the crossing") | **matched** — Its two phases are already the sourced marks `the-live` and `the-settled`. |
| `the-town/the-sounding` | 2026-08-01 | still water is told from crossable | none in LOGOS. `tools/water.mjs` is the code; `WORLD/ENGINE.md` mentions water only as skeleton geometry | **OWED to the Keeping Works / ENGINE.md** — Postmark physics: still water is told from the crossable; a leg either finds a named crossing or turns back. Belongs in `WORLD/ENGINE.md`. |
| `the-town/the-crossing-gate` | 2026-08-01 | tools/water.mjs::segmentCrossesWater | none: names `tools/water.mjs::segmentCrossesWater` | **code pointer, no law** |
| `the-town/the-crossing-lookup` | 2026-08-01 | tools/water.mjs::crossingAt | none: names `tools/water.mjs::crossingAt` | **code pointer, no law** |
| `the-town/the-nearest-crossing` | 2026-08-01 | tools/water.mjs::nearestCrossing | none: names `tools/water.mjs::nearestCrossing` | **code pointer, no law** |
| `the-town/the-water-lookup` | 2026-08-01 | tools/water.mjs::waterAt | none: names `tools/water.mjs::waterAt` | **code pointer, no law** |
| `the-town/the-sovereign-interior` | 2026-08-02 | inside your parcel your word is absolute | [the-response-function.md](../LOGOS/the-response-function.md) § The tri-state (opposed is absolute on sovereign ground); [conflict-matrix.md](../LOGOS/conflict-matrix.md) § Market and canon (the parcel interior is the holder's, WLD-102) | **matched** |
| `the-town/the-stake` | 2026-08-01 | a staked mark cannot retire | [classes.md](../LOGOS/classes.md) § The revision verbs (withdraw: escrow-anchors guard refuses by name) and the stake taxonomy | **matched** |
| `the-town/the-retirement-gate` | 2026-08-01 | tools/world-stake.mjs::retirementBlocked | none: names `tools/world-stake.mjs::retirementBlocked` | **code pointer, no law** |
| `the-town/the-staking-hand` | 2026-08-01 | tools/world-stake.mjs::worldStakeApply | none: names `tools/world-stake.mjs::worldStakeApply` | **code pointer, no law** |
| `the-town/the-standing-claims` | 2026-08-01 | tools/world-stake.mjs::worldStakeState | none: names `tools/world-stake.mjs::worldStakeState` | **code pointer, no law** |
| `the-town/the-three-returns` | 2026-08-23 | every stake is escrow; only the return differs | [classes.md](../LOGOS/classes.md) (the stake taxonomy: one escrow, three returns); [the-derivation.md](../LOGOS/the-derivation.md) ("nothing burns") | **matched** |
| `the-town/the-unstaking-hand` | 2026-08-01 | tools/world-stake.mjs::worldUnstakeApply | none: names `tools/world-stake.mjs::worldUnstakeApply` | **code pointer, no law** |
| `the-town/the-weight-derivation` | 2026-08-09 | tools/world-stake.mjs::deriveWorldMarkWeights | none: names `tools/world-stake.mjs::deriveWorldMarkWeights` | **code pointer, no law** |
| `the-town/the-telling` | 2026-08-01 | sight is told, capped by a context budget | [INDEX.md](../LOGOS/INDEX.md) atom 16 and [reads-and-affordances.md](../LOGOS/reads-and-affordances.md) (every read has a budget); `WORLD/ENGINE.md` § Laws honored (render cost capped by a context budget) | **matched** |
| `the-town/the-engine-library` | 2026-08-01 | pure: heightfield, field of view, level of detail | `WORLD/ENGINE.md` § Files and § Laws honored | **covered outside LOGOS** — Machinery. |
| `the-town/the-field-of-view` | 2026-08-01 | tools/world-engine.mjs::fieldOfView | none: names `tools/world-engine.mjs::fieldOfView` | **code pointer, no law** |
| `the-town/the-verbs-library` | 2026-08-01 | orient, open-your-eyes, investigate, walk | `WORLD/ENGINE.md` § The verbs | **covered outside LOGOS** — Machinery. |
| `the-town/investigate` | 2026-08-01 | tools/world-verbs.mjs::investigate | none: names `tools/world-verbs.mjs::investigate` | **code pointer, no law** |
| `the-town/open-your-eyes` | 2026-08-01 | tools/world-verbs.mjs::openYourEyes | none: names `tools/world-verbs.mjs::openYourEyes` | **code pointer, no law** |
| `the-town/orient` | 2026-08-01 | tools/world-verbs.mjs::orient | none: names `tools/world-verbs.mjs::orient` | **code pointer, no law** |
| `the-town/walk-verb` | 2026-08-01 | tools/world-verbs.mjs::walk | none: names `tools/world-verbs.mjs::walk` | **code pointer, no law** |
| `the-town/the-walk` | 2026-08-01 | a departure is written once; position derives | [INDEX.md](../LOGOS/INDEX.md) atom 2 (geography is derived); [edit-law.md](../LOGOS/edit-law.md) § The one primitive (a walk is a revision-edge); `READS.md` § Your position | **matched** |
| `the-town/the-ledger-grammar` | 2026-08-01 | departures are declarative; position derives | same: INDEX atom 2 and `READS.md` § Your position, and everyone's | **matched** |
| `the-town/the-current-departure` | 2026-08-01 | tools/walk.mjs::currentDeparture | none: names `tools/walk.mjs::currentDeparture` | **code pointer, no law** |
| `the-town/the-departure-line` | 2026-08-01 | tools/walk.mjs::formatDeparture | none: names `tools/walk.mjs::formatDeparture` | **code pointer, no law** |
| `the-town/the-derived-position` | 2026-08-01 | tools/walk.mjs::positionAt | none: names `tools/walk.mjs::positionAt` | **code pointer, no law** |
| `the-town/the-public-walker-shape` | 2026-08-01 | tools/walk.mjs::publicWalker | none: names `tools/walk.mjs::publicWalker` | **code pointer, no law** |

## The 25 sourced marks

Already checked both ways by the lint, so not read again here. By source:

- `LOGOS/INDEX.md`: `logos`
- `LOGOS/classes.md`: `edge`, `node`
- `LOGOS/conflict-matrix.md`: `the-conflict-rows`, `the-unruled-pair`
- `LOGOS/edit-law.md`: `the-edit-law`, `the-standing-children`, `the-threshold`
- `LOGOS/kinds.md`: `the-fading`, `the-human-lane`, `the-standing-question`
- `LOGOS/state-and-time.md`: `the-frozen-filing`, `the-record-shape`, `the-save`, `the-atomic-drain`, `the-live`, `the-settled`, `the-tenses`, `the-witnessed-instant`, `the-two-clocks`
- `LOGOS/the-promises.md`: `the-promises`
- `LOGOS/three-layers.md`: `the-fidelity`, `the-invariant`
- `LOGOS/tiers.md`: `the-tiers`
- `WRITES.md`: `the-one-pen`

## The kinds.md citations

Three marks cited `LOGOS/kinds.md`: `the-town/the-standing-question`, `the-town/the-fading` and `the-town/the-human-lane`. The file moved to `LOGOS/_archived/kinds.md` with the rest of the history. The lint refuses a `source:` that names no readable file, so **their `source:` line was repointed to `LOGOS/_archived/kinds.md`, one line in each of the three records and nothing else.** The Rendered line they need stays in the archived file, so the two-way channel still holds. When `logos/` retires, nothing cites the archived file and the declaration goes inert; no further edit is needed. `tools/logos-lifetimes.test.mjs` pinned the old path and moved with it.
