// WLD-220 before/after capture: the first-visit tour, WHOLE viewport at 390x844 (phone, touch emulation) and 1440x900 (desktop), every slide.
//   ROOT=<a World tree to serve> LABEL=<before|after> OUT=<dir> WORLD1=<tree with node_modules/playwright and tools/page-machine.mjs> node capture-tour.mjs
// FIXTURE: the World repo's own existing page rig: spectator/server.mjs serving that tree's public WORLD/ snapshot, signed in as NOBODY (a spectator: no key, no act),
// ATLAS_ORIGIN pointed nowhere; tools/page-machine.mjs' set machine (16 cores, held clock), ?lite=0. NOT a Site build, NOT the production page, NOT a physical phone.
// Chromium (Playwright's) emulation. Ends by closing its own browser and killing its own server; prints their PIDs and exit outcome.
import { spawn, execSync } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.env.ROOT, LABEL = process.env.LABEL, OUT = process.env.OUT, WORLD1 = process.env.WORLD1;
mkdirSync(OUT, { recursive: true });
const { chromium } = await import(pathToFileURL(join(WORLD1, "node_modules/playwright/index.mjs")).href);
const { machineContext } = await import(pathToFileURL(join(WORLD1, "tools/page-machine.mjs")).href);
const say = (k, v) => console.log(JSON.stringify({ label: LABEL, k, ...v }));
const freePort = () => new Promise((res, rej) => { const p = createNetServer(); p.on("error", rej); p.listen(0, "127.0.0.1", () => { const { port } = p.address(); p.close(() => res(port)); }); });

// this script's own process tree (Playwright's Browser has no .process()): the browser's PIDs are its descendants, read by ps, never by name
const descendants = () => {
  const rows = execSync("ps -eo pid=,ppid=,args=", { encoding: "utf8" }).trim().split("\n").map((l) => { const m = l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/); return m && { pid: +m[1], ppid: +m[2], args: m[3] }; }).filter(Boolean);
  const kids = new Map(); for (const r of rows) { if (!kids.has(r.ppid)) kids.set(r.ppid, []); kids.get(r.ppid).push(r); }
  const out = []; const walk = (p) => { for (const k of kids.get(p) ?? []) { out.push(k); walk(k.pid); } }; walk(process.pid);
  return out;
};
const port = await freePort();
const proc = spawn(process.execPath, [join(ROOT, "spectator", "server.mjs")], { cwd: ROOT, env: { ...process.env, PORT: String(port), ATLAS_ORIGIN: "http://127.0.0.1:1" }, stdio: ["ignore", "pipe", "pipe"] });
let browser = null, outcome = "ok";
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the rig did not announce itself in 30s")), 30_000);
    proc.stdout.on("data", (b) => { if (String(b).includes(`localhost:${port}`)) { clearTimeout(timer); resolve(); } });
    proc.on("exit", (c) => { clearTimeout(timer); reject(new Error(`the rig exited ${c} before serving`)); });
  });
  browser = await chromium.launch();
  say("started", { root: ROOT, serverPid: proc.pid, browserPids: descendants().filter((d) => /chrom/i.test(d.args)).map((d) => d.pid), port });

  const readTour = (page) => page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const card = box(q(".wv-tour-card"));
    const named = { skip: box(q(".wv-tour-skip")), back: box(q(".wv-tour-back")), next: box(q(".wv-tour-next")) };
    const dots = [...document.querySelectorAll(".wv-tour-dot")].map(box);
    const parts = [...dots, named.skip, named.back, named.next];
    const inside = (b, o) => b && o && b.w > 0 && b.x >= o.x - 0.5 && b.right <= o.right + 0.5 && b.y >= o.y - 0.5 && b.bottom <= o.bottom + 0.5;
    const screen = { x: 0, y: 0, right: innerWidth, bottom: innerHeight };
    return { viewport: { w: innerWidth, h: innerHeight }, kicker: q(".wv-tour-kicker")?.textContent, title: q(".wv-tour-title")?.textContent, next: q(".wv-tour-next")?.textContent,
      words: (q(".wv-tour-body")?.textContent ?? "").trim().split(/\s+/).length, card, dotCount: dots.length, skip: named.skip, back: named.back, nextBox: named.next,
      cardOnScreen: inside(card, screen), controlsInCard: parts.every((b) => inside(b, card)), controlsOnScreen: parts.every((b) => inside(b, screen)),
      maxRight: Math.max(...parts.filter(Boolean).map((b) => b.right)) };
  });

  for (const vp of [{ name: "phone-390x844", viewport: { width: 390, height: 844 }, phone: true }, { name: "desktop-1440x900", viewport: { width: 1440, height: 900 }, phone: false }]) {
    const ctx = await machineContext(browser, { viewport: vp.viewport, ...(vp.phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : {}) });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${port}/?lite=0`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForSelector(".wv-tour-card", { state: "visible", timeout: 90_000 });
    await page.waitForTimeout(1500);   // the card's own slide-in settles
    const press = (sel) => (vp.phone ? page.tap(sel) : page.click(sel));
    for (let i = 0; i < 12; i++) {
      const s = await readTour(page);
      if (!s.kicker) break;
      const last = s.next === "done";
      // FIRST_ONLY=1 (the welcome correction): photograph only step 1 and stop
      if (process.env.FIRST_ONLY) {
        say(`${vp.name}-slide`, s);
        await page.screenshot({ path: join(OUT, `${LABEL}-${vp.name}-welcome.png`), fullPage: false });
        break;
      }
      // LAST_ONLY=1 (the docs-link completion): walk to the last step and photograph only it, plus the link's own bounds
      if (!process.env.LAST_ONLY || last) {
        say(`${vp.name}-slide`, { ...s, link: await page.evaluate(() => { const a = document.querySelector(".wv-tour-body a"); if (!a) return null; const r = a.getBoundingClientRect(); return { href: a.getAttribute("href"), text: a.textContent, x: +r.x.toFixed(1), y: +r.y.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; }) });
        await page.screenshot({ path: join(OUT, `${LABEL}-${vp.name}-${process.env.LAST_ONLY ? "last-step" : `slide-${String(i + 1).padStart(2, "0")}`}.png`), fullPage: false });
      }
      await press(".wv-tour-next");
      await page.waitForTimeout(900);
      if (last) break;
    }
    if (!process.env.FIRST_ONLY) await page.waitForSelector(".wv-tour", { state: "hidden", timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(700);
    if (!process.env.LAST_ONLY && !process.env.FIRST_ONLY) await page.screenshot({ path: join(OUT, `${LABEL}-${vp.name}-closed.png`), fullPage: false });
    say(`${vp.name}-closed`, { tourHidden: await page.evaluate(() => !!document.querySelector(".wv-tour")?.hidden), mapThere: await page.evaluate(() => !!document.querySelector(".wv-minimap > svg")) });
    await ctx.close();
  }
} catch (e) { outcome = `error: ${String(e?.message ?? e).slice(0, 300)}`; process.exitCode = 1; }
finally {
  const bpids = descendants().filter((d) => /chrom/i.test(d.args)).map((d) => d.pid);
  try { await browser?.close(); } catch { /* gone */ }
  try { proc.kill(); } catch { /* gone */ }
  await new Promise((r) => setTimeout(r, 1500));
  const alive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch { return false; } };
  say("finished", { outcome, serverPid: proc.pid, serverAlive: alive(proc.pid), browserPids: bpids, browserAlive: bpids.filter(alive), leftoverDescendants: descendants().map((d) => d.pid) });
  process.exit(process.exitCode ?? 0);
}
