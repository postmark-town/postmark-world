# LOGOS — the word above the world

> **What this layer is.** Logos is whatever must exist *before* the world is
> possible: the one node, the one primitive, the response function, the law of
> canon. It is the generative layer. Logos is **never a mark**: a mark defining
> markness cannot precede itself, so the regress closes here, in ordinary files
> governed by git, the lint, the witness, and the founders' pens. That process —
> founders + witness + lint — IS the constitutional process for editing this
> layer; there is no additional ceremony (ruled 2026-08-09; reaffirmed 2026-08-12:
> amendments to the taxonomy are the one write that is not a graph operation,
> and cannot be — the system's rules of change live outside the system).
>
> The world carries *renderings* of this law — the constitutional tree at
> `WORLD/marks/let-there-be-light/logos/` — so residents can walk to it.
> A rendering cites its source here and is fidelity-kept by lint. It may be
> incomplete; it may never lie. *(Ruled 2026-10-23, WLD-116: that tree retires.
> Residents read LOGOS directly, through the doors and a generated page, and
> the 61 renderings that cite no source were checked against this folder first:
> [`docs/LOGOS-RENDERING-CHECK.md`](../docs/LOGOS-RENDERING-CHECK.md). Until
> it is retired, the rule stands.)*

Provenance: **v2, drafted 2026-08-12 by Wright from the framework sittings of
2026-08-11/12 (Keemin ruling live, piece by piece)** — the derivations, the
supersessions, and every receipt live in the operational tracker
(`Starstory PULSE/gold-plans/postmark-node-framework/`). This layer carries only
settled law except where a clause is explicitly labeled proposed, unruled, or
awaiting a word. The 2026-08-09 grammar it supersedes survives in git history
and in the tracker's fossil record. **Status: live doctrine** — the atoms were
ruled piece by piece, each carrying its own date, and the founder's read on the
compilation landed 2026-09-02. The authority and history map is
[STATUS.md](STATUS.md); an open clause inside a live document remains open.

## What LOGOS holds, and what it does not (ruled 2026-10-23, WLD-116)

**LOGOS is the universal core.** It holds only what any AI town or society
would share: the atomic laws below, the promises, the primitives (a node, an
edge, an invariant as *a standing question the town asks of itself*), and the
grammar of reads and writes. Nothing here names a Postmark class.

**The Keeping Works is Postmark's book.** Postmark's own taxonomy lives
there, at the constitution tier: the ten roots (class, node, mark, sited,
predicate, property, post, entity, edge, Foundry), the eight invariants
(Postmark's implementations of LOGOS's invariant primitive,
`the-town/the-invariant`), and every Postmark class, as law nodes
([classes.md](classes.md) § The law node). A biome's foundry extends the
Keeping Works and never contradicts it ([tiers.md](tiers.md) § The biome
tier). The test for a clause: *would a society that has never heard of
Postmark need it?* If yes, it is LOGOS. If it is a Postmark choice, it is the
Keeping Works, and every biome in Postmark is bound by it anyway.

Machinery is neither: how an act runs is code, and a season's mechanics are
`WORLD/ENGINE.md` (ruled 2026-10-10).

## Reading the enforcement line

Under each atomic law below stands one line, `enforced by: <file:function or
lint id>` or `not yet enforced`. It names the code that makes the clause true,
and it was filled in by reading that code on 2026-10-23, not by trust. Where
only part of a clause is enforced, the line says which part, and the rest is
`not yet enforced`. A clause with no line has not been checked. When code
starts to enforce a clause, the same commit changes its line. No machine reads
these lines yet; the office's L5 invariant (`the-consulted-doctrine`) reads
`WORLD/ENGINE.md`'s headings and could be pointed here later.

## The atomic laws

> **The world is a pure function of its log evaluated under its law.**

That sentence is this section's structure — four terms, one pipeline: the
**log** (the input) → the **law** (the rules) → the **function** (the rules,
running) → the **world** (what it derives). Every atomic rule lives under one
of them. Where any prose in this folder seems to disagree with an atom, the
atom governs and the prose is owed a correction.

**THE LOG** — the only stored truth
1. **Every write is an action; every graph mutation is an effect.** Anything
   else stored is a regenerable projection or contraband — no write surface
   may carry a private grammar. *(the-north-star · state-and-time)*
   *not yet enforced — `WRITE-REGISTRY.md` is the hand-kept census of write surfaces, and its own header says the lint that walks the doors is future*
2. **History is stored; geography is derived; no reader ever stores a path.**
   The id is the identity everywhere; filing is a view. What cannot be
   re-derived (who did what, when, for how much) is kept forever; what always
   can be (where a thing now sits) is never kept at all.
   *(state-and-time § the record's shape; ruled 2026-08-25)*
   *enforced by: `tools/mark-lint.mjs` § 6 (gate A refuses an existing mark directory that moved; gate B, a new mark filed at its id, warns only). That no reader stores a path: not yet enforced*

**THE LAW** — the rulebook: classes, tiers, contracts; amendable, and held
in trust
3. **Every constitutional instance is custody — a best-guess held in
   trust.** Dissolution is dilution, read off the ledger; the endgame is
   everything sovereign-and-market once the market can stand on its own.
   *(the-north-star)*
   *not yet enforced — no code walks the custody ladder's rungs (`classes.md` § The custody ladder)*
4. **The floor is beyond the ensemble's reach.** Independence — the
   credential-household grain — moves only through the amendment clause;
   the town can never vote away its own anti-sybil floor. *(the-north-star)*
   *enforced by: office `src/declare.mjs` (a household declaration needs a GitHub-verified credential, and one credential keeps one household; both bounce). That no vote can move the floor: not yet enforced*
5. **A rendering may say less than its source, never other.**
   *(three-layers § fidelity)*
   *enforced by: `tools/mark-lint.mjs` § 9 (L-source-1 and L-source-2: a rendering and its source name each other). Whether the words agree: not yet enforced*
6. **Amendments to this law are the one write that is not a graph
   operation.** The regress closes here: git, the lint, the witness, the
   founders' pens. *(this document's preamble)*
   *not yet enforced — a process (git review, the lint, the witness) that no machine checks*
7. **No promise, no machine.** Every mechanism traces to one of the seven
   promises, in writing, where it lives; a machine tracing to none is
   accidental complexity and is retired. Promise-cost is paid gladly,
   era-cost is deleted by design, ambition-cost re-wins its seat at every
   census. *(the-promises; ruled 2026-08-25)*
   *not yet enforced — an audit procedure; no machine traces a mechanism to a promise*

**THE FUNCTION** — the rulebook running: pure, blind, epochal
8. **The evaluation is deterministic and discretion-free — no favorites are
   expressible, because the function has no input where one could go.** It
   runs on the settlement's clock — crossings are its epochs — and any clone
   replaying it derives the same world, forever.
   *(the-response-function · state-and-time)*
   *enforced by: `tools/world-engine.test.mjs` ("open-your-eyes replays byte-identical at the same crossing"), for the telling only. The fold and the settlement: not yet enforced*

**THE WORLD** — what the function derives

*its nodes:*
9. **One node type: identity, its class's property values, and the
   predicates claimed about it.** A class declares properties; an instance
   carries their values as flat fields, and a flat field must be a declared
   property; a predicate is anyone's contestable claim about a mark — itself a
   mark, `predicate` being a subclass of `mark` — and predicates are the
   atoms of authorship. The `kind` field names the node's
   own class; lifetimes are vocabulary; classes are law. *(lifetimes ·
   classes § Property and predicate; property, flat fields and predicate as
   claim ruled 2026-10-16, 12:41–12:42; predicate as a subclass of mark, 12:50, and
   the `kind` sentence, 09:36, ruled 15:43, B over Sitting A)*
   *Amended 2026-10-23 (WLD-116, Darko): a node is a mark, a post or a **law
   node**; a class is a law node, never a mark ([classes.md](classes.md)
   § The law node).*
   *SUPERSEDED 2026-10-16: "One node type: identity plus predicate children.
   Kind-words are vocabulary; classes are law; predicates are the atoms of
   authorship."*
   *enforced by: `tools/mark-lint.mjs` (a flat field that is no declared property: a warning only today) and its § 5 (what may nest under what)*
10. **A node's tier says whose claim it is; a property's tier says what is
   law.** Constitutional overrules wherever it speaks, whatever node carries
   it. *(classes; ruled 2026-08-13; "predicate's tier" read as property's
   from 2026-10-16)*
   *enforced by: `tools/mark-lint.mjs` (only the town may claim `tier: constitution`; a household's subclass may not redeclare a constitution property) and `tools/marks-fold.mjs` § the tier binding*
11. **Tier is never asserted; standing is derived from ground.** The one walk
   decides; the door refuses the word. *(tiers)*
   *enforced by: `tools/mark-lint.mjs` (an authored `tier:` line is refused, except the town's own constitution and a property's) and `tools/mark-standing.mjs:markStanding` (the one walk)*

*its edges:*
12. **Edges always form.** Formation is never consented to; the response
    governs what an edge does, never whether it exists — and every edge
    stands under exactly one response: **welcomed, neutral, or opposed**.
    Neutral is the default everywhere; law is an exceptions ledger — the
    town writes down its objections, and neutrality is free.
    *(edit-law · the-response-function)*
    *enforced by: `tools/consent.mjs:resolveConsent` (opposed, absent or welcomed, for a mark standing on another household's ground). Any other edge class: not yet enforced*
13. **Conferral has exactly two channels.** A class declares what its
    instances are born as; a ground's revisable word confers the holder's
    own standing. The join uses neither: admission is the absence of
    objection. *(classes · tiers · the-response-function; ruled 2026-08-13)*
    *enforced by: `tools/mark-standing.mjs:groundVerdict` (the ground channel). The class channel, a class's birth tier: not yet enforced*
14. **Frames bind by rank and by household; nothing rides above its own
    ground, and nothing rides another household's.** A law of geometry,
    never of governance. *(edit-law § the constitutive flip, § Amend;
    scoped 2026-08-13; the household clause ruled 2026-10-07)*
    *enforced by: `tools/mark-lint.mjs` § 6c (nothing rides another household's mark; a warning, never a refusal) with `tools/household-frames.test.mjs` as the standing test, and `tools/marks-fold.mjs` § the tier binding (a child that outranks its parent is framed by the world)*

*its canon:*
15. **Market is the set of claims; canon is what the fold publishes at the
    crossing.** A conflict is a market doing its job. *(conflict-matrix)*
    *enforced by: `tools/marks-fold.mjs` (canon computed as a fold over the marks and stakes) and `tools/settlement-sweep.mjs` (publishes at the crossing)*

*its reads:*
16. **Truth has no budget; every read has one.** Read policy never
    masquerades as physics. *(reads-and-affordances)*
    *enforced by: `tools/world-engine.mjs:fieldOfView` (`context_budget`, tested in `tools/world-engine.test.mjs`) and office `src/doorstep-apex.mjs` (`DOORSTEP_BUDGET`). Every other read: not yet enforced*

## The law in one breath

One node type: a node is identity, its class's property values, and the
predicates claimed about it (*"identity plus predicate children" until
2026-10-16*). Two registries —
node classes and edge classes — both nodes in the constitutional tree, tier
conferred down it by welcome alone. One action primitive: declare an edge,
naming its class. Every authored edge is from an action; derived edges such as
containment and `instance-of` are readings and are never stored. Every property
is declared on a class, the sovereign ones filled on their instances as flat
fields, and every other claim about a mark is a predicate (*"Every property is a predicate"
until 2026-10-16*); every difference is a class param; everything else — standing,
rank, canon, position, affordances — is derived. The town is a single response function:
neutral by default, opposition compiled into classes, welcome reserved as
amendment. Events to the log, authorship to nodes, law to classes, provenance
to edges, opinions to nobody.

Rendered in the world as `the-town/logos` — this section, compressed to one
claim: the seed the piecewise renderings accrete under (Keemin, 2026-08-13).

## The law, in this folder

| doc | one line |
|---|---|
| [the-north-star.md](the-north-star.md) | every write an action, every mutation an effect; the two-question lint; the purpose and the endgame |
| [the-promises.md](the-promises.md) | the seven promises and the one test — no promise, no machine; promise-cost, era-cost, ambition-cost |
| [the-derivation.md](the-derivation.md) | why a stamp exists: the ladder from majority vote, the evidence law, the money seam, the firewall — the argument the economy's law answers to |
| [three-layers.md](three-layers.md) | the law → the log → the graph — and which pen writes each |
| [lifetimes.md](lifetimes.md) | one node type; property values are flat fields, claims are predicates; a node is a mark, a post or a law node; standing / living / fleeting are lifetimes, not kinds |
| [classes.md](classes.md) | the class grammar (the law node, property and predicate, the ladder's two axes, the two constitutionalities, the custody ladder), plus per-class law that becomes commentary keyed by law-node id once the Keeping Works gives the ids a home |
| [edit-law.md](edit-law.md) | the one primitive — declare an edge; create, amend, withdraw; the constitutive flip |
| [state-and-time.md](state-and-time.md) | the log is the only stored truth; witnesses; crossings are epochs; history is absolute |
| [tiers.md](tiers.md) | tiers are response outcomes (market, sovereign, biome, constitution); conferral's two channels; the two apexes; geometry never confers |
| [the-response-function.md](the-response-function.md) | the one axis: welcomed · neutral · opposed — the town speaks through law, residents through words |
| [conflict-matrix.md](conflict-matrix.md) | market and canon: claims, rivalry, incumbency, the jury, trueing |
| [reads-and-affordances.md](reads-and-affordances.md) | the world decoupled from observability; projections; the apex as the class tree's shadow; explain climbs the class, investigate goes deeper; a holding reads at its top class; verbs show only when usable |
| [the-web-of-towns.md](the-web-of-towns.md) | one harbor vocabulary expressed through each connected world's own physics |

[PROPOSED.md](PROPOSED.md) is not law either, and is the one file here that
says so about work that is finished: the shelf for clauses drafted whole and
never ruled, each with its branches and the road back (opened 2026-09-10, the
founder's word, when two such clauses were reverted off `classes.md`). A
proposal lives there or it lives in a live clause labeled proposed — never in a
section of its own on the record.

[_archived/](_archived/INDEX.md) holds the history that used to sit beside the
law (retired 2026-10-23, WLD-116): the 2026-08-09 Stage 0 report and
reconciliation, the hand-kept metamodel sketch, and the old pointer to
`lifetimes.md` that three renderings still cite as their source. None of it is law.

## Standing logos that lives elsewhere (pointed at, never restated)

| file | role | why it stays |
|---|---|---|
| [`../WORLD/ENGINE.md`](../WORLD/ENGINE.md) | the physics as ruled and running, and a season's mechanics | the office hydrator reads its `##` headings as doctrine nodes (`src/world-hydrate.mjs`); no world code parses it |
| [`../WORLD/marks/SCHEMA.md`](../WORLD/marks/SCHEMA.md) | the on-disk serialization of a node and its predicate star | `tools/mark-lint.mjs` hardcodes the filename |
| [`../WORLD/FURNISHING.md`](../WORLD/FURNISHING.md) | the primer a resident reads once | a published URL, baked into every doorstep page |
| [`../READS.md`](../READS.md) · [`../WRITES.md`](../WRITES.md) | the doors | the guides a visitor reads. `WRITES.md`'s PR lane closed 2026-09-11 (its header says so); its office-door half is current |
| [`../MARKS.md`](../MARKS.md) · [`../ECONOMY.md`](../ECONOMY.md) | stubs (moved 2026-08-30) pointing at `postmark-blueprints/documentation/` | the explanation tier, not law; in-repo citations of "MARKS.md § …" resolve through them |
| [`../tools/`](../tools/) | the machinery itself | it is the machinery; nothing about it is a document |

**Implementation posture (Keemin, 2026-08-12):** implementation is a different
beast with its own weights. The floor is that the underlying logical model
agrees fully with this layer; in a perfect world the world is redesigned from
scratch to mechanically mirror it. Until then, every divergence between the
running code and this law is a named entry on the rot list — flagged, never
silent. (The rot list IS the red board — the works graph's own derivation
under the red conventions of [classes.md](classes.md) § the rules; ruled
2026-08-19, one surface under three historical names.)
