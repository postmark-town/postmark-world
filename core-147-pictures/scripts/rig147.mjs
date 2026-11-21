// rig127.mjs <worldTree> <outDir> <label> <scenario>: CORE-127's REAL local viewer (the tree's spectator/server.mjs, headless Chromium) over an INVENTED labelled fixture
// (a synthetic WORLD_DIR: one huge non-matching mark covering smaller ones; the acting household's and another household's marks, a parcel of each, a draft),
// an INVENTED resident ("rig-actor", household "rig-house") through a stub office (whoami, my-marks, state, apex). No production read/act/key/operator.
// Scenarios: unfiltered | filtered (parcels + my marks + under 80 m, panel closed) | panel (the same, the panel open) | removed (one chip removed) | cleared | probe (DOM facts as JSON).
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttp } from "node:http";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [TREE, OUT, label, scenario = "unfiltered"] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const { chromium } = await import(join(TREE, "node_modules/playwright/index.mjs"));
const ACTOR = "rig-actor", HOUSE = "rig-house";
const freePort = () => new Promise((ok, no) => { const p = createServer(); p.on("error", no); p.listen(0, "127.0.0.1", () => { const { port } = p.address(); p.close(() => ok(port)); }); });

// ── the INVENTED world ──
const real = JSON.parse(readFileSync(join(TREE, "WORLD/world-state.json"), "utf8"));
const mk = (id, kind, by, household, x, y, w, h, extra = {}) => ({ id, kind, by, tier: kind === "parcel" ? "home" : "market", household, declared_household: "hh:" + household, date: "2026-11-20T00:00:00.000Z", at: { x: x * 0.5, y: y * 0.5 }, extent: { w, h }, sovereign: false, stamps: 0, weight: 0, body: "INVENTED fixture mark for CORE-127 pictures.", ...extra });
const MARKS = [
  // the huge hall wears an EXISTING public picture as a stand-in (served from the site's public media), so it visibly covers the ground it sits on
  mk("invented/the-huge-hall", "sited", "invented", "other-house", 0, 0, 1500, 1100, { image: "https://media.postmark.town/media/aion-solare-aelyria-region-card.jpg", body: "INVENTED: a huge legal mark of another household, covering everything smaller." }),
  mk("rig-house/the-big-orchard", "sited", ACTOR, HOUSE, 150, -40, 900, 700, { body: "INVENTED: a large mark of the acting household (over 80 m)." }),
  mk("rig-house/home-parcel", "parcel", ACTOR, HOUSE, -180, -80, 40, 40),
  mk("rig-house/second-parcel", "parcel", ACTOR, HOUSE, 90, -120, 60, 60),
  mk("rig-house/lantern", "sited", ACTOR, HOUSE, -90, 70, 6, 6),
  mk("other-house/parcel-a", "parcel", "other", "other-house", -260, 110, 50, 50),
  mk("other-house/parcel-b", "parcel", "other", "other-house", 170, 150, 70, 70),
  mk("other-house/bench", "sited", "other", "other-house", 40, 40, 5, 5),
  mk("other-house/fountain", "sited", "other", "other-house", -40, -30, 14, 14),
];
const DRAFT = { id: "rig-house/draft-gazebo", status: "added", kind: "sited", at: { x: 15, y: 65 }, extent: { w: 20, h: 20 }, body: "INVENTED unpublished draft of the acting household.", date: "2026-11-20T00:00:00.000Z" };
// the town's own regions come from this clone's published record (the ground the painting needs to draw); every OTHER mark is invented
const { townRegionMarks } = await import(join(TREE, "spectator/viewer.mjs"));
const world = { ...real, marks: [real.marks.find((m) => m.id === "the-town/let-there-be-light"), ...townRegionMarks(real.marks), ...MARKS].filter(Boolean), parcels: [], portfolios: {} };
// what the stub office's read hands a resident page: every mark's record, and the told marks (invented ones, with a distance and bearing from the standpoint at 0,0)
const DRAFT_MARK = { ...mk(DRAFT.id, "sited", ACTOR, HOUSE, DRAFT.at.x, DRAFT.at.y, DRAFT.extent.w, DRAFT.extent.h, { body: DRAFT.body }), draft: true };
const RECORDS = Object.fromEntries([...world.marks, DRAFT_MARK].map((m) => [m.id, m]));
const bearingOf = (x, y) => (Math.abs(x) >= Math.abs(y) ? (x >= 0 ? "E" : "W") : (y >= 0 ? "S" : "N"));
const NEARBY = [...MARKS, DRAFT_MARK].map((m) => ({ id: m.id, kind: m.kind, tier: m.tier, at: m.at, distance_m: Math.round(Math.hypot(m.at.x, m.at.y)), bearing: bearingOf(m.at.x, m.at.y) }));
const WD = mkdtempSync(join(tmpdir(), "core127-world-"));
writeFileSync(join(WD, "world-state.json"), JSON.stringify(world));
for (const f of ["skeleton.json", "enter-exit-ledger.md", "walk-ledger.md", "enter-exit-ledger-frozen.md"]) { try { cpSync(join(TREE, "WORLD", f), join(WD, f)); } catch {} }

const office = await (async () => {
  const port = await freePort();
  const srv = createHttp((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1:" + port);
    res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, accept, *"); res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    const send = (b, code = 200) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
    if (url.pathname === "/ops/whoami") return send({ principal: false, household: HOUSE, handles: [ACTOR], households: { [ACTOR]: { slug: HOUSE } } });
    if (url.pathname === "/world/my-marks") return send({ drafts: [DRAFT], docket: [], published: MARKS.filter((m) => m.household === HOUSE).map((m) => ({ id: m.id, at: m.at, extent: m.extent, kind: m.kind })), backed: [], counts: { drafts: 1, docket: 0, published: 4, backed: 0 }, complete: true });
    if (url.pathname === "/world/state") return send(world);
    if (url.pathname === "/world/enter-exit-ledger") return send({ ledger: "# invented\n" });
    if (url.pathname === "/world/apex") return send({ handle: ACTOR, standpoint: { x: 0, y: 0, name: "the rig's standpoint", stance: "embodied" }, within: [], nearby: NEARBY, records: RECORDS, telling: "The rig's air is clear.", actions: [{ action: "walk" }], present: { residents: [] } });
    if (url.pathname === "/world/present") return send({ at: 190, residents: [] });
    if (url.pathname === "/world/walkers") return send({ at: 190, walkers: [], standing: [{ handle: ACTOR, x: 0, y: 0, standing: true }] });
    res.writeHead(404, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "bounce", defect: "no such door in the rig" }));
  });
  await new Promise((ok) => srv.listen(port, "127.0.0.1", ok));
  return { port, srv };
})();
const atlas = await (async () => {
  const port = await freePort();
  const SHEET = '<!doctype html><html><body><svg id="map-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 2400"><rect x="0" y="0" width="1500" height="2400" fill="#101418"/></svg></body></html>';
  const MEDIA = "/srv/repos/postmark-site/public/atelier/postmark/media/";
  const srv = createHttp((req, res) => {
    if (req.url.startsWith("/atlas/")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(SHEET); }
    if (req.url.startsWith("/media/")) { try { const f = decodeURIComponent(req.url.split("?")[0].slice(7)).replace(/[^A-Za-z0-9._-]/g, ""); const b = readFileSync(MEDIA + f); res.writeHead(200, { "content-type": "image/jpeg", "access-control-allow-origin": "*" }); return res.end(b); } catch { /* fall through */ } }
    res.writeHead(404); res.end("");
  });
  await new Promise((ok) => srv.listen(port, "127.0.0.1", ok));
  return { port, srv };
})();
// SITE_DIST + WORLD_EXPORT: the ACTUAL built Site (its /world page, its chrome) served statically, with /world-engine/ served from a labelled exact-SHA export of the World and /WORLD/ from the invented world
let rigPort, proc = null, siteSrv = null;
if (process.env.SITE_DIST) {
  const { serveDist } = await import("/var/tmp/core-54/shots/lib.mjs");
  siteSrv = await serveDist(process.env.SITE_DIST, { overlays: [{ prefix: "/world-engine/", dir: process.env.WORLD_EXPORT }, { prefix: "/WORLD/", dir: WD }] });
  rigPort = siteSrv.address().port;
} else {
  rigPort = await freePort();
  proc = spawn(process.execPath, [join(TREE, "spectator", "server.mjs")], { cwd: TREE, env: { ...process.env, PORT: String(rigPort), ATLAS_ORIGIN: "http://127.0.0.1:" + atlas.port, SHELF_ORIGIN: "http://127.0.0.1:" + atlas.port, WORLD_DIR: WD }, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((ok, no) => { const t = setTimeout(() => no(new Error("rig did not start")), 30000); proc.stdout.on("data", (b) => { if (String(b).includes("localhost:" + rigPort)) { clearTimeout(t); ok(); } }); });
}
const START = process.env.SITE_DIST ? "http://127.0.0.1:" + rigPort + "/world/" : "http://localhost:" + rigPort + "/";
const browser = await chromium.launch();
const results = {};
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
try {
  for (const [vname, W, H] of [["desktop-1440x900", 1440, 900], ["phone-390x844", 390, 844]].filter(([n]) => !process.env.ONLY || n.startsWith(process.env.ONLY))) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: W < 600, hasTouch: W < 600 });
    const page = await ctx.newPage();
    results[vname] = {};
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
    await page.route("**/world-engine/residents-meta.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generated: "2026-11-20T00:00:00Z", residents: { [ACTOR]: { name: "Rig Actor (invented)", color: "#d65f3f", household: "Rig House" } } }) }));
    await page.addInitScript((base) => { try { localStorage.setItem("pm.office.base", base); localStorage.setItem("pm_key", "rig-key-not-a-secret"); localStorage.setItem("pm.world.act_as", "rig-actor"); for (const who of ["rig-actor", "rig-house"]) localStorage.setItem("pm_world_tour_seen:" + who, "1"); } catch {} }, "http://127.0.0.1:" + office.port);
    await page.goto(START, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector(".wv-mapctl", { state: "attached", timeout: 90000 });
    await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
    await sleep(5000);
    // desktop: open the Telling list (the existing ▤ toggle) so the list and the map are seen together; a phone shows the painting only (existing behaviour)
    if (W > 720) {
      const st = () => page.evaluate(() => { const t = document.querySelector(".wv-telling-toggle"); return { exp: t?.getAttribute("aria-expanded"), on: t?.classList.contains("on"), cards: document.querySelectorAll(".wv-card, .wv-tcard, [data-tell]").length, telling: !!document.querySelector(".wv-telling, .wv-tell-list, .wv-nav .wv-cards") }; });
      console.error("telling before", JSON.stringify(await st()));
      if (!process.env.NO_TELL_CLICK) { await page.evaluate(() => document.querySelector(".wv-telling-toggle")?.click()); await sleep(1500); console.error("telling after", JSON.stringify(await st())); }
    }
    // zoom in on the invented scene with the map's own wheel (the page zooms about the pointer), so the marks are readable
    const Z = Number(process.env.ZOOM || 0);
    if (Z) {
      // bring the invented scene (around the acting resident at 0,0) to the middle of the painting by dragging it there, then zoom about that point
      const cx = W < 600 ? W / 2 : 740 + (W - 740) / 2, cy = H / 2;
      const where = () => page.evaluate(() => { const l = [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && /Rig Actor \(invented\)/.test(e.textContent || "")); if (!l) return null; const r = l.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top - 14 }; });
      await page.evaluate(() => document.querySelector(".wv-map-follow")?.click());
      await sleep(4000);
      // zoom ABOUT THE ACTING RESIDENT (re-read each notch), so the scene around them (the invented marks, within a few hundred metres) comes into view and stays there
      // CAMERA MATCH (CORE-147): the same wheel notches about the acting resident as CORE-127's frames, stopped when the two parcels' houses stand as far apart on the
      // painting as they do in the CORE-127 frames (desktop 96 px, phone 69 px, from after-states.json), so the marks are drawn at the same on-map size.
      const TARGET = W < 600 ? 69 : 96;
      const gap = () => page.evaluate(() => { const c = (id) => { const e = document.querySelector(`g.ov-home[data-id="${id}"]`); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }; const a = c("rig-house/home-parcel"), b = c("rig-house/second-parcel"); return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null; });
      results[vname].camera = { target: TARGET, notches: [] };
      for (let i = 0; i < 20; i++) {
        const g = await gap(); results[vname].camera.notches.push(g == null ? null : Math.round(g));
        if (g != null && g >= TARGET - 2) break;
        const a = (await where()) ?? { x: cx, y: cy }; await page.mouse.move(Math.max(W < 600 ? 20 : 760, Math.min(W - 20, a.x)), Math.max(60, Math.min(H - 20, a.y + 8))); await page.mouse.wheel(0, -(Number(process.env.NOTCH) || 300)); await sleep(300);
      }
      await sleep(2500);
      // pan so the middle of the invented marks (their pips) is the middle of the painting: a drag on empty ground by the difference
      const c = await page.evaluate(() => { const p = [...document.querySelectorAll("svg circle.ov-pip")].filter((e) => /^(rig-house|other-house)\//.test(e.closest("[data-id]")?.getAttribute("data-id") || e.getAttribute("data-id") || "")).map((e) => e.getBoundingClientRect()); if (!p.length) return null; return { x: p.reduce((s, r) => s + r.left + r.width / 2, 0) / p.length, y: p.reduce((s, r) => s + r.top + r.height / 2, 0) / p.length }; });
      // a drag of a few pixels is a CLICK on the ground (run 2: it selected The Big Orchard and its column covered the map), so none is made when the marks are already centred
      if (c && Math.hypot(cx - c.x, cy - c.y) > 8) {
        const dx = cx - c.x, dy = cy - c.y;
        const sx = W < 600 ? 195 : 1160, sy = 160;
        await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx + dx / 2, sy + dy / 2, { steps: 6 }); await page.mouse.move(sx + dx, sy + dy, { steps: 6 }); await page.mouse.up();
        await sleep(2500);
      }
    }
    const facts = () => page.evaluate(() => {
      const q = (s) => [...document.querySelectorAll(s)];
      const ids = (s, attr = "data-id") => q(s).map((e) => e.getAttribute(attr)).filter(Boolean);
      return {
        opener: !!document.querySelector(".wv-filters-open"), openerN: document.querySelector(".wv-filters-n")?.textContent ?? null,
        panelOpen: !!document.querySelector(".wv-dpanel") && !document.querySelector(".wv-dpanel").hidden,
        strip: document.querySelector(".wv-dstrip")?.innerText.replace(/\s+/g, " ").trim() ?? null,
        pips: [...new Set(ids(".ov-glyph[data-id], .ov-home[data-id]"))].sort(),
        cards: [...new Set(ids(".wv-card[data-id], .wv-cell[data-id], [data-mark-id]"))].sort(),
        boxes: Object.fromEntries(q("svg [data-id]").filter((e) => /^(rig-house|other-house|invented)\//.test(e.getAttribute("data-id"))).map((e) => { const r = e.getBoundingClientRect(); return [e.getAttribute("data-id") + "|" + e.tagName + "." + (e.getAttribute("class") || "").split(" ")[0], [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]]; })),
        chips: q("[data-dsel]").map((b) => b.getAttribute("data-dsel") + ":" + b.getAttribute("aria-pressed") + (b.disabled ? ":disabled" : "")),
        scrollW: document.documentElement.scrollWidth, innerW: innerWidth,
        layers: Object.fromEntries(q("[data-dsel-layer]").map((b) => [b.dataset.dselLayer, b.getAttribute("aria-pressed") + "/" + b.innerText.replace(/\s+/g, " ").trim()])),
        layerBox: q("[data-dsel-layer]").slice(0, 2).map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }),
        walkerBodies: q("#wv-walk-layer [data-walker]").length, standpointDot: !!document.querySelector(".ov-standpoint"),
        bubblesLayerShown: document.getElementById("wv-convo-layer") ? document.getElementById("wv-convo-layer").style.display !== "none" : null,
        oldBubbleButton: !!document.querySelector(".wv-map-convo"),
        sheet: (() => { const p = document.querySelector(".wv-dpanel"); return p && !p.hidden ? { scrollH: p.scrollHeight, clientH: p.clientHeight, top: Math.round(p.getBoundingClientRect().top), bottom: Math.round(p.getBoundingClientRect().bottom) } : null; })(),
      };
    });
    results[vname].closedDefault = await facts();
    if (process.env.HOVER && W > 720) {
      const bub = () => page.evaluate(() => [...document.querySelectorAll(".wv-bubble")].map((b) => (b.hidden ? "H:" : "V:") + b.className.replace("wv-bubble ", "") + ":" + b.innerText.replace(/\s+/g, " ").slice(0, 50)).join(" ; "));
      const pip = await page.evaluate(() => { const e = [...document.querySelectorAll("svg circle.ov-pip")].find((c) => (c.closest("[data-id]") ?? c).getAttribute("data-id") === "other-house/bench"); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await page.mouse.move(pip.x - 4, pip.y - 4); await page.mouse.move(pip.x, pip.y); await sleep(600);
      results[vname].hoverPip = await bub();
      const spot = await page.evaluate(() => { const box = document.querySelector("svg circle.ov-pip").ownerSVGElement; const r = box.getBoundingClientRect(); const taken = (x, y) => document.elementsFromPoint(x, y).some((e) => { const id = (e.closest?.("[data-id]") ?? e).getAttribute?.("data-id"); return id && id !== "invented/the-huge-hall"; }); for (let y = r.top + 120; y < r.bottom - 60; y += 40) for (let x = r.left + 40; x < r.right - 40; x += 40) if (!taken(x, y)) return { x, y, ids: document.elementsFromPoint(x, y).map((e) => (e.closest?.("[data-id]") ?? e).getAttribute?.("data-id") || e.tagName).slice(0, 6) }; return null; });
      results[vname].spot = spot;
      if (spot) { await page.mouse.move(spot.x - 4, spot.y - 4); await page.mouse.move(spot.x, spot.y); await sleep(700); results[vname].hoverEmpty = await bub(); }
    }
    const shot = async (n) => page.screenshot({ path: join(OUT, `${label}-${vname}-${n}.png`) });
    await shot("1-closed-default");
    if (scenario !== "unfiltered") {
      const click = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; e.click(); return true; }, sel);
      // 2: the panel open, nothing chosen (today's view, every switch on)
      await click(".wv-filters-open"); await sleep(700);
      results[vname].openDefault = await facts();
      await shot("2-open-default");
      // 3: through the REAL controls: one kind this fixture holds (parcels), the residents, and the speech bubbles, each switched off
      for (const k of ["home", "residents", "conversation"]) { results[vname]["click_" + k] = await click(`[data-dsel-layer="${k}"]`); await sleep(500); }
      await sleep(600);
      results[vname].openOff = await facts();
      await shot("3-open-parcels-residents-speech-off");
      // a phone sheet that needs scrolling gets ONE extra frame of its lower part (only if the panel genuinely overflows)
      const sh = results[vname].openOff.sheet;
      if (W < 600 && sh && sh.scrollH > sh.clientH + 2) {
        await page.evaluate(() => { const p = document.querySelector(".wv-dpanel"); p.scrollTop = p.scrollHeight; });
        await sleep(500);
        results[vname].openOffLower = await facts();
        await shot("4-open-off-lower-sheet");
      }
    }
    results[vname].errors = errors;
    await ctx.close();
  }
} finally {
  await browser.close(); if (proc) { await new Promise((d) => { proc.once("exit", d); proc.kill(); setTimeout(() => { proc.kill("SIGKILL"); d(); }, 5000); }); } siteSrv?.close(); office.srv.close(); atlas.srv.close();
  console.error("reap: browser closed; spectator child pid " + (proc?.pid ?? "none") + " exit " + proc?.exitCode);
}
writeFileSync(join(OUT, `${label}-states.json`), JSON.stringify({ scenario, results }, null, 2));
console.log(JSON.stringify(results).slice(0, 6000));
process.exit(0);
