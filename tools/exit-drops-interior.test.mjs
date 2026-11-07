// exit-drops-interior.test.mjs — WLD-62: a World page left open across an exit
// from a dungeon stops drawing what it saw from inside.
//
//   node --test tools/exit-drops-interior.test.mjs
//
// LAW (Wright, WLD-62, 2026-11-06T02:03:42Z, the ruling this builds to): "when the
// standpoint leaves a dungeon, by either exit path (the page's own exit, or a door
// exit the page learns from the ledger), the page drops everything it saw from
// inside. That's one falsifier for each path. No new sight model."
//
// THE BUG (Darko, 10-15, play row 3): a tab open across an exit went on drawing a
// dungeon's rooms until a reload. The office's read and the occupancy fold were
// right all along, and a fresh page showed the exterior; only the open page kept
// the inside. Two ways out reach it, and both end in the same two calls
// (loadEnterExitLedger, then renderCurrent):
//
//   PAGE EXIT    the room card's own "step outside" (stepOutside, the door asks
//                first and "go" sends confirm:true).
//   LEDGER EXIT  a door or CLI exit (confirm:true) the page never saw happen; it
//                learns it when its 30 s tick re-reads the crossings (play fix 57).
//
// THE ROOM IS INVENTED and stays a dungeon (the Spire's first floor stops being
// one at S154, WLD-135). The office is a stub that plays the door: the same
// reader, asked from inside and from outside, answers as the real office does
// (the read follows the reader's enter stack). The FRESH CONTROL is a separate
// page opened after the exit, and each arm must match it. Nothing here calls
// rerender, reload or anything else on the page under test: the page is driven
// by its own button (page exit) or left alone (ledger exit).
//
// Every world here is synthetic. Nothing reads a record.

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttp } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { townRegionMarks } from "../spectator/viewer.mjs";
import { machinePage, readsSettled } from "./page-machine.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── THE INVENTED WORLD ─────────────────────────────────────────────────────
const TOWN = { x: 0, y: 0 };
const REGION = { id: "rig-town/the-town-centre", kind: "sited", tier: "constitution", by: "rig-town", at: TOWN, extent: { w: 1400, h: 1400 }, body: "a synthetic region",
  points: [{ x: -700, y: -700 }, { x: 700, y: -700 }, { x: 700, y: 700 }, { x: -700, y: 700 }] };
const FRAME = { id: "rig-town/let-there-be-light", kind: "sited", tier: "constitution", by: "rig-town", at: TOWN, extent: { w: 40000, h: 40000 }, body: "the world frame" };
const plot = (who, at) => ({ id: `${who}/the-plot`, kind: "parcel", tier: "home", by: who, household: who, at, extent: { w: 25, h: 25 }, body: `${who}'s plot` });
const STANDPOINT = { x: 200, y: 100 };
// the dungeon: a sited mark carrying the class, an instance with an extent (portals.mjs isDungeon)
const VAULT = { id: "rig-keep/the-vault", kind: "sited", tier: "home", by: "rig-keep", class: "dungeon", at: STANDPOINT, extent: { w: 80, h: 80 }, body: "an invented dungeon that stays one" };
// what stands inside it: sited marks wholly within the vault's box
const INSIDE = [
  { id: "rig-keep/the-vault-lantern", kind: "sited", tier: "home", by: "rig-keep", at: { x: 185, y: 90 }, extent: { w: 8, h: 8 }, body: "a lantern, seen only from inside" },
  { id: "rig-keep/the-vault-chest", kind: "sited", tier: "home", by: "rig-keep", at: { x: 215, y: 112 }, extent: { w: 8, h: 8 }, body: "a chest, seen only from inside" },
  { id: "rig-keep/the-vault-bench", kind: "sited", tier: "home", by: "rig-keep", at: { x: 195, y: 118 }, extent: { w: 8, h: 8 }, body: "a bench, seen only from inside" },
];
// the exterior: neighbours well clear of the vault, so beads/cards to be drawn
const OUTSIDE = [[-300, -200], [-150, 260], [40, -340], [380, 220], [520, -60], [-460, 80], [90, 330], [-80, -90]]
  .map(([x, y], i) => plot(`rig-neighbour-${i + 1}`, { x: TOWN.x + x, y: TOWN.y + y }));
const MARKS = [FRAME, REGION, VAULT, ...INSIDE, ...OUTSIDE];
const byId = new Map(MARKS.map((m) => [m.id, m]));
const must = (id) => { const m = byId.get(id); if (!m) throw new Error(`fixture member "${id}" is required by this file and is not in the invented world`); return m; };
const INSIDE_IDS = INSIDE.map((m) => m.id);
const OUTSIDE_IDS = OUTSIDE.map((m) => m.id);
const FOLD = {
  tick: 0, dials: {}, marks: MARKS,
  parcels: OUTSIDE.map((p) => ({ id: p.id, household: p.household, at: p.at, extent: p.extent })),
  determined: {}, vague: [], rivalries: [], portfolios: {}, terrain_weight: {}, errors: [],
};
const SKELETON = {
  _grid: { cell_m: 1, scale: "5 m per atlas px", origin: "the Origin, synthetic: atlas (485,760)" },
  elevation: { fog_ceiling_m: 22, quay_m: 5 },
  light: { dawn_pole_m: { x: 5075, y: 450 }, dark_pole_m: { x: -1900, y: 2150 } },
  features: [], far_features: [], physics_registry: {},
};

const HANDLE = "rig-reader";
const ENTERED = `- 2026-08-20T01:00:00.000Z · ${HANDLE} · enters ${VAULT.id} · at 138.0000 · word neutral\n`;
const EXITED = ENTERED + `- 2026-08-20T02:00:00.000Z · ${HANDLE} · exits ${VAULT.id} · at 139.0000\n`;
const LEDGER_HEAD = "# crossings\n\n";

// The reader's read, as the office answers it: from inside, the vault and what it
// holds; from outside, the town around it. The vault is a rect mark in the read's
// `nearby` either way (a dungeon draws as its own mark alone from outside).
const rowOf = (m) => ({ id: m.id, at: m.at, kind: m.kind, tier: m.tier, distance_m: Math.round(Math.hypot(m.at.x - STANDPOINT.x, m.at.y - STANDPOINT.y)), bearing: "N" });
const recordsOf = (marks) => Object.fromEntries([...townRegionMarks(MARKS), ...marks].map((m) => [m.id, m]));
const readFor = (inside) => ({
  handle: HANDLE,
  standpoint: { ...STANDPOINT, name: "the rig's standpoint" },
  within: inside ? [{ id: VAULT.id }] : [],
  nearby: (inside ? [VAULT, ...INSIDE] : [VAULT, ...OUTSIDE]).map(rowOf),
  records: recordsOf(inside ? [VAULT, ...INSIDE] : [VAULT, ...OUTSIDE]),
  telling: inside ? "The vault is quiet." : "The rig's air is clear.",
  present: { residents: [] },
});

// ── THE RIG ────────────────────────────────────────────────────────────────
const CLEANUP = [];
after(() => { for (const stop of CLEANUP.reverse()) { try { stop(); } catch { /* already gone */ } } });
const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.on("error", reject);
  probe.listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});
async function loadChromium() { try { return (await import("playwright")).chromium; } catch { return null; } }

/** One rig: the page server over its own synthetic WORLD_DIR, a stub office that
 *  plays the door, and a stub atlas sheet. `door.inside` is the whole truth of
 *  where the reader stands; the ledger file and every read follow it. */
async function bootRig() {
  const dir = mkdtempSync(join(tmpdir(), "wld62-exit-world-"));
  CLEANUP.push(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "world-state.json"), JSON.stringify(FOLD));
  writeFileSync(join(dir, "skeleton.json"), JSON.stringify(SKELETON));
  writeFileSync(join(dir, "walk-ledger.md"), "# walks\n\nsynthetic: nobody has walked in the rig\n");
  const door = {
    inside: true,
    asked: [],                                   // every exit act the office was handed
    setInside(v) {
      this.inside = v;
      writeFileSync(join(dir, "enter-exit-ledger.md"), LEDGER_HEAD + (v ? ENTERED : EXITED));
    },
  };
  door.setInside(true);

  const officePort = await freePort();
  const office = createHttp((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${officePort}`);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    const send = (b, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
    if (url.pathname === "/ops/whoami") return send({ principal: "rig", handles: [HANDLE] });
    if (url.pathname === "/world/my-marks") return send({ drafts: [], docket: [], published: [], backed: [], counts: { drafts: 0, docket: 0, published: 0, backed: 0 }, complete: true });
    if (url.pathname === "/world/apex" && req.method === "GET") return send(readFor(door.inside));
    if (url.pathname === "/world/apex" && req.method === "POST") {
      let raw = "";
      req.on("data", (c) => { raw += c; });
      req.on("end", () => {
        let body = {};
        try { body = JSON.parse(raw); } catch { /* an unreadable act is an empty one */ }
        if (body.do !== "exit") return send({ error: "bounce", defect: "the rig's office takes only an exit" }, 422);
        door.asked.push(body.args ?? {});
        // LEAVING A DUNGEON ASKS FIRST: the first answer writes nothing; "go" sends confirm:true
        if (!body.args?.confirm) {
          return send({ did: "exit", result: { dungeon: VAULT.id, awaiting: { effect: "confirm", because: "Leave the invented vault from here?" } } });
        }
        door.setInside(false);
        return send({ did: "exit", result: { exited: VAULT.id } });
      });
      return;
    }
    send({ error: "bounce", defect: "no such door in the rig" }, 404);
  });
  await new Promise((resolve) => office.listen(officePort, "127.0.0.1", resolve));
  CLEANUP.push(() => office.close());

  const atlasPort = await freePort();
  const SHEET = '<!doctype html><html><body><svg id="map-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 2400"><rect x="0" y="0" width="1500" height="2400" fill="#101418"/></svg></body></html>';
  const atlas = createHttp((req, res) => {
    if (req.url.startsWith("/atlas/")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(SHEET); }
    res.writeHead(404); res.end("");
  });
  await new Promise((resolve) => atlas.listen(atlasPort, "127.0.0.1", resolve));
  CLEANUP.push(() => atlas.close());

  const port = await freePort();
  const proc = spawn(process.execPath, [join(ROOT, "spectator", "server.mjs")], {
    cwd: ROOT, env: { ...process.env, PORT: String(port), ATLAS_ORIGIN: `http://127.0.0.1:${atlasPort}`, WORLD_DIR: dir }, stdio: ["ignore", "pipe", "pipe"],
  });
  CLEANUP.push(() => proc.kill());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the rig did not announce itself in 30s")), 30_000);
    proc.stdout.on("data", (b) => { if (String(b).includes(`localhost:${port}`)) { clearTimeout(timer); resolve(); } });
    proc.on("exit", (code) => { clearTimeout(timer); reject(new Error(`the rig exited ${code} before serving`)); });
  });
  return { port, officePort, door };
}

let chromium = null, browser = null;
before(async () => {
  chromium = await loadChromium();
  if (!chromium) return;
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
});
const SKIP = "NO PLAYWRIGHT: whether the open World page forgets an exited dungeon's inside is unguarded on this machine";

async function openPage(rig) {
  const page = await machinePage(browser, { viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.addInitScript((base) => { try { localStorage.setItem("pm.office.base", base); localStorage.setItem("pm_key", "rig-key-not-a-secret"); localStorage.setItem("pm.world.act_as", "rig-reader"); } catch {} },
    `http://127.0.0.1:${rig.officePort}`);
  await page.goto(`http://localhost:${rig.port}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  return page;
}
/** the ids the painting draws, and whether the room scene is mounted */
const drawn = (page) => page.evaluate(() => ({
  ids: [...new Set([...document.querySelectorAll("#wv-overlay [data-id]")].map((e) => e.dataset.id))].sort(),
  scene: !!document.querySelector(".wv-minimap.is-scene-mark"),
}));
const waitFor = (page, ids, scene) => page.waitForFunction(([want, sc]) => {
  const have = new Set([...document.querySelectorAll("#wv-overlay [data-id]")].map((e) => e.dataset.id));
  return want.every((id) => have.has(id)) && !!document.querySelector(".wv-minimap.is-scene-mark") === sc;
}, [ids, scene], { timeout: 90_000 });

/** the exterior a FRESH page shows once the reader is outside: the separate control */
async function freshOutside() {
  const rig = await bootRig();
  rig.door.setInside(false);
  const page = await openPage(rig);
  await waitFor(page, [VAULT.id, ...OUTSIDE_IDS.slice(0, 1)], false);
  await readsSettled(page);
  const seen = await drawn(page);
  await page.close();
  return seen;
}

test("THE INVENTED WORLD IS WHOLE: a dungeon that stays one, what it holds, and a town around it", () => {
  for (const id of [VAULT.id, ...INSIDE_IDS, ...OUTSIDE_IDS, REGION.id, FRAME.id]) must(id);
  assert.equal(VAULT.class, "dungeon");
  assert.equal(INSIDE_IDS.length, 3);
  assert.equal(OUTSIDE_IDS.length, 8);
});

test("PAGE EXIT: stepping out through the room card's own button leaves the page drawing what a fresh page draws", async (t) => {
  if (!chromium) return t.skip(SKIP);
  const control = await freshOutside();
  const rig = await bootRig();
  const page = await openPage(rig);
  try {
    // POSITIVE: from inside, the room's furniture is drawn and the scene is mounted
    await waitFor(page, INSIDE_IDS, true);
    const before = await drawn(page);
    for (const id of INSIDE_IDS) assert.ok(before.ids.includes(id), `${id} is drawn from inside, or "dropped" below means nothing`);
    // the page's own exit: the card's button, the door asks first, then "go"
    await page.click(".wv-int-exit-btn", { timeout: 60_000 });
    await page.click(".wv-exit-confirm", { timeout: 60_000 });
    // the exterior comes back (the genuine exterior-positive control, so a blank scene cannot pass)
    await waitFor(page, [VAULT.id, OUTSIDE_IDS[0]], false);
    await readsSettled(page);
    const after = await drawn(page);
    assert.deepEqual(rig.door.asked, [{ mark: VAULT.id }, { mark: VAULT.id, confirm: true }], "the page asked, was asked to confirm, and confirmed");
    assert.equal(after.scene, false, "the room scene is gone");
    assert.deepEqual(after.ids.filter((id) => INSIDE_IDS.includes(id)), [], "nothing seen from inside is still drawn after the page's own exit");
    assert.deepEqual(after.ids, control.ids, "the open page draws exactly what a fresh page draws at the resulting standpoint");
  } finally { await page.close().catch(() => {}); }
});

test("LEDGER EXIT: an exit the page never saw, learned from the ledger, leaves the page drawing what a fresh page draws", async (t) => {
  if (!chromium) return t.skip(SKIP);
  const control = await freshOutside();
  const rig = await bootRig();
  const page = await openPage(rig);
  try {
    await waitFor(page, INSIDE_IDS, true);
    const before = await drawn(page);
    for (const id of INSIDE_IDS) assert.ok(before.ids.includes(id), `${id} is drawn from inside, or "dropped" below means nothing`);
    // the door exit happens elsewhere (a CLI with confirm:true): the ledger and the office move, the page is not touched
    rig.door.setInside(false);
    // the page's own 30 s tick re-reads the crossings; waiting is on the drawing, never on a duration
    await waitFor(page, [VAULT.id, OUTSIDE_IDS[0]], false);
    await readsSettled(page);
    const after = await drawn(page);
    assert.deepEqual(rig.door.asked, [], "the page sent no exit of its own: this exit was learned from the ledger");
    assert.equal(after.scene, false, "the room scene is gone");
    assert.deepEqual(after.ids.filter((id) => INSIDE_IDS.includes(id)), [], "nothing seen from inside is still drawn after the ledger exit");
    assert.deepEqual(after.ids, control.ids, "the open page draws exactly what a fresh page draws at the resulting standpoint");
  } finally { await page.close().catch(() => {}); }
});
