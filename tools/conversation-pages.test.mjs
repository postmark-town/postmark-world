// conversation-pages.test.mjs — POS-779: the World map reads ALL the pages of the conversation list it draws.
//
// The office's `GET /world/conversations` answers the FIRST PAGE of each section and a `next_threads` cursor for the
// rest (postmark-office #769). The map used to read one body and draw it, so the 41st thread of a busy settlement had
// no badge and nothing said so. `readConvoPages` (spectator/viewer.mjs) is the one reader: the same function the mounted
// viewer calls, driven here with a fake office that answers in the door's own shapes (world2/tools/convo-door.mjs @
// office 8c11b3e2: the lean summary is `?voices=0`, the cursor is `?next_threads=`, a changed list answers
// `regenerated: true`, a refusal is a 503 bounce).
//
// Two halves:
//   1. the reader, singly: multiple live and closed pages, seams, a regenerated or refused follow, the cap, the
//      day an earlier settlement is drawn for, the in-memory (legacy) office, and the honest sentences
//   2. the mounted viewer in a browser against a stub office that pages: every thread has its badge, a part says it
//      is a part, a hidden layer fetches nothing, the reader's own choice and a storage that throws, an earlier
//      settlement's dotted badge for a day and a long quiet inside a settlement that never expires
//
// ── THE CAN-FAIL FLIPS (each restored by hash after) ─────────────────────────────────────────────────────────
//   readConvoPages without following `next_threads`            → the multi-page, closed-page, seam and cap tests red; the browser "every thread" test reds (30 of 130 badges missing)
//   the follow without the merge (`add(section, m.threads)` out) → the same reds
//   no dedupe at the seam                                       → the seam test reds
//   `m.regenerated` not stopping the follow                     → the regenerated test reds
//   the cap not counted (`pages >= maxPages` out)               → the cap test reds
//   a standing cursor not marked partial                        → the cap and refusal tests red
//   the viewer drawing a partial read without saying it         → the browser "a part says it is a part" test reds
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
import { readConvoPages, convoReadNote, CONVO_PAGE, CONVO_MAX_PAGES, CONVO_CLOSED_KEEP_MS } from "../spectator/viewer.mjs";
import { machinePage } from "./page-machine.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = readFileSync(join(ROOT, "spectator", "viewer.mjs"), "utf8");

// ═════════════════════════════════════════════════════════════════════
// 1. the reader
// ═════════════════════════════════════════════════════════════════════

const NOW = Date.parse("2026-11-04T18:00:00.000Z");
const thread = (id, { latest = NOW - 60_000, live = true } = {}) => ({
  id: String(id), place: `place ${id}`, at: { x: 100 + Number(id), y: 200 }, voice_count: 3, participants: ["a", "b"], latest: new Date(latest).toISOString(), aboard: false, live, voices: [],
});
/** a fake office: `pages` maps a query to a body; every query asked is recorded; an unknown query is a 503 bounce */
function fakeOffice(pages) {
  const asked = [];
  const get = async (query) => {
    asked.push(query);
    const p = pages[query];
    if (p === undefined) return { ok: false, body: { error: "bounce", defect: "the conversations cannot be read just now" } };
    if (p instanceof Error) return { ok: false, body: null };
    return { ok: true, body: p };
  };
  return { get, asked };
}
const FIRST = `?voices=0&limit=${CONVO_PAGE}&closed=${CONVO_PAGE}`;
const NEXT = (c) => `?next_threads=${encodeURIComponent(c)}&voices=0&limit=${CONVO_PAGE}`;
const META = { earshot_m: 45, fade_minutes: 20, hearable_since: "2026-11-04T10:00:00.000Z" };

test("1. several LIVE pages: every thread is read, in the office's order, from the lean pages and their cursors", async () => {
  const office = fakeOffice({
    [FIRST]: { ...META, live: [thread(1), thread(2), thread(3)], closed: [], next_threads: { live: "c1:1:aa", closed: null } },
    [NEXT("c1:1:aa")]: { threads: [thread(4), thread(5)], next_threads: "c2:4:aa" },
    [NEXT("c2:4:aa")]: { threads: [thread(6)], next_threads: null },
  });
  const r = await readConvoPages(office.get, { now: NOW });
  assert.deepEqual(r.live.map((t) => t.id), ["1", "2", "3", "4", "5", "6"], "page one is not the whole list");
  assert.equal(r.state, "ok");
  assert.deepEqual(r.cut, []);
  assert.deepEqual(office.asked, [FIRST, NEXT("c1:1:aa"), NEXT("c2:4:aa")], "the lean first page, then each cursor once, nothing else");
  assert.deepEqual(r.meta, META, "the say class's numbers ride the first page");
});

test("1b. the requests are the door's own: lean (`voices=0`), the largest list limit, and the cursor percent-encoded", async () => {
  const office = fakeOffice({ [FIRST]: { ...META, live: [thread(1)], closed: [], next_threads: { live: "9:1:ab", closed: null } }, [NEXT("9:1:ab")]: { threads: [], next_threads: null } });
  await readConvoPages(office.get, { now: NOW });
  assert.equal(office.asked[0], "?voices=0&limit=100&closed=100");
  assert.equal(office.asked[1], "?next_threads=9%3A1%3Aab&voices=0&limit=100");
});

test("2. the earlier-settlement section pages too, and stops following once its threads are older than the day it is drawn for", async () => {
  const day = CONVO_CLOSED_KEEP_MS;
  // page one of closed ends inside the day: follow; page two ends past the day: stop, and it is NOT a cut (nothing the map draws is left unread)
  const office = fakeOffice({
    [FIRST]: { ...META, live: [], closed: [thread(10, { latest: NOW - 3_600_000, live: false })], next_threads: { live: null, closed: "k1:10:aa" } },
    [NEXT("k1:10:aa")]: { threads: [thread(11, { latest: NOW - day - 60_000, live: false })], next_threads: "k2:11:aa" },
  });
  const r = await readConvoPages(office.get, { now: NOW });
  assert.deepEqual(r.closed.map((t) => t.id), ["10", "11"]);
  assert.equal(r.state, "ok", "the rest is older than any badge the map keeps");
  assert.deepEqual(office.asked, [FIRST, NEXT("k1:10:aa")], "the older cursor is not followed");
});

test("3. a thread repeated at a page seam is one badge", async () => {
  const office = fakeOffice({
    [FIRST]: { ...META, live: [thread(1), thread(2)], closed: [], next_threads: { live: "c:2:aa", closed: null } },
    [NEXT("c:2:aa")]: { threads: [thread(2), thread(3)], next_threads: null },
  });
  const r = await readConvoPages(office.get, { now: NOW });
  assert.deepEqual(r.live.map((t) => t.id), ["1", "2", "3"]);
});

test("4. the office says the list changed under the read (`regenerated`): what was read stands and is said to be a part", async () => {
  const office = fakeOffice({
    [FIRST]: { ...META, live: [thread(1), thread(2)], closed: [], next_threads: { live: "c:2:aa", closed: null } },
    [NEXT("c:2:aa")]: { now: "x", regenerated: true, reason: "the view changed since this page was cut; start again from the first page", threads: [], next_threads: null },
  });
  const r = await readConvoPages(office.get, { now: NOW });
  assert.deepEqual(r.live.map((t) => t.id), ["1", "2"]);
  assert.equal(r.state, "partial");
  assert.deepEqual(r.cut, ["live"]);
});

test("5. a refused FOLLOW (503, a transport failure) is a part, a refused FIRST page is `unavailable` and hands back no list", async () => {
  const followRefused = fakeOffice({ [FIRST]: { ...META, live: [thread(1)], closed: [], next_threads: { live: "c:1:aa", closed: null } } }); // the follow is unknown → a 503 bounce
  const a = await readConvoPages(followRefused.get, { now: NOW });
  assert.equal(a.state, "partial");
  assert.deepEqual(a.live.map((t) => t.id), ["1"]);
  const followThrows = fakeOffice({ [FIRST]: { ...META, live: [thread(1)], closed: [], next_threads: { live: "c:1:aa", closed: null } }, [NEXT("c:1:aa")]: new Error("network") });
  assert.equal((await readConvoPages(followThrows.get, { now: NOW })).state, "partial");
  const firstRefused = fakeOffice({});
  const b = await readConvoPages(firstRefused.get, { now: NOW });
  assert.equal(b.state, "unavailable");
  assert.equal(b.live, null, "no invented empty list: the caller keeps what it had");
  assert.equal(b.closed, null);
  const bounceBody = fakeOffice({ [FIRST]: { error: "bounce", defect: "the conversations cannot be read just now", live: [], closed: [] } });
  assert.equal((await readConvoPages(bounceBody.get, { now: NOW })).state, "unavailable", "a bounce body is never an empty town, whatever else it carries");
  assert.equal((await readConvoPages(async () => ({ ok: true, body: { now: "x" } }), { now: NOW })).state, "unavailable", "a body with no lists is not an empty town");
});

test("6. the cap: a list still cut after the pages it may follow is `partial`; one that ends exactly on the cap is whole", async () => {
  const pages = { [FIRST]: { ...META, live: [thread(0)], closed: [], next_threads: { live: "c0", closed: null } } };
  for (let p = 0; p < 5; p++) pages[NEXT("c" + p)] = { threads: [thread(p + 1)], next_threads: p === 4 ? null : "c" + (p + 1) };
  const exact = await readConvoPages(fakeOffice(pages).get, { now: NOW, maxPages: 5 });
  assert.equal(exact.state, "ok", "five follows, the fifth ends the list");
  assert.deepEqual(exact.live.map((t) => t.id), ["0", "1", "2", "3", "4", "5"]);
  const capped = fakeOffice(pages);
  const cut = await readConvoPages(capped.get, { now: NOW, maxPages: 4 });
  assert.equal(cut.state, "partial");
  assert.deepEqual(cut.cut, ["live"]);
  assert.deepEqual(cut.live.map((t) => t.id), ["0", "1", "2", "3", "4"], "what was read is kept, not dropped for being incomplete");
  assert.equal(capped.asked.length, 1 + 4, "four follows, then it stops: no depth-proportional loop");
  assert.equal(CONVO_MAX_PAGES, 8, "the viewer's own cap");
});

test("7. the office's in-memory record (`incomplete_legacy`) is `legacy`: no pages, no way back, said so", async () => {
  const office = fakeOffice({ [FIRST]: { ...META, incomplete_legacy: "this is the office's in-memory record", live: [thread(1)], closed: [], close_minutes: null } });
  const r = await readConvoPages(office.get, { now: NOW });
  assert.equal(r.state, "legacy");
  assert.deepEqual(r.live.map((t) => t.id), ["1"]);
  assert.equal(office.asked.length, 1);
});

test("7b. the control: an ordinary whole read is `ok` and says nothing", async () => {
  const office = fakeOffice({ [FIRST]: { ...META, live: [thread(1)], closed: [thread(2, { live: false })], next_threads: { live: null, closed: null } } });
  const r = await readConvoPages(office.get, { now: NOW });
  assert.equal(r.state, "ok");
  assert.equal(convoReadNote(r.state), null);
});

test("8. what the 💬 control says: each state its own plain sentence, none claims a count it does not have", () => {
  const words = ["unavailable", "partial", "legacy"].map(convoReadNote);
  assert.ok(words.every((w) => typeof w === "string" && w.length > 20));
  assert.equal(new Set(words).size, 3, "three different things said");
  assert.ok(words.every((w) => !/\d/.test(w)), "no number it did not measure");
  assert.match(convoReadNote("unavailable"), /could not be read just now/);
  assert.match(convoReadNote("partial"), /Only the newest conversations are drawn/);
  assert.match(convoReadNote("legacy"), /in-memory record/);
  assert.equal(convoReadNote("ok"), null);
});

test("9. the mounted viewer calls THIS reader (not a copy of it), one read at a time, and keeps what it drew when the office does not answer", () => {
  const load = SOURCE.slice(SOURCE.indexOf("  function loadConversations() {"), SOURCE.indexOf("  function loadConversations() {") + 1400);
  assert.match(load, /await readConvoPages\(convoGet\)/, "the viewer reads through the exported reader");
  assert.match(load, /if \(convoLoading\) return convoLoading;/, "a tick or a toggle while one read is in flight takes its answer");
  assert.match(load, /read\.state === "unavailable"[\s\S]{0,300}convoRead = "unavailable";/, "an unanswered office leaves the drawn threads");
  assert.doesNotMatch(load, /convoState = \{ live: \[\], closed: \[\] \}/, "and never turns a refusal into an empty town");
  assert.match(SOURCE, /btn\.title = note \? `\$\{btn\.dataset\.baseTitle\} \$\{note\}` : btn\.dataset\.baseTitle;/, "the control says what the read was");
  assert.doesNotMatch(SOURCE, /fetch\(officeUrl\("\/world\/conversations"\)/, "no second, unpaged reader of the same door");
});

// ═════════════════════════════════════════════════════════════════════
// 2. the mounted viewer
// ═════════════════════════════════════════════════════════════════════

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

// the stub office's state, set per test: how the list answers
const OFFICE = { mode: "pages", now: () => Date.now(), asked: [] };
/** n live threads laid on a line in the Town Centre, newest first (the office's order) */
const liveThreads = (n, { from = 0, latestAgo = 120_000 } = {}) => Array.from({ length: n }, (_, i) => ({
  id: `live-${from + i}`, place: `the quay ${from + i}`, at: { x: 150 + (from + i) * 2, y: 95 }, voice_count: 4, participants: ["rig-ash", "rig-cleo"],
  latest: new Date(OFFICE.now() - latestAgo - i * 1000).toISOString(), aboard: false, live: true, voices: [],
}));
const closedThread = (id, agoMs) => ({ id, place: `the old quay ${id}`, at: { x: 190, y: 120 }, voice_count: 2, participants: ["rig-ash"], latest: new Date(OFFICE.now() - agoMs).toISOString(), aboard: false, live: false, voices: [] });
function conversationsBody(url) {
  const q = url.searchParams;
  const base = { now: new Date(OFFICE.now()).toISOString(), earshot_m: 45, fade_minutes: 20, hearable_since: "2026-11-04T10:00:00.000Z", close_minutes: null };
  if (OFFICE.mode === "unavailable") return { status: 503, body: { error: "bounce", defect: "the conversations cannot be read just now", hint: "try again shortly (settlement-moved)" } };
  if (q.has("next_threads")) {
    if (OFFICE.mode === "follow-refused") return { status: 503, body: { error: "bounce", defect: "the conversations cannot be read just now" } };
    if (q.get("next_threads") === "live-p2") return { status: 200, body: { now: base.now, threads: liveThreads(30, { from: 100 }), next_threads: null, list: { complete: true, returned: 30, history_from: "x" } } };
    return { status: 404, body: { error: "bounce", defect: "that conversation is not available" } };
  }
  if (OFFICE.mode === "legacy") return { status: 200, body: { ...base, incomplete_legacy: "this is the office's in-memory record", live: liveThreads(2), closed: [] } };
  if (OFFICE.mode === "days") {
    return { status: 200, body: { ...base, live: liveThreads(1, { latestAgo: 6 * 3600_000 }), closed: [closedThread("closed-recent", 3 * 3600_000), closedThread("closed-old", 30 * 3600_000)], next_threads: { live: null, closed: null }, list: { complete: true } } };
  }
  return { status: 200, body: { ...base, live: liveThreads(100), closed: [], next_threads: { live: "live-p2", closed: null }, list: { complete: false } } };
}

async function bootStubOffice() {
  const port = await freePort();
  const srv = createHttp((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1:" + port);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    const send = (code, b) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
    if (url.pathname === "/world/conversations") { OFFICE.asked.push(url.search); const r = conversationsBody(url); return send(r.status, r.body); }
    if (url.pathname === "/ops/whoami") return send(200, { principal: false, household: null, handles: [] });
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bounce", defect: "no such door in the rig" }));
  });
  await new Promise((resolve) => srv.listen(port, "127.0.0.1", resolve));
  CLEANUP.push(() => srv.close());
  return { port };
}
async function bootRig() {
  const port = await freePort();
  const proc = spawn(process.execPath, [join(ROOT, "spectator", "server.mjs")], { cwd: ROOT, env: { ...process.env, PORT: String(port), ATLAS_ORIGIN: "http://127.0.0.1:1" }, stdio: ["ignore", "pipe", "pipe"] });
  CLEANUP.push(() => proc.kill());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the rig did not announce itself in 30s")), 30_000);
    proc.stdout.on("data", (b) => { if (String(b).includes("localhost:" + port)) { clearTimeout(timer); resolve(); } });
    proc.on("exit", (code) => { clearTimeout(timer); reject(new Error("the rig exited " + code + " before serving")); });
  });
  return { port };
}

let chromium = null, rig = null, browser = null, office = null;
const errors = [];
before(async () => {
  chromium = await loadChromium();
  if (!chromium) return;
  [rig, office] = await Promise.all([bootRig(), bootStubOffice()]);
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
});
const skipReason = "playwright is absent, so the mounted conversation badges go unguarded: run npm ci here (playwright is this package's devDependency)";

/** a fresh page on the real viewer, the stub office as its office; `storage` runs before the viewer does */
async function openViewer({ mode, storage = null, wait = true } = {}) {
  OFFICE.mode = mode; OFFICE.asked.length = 0;
  const page = await machinePage(browser, { viewport: { width: 1400, height: 900 } });
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.addInitScript((base) => { try { localStorage.setItem("pm.office.base", base); } catch {} }, "http://127.0.0.1:" + office.port);
  if (storage === "off") await page.addInitScript(() => { try { localStorage.setItem("pm.world.conversations", "off"); } catch {} });
  // a storage that throws on the reader's choice (private windows, blocked data): the page's other reads are not this test's subject
  if (storage === "throws") await page.addInitScript(() => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (k) { if (k === "pm.world.conversations") throw new Error("storage blocked"); return get.apply(this, arguments); };
    Storage.prototype.setItem = function (k, v) { if (k === "pm.world.conversations") throw new Error("storage blocked"); return set.apply(this, arguments); };
  });
  await page.goto("http://localhost:" + rig.port + "/", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  await page.waitForFunction(() => !!window.__pmViewer, null, { timeout: 60_000 });
  if (wait) await page.waitForFunction(() => !!document.querySelector(".wv-map-convo"), null, { timeout: 60_000 }).catch(() => {});
  return page;
}
const badgeIds = (page) => page.evaluate(() => [...document.querySelectorAll("[data-convo]")].map((g) => ({ id: g.getAttribute("data-convo"), cls: g.getAttribute("class") })));
const ctl = (page) => page.evaluate(() => { const b = document.querySelector(".wv-map-convo"); return b ? { on: b.classList.contains("on"), read: b.dataset.convoRead ?? null, title: b.title } : null; });
async function waitBadges(page, n, ms = 30_000) {
  await page.waitForFunction((want) => document.querySelectorAll("[data-convo]").length >= want, n, { timeout: ms }).catch(() => {});
  return badgeIds(page);
}

test("10. in the browser, EVERY thread has its badge: 130 live threads over two pages, the second asked by its cursor", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const page = await openViewer({ mode: "pages" });
  const badges = await waitBadges(page, 130);
  assert.equal(badges.length, 130, "page one's 100 and the cursor's 30: " + badges.length);
  assert.equal(new Set(badges.map((b) => b.id)).size, 130, "each thread once");
  assert.ok(badges.every((b) => /is-live/.test(b.cls)), "all live, solid");
  assert.ok(OFFICE.asked.includes("?voices=0&limit=100&closed=100"), "the lean first page: " + JSON.stringify(OFFICE.asked));
  assert.ok(OFFICE.asked.includes("?next_threads=live-p2&voices=0&limit=100"), "and the cursor, asked once: " + JSON.stringify(OFFICE.asked));
  assert.equal(OFFICE.asked.filter((s) => s.startsWith("?next_threads=")).length, 1);
  const c = await ctl(page);
  assert.equal(c?.read, "ok");
  assert.ok(!/Only the newest/.test(c?.title ?? ""), "a whole read adds no sentence: " + c?.title);
  await page.close();
});

test("11. a part says it is a part: the cursor's page is refused, the first page's 100 stay drawn and the control says only the newest are", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const page = await openViewer({ mode: "follow-refused" });
  const badges = await waitBadges(page, 100);
  assert.equal(badges.length, 100, "what was read stays drawn: " + badges.length);
  await page.waitForFunction(() => document.querySelector(".wv-map-convo")?.dataset.convoRead === "partial", null, { timeout: 30_000 }).catch(() => {});
  const c = await ctl(page);
  assert.equal(c?.read, "partial");
  assert.match(c?.title ?? "", /Only the newest conversations are drawn; the office has more than were read\./);
  await page.close();
});

test("12. an office that does not answer draws nothing it did not read and says it could not be read; it is never an empty-town success", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const page = await openViewer({ mode: "unavailable" });
  await page.waitForFunction(() => document.querySelector(".wv-map-convo")?.dataset.convoRead === "unavailable", null, { timeout: 30_000 }).catch(() => {});
  const c = await ctl(page);
  assert.equal(c?.read, "unavailable");
  assert.match(c?.title ?? "", /could not be read just now/);
  assert.equal((await badgeIds(page)).length, 0, "no badges were invented");
  await page.close();
});

test("13. the in-memory office is said to be short, and its threads are drawn", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const page = await openViewer({ mode: "legacy" });
  const badges = await waitBadges(page, 2);
  assert.equal(badges.length, 2);
  await page.waitForFunction(() => document.querySelector(".wv-map-convo")?.dataset.convoRead === "legacy", null, { timeout: 30_000 }).catch(() => {});
  assert.match((await ctl(page))?.title ?? "", /in-memory record/);
  await page.close();
});

test("14. the days: a live thread quiet for six hours is still live (a settlement never expires a conversation), an earlier settlement's thread is a dotted cooling badge for a day, then it leaves", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const page = await openViewer({ mode: "days" });
  const badges = await waitBadges(page, 2);
  const byId = Object.fromEntries(badges.map((b) => [b.id, b.cls]));
  assert.match(byId["live-0"] ?? "", /is-live/, "six quiet hours inside the settlement: still solid: " + JSON.stringify(byId));
  assert.match(byId["closed-recent"] ?? "", /is-cooling/, "an earlier settlement's thread, three hours old: the dotted cooling badge");
  assert.ok(!("closed-old" in byId), "past the day it is not drawn");
  await page.close();
});

test("15. the reader's own choice: default ON loads the list; stored OFF draws nothing and asks the office nothing; a storage that throws leaves the default", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const on = await openViewer({ mode: "pages" });
  assert.equal((await ctl(on))?.on, true, "on by default");
  assert.ok((await waitBadges(on, 100)).length >= 100);
  // the toggle off, then the choice is remembered as off
  await on.evaluate(() => document.querySelector(".wv-map-convo").click());
  await on.waitForFunction(() => !document.querySelector(".wv-map-convo").classList.contains("on"), null, { timeout: 10_000 });
  assert.equal(await on.evaluate(() => localStorage.getItem("pm.world.conversations")), "off");
  await on.close();

  const off = await openViewer({ mode: "pages", storage: "off" });
  await off.waitForTimeout(2500);
  assert.equal((await ctl(off))?.on, false, "stored off stays off");
  assert.equal((await badgeIds(off)).length, 0, "draws nothing");
  assert.equal(OFFICE.asked.length, 0, "and a hidden layer costs the office nothing: " + JSON.stringify(OFFICE.asked));
  await off.close();

  const blocked = await openViewer({ mode: "pages", storage: "throws" });
  assert.equal((await ctl(blocked))?.on, true, "a storage that throws leaves the default, on");
  assert.ok((await waitBadges(blocked, 100)).length >= 100);
  await blocked.close();
});

test("16. no page exception across the page tests", { skip: false }, (t) => {
  if (!chromium) return t.skip(skipReason);
  assert.deepEqual(errors, []);
});
