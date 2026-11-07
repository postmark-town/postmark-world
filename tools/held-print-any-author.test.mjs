// held-print-any-author.test.mjs — a held thing prints `held_by` at the next
// settlement WHATEVER ITS AUTHOR.
//
// The clearing writes a hold into the store and prints it (held_by, no at) into
// a sketchbook; the sweep lets that print land because it is "the town's record
// of where a thing is, never a publication" (settlement-sweep.mjs § hold-only).
// A door that counts holds `at: "settlement"` reads the PRINTED world, so a hold
// that never prints never counts.
//
// Three authors, one printed hold each, the real sweep over a real git repo:
//   1. a resident-made thing (the control: it printed before and must go on printing)
//   2. a thing signed by the town and given into a holder
//   3. a thing authored in git (a hand-committed `kind: thing` with a full ISO
//      date) by an ordinary household, given into a holder
// and the town wall's other half, which must stand: a town-signed mark that
// changes anything BUT where it is, or whose place moves while it stays on the
// ground, still never publishes from a sketchbook.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { settlementSweep } from "./settlement-sweep.mjs";
import { handOffOnly } from "./mark-kind.mjs";
import { withTool } from "./engine-files.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const THING_CLASS = "---\nkind: class\nby: the-town\ntier: constitution\ndate: 2026-07-28\nclass: thing\n---\n\nA thing: what can be carried.\n";
const FRAME = "---\nkind: sited\nby: the-town\ntier: constitution\ndate: 2026-07-28\nat: { x: 0, y: 0 }\nextent: { w: 320000, h: 320000 }\n---\n\nthe frame\n";

function world(t, name) {
  const repo = mkdtempSync(join(tmpdir(), `postmark-${name}-`));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const stakesPath = `${repo}-stakes.json`;
  t.after(() => rmSync(stakesPath, { force: true }));
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const put = (path, text) => { const full = join(repo, path); mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, text); };
  const commit = (message) => {
    execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs")], { cwd: repo });
    git("add", "-A");
    git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", message);
  };
  mkdirSync(join(repo, "tools"), { recursive: true });
  for (const file of withTool("mark-lint.mjs")) cpSync(join(HERE, file), join(repo, "tools", file));
  put("WORLD/skeleton.json", JSON.stringify({ features: [], physics_registry: {} }, null, 2));
  put("WORLD/marks/let-there-be-light/mark.md", FRAME);
  put("WORLD/marks/let-there-be-light/the-keeping-works/mark.md",
    "---\nkind: sited\nby: the-town\ntier: constitution\ndate: 2026-07-28\nat: { x: -500, y: -500 }\nextent: { w: 20, h: 20 }\n---\n\nthe works\n");
  put("WORLD/marks/let-there-be-light/the-keeping-works/thing/mark.md", THING_CLASS);
  git("init", "-q", "-b", "main");
  writeFileSync(stakesPath, JSON.stringify([]));
  return {
    repo, git, put, commit,
    blob: (ref, path) => git("show", `${ref}:${path}`),
    sweep: () => settlementSweep({ repo, stakesPath }),
    state: () => JSON.parse(readFileSync(join(repo, "WORLD", "world-state.json"), "utf8")),
    /** cut the sketchbook, write the printed hold into it, come back to main */
    print: (branch, path, text, message = "the hold record, printed") => {
      git("switch", "-q", "-c", branch);
      put(path, text);
      commit(message);
      git("switch", "-q", "main");
    },
  };
}

const heldOf = (c, id) => c.state().marks.find((m) => m.id === id);

// ── 1. THE CONTROL ───────────────────────────────────────────────────────────

test("1. a resident-made thing given into a holder prints held_by at the next settlement", (t) => {
  const c = world(t, "held-print-resident");
  const file = "WORLD/marks/berthillon/a-cone/mark.md";
  c.put(file, "---\nkind: sited\nby: berthillon\ndate: 2026-08-26\nat: { x: 800, y: 800 }\nextent: { w: 1, h: 1 }\nclass: thing\n---\n\nA paper cone.\n");
  c.commit("published main");
  const held = "---\nkind: sited\nby: berthillon\ndate: 2026-08-26\nclass: thing\nheld_by: sb-ash\n---\n\nA paper cone.\n";
  c.print("draft/berthillon", file, held);
  const report = c.sweep();
  assert.ok(report.published.some((r) => r.id === "berthillon/a-cone"), JSON.stringify(report.left_drafted));
  assert.equal(c.blob("main", file), held);
  assert.equal(heldOf(c, "berthillon/a-cone").held_by, "sb-ash");
});

// ── 2. A TOWN-SIGNED THING ───────────────────────────────────────────────────

const LAMP = "WORLD/marks/the-town/a-lamp/mark.md";
const LAMP_PLACED = "---\nkind: sited\nby: the-town\ndate: 2026-10-01\nat: { x: 900, y: 900 }\nextent: { w: 1, h: 1 }\nclass: thing\n---\n\nA brass lamp.\n";
const LAMP_HELD = "---\nkind: sited\nby: the-town\ndate: 2026-10-01\nclass: thing\nheld_by: sb-ash\n---\n\nA brass lamp.\n";

test("2. a town-signed thing given into a holder prints held_by at the next settlement", (t) => {
  const c = world(t, "held-print-town");
  c.put(LAMP, LAMP_PLACED);
  c.commit("published main");
  c.print("draft/house-a", LAMP, LAMP_HELD);
  const report = c.sweep();
  assert.ok(report.published.some((r) => r.id === "the-town/a-lamp"),
    `the hold did not print: ${JSON.stringify(report.left_drafted)}`);
  assert.equal(c.blob("main", LAMP), LAMP_HELD, "printed as held, byte for byte");
  assert.equal(heldOf(c, "the-town/a-lamp").held_by, "sb-ash");
});

test("2b. the town wall still stands: a town-signed thing whose WORDS change in a sketchbook never publishes, held or not", (t) => {
  const c = world(t, "held-print-town-words");
  c.put(LAMP, LAMP_PLACED);
  c.commit("published main");
  c.print("draft/house-a", LAMP, LAMP_HELD.replace("A brass lamp.", "A brass lamp, stolen."));
  const report = c.sweep();
  assert.equal(report.published.some((r) => r.id === "the-town/a-lamp"), false);
  assert.match(report.left_drafted.find((r) => r.id === "the-town/a-lamp")?.reason ?? "", /town wall/);
  assert.equal(c.blob("main", LAMP), LAMP_PLACED, "main is untouched");
});

test("2c. the town wall still stands: a town-signed thing MOVED on the ground, or handed to an owner with a new place, never publishes", (t) => {
  const c = world(t, "held-print-town-moved");
  c.put(LAMP, LAMP_PLACED);
  c.commit("published main");
  c.print("draft/house-a", LAMP, LAMP_PLACED.replace("x: 900", "x: 950"));
  const moved = c.sweep();
  assert.equal(moved.published.some((r) => r.id === "the-town/a-lamp"), false, "a move is authoring");
  assert.match(moved.left_drafted.find((r) => r.id === "the-town/a-lamp")?.reason ?? "", /town wall/);
  // an owner stamped on, with the place moved at the same time, is not a hand-off either
  const c2 = world(t, "held-print-town-owned-moved");
  c2.put(LAMP, LAMP_PLACED);
  c2.commit("published main");
  c2.print("draft/house-a", LAMP, LAMP_PLACED.replace("x: 900", "x: 950").replace("class: thing", "class: thing\nowned_by: sb-ash"));
  const owned = c2.sweep();
  assert.equal(owned.published.some((r) => r.id === "the-town/a-lamp"), false, "an owner stamp does not carry a move with it");
});

test("2d. a held town-signed thing set down prints its fresh place", (t) => {
  const c = world(t, "held-print-town-drop");
  c.put(LAMP, LAMP_HELD);
  c.commit("published main: the lamp, held");
  c.print("draft/house-a", LAMP, LAMP_PLACED.replace("x: 900, y: 900", "x: 910, y: 905"), "the drop, printed");
  const report = c.sweep();
  assert.ok(report.published.some((r) => r.id === "the-town/a-lamp"), JSON.stringify(report.left_drafted));
  assert.deepEqual(heldOf(c, "the-town/a-lamp").at, { x: 910, y: 905 });
});

// ── 3. A GIT-AUTHORED THING ──────────────────────────────────────────────────

const BOAT = "WORLD/marks/tessel-house/a-paper-boat/mark.md";
const BOAT_PLACED = "---\nkind: thing\nby: tessel-house\ndate: 2026-09-14T00:00:00.000Z\nat: { x: 3730, y: -5207 }\nextent: { w: 0.3, h: 0.3 }\n---\n\nA paper boat.\n";
const BOAT_HELD = "---\nkind: thing\nby: tessel-house\ndate: 2026-09-14T00:00:00.000Z\nheld_by: sb-bram\n---\n\nA paper boat.\n";

test("3. a git-authored thing of an ordinary household given into a holder prints held_by at the next settlement", (t) => {
  const c = world(t, "held-print-git");
  c.put(BOAT, BOAT_PLACED);
  c.commit("authored in git, published main");
  c.print("draft/tessel-house", BOAT, BOAT_HELD);
  const report = c.sweep();
  assert.ok(report.published.some((r) => r.id === "tessel-house/a-paper-boat"),
    `the hold did not print: ${JSON.stringify(report.left_drafted)}`);
  assert.equal(c.blob("main", BOAT), BOAT_HELD);
  assert.equal(heldOf(c, "tessel-house/a-paper-boat").held_by, "sb-bram");
});

test("3b. THE BOUNDARY: a hold print that also carries any other difference from the file is an authoring change, not a hand-off", (t) => {
  // The print is written from the store's row. A row that has drifted from its
  // file (here the date) prints the drift with the hold, and the sweep, which
  // cannot tell a drift from an edit, judges the change as it judges any edit:
  // a commons mark at 0 stamps is held back.
  const c = world(t, "held-print-git-drift");
  c.put(BOAT, BOAT_PLACED);
  c.commit("authored in git, published main");
  c.print("draft/tessel-house", BOAT, BOAT_HELD.replace("2026-09-14T00:00:00.000Z", "2026-09-13T00:00:00.000Z"));
  const report = c.sweep();
  assert.equal(report.published.some((r) => r.id === "tessel-house/a-paper-boat"), false);
  assert.match(report.left_drafted.find((r) => r.id === "tessel-house/a-paper-boat")?.reason ?? "", /commons needs escrow/);
});

// ── THE PREDICATE ITSELF ─────────────────────────────────────────────────────

test("4. handOffOnly: a hand-off, and nothing wider", () => {
  const placed = { kind: "sited", by: "the-town", date: "2026-10-01", class: "thing", at: { x: 1, y: 2 }, extent: { w: 1, h: 1 }, body: "x" };
  const held = { kind: "sited", by: "the-town", date: "2026-10-01", class: "thing", held_by: "sb-ash", body: "x" };
  assert.equal(handOffOnly(placed, held), true, "into hands: the place leaves");
  assert.equal(handOffOnly(held, { ...held, held_by: "sb-bram" }), true, "hand to hand");
  assert.equal(handOffOnly(held, { ...placed, at: { x: 5, y: 6 } }), true, "out of hands: a fresh place");
  assert.equal(handOffOnly(placed, { ...placed, owned_by: "sb-ash" }), true, "an owner stamped on, the place untouched");
  assert.equal(handOffOnly(placed, { ...placed, owned_by: "sb-ash", at: { x: 9, y: 9 } }), false, "an owner stamped on with the place moved");
  assert.equal(handOffOnly(placed, { ...placed, at: { x: 9, y: 9 } }), false, "a move on the ground");
  assert.equal(handOffOnly(placed, { ...held, body: "y" }), false, "new words");
  assert.equal(handOffOnly(placed, { ...held, date: "2026-10-02" }), false, "any other field");
  assert.equal(handOffOnly(null, held), false, "a mark main does not hold");
});
