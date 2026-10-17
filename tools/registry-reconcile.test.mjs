// registry-reconcile.test.mjs — a stale registry row follows its mark, in the
// safe direction only (postmark#3757).

import test from "node:test";
import assert from "node:assert/strict";
import { applyPlan, reconcilePlan } from "./registry-reconcile.mjs";

const plan = (published, filings, tiers, present = []) => reconcilePlan(published, {
  filingOf: (id) => filings[id] ?? null,
  tierOf: (id) => tiers[id],
  pathExists: (path) => present.includes(path),
});

test("kinofire's fireplace: a stale commons row for a mark that walks home follows its file, and its class is NOT written", () => {
  const p = plan(
    { "kinofire/the-too-big-fireplace": { household: "hh", path: "WORLD/marks/let-there-be-light/the-too-big-fireplace/mark.md", class: "commons" } },
    { "kinofire/the-too-big-fireplace": "WORLD/marks/kinofire/spin-ghar-manor/the-too-big-fireplace/mark.md" },
    { "kinofire/the-too-big-fireplace": "home" });
  assert.deepEqual(p.repairs.map((r) => [r.id, r.to, r.why]), [["kinofire/the-too-big-fireplace",
    { path: "WORLD/marks/kinofire/spin-ghar-manor/the-too-big-fireplace/mark.md", class: "commons" }, "path"]],
    "the walk keeps it (postmark-world#208); a second copy of standing in the data would be two sources of truth");
  assert.deepEqual([p.held, p.removed, p.unresolved], [[], [], []]);
});

test("a stale home row follows its mark's filing; its class was already right", () => {
  const p = plan({ "neth/hedgerow-cottage": { household: "h", path: "WORLD/marks/let-there-be-light/hedgerow-cottage/mark.md", class: "home" } },
    { "neth/hedgerow-cottage": "WORLD/marks/neth/hedgerow-cottage/mark.md" }, { "neth/hedgerow-cottage": "home" });
  assert.deepEqual(p.repairs.map((r) => [r.to.path, r.why]), [["WORLD/marks/neth/hedgerow-cottage/mark.md", "path"]]);
});

test("a row at a PRESENT path is left exactly as it is, whatever its stored class: the sweep's walk judges it at every crossing (Darko, 10-14)", () => {
  const garage = "WORLD/marks/keith/the-garage/mark.md";
  const cone = "WORLD/marks/berthillon/a-cone/mark.md";
  const p = plan({
    "keith/the-garage": { household: "h", path: garage, class: "commons" },   // walks home now
    "berthillon/a-cone": { household: "h", path: cone, class: "home" },       // walks market now: WLD-51
  }, { "keith/the-garage": garage, "berthillon/a-cone": cone }, { "keith/the-garage": "home", "berthillon/a-cone": "market" }, [garage, cone]);
  assert.deepEqual([p.repairs, p.held, p.removed, p.unresolved], [[], [], [], []]);
});

test("a stale row stored HOME whose mark walks market follows its file: a stored home is never swept today, so the repair takes nothing new", () => {
  const p = plan({ "a/cone": { household: "h", path: "WORLD/marks/let-there-be-light/cone/mark.md", class: "home" } },
    { "a/cone": "WORLD/marks/a/cone/mark.md" }, { "a/cone": "market" });
  assert.deepEqual(p.repairs.map((r) => [r.to, r.walks]), [[{ path: "WORLD/marks/a/cone/mark.md", class: "home" }, "market"]]);
  assert.deepEqual(p.held, []);
});

test("WLD-51: a stale row whose mark walks market is HELD, never written (the repair would make it sweepable)", () => {
  const p = plan({ "lupi/rootwood-bookend": { household: "h", path: "WORLD/marks/let-there-be-light/rootwood-bookend/mark.md", class: "commons" } },
    { "lupi/rootwood-bookend": "WORLD/marks/lupi/rootwood-bookend/mark.md" }, { "lupi/rootwood-bookend": "market" });
  assert.deepEqual(p.held.map((r) => r.id), ["lupi/rootwood-bookend"]);
  assert.match(p.held[0].why, /WLD-51/);
  assert.deepEqual(p.repairs, []);
});

test("a stale row for a mark that is gone is removed; a standing mark with no single filing is unresolved and left", () => {
  const p = plan({
    "the-town/departure": { household: "t", path: "WORLD/marks/x/departure/mark.md", class: "constitution" },
    "a/twice": { household: "h", path: "WORLD/marks/a/twice/mark.md", class: "home" },
    "a/stale-state": { household: "h", path: "WORLD/marks/a/stale-state/mark.md", class: "home" },
  }, { "a/stale-state": "WORLD/marks/a/elsewhere/stale-state/mark.md" }, { "a/twice": "home" });
  assert.deepEqual(p.removed.map((r) => r.id), ["the-town/departure"]);
  assert.deepEqual(p.unresolved.map((r) => r.id), ["a/twice", "a/stale-state"]);
});

test("applyPlan writes repairs and removals only; held and unresolved rows are byte-for-byte as they were", () => {
  const doc = { version: 1, published: {
    "k/f": { household: "h", path: "old", class: "commons" },
    "l/b": { household: "h", path: "old-b", class: "commons" },
    "t/d": { household: "t", path: "gone", class: "constitution" },
  } };
  const p = plan(doc.published, { "k/f": "new", "l/b": "new-b" }, { "k/f": "home", "l/b": "market" });
  const out = applyPlan(doc, p);
  assert.deepEqual(out.published["k/f"], { household: "h", path: "new", class: "commons" }, "the path moves; the class is never written");
  assert.deepEqual(out.published["l/b"], doc.published["l/b"], "held");
  assert.equal(out.published["t/d"], undefined, "removed");
  assert.equal(out.version, 1);
  assert.equal(doc.published["k/f"].path, "old", "the input is not mutated");
});

test("the data: the four rows stored commons whose marks walk home were repointed and NOT relabelled (postmark#3757)", async (t) => {
  const { readFileSync, existsSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const { published } = JSON.parse(readFileSync(join(root, "WORLD", "settlement-publications.json"), "utf8"));
  const FOUR = {
    "kinofire/the-too-big-fireplace": "WORLD/marks/kinofire/spin-ghar-manor/the-too-big-fireplace/mark.md",
    "kinofire/the-uphill-firepit": "WORLD/marks/kinofire/spin-ghar-manor/the-uphill-firepit/mark.md",
    "vireo/the-cone": "WORLD/marks/vireo/understory/the-cone/mark.md",
    "jiang-haijing/call-it-fengtian-lou": "WORLD/marks/jiang-haijing/fengtian-lou/call-it-fengtian-lou/mark.md",
  };
  for (const [id, path] of Object.entries(FOUR)) {
    const row = published[id];
    if (!row || row.path !== path) { t.diagnostic(`${id}: its row moved since 10-14; re-measure`); continue; }
    assert.equal(existsSync(join(root, path)), true, `${id}: repointed to its file`);
    assert.equal(row.class, "commons", `${id}: the stored class is never relabelled; the sweep's walk keeps the mark`);
  }
});
