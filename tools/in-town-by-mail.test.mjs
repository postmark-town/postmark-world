// in-town-by-mail.test.mjs — "In town by mail": a names-only list beside the map (POS-945).
//
// Little Bird counted (Discord 11-07 20:27 EST): residents who have never walked sit on the walkers door at the
// Origin with `placeholder: true`, and the map leaves them off. Pidgey found it. Darko 11-07 22:06 EST: "A list
// beside the map." Wright's build shape (11-08 03:08Z): "In town by mail", names only, each linking to their
// address page. Never a dot at the Origin, and no position made up. A resident leaves the list the moment they
// have a real position (a walk, a landing or ground). Source the list from what already marks them (the walkers
// door's placeholder: true), so it can't drift from the map's own rule.
//
// ── THE CLAIMS ─────────────────────────────────────────────────────────────
//
//   1. the pure part: byMailFrom reads the flag alone, a real row wins, the town is no resident; byMailHTML links
//      only what residentHref allows and escapes the rest
//   2. the Spectator's page: the placeholder residents are listed beside the map, each a link to their address
//      page, names only, and no body is drawn for them; a placed resident (including one standing on the real
//      Origin) is not listed
//   3. the same answer that gives a resident a real position removes the name (no second request, no timer of its own)
//   4. the resident path (acting as someone), and an UNPLACED reader (no standpoint at all), see the same list
//   5. a missed poll leaves the last good list standing, and shows no error of its own
//
// ── THE CAN-FAIL FLIPS ─────────────────────────────────────────────────────
//
//   drop `takeByMail(townRows)` from the Spectator poll                      → claims 2 and 3 red
//   drop `takeByMail(answered)` from the resident poll                       → claim 4 red
//   delete the `else { … takeByMail … }` for a reader with no standpoint    → claim 4's unplaced leg red
//   `byMailFrom` returns every standing row's handle (any row, not the flag) → claims 1 and 2 red
//   `takeByMail` clears the list when the answer is null                     → claim 5 red
//
// Invented residents only; the stubbed office answers whatever the test sets.

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttp } from "node:http";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { byMailFrom, byMailHTML, residentHref, townRegionMarks } from "../spectator/viewer.mjs";
import { machinePage } from "./page-machine.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVED = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
const SHOTS = process.env.POS945_SHOTS ?? null; // a folder for the local screenshots, never a prod page

// ── 1. the pure part ───────────────────────────────────────────────────────

test("byMailFrom reads the flag alone: a real row for the same handle wins, the town is no resident, duplicates collapse, order is stable", () => {
  const rows = [
    { handle: "zed", x: 0, y: 0, standing: true, placeholder: true },
    { handle: "amy", x: 0, y: 0, standing: true, placeholder: true },
    { handle: "amy", x: 0, y: 0, standing: true, placeholder: true },           // a duplicate row
    { handle: "bo", x: 0, y: 0, standing: true },                                 // standing on the real Origin: PLACED, not by mail
    { handle: "cy", x: 10, y: 10, standing: true, placeholder: true },             // flagged at a coordinate: still the flag's word
    { handle: "cy", x: 40, y: 40, moving: true },                                  // …but a real walk row for them wins
    { handle: "the-town", x: 0, y: 0, placeholder: true },
    { handle: "dee", x: 5, y: 5, placeholder: false },
    { x: 0, y: 0, placeholder: true },                                              // no handle
    null,
  ];
  assert.deepEqual(byMailFrom(rows), ["amy", "zed"]);
  assert.deepEqual(byMailFrom([]), []);
  assert.deepEqual(byMailFrom(undefined), []);
  assert.deepEqual(byMailFrom([{ handle: "no-flag", x: 0, y: 0 }]), [], "an absent flag is never by mail");
});

test("byMailHTML: names only, linked through residentHref; what is not a handle is text, never a link; everything is escaped", () => {
  const html = byMailHTML(["ana-one", "Bad Handle<b>", 'q"><img src=x onerror=1>'], { nameOf: (h) => (h === "ana-one" ? "Ana <One>" : h) });
  assert.match(html, /<li><a class="wv-bymail-link" href="\/residents\/ana-one\/">Ana &lt;One&gt;<\/a><\/li>/);
  assert.equal(residentHref("Bad Handle<b>"), null);
  assert.doesNotMatch(html, /<b>|<img|onerror=1>/, "no raw markup");
  assert.equal((html.match(/<a /g) ?? []).length, 1, "only the real handle is linked");
  assert.equal(html.match(/<li>/g).length, 3, "all three are listed by name");
});

// ── the page ───────────────────────────────────────────────────────────────

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

const PLACED = SERVED.marks.filter((m) => m?.kind === "parcel" && m.at && Number.isFinite(m.at.x));
const HOUSE = PLACED.find((m) => m.at.x > -1500 && m.at.x < 4000 && m.at.y > -2800 && m.at.y < 7000) ?? null;
const STAND = { x: HOUSE?.at?.x ?? 0, y: HOUSE?.at?.y ?? 0 };
const off = (dx, dy) => ({ x: STAND.x + dx, y: STAND.y + dy });

const ACTOR = "rig-actor", NEAR = "rig-near", ON_ORIGIN = "rig-on-the-origin";
const MAIL = ["mail-two", "mail-one", "mail-three"];                 // listed alphabetically: mail-one, mail-three, mail-two
const BAD = "Bad Handle<b>";
const placeholderRow = (handle) => ({ handle, x: 0, y: 0, standing: true, placeholder: true, source: "groundless" });

// the town's answer, as the stubbed office gives it: set by each test
let TOWN = { at: 187.5, walkers: [], standing: [] };
let TOWN_FAILS = false;
let walkersAsked = 0;
let presentAsked = 0;
const baseTown = () => ({
  at: 187.5,
  walkers: [],
  standing: [
    { handle: ACTOR, ...off(0, 0), standing: true },
    { handle: NEAR, ...off(40, 30), standing: true },
    { handle: ON_ORIGIN, x: 0, y: 0, standing: true },                // placed AT the real Origin: not by mail
    ...MAIL.map(placeholderRow),
    placeholderRow(BAD),
    { handle: "the-town", x: 0, y: 0, standing: true, placeholder: true },
  ],
});
const withMailPlaced = (town, handle, row) => ({ ...town, standing: town.standing.filter((r) => r.handle !== handle), walkers: [...town.walkers, { handle, ...row }] });

const READ = {
  handle: ACTOR,
  standpoint: { ...STAND, name: "the rig's standpoint", stance: "embodied" },
  within: [], nearby: [],
  records: Object.fromEntries(townRegionMarks(SERVED.marks).map((m) => [m.id, m])),
  telling: "The rig's air is clear.",
  present: { residents: [{ handle: NEAR, at: off(40, 30), standing: true }] },
};
const READ_UNPLACED = { ...READ, standpoint: null, present: { residents: [] } };
let READ_NOW = READ;
const META = {
  generated: "2026-11-08T00:00:00Z",
  residents: {
    "mail-one": { name: "Mail One", color: "#6ba36b", household: "Post House" },
    [ACTOR]: { name: "Rig Actor", color: "#d65f3f", household: "Rig House" },
  },
};

async function bootStubOffice() {
  const port = await freePort();
  const srv = createHttp((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1:" + port);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    const send = (b) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
    if (url.pathname === "/ops/whoami") return send({ principal: false, household: "rig-house", handles: [ACTOR] });
    if (url.pathname === "/world/my-marks") return send({ drafts: [], docket: [], published: [], backed: [], counts: { drafts: 0, docket: 0, published: 0, backed: 0 }, complete: true });
    if (url.pathname === "/world/apex") return send(READ_NOW);
    if (url.pathname === "/world/present") { presentAsked += 1; return send({ at: 187.5, residents: READ.present.residents }); }
    if (url.pathname === "/world/walkers") {
      walkersAsked += 1;
      if (TOWN_FAILS) { res.writeHead(500, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: "down" })); }
      return send(TOWN);
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bounce", defect: "no such door in the rig" }));
  });
  await new Promise((resolve) => srv.listen(port, "127.0.0.1", resolve));
  CLEANUP.push(() => srv.close());
  return { port };
}

async function bootStubAtlas() {
  const port = await freePort();
  const SHEET = '<!doctype html><html><body><svg id="map-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 2400"><rect x="0" y="0" width="1500" height="2400" fill="#101418"/></svg></body></html>';
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
    cwd: ROOT, env: { ...process.env, PORT: String(port), ATLAS_ORIGIN: "http://127.0.0.1:" + atlasPort }, stdio: ["ignore", "pipe", "pipe"],
  });
  CLEANUP.push(() => proc.kill());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the rig did not announce itself in 30s")), 30_000);
    proc.stdout.on("data", (b) => { if (String(b).includes("localhost:" + port)) { clearTimeout(timer); resolve(); } });
    proc.on("exit", (code) => { clearTimeout(timer); reject(new Error("the rig exited " + code + " before serving")); });
  });
  return { port };
}

let chromium = null, rig = null, office = null, browser = null;
before(async () => {
  chromium = await loadChromium();
  if (!chromium) return;
  const atlas = await bootStubAtlas();
  const booted = await Promise.all([bootRig(atlas.port), bootStubOffice()]);
  rig = booted[0];
  office = booted[1];
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
});

// signedIn: a key and an act-as; signed out: neither (the Spectator)
async function openPage({ signedIn = false, viewport = { width: 1500, height: 950 } } = {}) {
  const page = await machinePage(browser, { viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.route("**/world-engine/residents-meta.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(META) }));
  await page.addInitScript((base) => { try { localStorage.setItem("pm.office.base", base); } catch {} }, "http://127.0.0.1:" + office.port);
  if (signedIn) {
    await page.addInitScript(() => { try { localStorage.setItem("pm_key", "rig-key-not-a-secret"); } catch {} });
    await page.addInitScript((h) => { try { localStorage.setItem("pm.world.act_as", h); } catch {} }, ACTOR);
  }
  await page.goto("http://localhost:" + rig.port + "/", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  return { page, errors };
}

/** Ask the page to poll again NOW (the viewer's own reload, the poll the 15 s timer makes), and wait for it to land. */
async function pollAgain(page) {
  const before = walkersAsked;
  await page.evaluate(() => window.__pmViewer.reload());
  await page.waitForFunction(() => true);
  return walkersAsked - before;
}

const readList = (page) => page.evaluate(() => {
  const box = document.querySelector(".wv-bymail");
  const items = [...(box?.querySelectorAll("li") ?? [])].map((li) => ({
    text: li.textContent, href: li.querySelector("a")?.getAttribute("href") ?? null, html: li.innerHTML,
  }));
  const r = box ? box.getBoundingClientRect() : null;
  const map = document.querySelector(".wv-minimap")?.getBoundingClientRect();
  return {
    present: !!box, hidden: box ? box.hidden || getComputedStyle(box).display === "none" : true,
    heading: box?.querySelector("h2")?.textContent ?? null, items,
    box: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
    map: map ? { x: map.x, y: map.y, w: map.width, h: map.height } : null,
    drawn: [...document.querySelectorAll("#wv-walk-layer g[data-handle]")].map((g) => g.getAttribute("data-handle")).sort(),
    text: box?.textContent ?? "",
  };
});

const waitForList = (page, predicate, arg) => page.waitForFunction(predicate, arg, { timeout: 60_000 });
const skipReason = "playwright is absent, so the page's list goes unguarded: run npm ci here (playwright is this package's devDependency)";
const listed = (r) => r.items.map((i) => i.text);
const shot = async (page, name) => { if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: join(SHOTS, name + ".png") }); } };

test("2. the Spectator: the placeholder residents are listed beside the map as names that link to their address pages; none is drawn; placed residents (even on the real Origin) are not listed", async (t) => {
  if (!chromium) return t.skip(skipReason);
  TOWN = baseTown(); TOWN_FAILS = false; READ_NOW = READ;
  const { page, errors } = await openPage();
  await waitForList(page, () => document.querySelectorAll(".wv-bymail li").length > 0);
  const r = await readList(page);
  assert.equal(r.hidden, false);
  assert.equal(r.heading, "In town by mail");
  // alphabetical, de-duplicated, the town left out; "Mail One" is the name the faces file gives, the rest are their handles
  assert.deepEqual(listed(r), [BAD, "Mail One", "mail-three", "mail-two"], "four names, in handle order; Mail One is the name the faces file gives");
  assert.deepEqual(r.items.map((i) => i.href), [null, "/residents/mail-one/", "/residents/mail-three/", "/residents/mail-two/"], "links through residentHref; a non-handle is text only");
  assert.ok(r.items.every((i) => !/<img|<b>|onerror/.test(i.html)), "nothing raw: " + JSON.stringify(r.items.map((i) => i.html)));
  assert.doesNotMatch(r.text, /[0-9]{2,}/, "names only: no coordinate, count or activity");
  assert.doesNotMatch(r.text, new RegExp([ACTOR, NEAR, ON_ORIGIN, "the-town"].join("|")), "placed residents and the town are not listed");
  // never a dot: nobody on the list is drawn on the map (and the placed ones, but for the Origin's own, are)
  assert.ok(![...MAIL, BAD].some((h) => r.drawn.includes(h)), "no body for a resident by mail: " + JSON.stringify(r.drawn));
  assert.ok(r.drawn.includes(ACTOR) && r.drawn.includes(NEAR), "the placed residents are drawn as before: " + JSON.stringify(r.drawn));
  // beside the map: in the map's own column, under the painting, not over it
  assert.ok(r.box && r.map && r.box.x >= r.map.x - 1 && r.box.x + r.box.w <= r.map.x + r.map.w + 1, "inside the map's column");
  assert.ok(r.box.y >= r.map.y + r.map.h - 2, "under the painting, not on it");
  t.diagnostic("layout at 1500x950, the rendered fixture: list " + JSON.stringify(r.box) + " under painting " + JSON.stringify(r.map) + "; items " + JSON.stringify(listed(r)));
  await shot(page, "spectator-1500");
  assert.deepEqual(errors, [], "no page errors");
  await page.close();
});

test("3. the answer that gives a resident a real position removes the name in the same update, on the poll's one request; the others stay", async (t) => {
  if (!chromium) return t.skip(skipReason);
  TOWN = baseTown(); TOWN_FAILS = false; READ_NOW = READ;
  const { page, errors } = await openPage();
  await waitForList(page, () => document.querySelectorAll(".wv-bymail li").length === 4);
  // a walk, a landing and ground: three ways to a real position, each a row without the flag
  TOWN = withMailPlaced(TOWN, "mail-one", { x: STAND.x + 90, y: STAND.y + 20, moving: true, remaining_m: 400 });
  const asked0 = walkersAsked;
  await page.evaluate(() => window.__pmViewer.reload());
  await waitForList(page, () => !/Mail One/.test(document.querySelector(".wv-bymail")?.textContent ?? ""));
  let r = await readList(page);
  assert.ok(!listed(r).includes("Mail One"), "a fresh walk takes them off: " + JSON.stringify(listed(r)));
  assert.equal(walkersAsked - asked0, 1, "the list rode the poll's one walkers request: no second request for it");
  assert.equal(r.items.length, 3);
  TOWN = withMailPlaced(TOWN, "mail-two", { ...off(60, -40), standing: true, landed: { iso: "2026-11-08T01:00:00Z", x: STAND.x + 60, y: STAND.y - 40 } });
  TOWN = withMailPlaced(TOWN, "mail-three", { ...off(-70, 50), standing: true });   // ground: a plain standing row with a position and no flag
  await page.evaluate(() => window.__pmViewer.reload());
  await waitForList(page, () => document.querySelectorAll(".wv-bymail li").length === 1);
  r = await readList(page);
  assert.deepEqual(listed(r), [BAD], "only the one still without a position is left");
  assert.ok(r.drawn.includes("mail-one") && r.drawn.includes("mail-two") && r.drawn.includes("mail-three"), "and the three with a position are on the map: " + JSON.stringify(r.drawn));
  // and none left: the list goes away, it does not sit empty
  TOWN = withMailPlaced(TOWN, BAD, { ...off(10, 10), standing: true });
  await page.evaluate(() => window.__pmViewer.reload());
  await waitForList(page, () => document.querySelector(".wv-bymail")?.hidden === true);
  assert.equal((await readList(page)).hidden, true);
  assert.deepEqual(errors, [], "no page errors");
  await page.close();
});

test("4. acting as a resident sees the same list, and so does an UNPLACED reader (no standpoint, none invented)", async (t) => {
  if (!chromium) return t.skip(skipReason);
  TOWN = baseTown(); TOWN_FAILS = false;
  for (const [name, read] of [["a placed resident", READ], ["an unplaced reader", READ_UNPLACED]]) {
    READ_NOW = read;
    const { page, errors } = await openPage({ signedIn: true });
    await waitForList(page, () => document.querySelectorAll(".wv-bymail li").length > 0);
    const r = await readList(page);
    assert.deepEqual(r.items.map((i) => i.href), [null, "/residents/mail-one/", "/residents/mail-three/", "/residents/mail-two/"], `${name}: the same four names`);
    assert.ok(![...MAIL, BAD].some((h) => r.drawn.includes(h)), `${name}: and nobody by mail is drawn`);
    if (name === "a placed resident") await shot(page, "resident-first-paint-1500"); // before the first poll with a standpoint: the first paint, not the standpoint branch
    assert.deepEqual(errors, [], `${name}: no page errors`);
    // a real position removes the name on this path too
    TOWN = withMailPlaced(baseTown(), "mail-one", { ...off(80, 20), standing: true });
    const asked0 = walkersAsked, present0 = presentAsked;
    await page.evaluate(() => window.__pmViewer.reload());
    await waitForList(page, () => !/Mail One/.test(document.querySelector(".wv-bymail")?.textContent ?? ""));
    assert.ok(!listed(await readList(page)).includes("Mail One"), `${name}: a real row takes them off`);
    // the poll that took it: a placed resident asks /world/present (the standpoint branch); an unplaced reader has none to ask from
    assert.equal(presentAsked - present0, name === "a placed resident" ? 1 : 0, `${name}: /world/present ${name === "a placed resident" ? "fired once" : "was not asked (no standpoint, none invented)"}`);
    assert.equal(walkersAsked - asked0, 1, `${name}: one walkers request for the poll, the list included`);
    TOWN = baseTown();
    await page.close();
  }
  READ_NOW = READ;
});

const dupFirst = () => { const t = baseTown(); return { ...t, walkers: [{ ...placeholderRow("mail-one") }, ...t.walkers], standing: [...t.standing.filter((x) => x.handle !== "mail-one"), { handle: "mail-one", ...off(90, 25), standing: true }] }; };

test("4b. a handle the answer carries twice, FLAGGED ROW FIRST and a real row second: on every path they are drawn at the real position and not listed (the resident path dedupes one row per handle)", async (t) => {
  if (!chromium) return t.skip(skipReason);
  TOWN_FAILS = false; READ_NOW = READ;
  for (const [name, signedIn] of [["the Spectator", false], ["a positioned resident", true]]) {
    TOWN = dupFirst();
    const { page, errors } = await openPage({ signedIn });
    await waitForList(page, () => document.querySelectorAll(".wv-bymail li").length > 0);
    if (signedIn) {
      // the standpoint branch itself: poll again until /world/present has really fired, then read what it drew
      const present0 = presentAsked;
      await page.evaluate(() => window.__pmViewer.reload());
      await page.waitForFunction(() => true);
      assert.equal(presentAsked - present0, 1, "/world/present fired: this is the standpoint branch");
    }
    await page.waitForFunction((h) => !!document.querySelector(`#wv-walk-layer g[data-handle="${h}"]`), "mail-one", { timeout: 60_000 });
    const r = await readList(page);
    assert.ok(r.drawn.includes("mail-one"), `${name}: the resident with a real second row is drawn: ` + JSON.stringify(r.drawn));
    assert.ok(!listed(r).includes("Mail One") && !r.text.includes("mail-one"), `${name}: and is not listed: ` + JSON.stringify(listed(r)));
    assert.deepEqual(listed(r), [BAD, "mail-three", "mail-two"], `${name}: the rest of the list is as before`);
    assert.ok(!["mail-two", "mail-three", BAD].some((h) => r.drawn.includes(h)), `${name}: and nobody else by mail is drawn`);
    if (signedIn) await shot(page, "resident-positioned-1500");
    assert.deepEqual(errors, [], `${name}: no page errors`);
    await page.close();
  }
});

test("5. a missed poll leaves the last good list standing and shows no error of its own", async (t) => {
  if (!chromium) return t.skip(skipReason);
  TOWN = baseTown(); TOWN_FAILS = false; READ_NOW = READ;
  const { page, errors } = await openPage();
  await waitForList(page, () => document.querySelectorAll(".wv-bymail li").length === 4);
  TOWN_FAILS = true;
  await page.evaluate(() => window.__pmViewer.reload());
  await page.waitForTimeout(1500);
  const r = await readList(page);
  assert.equal(r.items.length, 4, "the last good list stands");
  assert.equal(r.hidden, false);
  assert.doesNotMatch(r.text, /error|fail|down|unavailable|could not/i, "and says nothing about the miss");
  TOWN_FAILS = false;
  assert.deepEqual(errors.filter((e) => !/Failed to load resource/.test(e)), [], "no page errors");
  await page.close();
});

test("6. a narrow screen: the list still sits under the painting and scrolls itself, never over the map", async (t) => {
  if (!chromium) return t.skip(skipReason);
  TOWN = baseTown(); TOWN.standing.push(...Array.from({ length: 60 }, (_, i) => placeholderRow("mail-x-" + String(i).padStart(2, "0"))));
  TOWN_FAILS = false; READ_NOW = READ;
  const { page } = await openPage({ viewport: { width: 390, height: 800 } });
  await waitForList(page, () => document.querySelectorAll(".wv-bymail li").length > 50);
  const r = await readList(page);
  assert.ok(r.box.h <= 7.5 * 16 + 24, "capped: " + r.box.h);
  assert.ok(r.box.y >= r.map.y + r.map.h - 2, "under the painting");
  assert.ok(r.box.x >= 0 && r.box.x + r.box.w <= 390 + 1, "inside the phone's width (no sideways scroll)");
  await shot(page, "narrow-390");
  await page.close();
});

void writeFileSync;
