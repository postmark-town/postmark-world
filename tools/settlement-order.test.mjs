// settlement-order.test.mjs — THE ORDER: TOWN, THEN SOVEREIGN, THEN MARKET
// (Darko, WLD-51, 2026-10-14 14:51 EDT).
//
//   "A crossing applies all town-level work first, then all sovereign and
//    parcel work, then judges market marks (escrow) against the result, so
//    nothing earlier gets overruled by something later."
//
// Each test is a shape the gap read measured (Starstory
// docs/2026-10-13/rail/WLD-51/gap-read.md): the sweep judged a market mark
// against the world BEFORE this crossing's sovereign work, on one side or the
// other. Every one of them was red on main at 5d1ef1e4.
//
//   node --test tools/settlement-order.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { settlementSweep } from "./settlement-sweep.mjs";
import { admitDelta } from "./marks-fold.mjs";
import { withTool } from "./engine-files.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const record = ({ kind = "sited", by, tier, at, extent, body, consent, date = "2026-07-28" }) => {
  const lines = ["---", `kind: ${kind}`, `by: ${by}`, ...(tier ? [`tier: ${tier}`] : []), `date: ${date}`];
  if (at) lines.push(`at: { x: ${at.x}, y: ${at.y} }`);
  if (extent) lines.push(`extent: { w: ${extent.w}, h: ${extent.h} }`);
  if (consent) lines.push(`consent: { ${consent} }`);
  return `${lines.join("\n")}\n---\n\n${body}\n`;
};

/**
 * A town: `main` is canon, `drafts` maps a sketchbook to the files it changes
 * (null deletes one), `rows` is the publication registry, `stakes` the escrow.
 */
function town(t, { main = {}, drafts = {}, rows = {}, stakes = [] }) {
  const repo = mkdtempSync(join(tmpdir(), "postmark-order-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...a) => execFileSync("git", ["-C", repo, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const put = (p, text) => { const f = join(repo, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text); };
  const commit = (m) => { git("add", "-A"); git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", m); };
  mkdirSync(join(repo, "tools"), { recursive: true });
  for (const file of withTool("mark-lint.mjs")) cpSync(join(HERE, file), join(repo, "tools", file));
  put("WORLD/skeleton.json", JSON.stringify({ features: [], physics_registry: {} }, null, 2));
  put("WORLD/marks/let-there-be-light/mark.md", record({
    by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 }, body: "the frame",
  }));
  for (const [p, text] of Object.entries(main)) put(p, text);
  put("WORLD/settlement-publications.json", JSON.stringify({ version: 1, published: rows }, null, 2) + "\n");
  git("init", "-q", "-b", "main");
  execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs")], { cwd: repo });
  commit("published main");
  const remote = mkdtempSync(join(tmpdir(), "postmark-order-remote-"));
  t.after(() => rmSync(remote, { recursive: true, force: true }));
  execFileSync("git", ["init", "--bare", "-q", remote]);
  git("remote", "add", "origin", remote);
  git("push", "-q", "origin", "main");
  for (const [branch, files] of Object.entries(drafts)) {
    git("switch", "-q", "-c", branch, "main");
    for (const [p, text] of Object.entries(files)) {
      if (text === null) rmSync(join(repo, p), { force: true }); else put(p, text);
    }
    commit(`${branch}'s sketchbook`);
    git("switch", "-q", "main");
  }
  const stakesPath = `${repo}-stakes.json`;
  t.after(() => rmSync(stakesPath, { force: true }));
  writeFileSync(stakesPath, JSON.stringify(stakes));
  const file = (p) => (existsSync(join(repo, p)) ? readFileSync(join(repo, p), "utf8") : null);
  const registry = () => JSON.parse(readFileSync(join(repo, "WORLD/settlement-publications.json"), "utf8")).published;
  return { repo, stakesPath, file, registry };
}

const ids = (rows) => (rows ?? []).map((row) => row.id).sort();
const why = (report, id) => report.left_drafted.find((row) => row.id === id)?.reason ?? null;

const PARCEL = "WORLD/marks/keith/keith-parcel/mark.md";
const GARAGE = "WORLD/marks/keith/the-garage/mark.md";
const parcel = (over = {}) => record({ kind: "parcel", by: "keith", at: { x: 100, y: 100 }, extent: { w: 25, h: 25 }, body: "keith's parcel", ...over });
const garageAt = (x, y) => record({ by: "keith", at: { x, y }, extent: { w: 4, h: 4 }, body: "the garage" });
const garageRow = { "keith/the-garage": { household: "house-k", path: GARAGE, class: "commons" } };

test("THE RULED INSTANCE: a parcel published around a ✦0 commons mark in the same crossing protects it", (t) => {
  const w = town(t, { main: { [GARAGE]: garageAt(100, 100) }, rows: garageRow, drafts: { "draft/keith": { [PARCEL]: parcel() } } });
  const report = settlementSweep({ repo: w.repo, stakesPath: w.stakesPath });
  assert.deepEqual(ids(report.published), ["keith/keith-parcel"]);
  assert.deepEqual(ids(report.unpublished), [], "judged against the result, the garage walks home and stays");
  assert.ok(w.file(GARAGE), "the garage stands");
});

test("THE OWN AMEND (gap read P2): a household moving its ✦0 commons mark onto its own parcel is published, never also unpublished", (t) => {
  // On main at 5d1ef1e4 the sweep published the amend (judged against the
  // household's own sketchbook) AND unpublished the mark (judged against main
  // as the crossing found it): the file was written and then removed, the
  // amend was lost, and the harm gate passed it.
  const w = town(t, {
    main: { [PARCEL]: parcel(), [GARAGE]: garageAt(1000, 1000) },
    rows: garageRow,
    drafts: { "draft/keith": { [GARAGE]: garageAt(100, 100) } },
  });
  const report = settlementSweep({ repo: w.repo, stakesPath: w.stakesPath });
  assert.deepEqual(ids(report.published), ["keith/the-garage"]);
  assert.deepEqual(ids(report.unpublished), []);
  assert.match(w.file(GARAGE) ?? "", /at: \{ x: 100, y: 100 \}/, "the amend stands, at its new place");
  assert.equal(w.registry()["keith/the-garage"].class, "home");
});

test("THE WITHDRAWAL: a parcel withdrawn from under a ✦0 commons-row mark leaves it on open ground, and the same crossing takes it", (t) => {
  const w = town(t, {
    main: { [PARCEL]: parcel(), [GARAGE]: garageAt(100, 100) },
    rows: garageRow,
    drafts: { "draft/keith": { [PARCEL]: null } },
  });
  const report = settlementSweep({ repo: w.repo, stakesPath: w.stakesPath });
  assert.deepEqual(ids(report.withdrawn), ["keith/keith-parcel"]);
  assert.deepEqual(ids(report.unpublished), ["keith/the-garage"], "judged against the result, it is a commons mark with no stamps");
  assert.equal(w.file(GARAGE), null);
});

test("B1: a parcel the grammar suite holds back lends no ground — a ✦0 mark on it stays drafted", (t) => {
  const SHED = "WORLD/marks/keith/the-shed/mark.md";
  const w = town(t, {
    drafts: { "draft/keith": { [PARCEL]: parcel(), [SHED]: record({ by: "keith", at: { x: 100, y: 100 }, extent: { w: 4, h: 4 }, body: "a shed" }) } },
  });
  const report = settlementSweep({ repo: w.repo, stakesPath: w.stakesPath, suiteQuarantine: new Set(["keith/keith-parcel"]) });
  assert.deepEqual(ids(report.suite_quarantined), ["keith/keith-parcel"]);
  assert.deepEqual(ids(report.published), [], "the shed does not publish at ✦0 on ground that did not cross");
  assert.equal(why(report, "keith/the-shed"), "commons needs escrow > 0");
  assert.equal(w.file(SHED), null);
});

test("B2: a ✦0 mark judged home on ground that is then held back waits with its ground", (t) => {
  // The meadow is a ✦0 market mark, so it stays drafted; the parcel is filed
  // under it, so the closure hold keeps the parcel back; the shed was judged
  // home ON the parcel, so it must not publish at ✦0 without it.
  const MEADOW = "WORLD/marks/keith/the-meadow/mark.md";
  const NESTED = "WORLD/marks/keith/the-meadow/keith-parcel/mark.md";
  const SHED = "WORLD/marks/keith/the-shed/mark.md";
  const w = town(t, {
    drafts: { "draft/keith": {
      [MEADOW]: record({ by: "keith", at: { x: 5000, y: 5000 }, extent: { w: 200, h: 200 }, body: "a meadow" }),
      [NESTED]: parcel({ at: { x: 5000, y: 5000 } }),
      [SHED]: record({ by: "keith", at: { x: 5000, y: 5000 }, extent: { w: 4, h: 4 }, body: "a shed" }),
    } },
  });
  const report = settlementSweep({ repo: w.repo, stakesPath: w.stakesPath });
  assert.deepEqual(ids(report.published), []);
  assert.equal(why(report, "keith/the-meadow"), "commons needs escrow > 0");
  assert.match(why(report, "keith/keith-parcel") ?? "", /^held: its ground/);
  assert.match(why(report, "keith/the-shed") ?? "", /^held: the ground it stood on did not cross this settlement/);
  assert.equal(w.file(SHED), null);
});

test("B3: a welcome written on another household's parcel in the same crossing lets the welcomed ✦0 mark publish", (t) => {
  const ALICE = "WORLD/marks/alice/alice-parcel/mark.md";
  const STOOL = "WORLD/marks/bob/the-stool/mark.md";
  const aliceParcel = (consent) => record({ kind: "parcel", by: "alice", at: { x: 300, y: 300 }, extent: { w: 40, h: 40 }, body: "alice's parcel", date: "2026-07-01", consent });
  const w = town(t, {
    main: { [ALICE]: aliceParcel() },
    drafts: {
      "draft/alice": { [ALICE]: aliceParcel(`"bob/the-stool": "welcomed"`) },
      "draft/bob": { [STOOL]: record({ by: "bob", at: { x: 300, y: 300 }, extent: { w: 2, h: 2 }, body: "a stool, welcomed" }) },
    },
  });
  const report = settlementSweep({ repo: w.repo, stakesPath: w.stakesPath });
  assert.deepEqual(ids(report.published), ["alice/alice-parcel", "bob/the-stool"]);
  assert.equal(w.registry()["bob/the-stool"].class, "home");
});

test("FAIL SAFE: a result that cannot be admitted takes nothing, and the crossing completes", (t) => {
  const BENCH = "WORLD/marks/bob/the-bench/mark.md";
  const w = town(t, {
    main: { [BENCH]: record({ by: "bob", at: { x: 1000, y: 1000 }, extent: { w: 1, h: 1 }, body: "a bench on open ground" }) },
    rows: { "bob/the-bench": { household: "house-b", path: BENCH, class: "commons" } },
    drafts: { "draft/keith": { [PARCEL]: parcel() } },
  });
  const report = settlementSweep({ repo: w.repo, stakesPath: w.stakesPath, resultAdmitter: () => { throw new Error("planted"); } });
  assert.deepEqual(ids(report.unpublished), [], "the ✦0 bench would be taken; with the result unread, nothing is");
  assert.deepEqual(ids(report.published), ["keith/keith-parcel"], "publishes fall back to their sketchbook's reading");
  assert.match(report.result.error ?? "", /planted/);
  assert.ok(w.file(BENCH));
});

test("THE CONTROL: with nothing laid on main, a ✦0 market mark is still taken, on the fold's own verdict", (t) => {
  const BENCH = "WORLD/marks/bob/the-bench/mark.md";
  const w = town(t, {
    main: { [BENCH]: record({ by: "bob", at: { x: 1000, y: 1000 }, extent: { w: 1, h: 1 }, body: "a bench on open ground" }) },
    rows: { "bob/the-bench": { household: "house-b", path: BENCH, class: "commons" } },
  });
  const report = settlementSweep({ repo: w.repo, stakesPath: w.stakesPath });
  assert.deepEqual(ids(report.unpublished), ["bob/the-bench"]);
  assert.equal(report.fold_stats.whole, 1, "on ONE whole-world fold (§4)");
});

// ── review-214 (FIX), ported from its probes (docs/2026-10-13/rail/WLD-51/probes/review-214/) ──

const KIM_HOUSE = "WORLD/marks/kim/kims-house/mark.md";
const KIM_PARCEL = "WORLD/marks/kim/kim-parcel/mark.md";
const BOB_BENCH = "WORLD/marks/bob/the-bench/mark.md";
const kimHouse = (consent = `"bob/the-bench": "welcomed"`) =>
  record({ by: "kim", at: { x: 100, y: 100 }, extent: { w: 6, h: 6 }, body: "kim's house", ...(consent ? { consent } : {}) });
const kimParcel = (over = {}) => record({ kind: "parcel", by: "kim", at: { x: 100, y: 100 }, extent: { w: 25, h: 25 }, body: "kim's parcel", date: "2026-10-14", ...over });
const bobBench = () => record({ by: "bob", at: { x: 100, y: 100 }, extent: { w: 1, h: 1 }, body: "a bench in kim's house" });
const bobBenchRow = { "bob/the-bench": { household: "house-b", path: BOB_BENCH, class: "commons" } };
// A row laid ELSEWHERE, so the sweep reads the result path rather than main's fold.
const ELSEWHERE = { "draft/sable": { "WORLD/marks/sable/sable-parcel/mark.md": record({ kind: "parcel", by: "sable", at: { x: 20000, y: 20000 }, extent: { w: 25, h: 25 }, body: "sable's parcel, far away" }) } };

test("C1, beside THE CONTROL: with a row laid elsewhere, a ✦0 bench on open ground is still taken, through the result", (t) => {
  const BENCH = "WORLD/marks/bob/the-open-bench/mark.md";
  const w = town(t, {
    main: { [BENCH]: record({ by: "bob", at: { x: 9000, y: 9000 }, extent: { w: 1, h: 1 }, body: "open ground" }) },
    rows: { "bob/the-open-bench": { household: "house-b", path: BENCH, class: "commons" } },
    drafts: ELSEWHERE,
  });
  const report = settlementSweep({ repo: w.repo, stakesPath: w.stakesPath });
  assert.deepEqual(ids(report.unpublished), ["bob/the-open-bench"]);
  assert.ok(report.result.laid >= 1 && report.result.admitted >= 2, JSON.stringify(report.result));
});

test("W1: a welcome already on MAIN keeps its ✦0 guest when rows are laid elsewhere (the consent word rides main's views)", (t) => {
  const AP = "WORLD/marks/alice/alice-parcel/mark.md";
  const STOOL = "WORLD/marks/bob/the-stool/mark.md";
  const w = town(t, {
    main: {
      [AP]: record({ kind: "parcel", by: "alice", at: { x: 300, y: 300 }, extent: { w: 40, h: 40 }, body: "alice's parcel", date: "2026-07-01", consent: `"bob/the-stool": "welcomed"` }),
      [STOOL]: record({ by: "bob", at: { x: 300, y: 300 }, extent: { w: 2, h: 2 }, body: "a stool, welcomed" }),
    },
    rows: { "bob/the-stool": { household: "house-b", path: STOOL, class: "commons" } },
    drafts: ELSEWHERE,
  });
  const report = settlementSweep({ repo: w.repo, stakesPath: w.stakesPath });
  assert.deepEqual(ids(report.unpublished), [], "welcomed on main: home, laid or not");
});

test("Q2: a consent word that welcomes ANOTHER mark changes nothing: the unwelcomed ✦0 guest is taken", (t) => {
  const AP = "WORLD/marks/alice/alice-parcel/mark.md";
  const STOOL = "WORLD/marks/bob/the-stool/mark.md";
  const w = town(t, {
    main: {
      [AP]: record({ kind: "parcel", by: "alice", at: { x: 300, y: 300 }, extent: { w: 40, h: 40 }, body: "alice's parcel", date: "2026-07-01", consent: `"bob/another-thing": "welcomed"` }),
      [STOOL]: record({ by: "bob", at: { x: 300, y: 300 }, extent: { w: 2, h: 2 }, body: "a stool, not welcomed" }),
    },
    rows: { "bob/the-stool": { household: "house-b", path: STOOL, class: "commons" } },
    drafts: ELSEWHERE,
  });
  const report = settlementSweep({ repo: w.repo, stakesPath: w.stakesPath });
  assert.deepEqual(ids(report.unpublished), ["bob/the-stool"]);
});

test("THE CHAIN RE-ASK: a main house that welcomes a ✦0 bench comes to stand on a parcel arriving this crossing (claimed before the house) — the bench is kept", (t) => {
  // The house is re-admitted only because the bench's walk stands on it; left
  // as main had it, its containment never sees the new parcel.
  const w = town(t, {
    main: { [KIM_HOUSE]: kimHouse(), [BOB_BENCH]: bobBench() },
    rows: bobBenchRow,
    drafts: { "draft/kim": { [KIM_PARCEL]: kimParcel({ date: "2026-07-01" }) } },
  });
  const report = settlementSweep({ repo: w.repo, stakesPath: w.stakesPath });
  assert.deepEqual(ids(report.published), ["kim/kim-parcel"]);
  assert.deepEqual(ids(report.unpublished), [], "the fold: the house is sovereign on kim's parcel and welcomes the bench");
});

test("D1: the same, with the parcel claimed AFTER the house — sovereignty is the result's, not claim order's, so the bench is kept as the fold keeps it", (t) => {
  const laid = town(t, { main: { [KIM_HOUSE]: kimHouse(), [BOB_BENCH]: bobBench() }, rows: bobBenchRow, drafts: { "draft/kim": { [KIM_PARCEL]: kimParcel() } } });
  assert.deepEqual(ids(settlementSweep({ repo: laid.repo, stakesPath: laid.stakesPath }).unpublished), []);
  // the control: the same final world with the parcel already on main, so the fold's own tier decides
  const folded = town(t, { main: { [KIM_HOUSE]: kimHouse(), [KIM_PARCEL]: kimParcel(), [BOB_BENCH]: bobBench() }, rows: bobBenchRow });
  assert.deepEqual(ids(settlementSweep({ repo: folded.repo, stakesPath: folded.stakesPath }).unpublished), []);
});

test("D1, THE REVERSE: the parcel arriving welcomes the bench and the house does not — the house is the bench's ground, so it is taken, as the fold takes it", (t) => {
  const parcelWelcomes = { consent: `"bob/the-bench": "welcomed"` };
  const laid = town(t, { main: { [KIM_HOUSE]: kimHouse(null), [BOB_BENCH]: bobBench() }, rows: bobBenchRow, drafts: { "draft/kim": { [KIM_PARCEL]: kimParcel(parcelWelcomes) } } });
  assert.deepEqual(ids(settlementSweep({ repo: laid.repo, stakesPath: laid.stakesPath }).unpublished), ["bob/the-bench"]);
  const folded = town(t, { main: { [KIM_HOUSE]: kimHouse(null), [KIM_PARCEL]: kimParcel(parcelWelcomes), [BOB_BENCH]: bobBench() }, rows: bobBenchRow });
  assert.deepEqual(ids(settlementSweep({ repo: folded.repo, stakesPath: folded.stakesPath }).unpublished), ["bob/the-bench"], "the fold agrees");
});

test("B1 ON THE FALLBACK: when the result cannot be admitted, a suite-held parcel still lends no ground to a ✦0 sibling", (t) => {
  const SHED = "WORLD/marks/keith/the-shed/mark.md";
  const w = town(t, {
    drafts: { "draft/keith": { [PARCEL]: parcel(), [SHED]: record({ by: "keith", at: { x: 100, y: 100 }, extent: { w: 4, h: 4 }, body: "a shed" }) } },
  });
  const report = settlementSweep({ repo: w.repo, stakesPath: w.stakesPath, suiteQuarantine: new Set(["keith/keith-parcel"]),
    resultAdmitter: () => { throw new Error("planted"); } });
  assert.match(report.result.error ?? "", /planted/);
  assert.deepEqual(ids(report.published), [], "the sketchbook's own reading leaves the held parcel out of the world it judges in");
  assert.equal(why(report, "keith/the-shed"), "commons needs escrow > 0");
});

test("THE TOWN'S OWN MARK is never judged off a re-admitted view: a constitution mark under a commons row at ✦0 stays, rows laid or not", (t) => {
  const NODE = "WORLD/marks/the-town/the-quay-post/mark.md";
  const w = town(t, {
    main: { [NODE]: record({ by: "the-town", tier: "constitution", at: { x: 700, y: 700 }, extent: { w: 2, h: 2 }, body: "the quay's post" }) },
    rows: { "the-town/the-quay-post": { household: "the-town", path: NODE, class: "commons" } },
    drafts: ELSEWHERE,
  });
  const report = settlementSweep({ repo: w.repo, stakesPath: w.stakesPath });
  assert.deepEqual(ids(report.unpublished), []);
  assert.ok(w.file(NODE));
});

test("A JUDGED MARK THE RESULT CANNOT ADMIT is kept, and named on the report", (t) => {
  // An admission error on a re-asked mark (its parent left this crossing, a
  // home word outside its household, …) leaves it out of the views; planted
  // here by dropping its view, since each real cause also reddens the gate.
  const BENCH = "WORLD/marks/bob/the-open-bench/mark.md";
  const w = town(t, {
    main: { [BENCH]: record({ by: "bob", at: { x: 9000, y: 9000 }, extent: { w: 1, h: 1 }, body: "open ground" }) },
    rows: { "bob/the-open-bench": { household: "house-b", path: BENCH, class: "commons" } },
    drafts: ELSEWHERE,
  });
  const resultAdmitter = (candidates, base) => {
    const admitted = admitDelta(candidates, base);
    admitted.views.delete("bob/the-open-bench");
    return admitted;
  };
  const report = settlementSweep({ repo: w.repo, stakesPath: w.stakesPath, resultAdmitter });
  assert.deepEqual(ids(report.unpublished), [], "a mark is never taken on a walk not run");
  assert.deepEqual(report.result.judged_unread, ["bob/the-open-bench"]);
});

test("H1: a suite-held parcel's naming mark does not quarantine its household — the held parcel is still admitted, and the staked sibling publishes", (t) => {
  // review-214's re-check: leaving the held row out of the sketchbook's
  // admission made its child's `parent:` unfindable, and the whole sketchbook
  // was set aside. The isolation pass's ordinary shape.
  const NAME = "WORLD/marks/keith/the-parcel-name/mark.md";
  const LANTERN = "WORLD/marks/keith/the-lantern/mark.md";
  const w = town(t, {
    drafts: { "draft/keith": {
      [PARCEL]: parcel(),
      [NAME]: "---\nkind: predicated\nby: keith\ndate: 2026-07-28\nparent: keith/keith-parcel\nslot: name\nvalue: Keith's Acre\n---\n\nIts name.\n",
      [LANTERN]: record({ by: "keith", at: { x: 9000, y: 9000 }, extent: { w: 1, h: 1 }, body: "a lantern on open ground, staked" }),
    } },
    stakes: [{ holder: "s1", mark: "keith/the-lantern", n: 2, weight: 4 }],
  });
  const report = settlementSweep({ repo: w.repo, stakesPath: w.stakesPath, suiteQuarantine: new Set(["keith/keith-parcel"]) });
  assert.deepEqual(report.quarantined, [], "the household is not set aside");
  assert.deepEqual(ids(report.suite_quarantined), ["keith/keith-parcel"]);
  assert.deepEqual(ids(report.published), ["keith/the-lantern"], "the staked lantern, which nothing held, publishes");
  assert.ok(w.file(LANTERN));
  assert.equal(w.file(NAME), null, "the name waits with its parcel");
});

// ── G2: STANDING DECIDES IN BOTH DIRECTIONS (Darko, WLD-51, 2026-10-15 12:59) ─
//
//   "A mark first filed as home that now stands on market ground is takeable
//    at ✦0." The cone (berthillon/cone-peche-de-vigne-2026-08-27, ✦4 on 10-15)
//    is the live case.

const homeRow = { "keith/the-garage": { household: "house-k", path: GARAGE, class: "home" } };

test("G2: a home row whose mark walks market at ✦0 is taken, with nothing laid on main; a home row that walks home stays", (t) => {
  const SHED = "WORLD/marks/keith/the-shed/mark.md";
  const w = town(t, {
    main: { [PARCEL]: parcel(), [SHED]: record({ by: "keith", at: { x: 100, y: 100 }, extent: { w: 4, h: 4 }, body: "a shed" }), [GARAGE]: garageAt(1000, 1000) },
    rows: { ...homeRow, "keith/the-shed": { household: "house-k", path: SHED, class: "home" } },
  });
  const report = settlementSweep({ repo: w.repo, stakesPath: w.stakesPath });
  assert.deepEqual(ids(report.unpublished), ["keith/the-garage"], "stored home, standing on open ground: taken");
  assert.equal(w.file(GARAGE), null);
  assert.ok(w.file(SHED), "stored home, walking home: kept");
  assert.equal(w.registry()["keith/the-garage"], undefined, "its row leaves the registry");
});

test("G2 + THE WITHDRAWAL: a parcel withdrawn from under a ✦0 HOME-row mark leaves it on open ground, and the same crossing takes it", (t) => {
  const w = town(t, {
    main: { [PARCEL]: parcel(), [GARAGE]: garageAt(100, 100) },
    rows: homeRow,
    drafts: { "draft/keith": { [PARCEL]: null } },
  });
  const report = settlementSweep({ repo: w.repo, stakesPath: w.stakesPath });
  assert.deepEqual(ids(report.withdrawn), ["keith/keith-parcel"]);
  assert.deepEqual(ids(report.unpublished), ["keith/the-garage"], "judged against the result, the home row's mark walks market with no stamps");
  assert.equal(w.file(GARAGE), null);
});

test("G2, backed or still at home: a home row's mark is kept when stamps stand behind it, or when this crossing's parcel is its ground", (t) => {
  const backed = town(t, {
    main: { [GARAGE]: garageAt(1000, 1000) }, rows: homeRow,
    stakes: [{ holder: "s1", mark: "keith/the-garage", n: 2, weight: 4 }],
  });
  const kept = settlementSweep({ repo: backed.repo, stakesPath: backed.stakesPath });
  assert.deepEqual(ids(kept.unpublished), [], "✦2 behind it: kept");
  const sheltered = town(t, { main: { [GARAGE]: garageAt(100, 100) }, rows: homeRow, drafts: { "draft/keith": { [PARCEL]: parcel() } } });
  const report = settlementSweep({ repo: sheltered.repo, stakesPath: sheltered.stakesPath });
  assert.deepEqual(ids(report.published), ["keith/keith-parcel"]);
  assert.deepEqual(ids(report.unpublished), [], "the parcel arriving this crossing is its ground: town, then sovereign, then market");
});
