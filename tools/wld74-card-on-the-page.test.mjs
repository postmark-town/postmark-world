// wld74-card-on-the-page.test.mjs — WLD-74, the resident card on the REAL page
// (Wright, 2026-11-05 04:48: "radialWhere gets its resident-only fix in this
// build, with the real controls you named: three arms, a true outside case, and
// a room").
//
// The real viewer, served by the real server, signed in as an invented resident
// through a stub office (the resident path: whoami, the read, where she stands).
// What the resident has entered is the page's own reading of the enter ledger,
// served here per arm. Selecting a mark opens its column, whose where-line is
// `radialWhere`'s, and the telling's card carries the same line:
//   UNENTERED  the bowl under her feet reads "here"
//   ENTERED    "you are inside"
//   EXITED     "here" again
//   OUTSIDE    a real thing 30 m east, in her view, reads "30 m · east of you"
//   ROOM       an untyped shed under her feet reads "you are inside" in every arm
// and the camera keeps its words: a spectator over a bowl is told "the camera is
// inside" by the card, while the page's own eyes (the engine, B) no longer put the
// bowl in the ladder of where the camera stands.
//
// Every record is invented. Run: node --test tools/wld74-card-on-the-page.test.mjs

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttp } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { townRegionMarks } from "../spectator/viewer.mjs";
import { formatEnterExit } from "./enter-exit.mjs";
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

const ACTOR = "rig-wren";
const HERE = { x: 221, y: 95.5 };   // in the Town Centre, where the record's own rings are
const BOWL = "rig-wren/a-door-bowl";      // a halloween-candy-bowl (a subclass thing) centred under her
const OUT = "rig-wren/a-far-lamp";        // a thing 30 m east, in her view: the true outside case
const SHED = "rig-wren/the-shed";         // an untyped room under her feet: geometry, as ever
const RECORDS = {
  [BOWL]: { id: BOWL, by: ACTOR, household: ACTOR, kind: "halloween-candy-bowl", tier: "market", at: { ...HERE }, extent: { w: 2, h: 2 }, body: "A carved pumpkin bowl." },
  [OUT]: { id: OUT, by: ACTOR, household: ACTOR, kind: "thing", tier: "market", at: { x: HERE.x + 30, y: HERE.y }, extent: { w: 1, h: 1 }, body: "A lamp on a post." },
  [SHED]: { id: SHED, by: ACTOR, household: ACTOR, kind: "sited", tier: "market", at: { ...HERE }, extent: { w: 20, h: 20 }, body: "A garden shed." },
};
const READ = {
  handle: ACTOR,
  standpoint: { x: HERE.x, y: HERE.y, name: "the rig's yard", stance: "embodied", handle: ACTOR },
  within: [{ id: SHED }],
  nearby: [
    { id: BOWL, at: { ...HERE }, bearing: "N", distance_m: 0, kind: "halloween-candy-bowl", tier: "market" },
    { id: OUT, at: { x: HERE.x + 30, y: HERE.y }, bearing: "E", distance_m: 30, kind: "thing", tier: "market" },
  ],
  records: { ...Object.fromEntries(townRegionMarks(SERVED.marks).map((m) => [m.id, m])), ...RECORDS },
  present: { radius_m: 120, residents: [] },
  actions: [{ action: "say", blurb: "Speak where you stand.", from: "the-town/resident", class: "resident", grant: "yours", fields: { text: "string" }, dispatches_to: "world_say" }],
  telling: "The rig's yard is quiet.",
};
// the office's word on a kind: how the page learns a bowl is a thing (its own lineage source, thingClasses)
const EXPLAIN = {
  "halloween-candy-bowl": { explains: "halloween-candy-bowl", class: "the-town/halloween-candy-bowl", what: "A Halloween Candy Bowl is a thing that holds.",
    extends: [{ class: "thing" }, { class: "sited" }, { class: "mark" }, { class: "postmark-node" }] },
  thing: { explains: "thing", class: "the-town/thing", what: "A thing.", extends: [{ class: "sited" }, { class: "mark" }, { class: "postmark-node" }] },
};
// the enter ledger, per arm: the page reads it as the resident's enter stack
const ENTERS = formatEnterExit({ handle: ACTOR, act: "enters", mark: BOWL, at: 1, iso: "2026-10-01T00:00:00.000Z" });
const EXITS = formatEnterExit({ handle: ACTOR, act: "exits", mark: BOWL, at: 2, iso: "2026-10-01T01:00:00.000Z" });
const LEDGERS = { unentered: "", entered: `${ENTERS}\n`, exited: `${ENTERS}\n${EXITS}\n` };
let arm = "unentered";
const ledgerText = () => `# enter-exit ledger (an invented rig)\n\n${LEDGERS[arm]}`;

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
      if (q.get("mark")) return send({ ...READ, focus: { id: q.get("mark"), body: RECORDS[q.get("mark")]?.body ?? "", can: [] } });
      if (q.get("read") === "walk") return send({ read: "walk", walkers: { walkers: [] } });
      return send(READ);
    }
    if (url.pathname === "/world/enter-exit-ledger") return send({ ledger: ledgerText() });
    if (url.pathname === "/world/present") return send({ at: 1000, residents: [{ handle: ACTOR, at: { ...HERE }, source: "walk", standing: true }] });
    if (url.pathname === "/world/walkers") return send({ at: 1000, walkers: [], standing: [{ handle: ACTOR, x: HERE.x, y: HERE.y, standing: true }] });
    if (url.pathname === "/world/my-marks") return send({ handle: ACTOR, drafts: [], docket: [], published: [], backed: [], complete: true, counts: { drafts: 0, docket: 0, published: 0, backed: 0 } });
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

let chromium = null, rig = null, browser = null, office = null;
before(async () => {
  chromium = await loadChromium();
  if (!chromium) return;
  [rig, office] = await Promise.all([bootRig(), bootStubOffice()]);
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
});

/** open the page, signed in or as the camera, with this arm's enter ledger served on the page's own path too */
async function openPage({ signedIn, worldState = null }) {
  const page = await machinePage(browser, { viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.route("**/WORLD/enter-exit-ledger.md", (route) => route.fulfill({ status: 200, contentType: "text/markdown", body: ledgerText() }));
  if (worldState) await page.route("**/WORLD/world-state.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(worldState) }));
  await page.addInitScript((base) => { try { localStorage.setItem("pm.office.base", base); } catch {} }, "http://127.0.0.1:" + office.port);
  if (signedIn) {
    // a key the stub never checks: its PRESENCE puts the viewer on the signed-in branch. No real secret is here.
    await page.addInitScript(() => { try { localStorage.setItem("pm_key", "rig-key-not-a-secret"); } catch {} });
    await page.addInitScript((h) => { try { localStorage.setItem("pm.world.act_as", h); } catch {} }, ACTOR);
  }
  await page.goto("http://localhost:" + rig.port + "/", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  await page.waitForFunction(() => !!window.__pmViewer, null, { timeout: 60_000 });
  return { page, errors };
}

/** select a mark as a click would and read its column's where-line, waiting for it to be the one asked */
async function whereOf(page, id) {
  await page.evaluate((x) => window.__pmViewer.select(x), id);
  await page.waitForFunction((x) => {
    const col = document.querySelector(".wv-homecol");
    return !!col && !col.hidden && !!col.querySelector(".wv-homecol-meta") && (col.textContent.includes(x) || !!col.querySelector(".wv-homecol-title"));
  }, id, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(400);
  return page.evaluate(() => document.querySelector(".wv-homecol .wv-homecol-meta")?.textContent.trim() ?? null);
}
/** what the page shows when a column did not open: for a failure message only */
const pageState = (page) => page.evaluate(() => ({
  col: (() => { const c = document.querySelector(".wv-homecol"); return c ? { hidden: c.hidden, text: c.textContent.replace(/\s+/g, " ").slice(0, 160) } : null; })(),
  roomCard: [...document.querySelectorAll(".wv-room-card, [class*='room-card']")].map((e) => e.textContent.replace(/\s+/g, " ").slice(0, 120)),
  cards: [...document.querySelectorAll(".wv-card[data-id]")].map((e) => `${e.getAttribute("data-id")}: ${e.querySelector(".wv-detail-where")?.textContent ?? ""}`).slice(0, 12),
}));

/** wait until the resident's read has landed and the enter ledger has been read */
async function residentSettled(page) {
  const until = Date.now() + 60_000;
  while (Date.now() < until && !office.asked.some((p) => p.startsWith("/world/present"))) await page.waitForTimeout(200);
  await page.waitForFunction((bowl) => !!document.querySelector(`.wv-card[data-id="${bowl}"]`), BOWL, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

const skipReason = "playwright is absent, so the resident card's WLD-74 arms go unguarded: run npm ci here (playwright is this package's devDependency)";

for (const [name, want] of [["unentered", "here"], ["entered", "you are inside"], ["exited", "here"]]) {
  test(`RESIDENT · ${name.toUpperCase()}: the bowl under her feet reads "${want}"; the shed she stands in reads "you are inside"; the lamp 30 m east reads its distance`, async (t) => {
    if (!chromium) return t.skip(skipReason);
    arm = name;
    const { page, errors } = await openPage({ signedIn: true });
    try {
      await residentSettled(page);
      const bowlWhere = await whereOf(page, BOWL);
      assert.equal(bowlWhere, want, `the bowl's where-line (${name}); the page: ${bowlWhere === want ? "" : JSON.stringify(await pageState(page))}`);
      // the telling's card carries the same line at the page's next render: the bowl's lineage is the office's
      // answer to the page's own ask (thingClasses, learned), and a card drawn before it landed is redrawn by
      // the next render as every card is (the handle's rerender is renderCurrent itself)
      await page.evaluate(() => window.__pmViewer.rerender());
      await page.waitForTimeout(400);
      const cards = await page.evaluate((x) => [...document.querySelectorAll(`.wv-card[data-id="${x}"] .wv-detail-where`)].map((e) => e.textContent.trim()), BOWL);
      if (name === "entered") assert.ok(cards.every((c) => c === "you are inside"), `entered, the bowl is the scene she is inside, never a card that says here: ${cards}`);
      else assert.ok(cards.length > 0 && cards.every((c) => c === want), `the bowl's card (${name}): ${JSON.stringify(cards)}`);
      assert.equal(await whereOf(page, SHED), "you are inside", "ROOM CONTROL: a room under her feet is geometry, as ever");
      assert.equal(await whereOf(page, OUT), "30 m · east of you", "OUTSIDE CONTROL: a real thing in view, measured from her body");
      assert.deepEqual(errors, [], "no page errors");
    } finally { await page.close(); }
  });
}

test("SPECTATOR · the camera keeps its words over a bowl (\"the camera is inside\"), and the page's own eyes no longer put the bowl in the camera's ladder", async (t) => {
  if (!chromium) return t.skip(skipReason);
  arm = "unentered";
  const CAM_BOWL = "wld74-fixture/bowl-under-camera";
  const state = { ...SERVED, marks: [...SERVED.marks, { id: CAM_BOWL, by: "wld74-fixture", household: "wld74-fixture", kind: "halloween-candy-bowl", tier: "market",
    at: { x: 0, y: 0 }, extent: { w: 6, h: 6 }, body: "A bowl set under the camera's resting point." }] };
  const { page, errors } = await openPage({ signedIn: false, worldState: state });
  try {
    await page.waitForFunction(() => document.querySelectorAll(".wv-card.ladder").length > 0, null, { timeout: 90_000 }).catch(() => {});
    const ladder = await page.evaluate(() => [...document.querySelectorAll(".wv-card.ladder")].map((c) => c.getAttribute("data-id")));
    assert.ok(ladder.length > 0, "control: the camera stands within something (the ladder is drawn)");
    assert.ok(!ladder.includes(CAM_BOWL), `the bowl is not where the camera stands: ${ladder}`);
    assert.equal(await whereOf(page, CAM_BOWL), "the camera is inside", "the camera's own words, unchanged");
    assert.deepEqual(errors, [], "no page errors");
  } finally { await page.close(); }
});
