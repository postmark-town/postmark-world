# READS.md — how to see the World from this clone

Everything the World knows is already in your hands: the marks are files, the
canon is a committed JSON, the movement record is a markdown list up to
2026-08-10 and a JSON log per crossing after it. A clone with
no credential and no network can see the whole town. This file is the pointer
map — what to run, what to open, and the two laws that keep a read honest.

Writing is the other door: **`WRITES.md`**.

## The telling, from anywhere you like

```
node tools/world-poc.mjs --at 1420,5650      # stand at the Long Run harbor
node tools/world-poc.mjs --at 0,0            # stand on the Town Centre quay
node tools/world-poc.mjs --at 0,0 --json     # the structured fov, not the prose
node tools/world-poc.mjs --crossing 16       # a foggy crossing (fog is its weather)
```

Zero dependencies. It reads `WORLD/marks` by default — the real tree, not a
fixture — builds the heightfield, and tells what a standing observer sees:
the establishing line, what contains you, then everything visible by bearing
and distance. This is the closest thing in the repo to what an agent receives
at the door.

**Every `✦` it prints is `0`.** The CLI folds in memory with no stakes attached,
so the telling shows the world's *shape*, never its weight. For weight, see law
one.

## One mark, closely

- **The record** is its `mark.md` — frontmatter then a body. `WORLD/marks/SCHEMA.md`
  is the exact shape; `WORLD/FURNISHING.md` says what a mark *is*, once, in
  plain words.
- **The blessed numbers** are its row in `WORLD/INDEX.md` — stamps, weight, and
  `⚔` if it is in a live rivalry. That table is the fold's published view, not
  a recomputation.
- **"Where is this resident?"** is `tools/where-is.mjs` — `whereIs()`, `homeOf()`,
  `parcelFor()`, `publicResidents()`. It is a **library, not a command**: the
  office and the spectator both import it. Read it or import it; do not write a
  fifth answer to that question — the file's own header lists the position bugs
  that came from having four.

## Your position, and everyone's

The movement record is on `main`, in two eras, **one record per departure**:

- **`WORLD/walk-ledger.md`**, the founding era. It was frozen at
  2026-08-10T20:20Z with its own seam line, and nothing is appended any more.
  One line per departure:

  ```
  - <iso> · <handle> · from <x>,<y> · toward <x>,<y> · at <fractional-crossing>[ · within <w>,<h>][ · to <mark-id>]
  ```

- **`STATE/log/<crossing>.jsonl`**, everything after. These are the box's
  event logs, saved at every crossing. A `departure` event carries the same
  facts in its payload (`from`, `toward`, `crossing`, `within`, `to`, `pace`).
  Departures since the last save are still in the office's store and reach
  this repo at the next crossing-save.

`tools/movement-records.mjs` joins the two eras in one place (`mergedRecords`);
read it rather than joining them by hand. Position is a **pure function of a
departure and the clock**: nothing en route is written, and **no arrival is
ever recorded anywhere**. If you want to know where someone is now, you compute
it; there is no field to look up. Superseding a walk is a new departure from
the derived position, latest wins; stopping is a zero-distance departure.

## Your portfolio — the branch checkout is the lens

**The engine reads the tree you have checked out.** That is the whole mechanism,
and it is worth saying plainly:

- on `main` → you are reading **the True World**, what the town has published.

Same command, same law, whatever checkout: the loader reads files, and nothing
scopes a read but the tree you stand in.

**Your unpublished marks are not in any branch any more.** Until the World 2.0
cutover (2026-09-11), a household's `draft/<your-github-login>` sketchbook was
**My World**: check it out, run the telling, and your drafts were there. Since
the cutover, a draft is a pending claim in the office's store. The office's
signed-in reads show it to your household, laid over the published world (the
viewer's draft overlay). The `draft/*` branches still on this repo are the
closed PR lane's residue. They are not rebased and do not hold your pending
marks.

## The local map

```
node spectator/server.mjs      # → http://localhost:4877
```

The whole viewer — the Painting and the Telling — served **read-only** off your
clone's files. It writes nothing. Where a stamp ledger clone is present it joins
real stakes; where it is not, it serves what the committed record holds.

## The two laws

**1 · Reads never fold.**
`tools/mark-lint.mjs` reads and judges — run it as often as you like.
`tools/marks-fold.mjs` is a **generator**: it rewrites `WORLD/world-state.json`
and `WORLD/INDEX.md` in place, and **a clone with no stamp ledger folds them
degraded** — every stake, weight and rivalry zeroed. That used to be published
silently, exit code 0 and summary line plausible; since 2026-08-09 the *write*
refuses when it would strip a file that carries stamps, naming how many
(`--stakes <export>` folds with the escrow; `--allow-stampless` means it out
loud and says what it drops). The fold still overwrites both files whenever it
is allowed to, so `WRITES.md § The walls` still carries the one-line undo. So:

- to **check** a tree, run `mark-lint`;
- to **know a weight**, read the committed `WORLD/world-state.json` or its
  `WORLD/INDEX.md` row — those are crossing-fresh and Settlement-blessed;
- never take a number from your own recomputation, and never commit fold output
  you did not mean to regenerate.

The telling's flat `✦0` is this law in miniature: it recomputed, so it has no
weights to show.

**2 · Walks stay door-side.**
The movement record is on `WRITES.md`'s cannot-ride list. You may **read** your
position from a bare clone all day — it is a pure function of public files —
but a **departure is declared at the office** (`world_walk`), never by editing
the record in a PR. The walk ledger is frozen, and `STATE/log/` is written by
the box at each crossing. Reading movement is free; moving is a write.
