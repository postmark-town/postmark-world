// walk-enter-terms-page.test.mjs — "walk there and enter" on the page, to a door
// with terms (WLD-48, 2026-10-14).
//
// The walk door nests the entry's answer in the walk's own receipt
// (`entry.awaiting`, `entry.terms`). The page read them off the walk's top
// level, so a terms door reached by a walk showed "on the way" and its accept
// button could never fire. These drive the page's own walkThereAndEnter: the
// button is pressed, the stub office answers the walk the way the office does,
// and the page must show the door's terms and resend the walk with the
// walker's word.
//
// ── THE CLAIMS ─────────────────────────────────────────────────────────────
//
//   1. a walk to a terms door shows the terms and "accept and cross"; pressing
//      it sends the WALK again, with accept: true; the queued answer then reads
//      "on the way" in the entry's own words
//   2. a walk whose entry queued nothing shows the door's refusal and the
//      office's note, never the walk's position sentence
//
// ── THE CAN-FAIL FLIPS ─────────────────────────────────────────────────────
//
//   `walkEntryOf = (answer) => answer`        → claim 1 reds (no accept button)
//   drop `refused` from walkEnterSheetHTML's words  → claim 2 reds
//
// The browser is CI's (suite.yml installs playwright); the box skips by name.

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttp } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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

const ACTOR = "rig-actor";
const MARK = "rig/the-terms-door";   // a mark of the rig's own, so no card of the town's shares its id
const TERMS = { body: "aboard: her timetable binds", edge: "aboard", consequence: "you ride where she sails" };
// The walk's own fields. Its `note` is the WALK's sentence, which is the one
// the page showed in place of the door's answer.
const WALK = {
  handle: ACTOR, from: { x: 0, y: 0 }, toward: { x: 40, y: 30 }, mark_id: MARK,
  departed_at_crossing: 1000, leg_m: 50, eta_crossings: 0.0004,
  note: "position derives from this record and the clock; you arrive whether or not anyone is watching",
};
// The office's answers, in walkEntryReceipt's shapes (office world.mjs; #541's
// not-queued arm for the ask and the refusal).
const ANSWERS = {
  ask: { ...WALK, entry: { queued_for_arrival: false, stop: MARK, eta: 1000.0004, handle: ACTOR,
    awaiting: { mark: MARK, terms: TERMS }, terms: TERMS,
    note: "nothing is queued: this mark asks for your word: walk again with accept: true to have the entry made on arrival. Nothing has been entered" } },
  queued: { ...WALK, entry: { queued_for_arrival: true, stop: MARK, eta: 1000.0004,
    note: "the entry is adjudicated when you arrive; nothing has been entered yet" } },
  refused: { ...WALK, entry: { queued_for_arrival: false, stop: MARK, eta: 1000.0004,
    refused: "the gate is barred to strangers after dark",
    note: "nothing is queued: the mark refuses you as its law stands now. Its own words are above. Nothing has been entered" } },
};
const READ = { handle: ACTOR, standpoint: { x: 0, y: 0, name: "the rig's standpoint", stance: "embodied" },
  within: [], nearby: [], records: {}, telling: "The rig's air is clear." };

// `door` picks the walk's answer: "terms" asks until the walker's word, then queues
async function bootStubOffice(door) {
  const port = await freePort();
  const walks = [];
  const srv = createHttp((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1:" + port);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    const send = (b) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
    if (url.pathname === "/ops/whoami") return send({ principal: false, household: "rig-house", handles: [ACTOR] });
    if (url.pathname === "/world/apex" && req.method === "POST") {
      let raw = "";
      req.on("data", (c) => { raw += c; });
      req.on("end", () => {
        const body = JSON.parse(raw || "{}");
        if (body.do !== "walk") return send(READ);
        walks.push(body.args ?? {});
        const answer = door === "terms" ? (body.args?.accept ? ANSWERS.queued : ANSWERS.ask) : ANSWERS[door];
        send({ did: "walk", result: answer });
      });
      return;
    }
    if (url.pathname === "/world/apex") return send(READ);
    if (url.pathname === "/world/walkers") return send({ at: 1000, walkers: [], standing: [] });
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bounce", defect: "no such door in the rig" }));
  });
  await new Promise((resolve) => srv.listen(port, "127.0.0.1", resolve));
  CLEANUP.push(() => srv.close());
  return { port, walks };
}

async function bootStubAtlas() {
  const port = await freePort();
  const SHEET = '<!doctype html><html><body>'
    + '<svg id="map-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 2400">'
    + '<rect x="0" y="0" width="1500" height="2400" fill="#101418"/></svg></body></html>';
  const srv = createHttp((req, res) => {
    if (req.url.startsWith("/atlas/")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(SHEET); }
    res.writeHead(404); res.end("");
  });
  await new Promise((resolve) => srv.listen(port, "127.0.0.1", resolve));
  CLEANUP.push(() => srv.close());
  return { port };
}

async function bootRig(atlasPort) {
  const port = await freePort();
  const proc = spawn(process.execPath, [join(ROOT, "spectator", "server.mjs")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), ATLAS_ORIGIN: "http://127.0.0.1:" + atlasPort },
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

let chromium = null, rig = null, browser = null;
before(async () => {
  chromium = await loadChromium();
  if (!chromium) return;
  const atlas = await bootStubAtlas();
  rig = await bootRig(atlas.port);
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
});

// Signed in as the actor, with a mark's card holding the page's own
// "walk there and enter" button — the button crossInto offers after "you are
// not at that door". The root's delegate and walkThereAndEnter are the page's.
async function openAtTheDoor(office) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.addInitScript((base) => { try { localStorage.setItem("pm.office.base", base); } catch {} },
    "http://127.0.0.1:" + office.port);
  await page.addInitScript(() => { try { localStorage.setItem("pm_key", "rig-key-not-a-secret"); } catch {} });
  await page.addInitScript((h) => { try { localStorage.setItem("pm.world.act_as", h); } catch {} }, ACTOR);
  await page.goto("http://localhost:" + rig.port + "/", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  await page.evaluate((mark) => {
    const card = document.createElement("article");
    card.className = "wv-card";
    card.dataset.id = mark;
    card.style.cssText = "position:fixed;left:40px;top:120px;z-index:99999;background:#111;padding:8px";
    // the refusal sheet crossInto places, holding the offer (walkThereSheetHTML's shape)
    card.innerHTML = `<div class="wv-cell-byline-row">${mark}</div>`
      + `<div class="wv-cross-sheet is-refused is-far" data-for="${mark}"><div class="wv-cross-head">you are not at that door</div>`
      + `<div class="wv-cross-row"><button type="button" class="ctl wv-walk-enter" data-walk-enter="${mark}">walk there and enter</button></div></div>`;
    document.querySelector(".wv").appendChild(card);
  }, MARK);
  return { page, errors };
}

const sheetOf = (page) => page.evaluate((mark) => {
  const card = document.querySelector(`.wv-card[data-id="${mark}"]`);
  const sheet = card?.querySelector(".wv-cross-sheet:not(.is-far)");
  return sheet ? {
    head: sheet.querySelector(".wv-cross-head")?.textContent ?? null,
    text: sheet.textContent,
    accept: sheet.querySelector("[data-walk-enter-accept]")?.textContent ?? null,
    offerGone: !card.querySelector(".is-far"),
  } : null;
}, MARK);

const skipReason = "playwright is absent, so the page's walk-and-enter goes unguarded: "
  + "run npm ci here (playwright is this package's devDependency)";

test("1. a walk to a terms door shows the terms and its accept, and the accept resends the walk with the walker's word", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const office = await bootStubOffice("terms");
  const { page, errors } = await openAtTheDoor(office);
  await page.click(".wv-walk-enter");
  await page.waitForFunction((mark) => document.querySelector(`.wv-card[data-id="${mark}"] .wv-cross-sheet:not(.is-far)`), MARK, { timeout: 15_000 });
  const asked = await sheetOf(page);
  assert.equal(asked.head, "this door has terms", "the door's ask, not a departure: " + JSON.stringify(asked));
  assert.match(asked.text, /aboard: her timetable binds/, "in the door's own words");
  assert.equal(asked.accept, "accept and cross", "and the walker can give their word");
  assert.equal(asked.offerGone, true, "the offer it answered is gone");
  assert.deepEqual(office.walks, [{ mark_id: MARK, enter_on_arrival: true }], "one walk so far, without the word");

  await page.click("[data-walk-enter-accept]");
  await page.waitForFunction(() => /on the way/.test(document.querySelector(".wv-card .wv-cross-sheet .wv-cross-head")?.textContent ?? ""),
    null, { timeout: 15_000 });
  assert.deepEqual(office.walks[1], { mark_id: MARK, enter_on_arrival: true, accept: true }, "the accept resent the WALK with accept: true");
  const queued = await sheetOf(page);
  assert.match(queued.text, /the entry is adjudicated when you arrive; nothing has been entered yet/, "the queued entry speaks in the office's words");
  assert.doesNotMatch(queued.text, /position derives/, "not the walk's own sentence");
  await page.close();
  assert.deepEqual(errors, [], "no page errors");
});

test("2. a walk whose entry queued nothing says the door's refusal and the office's note", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const office = await bootStubOffice("refused");
  const { page, errors } = await openAtTheDoor(office);
  await page.click(".wv-walk-enter");
  await page.waitForFunction((mark) => document.querySelector(`.wv-card[data-id="${mark}"] .wv-cross-sheet:not(.is-far)`), MARK, { timeout: 15_000 });
  const said = await sheetOf(page);
  await page.close();
  assert.equal(said.head, "on the way", "the walk stands");
  assert.match(said.text, /the gate is barred to strangers after dark/, "the mark's own refusal is on the page: " + JSON.stringify(said));
  assert.match(said.text, /nothing is queued/, "and the office's note that nothing was queued");
  assert.doesNotMatch(said.text, /position derives|cross the threshold when you arrive/, "never a promise of an entry");
  assert.deepEqual(errors, [], "no page errors");
});
