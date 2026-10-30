// part2-on-the-page.test.mjs — LOGOS v2 part 2 on the World page (POS-678),
// driven in a browser against a stub office that answers in the office's own
// shapes (office train/2026-w43 @ dd226dbd; see tools/holdings-page.test.mjs
// for where each shape comes from).
//
// The overnight A/B walk (docs/2026-10-18/w43-ship/SPIRE-AB-QA.md § Bags and
// bowls on the page) found the page showing none of part 2. These are its
// findings, each read off the rendered page:
//
//   1. a holder's column says what it holds, by kind, with its room and
//      whether it is open; a resident's column says what is in their hands
//   2. a bag in your own hands is never drawn as a mark of its own (POS-688,
//      Darko 2026-10-18 20:58: published but unplaced), and its column says
//      "in your hands", never "11 m southeast of you"
//   2b. a kite set down is drawn where it was set down: the office's read
//      places it there (review-241 H2; POS-688: the record says so)
//   4. a Halloween bowl reads as a thing, never "A place", on the map before
//      any column is opened (review-241 N2)
//   5. the say card says the office's numbers (the stub's are off the
//      defaults, 45 m and 20 minutes, so a page that hard-codes 60/15 reds;
//      the page said "fades from hearing in five minutes")
//
// ── THE CAN-FAIL FLIPS ─────────────────────────────────────────────────────
//   drop `...holdingFacts(holding)` from markColumnView      → 1 reds
//   overlayMarks drawing a held thing (no held_by filter)    → 2 and 4d red (the pips part)
//   radialWhere without the held line                        → 2 reds (the column says "11 m · southeast of you")
//   the kicker read raw off `household` (page fix 1)           → 1c reds ("hh:rig-house")
//   the column ignoring the record's held_by (fix 4)          → 4d reds (no "held by")
//   ownIds without the docket (page fix 1)                     → 1c reds (no "Yours")
//   markWhat without thingClasses                            → 4 reds
//   iconsOf without askLineage                               → 4's draw-time row reds
//   containmentIndex keying things on class === "thing" alone → 2b reds (her place line names the bowl)
//   noteThingKind ignoring a close look's holder             → 4b reds (the old-form bag is "A place")
//   sayNote() back to the old sentence                       → 5 reds
//
// The browser is CI's (suite.yml installs playwright); the box skips by name.

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttp } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { townRegionMarks } from "../spectator/viewer.mjs";
import { machinePage } from "./page-machine.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVED = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));

const PLAYWRIGHT_PATHS = ["playwright"];
async function loadChromium() {
  for (const spec of PLAYWRIGHT_PATHS) {
    try { return (await import(spec)).chromium; } catch { /* try the next */ }
  }
  return null;
}
const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.on("error", reject);
  probe.listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});
const CLEANUP = [];
after(() => { for (const stop of CLEANUP.reverse()) { try { stop(); } catch { /* already gone */ } } });

// the rig's own household, so no mark of the town's shares an id
const ACTOR = "rig-ash";
const HERE = { x: 221, y: 95.5 };   // in the Town Centre, where the record's own rings are
const BOWL = "rig-ash/a-halloween-bowl";
const BAG = "rig-ash/a-cloth-bag-one";
const CLEO = "rig-cleo";               // stands on the bowl too, so her body is drawn where the bowl's pip is
const KITE = "rig-cleo/a-kite";
const STOOL = "rig-ash/a-stool";       // where the kite is set down: its pip is the reference
const STOOL_AT = { x: 205, y: 110 };
// the Candy Bag in the OLD form (kind: sited, class: <kind>), as the playground's sb-ash wrote it
const CANDY_BAG = "rig-ash/a-candy-bag";
// a tin box the actor set down: the office files its re-site as a pending amend (office #613),
// which /world/my-marks lists on the DOCKET with the store's registry key for its household
const TIN_BOX = "rig-ash/a-tin-box";
const TIN_BOX_DOCKET = { id: TIN_BOX, by: ACTOR, kind: "thing", tier: "market", body: "A dented tin box with a hinged lid.",
  date: "2026-10-18T15:46:00.000Z", at: { x: 214, y: 100 }, extent: { w: 1, h: 1 }, claim_status: "pending", household: "hh:rig-house" };
const RECORDS = {
  [BOWL]: { id: BOWL, by: ACTOR, household: ACTOR, kind: "halloween-candy-bowl", tier: "market", at: { ...HERE }, extent: { w: 1, h: 1 },
    body: "A second pumpkin bowl." },
  // in the actor's hands: published but unplaced (POS-688), as the office's placed read gives it
  // (its canon place was ~11 m southeast of where the actor stands: where the page used to draw it)
  [BAG]: { id: BAG, by: ACTOR, household: ACTOR, kind: "thing", holder: true, capacity: 3, tier: "market", held_by: ACTOR,
    body: "A cloth bag." },
  // set down by cleo on the stool's spot: the office's read places it where it was set down
  [KITE]: { id: KITE, by: CLEO, household: CLEO, kind: "thing", tier: "market", at: { ...STOOL_AT }, extent: { w: 1, h: 1 }, body: "A paper kite." },
  // given into the bowl: held by the bowl, so unplaced too
  [CANDY_BAG]: { id: CANDY_BAG, by: ACTOR, household: ACTOR, kind: "sited", class: "halloween-candy-bag", tier: "market", held_by: BOWL,
    body: "A bag for gathering candy." },
  [STOOL]: { id: STOOL, by: ACTOR, household: ACTOR, kind: "sited", tier: "market", at: { ...STOOL_AT }, extent: { w: 1, h: 1 }, body: "A stool." },
};
const READ = {
  handle: ACTOR,
  standpoint: { x: HERE.x, y: HERE.y, name: "the rig's yard", stance: "embodied", handle: ACTOR },
  within: [],
  nearby: [
    { id: BOWL, at: { ...HERE }, bearing: "N", distance_m: 0, kind: "halloween-candy-bowl", tier: "market" },
    // the bag and the candy bag are held: never in anyone's field of view as marks of their own (POS-688)
    { id: KITE, at: { ...STOOL_AT }, bearing: "SW", distance_m: 21, kind: "thing", tier: "market" },
    { id: STOOL, at: { ...STOOL_AT }, bearing: "SW", distance_m: 21, kind: "sited", tier: "market" },
  ],
  // the ground set, as a real read carries it: townGround refuses a set with no region rings
  records: { ...Object.fromEntries(townRegionMarks(SERVED.marks).map((m) => [m.id, m])), ...RECORDS },
  present: { radius_m: 120, residents: [] },
  actions: [{ action: "say", blurb: "Speak where you stand.", from: "the-town/resident", class: "resident", grant: "yours",
    fields: { text: "string" }, dispatches_to: "world_say" },
    { action: "enter", blurb: "Go inside a place.", from: "the-town/resident", class: "resident", grant: "yours", fields: { mark: "string" }, dispatches_to: "world_enter" }],
  telling: "The rig's yard is quiet.",
};
// world-kinds.mjs § investigateMark, merged into the apex focus
const FOCUS = {
  [BOWL]: { id: BOWL, body: "A second pumpkin bowl.", holder: { capacity: 30, open: true },
    holds: { holder: BOWL, count: 5, class: "thing", shows: "5 things", kinds: [{ kind: "candy", count: 4, shows: "4 candies" }] },
    can: ["take", "give", "refill"], class_pointer: 'kind: halloween-candy-bowl · a thing · a sited — explain: "halloween-candy-bowl"' },
  [BAG]: { id: BAG, body: "A cloth bag.", holder: { capacity: 3, open: true },
    holds: { holder: BAG, count: 2, class: "candy", shows: "2 candies", kinds: [{ kind: "candy", count: 2, shows: "2 candies" }] },
    can: [], class_pointer: 'kind: thing · a sited · a mark — explain: "thing"' },
  // a holder's close look whose pointer names no thing (an old-form row pointed at "sited"),
  // from an office whose class layer cannot explain the kind: its `holder` is the only word
  [CANDY_BAG]: { id: CANDY_BAG, body: "A bag for gathering candy.", holder: { capacity: 200, open: true },
    holds: { holder: CANDY_BAG, count: 8, class: "candy", shows: "8 candies", kinds: [{ kind: "candy", count: 8, shows: "8 candies" }] },
    can: ["take", "give"], class_pointer: 'kind: sited · a mark — explain: "sited"',
    // given into the bowl: its close look names its holder and gives no place (POS-688)
    held_by: BOWL },
  [STOOL]: { id: STOOL, body: "A stool.", can: [], class_pointer: 'kind: sited · a mark — explain: "sited"' },
};
// world-hold.mjs § world_holdings, and the ground within reach (groundRow)
const TAKE = {
  read: "take",
  holdings: { handle: ACTOR, count: 1, shown: 1, limit: 20, offset: 0, complete: true,
    holding: [{ thing: BAG, made_by: ACTOR }],
    kinds: { holder: ACTOR, count: 3, class: "candy", shows: "3 candies", kinds: [{ kind: "candy", count: 3, shows: "3 candies" }] } },
  ground: { at: { ...HERE }, reach_m: 60, count: 1, things: [
    { thing: BAG, made_by: ACTOR, stands_at: { ...HERE }, place_from: "holder", distance_m: 0, holder: ACTOR, takeable: false },
  ] },
};
// world-apex.mjs § investigateOn
// `holds` as the office sends it: mark rows (world-investigate-entity.mjs), never bare ids
const INVESTIGATED = {
  [ACTOR]: { kind: "resident", handle: ACTOR, holds: [{ id: BAG, name: "A Cloth Bag", body: "A cloth bag." }],
    holds_by_kind: { holder: ACTOR, count: 3, class: "candy", shows: "3 candies", kinds: [{ kind: "candy", count: 3, shows: "3 candies" }] } },
  [CLEO]: { kind: "resident", handle: CLEO, holds: [] },
};
// class-read.mjs § explainClass: the whole chain, which the page asks once at draw time
const EXPLAIN = { "halloween-candy-bowl": { explains: "halloween-candy-bowl", class: "the-town/halloween-candy-bowl", what: "A Halloween Candy Bowl is a thing that holds.",
  extends: [{ class: "thing" }, { class: "sited" }, { class: "mark" }, { class: "postmark-node" }] } };
// voices.mjs § conversations
const CONVERSATIONS = { now: "2026-10-18T03:00:00.000Z", earshot_m: 45, fade_minutes: 20, hearable_since: "2026-10-17T22:00:00.000Z",
  close_minutes: 30, live: [], closed: [] };

async function bootStubOffice() {
  const port = await freePort();
  const asked = [];
  const srv = createHttp((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1:" + port);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    asked.push(url.pathname + url.search);
    const send = (b) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
    const q = url.searchParams;
    if (url.pathname === "/ops/whoami") return send({ principal: false, household: "rig-house", handles: [ACTOR] });
    if (url.pathname === "/world/apex") {
      if (q.get("explain")) return send(EXPLAIN[q.get("explain")] ?? { error: "bounce", defect: "no class by that name" });
      if (q.get("mark")) return send({ ...READ, focus: FOCUS[q.get("mark")] ?? { error: "bounce", defect: "no such mark" } });
      if (q.get("investigate")) return send({ ...READ, investigated: INVESTIGATED[q.get("investigate")] ?? { error: "bounce" } });
      if (q.get("read") === "take") return send(TAKE);
      if (q.get("read") === "walk") return send({ read: "walk", walkers: { walkers: [] } });
      return send(READ);
    }
    if (url.pathname === "/world/present") return send({ at: 1000, residents: [{ handle: ACTOR, at: { ...HERE }, source: "walk", standing: true }, { handle: CLEO, at: { ...HERE }, source: "walk", standing: true }] });
    if (url.pathname === "/world/walkers") return send({ at: 1000, walkers: [], standing: [{ handle: ACTOR, x: HERE.x, y: HERE.y, standing: true }, { handle: CLEO, x: HERE.x, y: HERE.y, standing: true }] });
    if (url.pathname === "/world/conversations") return send(CONVERSATIONS);
    // the resident's portfolio: nothing of theirs is published, so the read is the page's index
    if (url.pathname === "/world/my-marks") return send({ handle: ACTOR, drafts: [], docket: [TIN_BOX_DOCKET], published: [], backed: [], complete: true, counts: { drafts: 0, docket: 1, published: 0, backed: 0 } });
    if (url.pathname === `/stamps/${ACTOR}`) return send({ handle: ACTOR, balance: 5 });
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bounce", defect: "no such door in the rig" }));
  });
  await new Promise((resolve) => srv.listen(port, "127.0.0.1", resolve));
  CLEANUP.push(() => srv.close());
  return { port, asked };
}

async function bootRig() {
  const port = await freePort();
  const proc = spawn(process.execPath, [join(ROOT, "spectator", "server.mjs")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), ATLAS_ORIGIN: "http://127.0.0.1:1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  CLEANUP.push(() => proc.kill());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the rig did not announce itself in 30s")), 30_000);
    proc.stdout.on("data", (b) => { if (String(b).includes("localhost:" + port)) { clearTimeout(timer); resolve(); } });
    proc.on("exit", (code) => { clearTimeout(timer); reject(new Error("the rig exited " + code + " before serving")); });
  });
  return { port };
}

let chromium = null, rig = null, browser = null, office = null, page = null;
const errors = [];
before(async () => {
  chromium = await loadChromium();
  if (!chromium) return;
  [rig, office] = await Promise.all([bootRig(), bootStubOffice()]);
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
  page = await machinePage(browser, { viewport: { width: 1400, height: 900 } });
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.addInitScript((base) => { try { localStorage.setItem("pm.office.base", base); } catch {} }, "http://127.0.0.1:" + office.port);
  await page.addInitScript(() => { try { localStorage.setItem("pm_key", "rig-key-not-a-secret"); } catch {} });
  await page.addInitScript((h) => { try { localStorage.setItem("pm.world.act_as", h); } catch {} }, ACTOR);
  await page.goto("http://localhost:" + rig.port + "/", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  // the resident's read, then their hands (read: "take") — both asked of the office
  await page.waitForFunction(() => !!window.__pmViewer, null, { timeout: 60_000 });
  const until = Date.now() + 60_000;
  while (Date.now() < until && !office.asked.some((p) => p.includes("read=take"))) await new Promise((r) => setTimeout(r, 250));
  await page.waitForFunction((bowl) => !!document.querySelector(`circle.ov-pip[data-id="${bowl}"]`), BOWL, { timeout: 60_000 })
    .catch(async (e) => {
      const pips = await page.evaluate(() => [...document.querySelectorAll("circle.ov-pip[data-id]")].map((c) => c.getAttribute("data-id")).slice(0, 20));
      throw new Error(`the bowl was never drawn: pips ${JSON.stringify(pips)}; asked ${JSON.stringify(office.asked.slice(0, 40))}; errors ${JSON.stringify(errors)}; ${e.message}`);
    });
  await page.waitForTimeout(1500);
});

const skipReason = "playwright is absent, so part 2 on the page goes unguarded: run npm ci here (playwright is this package's devDependency)";

/** select an id as a click would, and read the column it opens */
async function columnFor(id, { until = null } = {}) {
  await page.evaluate((x) => window.__pmViewer.select(x), id);
  await page.waitForFunction(({ want }) => {
    const col = document.querySelector(".wv-homecol");
    return !!col && !col.hidden && (!want || col.textContent.includes(want));
  }, { want: until }, { timeout: 20_000 }).catch(() => {});
  return page.evaluate(() => {
    const col = document.querySelector(".wv-homecol");
    const facts = {};
    const dts = [...(col?.querySelectorAll(".wv-homecol-facts dt") ?? [])];
    for (const dt of dts) facts[dt.textContent.trim()] = dt.nextElementSibling?.textContent.replace(/\s+/g, " ").trim() ?? "";
    return {
      open: !!col && !col.hidden,
      title: col?.querySelector(".wv-homecol-title")?.textContent.trim() ?? "",
      kicker: col?.querySelector(".wv-homecol-kicker")?.textContent.trim() ?? "",
      meta: col?.querySelector(".wv-homecol-meta")?.textContent.trim() ?? "",
      enter: !!col?.querySelector("[data-enter]"),
      icons: [...(col?.querySelectorAll(".wv-homecol-icon .wv-ic") ?? [])].map((e) => [...e.classList].find((c) => c.startsWith("ic-"))),
      meanings: [...(col?.querySelectorAll(".wv-homecol-icon-meaning") ?? [])].map((e) => e.textContent.trim()),
      facts,
      relations: [...(col?.querySelectorAll(".wv-homecol-rel") ?? [])].map((g) => ({
        label: g.querySelector(".wv-homecol-rel-label")?.textContent.trim(),
        items: [...g.querySelectorAll(".wv-homecol-go")].map((b) => b.getAttribute("data-homecol-go")),
      })),
    };
  });
}

const pipAt = (id) => page.evaluate((x) => {
  const c = document.querySelector(`circle.ov-pip[data-id="${x}"]`);
  const g = c?.parentElement?.parentElement;
  const m = /translate\(([-\d.e]+)[ ,]+([-\d.e]+)\)/.exec(g?.getAttribute("transform") ?? "");
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}, id);

test("4a. on the map, before any column is opened, the bowl wears the thing icon (its chain asked at draw time)", async (t) => {
  if (!chromium) return t.skip(skipReason);
  await page.waitForFunction((bowl) => window.__pmViewer.iconsOf(bowl).includes("thing"), BOWL, { timeout: 20_000 }).catch(() => {});
  const icons = await page.evaluate((bowl) => window.__pmViewer.iconsOf(bowl), BOWL);
  assert.ok(icons.includes("thing"), "the pip and the plate say thing: " + JSON.stringify(icons));
  assert.ok(!icons.includes("place"));
  assert.ok(office.asked.some((p) => p === "/world/apex?explain=halloween-candy-bowl"), "the chain was asked of the class layer, once");
  assert.ok(!office.asked.some((p) => p.includes("mark=")), "and no column had been opened");
  assert.equal(office.asked.filter((p) => p === "/world/apex?explain=halloween-candy-bowl").length, 1, "once, however often the map draws");
});

test("1. a holder's column says what it holds, by kind, its room and that it is open", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const col = await columnFor(BOWL, { until: "5 of 30" });
  assert.ok(col.open, "the bowl's column opened");
  assert.equal(col.facts.contents, "5 things · 5 of 30", "the office's blur and its room: " + JSON.stringify(col.facts));
  assert.equal(col.facts.holds, undefined, "\"holds\" stays the spatial relation's word");
  assert.equal(col.facts["by kind"], "4 candies, 1 whole thing");
  assert.equal(col.facts.open, "open: other households may give into it and take from it");
  assert.ok(office.asked.some((p) => p.startsWith(`/world/apex?mark=${encodeURIComponent(BOWL)}`) && p.includes(`handle=${ACTOR}`)),
    "asked as the resident, through the close look: " + JSON.stringify(office.asked.filter((p) => p.includes("mark="))));
});

test("1c. a thing you set down reads like every card: its household by name, and yours (page fix 1)", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const col = await columnFor(TIN_BOX, { until: "A dented tin box" });
  assert.ok(col.open, "the set-down tin box's column opened");
  assert.equal(col.kicker, ACTOR, "never the registry key: " + JSON.stringify(col.kicker));
  assert.ok(col.icons.includes("ic-yours"), "and it is still yours: " + JSON.stringify(col.icons));
});

test("1b. a resident's column says what is in their hands", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const col = await columnFor(`walker:${ACTOR}`, { until: "3 candies" });
  assert.ok(col.open, "the resident's column opened");
  assert.equal(col.facts.carrying, "4 things", JSON.stringify(col.facts));
  assert.equal(col.facts["by kind"], "3 candies");
  const carrying = col.relations.find((r) => r.label === "whole things");
  assert.deepEqual(carrying?.items, [BAG], "their whole things, each a way into its column");
});

test("2. a bag in your hands is never drawn as a mark of its own, and its column says it is in your hands (POS-688)", async (t) => {
  if (!chromium) return t.skip(skipReason);
  // SUPERSEDED: "a bag in your hands is drawn with you". A held thing is published but unplaced: it
  // shows as its holder's contents (your column's "whole things") and never as a pip of its own.
  await page.waitForTimeout(500);
  assert.equal(await pipAt(BAG), null, "no pip for a thing in your hands");
  const col = await columnFor(BAG, { until: "2 candies · 2 of 3" });
  assert.equal(col.meta, "in your hands", "never its old place: " + JSON.stringify(col.meta));
  assert.equal(col.facts.contents, "2 candies · 2 of 3");
  const heldBy = col.relations.find((r) => r.label === "held by");
  assert.deepEqual(heldBy?.items, [`walker:${ACTOR}`]);
});

test("2b. a kite set down is drawn where it was set down, and its column says no one's hands", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const col = await columnFor(`walker:${CLEO}`);
  assert.ok(col.open, "her column opened");
  // she stands at the bowl: her place line names the ground under it, never the bowl (a kind of thing)
  assert.doesNotMatch(col.meta, /Halloween Bowl/, "never on A Halloween Bowl's ground: " + JSON.stringify(col.meta));
  const down = await pipAt(KITE), stool = await pipAt(STOOL);
  assert.ok(down && stool && Math.hypot(down.x - stool.x, down.y - stool.y) < 0.01,
    `on the ground where she set it down: kite ${JSON.stringify(down)}, the set-down spot ${JSON.stringify(stool)}`);
  const kiteCol = await columnFor(KITE);
  assert.ok(!/hands/.test(kiteCol.meta), "its column does not say it is in anyone's hands: " + JSON.stringify(kiteCol.meta));
});

test("4. a Halloween bowl reads as a thing, never a place", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const col = await columnFor(BOWL, { until: "5 of 30" });
  assert.ok(col.icons.includes("ic-thing"), "the thing icon: " + JSON.stringify(col.icons));
  assert.ok(!col.icons.includes("ic-place"), "not a place");
  assert.ok(!col.meanings.some((m) => /^A place/.test(m)), JSON.stringify(col.meanings));
});

test("4b. the Candy Bag (old form, kind: sited + class) reads as a thing; it offers enter as the office grants, like a place", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const place = await columnFor(STOOL, { until: "A stool." });
  assert.ok(place.enter, "a plain place keeps its door: " + JSON.stringify(place));
  const col = await columnFor(CANDY_BAG, { until: "8 of 200" });
  assert.equal(col.facts.contents, "8 candies · 8 of 200");
  assert.ok(col.icons.includes("ic-thing"), "a thing: " + JSON.stringify(col.icons));
  assert.ok(!col.meanings.some((m) => /^A place/.test(m)), "never \"A place\": " + JSON.stringify(col.meanings));
  // the office's enter takes any mark with a place and an extent, a thing included (Darko's F1 ruling, a);
  // this one is in the bowl, so it has no place to enter (POS-688: published but unplaced)
  assert.equal(col.enter, false, "a held thing has no door to offer");
});

test("4d. a thing held inside a holder names that holder, and is not drawn (page fix 4; POS-688)", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const col = await columnFor(CANDY_BAG, { until: "8 of 200" });
  const heldBy = col.relations.find((r) => r.label === "held by");
  assert.deepEqual(heldBy?.items, [BOWL], "held by the bowl, a way into its column: " + JSON.stringify(col.relations));
  assert.equal(col.meta, "inside A Halloween Bowl", "never the spot it stood before: " + JSON.stringify(col.meta));
  await page.waitForTimeout(400);
  assert.equal(await pipAt(CANDY_BAG), null, "a thing in a holder is its holder's contents, never a pip of its own");
});

test("5. the say card says the office's numbers", async (t) => {
  if (!chromium) return t.skip(skipReason);
  await page.evaluate(() => window.__pmViewer.select(null));
  await page.waitForSelector('[data-action-verb="say"]', { timeout: 30_000 });
  await page.click('[data-action-verb="say"]');
  await page.waitForFunction(() => /20 minutes/.test(document.querySelector(".wv-say-note")?.textContent ?? ""), null, { timeout: 20_000 }).catch(() => {});
  const note = await page.evaluate(() => document.querySelector(".wv-say-note")?.textContent ?? "");
  assert.equal(note, "a voice carries 45 metres and stays drawn on the map for 20 minutes. everyone in earshot can hear it until the next settlement, nobody else does, and the town keeps its conversations browsable.");
  assert.doesNotMatch(note, /five minutes|60 metres|15 minutes/, "the office's numbers, never the page's");
});

test("the page threw nothing", async (t) => {
  if (!chromium) return t.skip(skipReason);
  assert.deepEqual(errors, [], errors.join(" | "));
});
