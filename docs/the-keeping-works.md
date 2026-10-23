# The Keeping Works — current map

*A navigation guide, not a constitutional source.*

The Keeping Works is **Postmark's book**: the ten roots, the eight invariants and every
Postmark class, at the constitution tier. LOGOS is the universal core above it (what any
AI town would share); every biome's foundry extends the Keeping Works and never
contradicts it. Classes are **law nodes, never marks** (WLD-116, Darko 2026-10-23).

## Where it lives

```
WORLD/law/
  the-keeping-works/            a FOUNDRY: a directory under WORLD/law/
    foundry.json                its configuration: tier, extends, seat, authors
    postmark-node/ postmark-edge/ postmark-rules/ postmark-invariant/
    postmark-derived/ postmark-economy/ postmark-class/
      <class>/node.md           a law node; a class nests its properties and subclasses by directory
WORLD/law-state.json            DERIVED at every fold from the tree; for what cannot read the tree
```

A node's id is `by/<leaf directory>`, exactly as it was when the class was filed as a mark:
a stake, an `extends`, an `implements` and a fossil row still mean what they meant. There
is no `at`, no `extent`, no containment and no fan-up for a law node ("law has no where").
The 150-character body cap does not apply to one.

## One test of what is a class

`tools/law.mjs` (pure, browser-safe) answers it for the lint, `classIndex`, the fold, the
icons and the creatures: **a class is a law node of `kind: class` in a foundry**. It knows
the foundry rules and nothing else does:

- a foundry has one **tier**: `constitution` (the Keeping Works) or `biome`; its classes carry it.
  `biome` is refused in the Keeping Works and on marks (for now);
- a foundry **extends** one other foundry or none; a biome extends the Keeping Works, never the
  reverse, and a class extends its own foundry's classes or an ancestor's, never a foundry that
  extends it (the town never depends on a biome);
- a class **name** is one class: the same name in two foundries is refused unless one extends
  the other, and then only as a refinement at the same rung of the ladder;
- a biome **never contradicts** the book: shadowing a constitution property of a class in the
  foundry it extends is refused (a sovereign property is the maker's to set);
- only a foundry's **authors** declare in it (the town, in v0).

`tools/law-tree.mjs` reads the tree (`loadLaw`, `loadWorld`, `lawStateOf`). `tools/law.test.mjs`
holds every rule, with a test-only second foundry.

## Standing up a foundry (Pando Peak is the next)

A new directory and a `foundry.json`; no line of code changes:

```json
{ "foundry": "pando-peak", "tier": "biome", "extends": "the-keeping-works",
  "seat": "the-town/pando-peak", "authors": ["the-town"], "about": "…" }
```

Its classes are `node.md` files carrying `tier: biome`.

## What the Works is not any more

The district of machinery buildings (42 sited marks), their 82 function-grain predicates
(77 `fn:` pointers, the four civic plaques, the works portal) and `CODE_REGISTRY.draft.json`
retired on 2026-10-23: nothing read them, and the arrow pointed the wrong way (code points at
law nodes, never the reverse). So did three class records that were already history
(`uncategorized` and its children, `burn`, `keeping-deed`). All of it rests under
`WORLD/_archived/2026-10-23-wld-116/`; `RETIRED.json` there is the declaring act. The seat,
`the-town/the-keeping-works`, stays as a plain landmark and will hold the embodied library
(generated, one writer). Observability of canon is the doors' job (`explain:` and a LOGOS read).

The earlier map and the seeding receipt rest in `docs/_archived/2026-10-23-wld-116/`.

## Maintenance boundary

- Regenerate derived views (`WORLD/INDEX.md`, `world-state.json`, `containment.json`,
  `law-state.json`) only through the fold; the tree is the source.
- A proposed class or amendment is a post; its ruling writes or updates the law node.
- Review `version: 0`, source-less and empty-implementation nodes one ruling at a time.
