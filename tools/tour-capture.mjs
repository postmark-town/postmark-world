// CORE-153 / WLD-220 first-visit tour capture: every step of the tour on the REAL mounted World page, at five sizes, with a void check.
//   LABEL=<name> OUT=<dir> [ROOT=<a World tree to serve; default this repo>] [PW=<dir that holds node_modules/playwright; default: `playwright` as the repo resolves it>] [SIZES=phone-390,desktop-1440x900,...] node tools/tour-capture.mjs
// FIXTURE: the World repo's own page rig: spectator/server.mjs serving that tree's public WORLD/ snapshot, signed in as nobody, ATLAS_ORIGIN pointed nowhere, page-machine's
// set machine, ?lite=0. NOT a Site build, NOT production, NOT a physical phone (Playwright Chromium emulation).
// CLASS FIX (CORE-153): every step's frame is checked for empty void beyond the map. The map's paper (`.wv-tg-paper`, the painting's own extent) is read in screen pixels and the
// share of the map pane it does not cover is the step's void share. A step the tour FRAMES (it moved the camera: the house + resident and the dot) over VOID_MAX (default 0.08) is a FAILED step
// and the run exits 1; the steps that light the reader's own view (welcome, picture, last) are reported, not failed, since that view is the page's own fit (on a tall phone it is void below the map).
import { spawn } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.env.ROOT ?? join(dirname(fileURLToPath(import.meta.url)), ".."), PW = process.env.PW, LABEL = process.env.LABEL, OUT = process.env.OUT;
const VOID_MAX = Number(process.env.VOID_MAX ?? 0.08);
mkdirSync(OUT, { recursive: true });
const { chromium } = await import(PW ? pathToFileURL(join(PW, "node_modules/playwright/index.mjs")).href : "playwright");
const { machineContext } = await import(pathToFileURL(join(ROOT, "tools/page-machine.mjs")).href);
const say = (k, v) => console.log(JSON.stringify({ label: LABEL, k, ...v }));
const freePort = () => new Promise((res, rej) => { const p = createNetServer(); p.on("error", rej); p.listen(0, "127.0.0.1", () => { const { port } = p.address(); p.close(() => res(port)); }); });

const SIZES = [
  { name: "phone-390x844", viewport: { width: 390, height: 844 }, touch: true },
  { name: "desktop-1440x900", viewport: { width: 1440, height: 900 }, touch: false },
  { name: "phone-844x390", viewport: { width: 844, height: 390 }, touch: true },
  { name: "desktop-1440x480", viewport: { width: 1440, height: 480 }, touch: false },
  { name: "phone-360x560", viewport: { width: 360, height: 560 }, touch: true },
].filter((s) => !process.env.SIZES || process.env.SIZES.split(",").some((k) => s.name.startsWith(k)));

const port = await freePort();
const proc = spawn(process.execPath, [join(ROOT, "spectator", "server.mjs")], { cwd: ROOT, env: { ...process.env, PORT: String(port), ATLAS_ORIGIN: "http://127.0.0.1:1" }, stdio: ["ignore", "pipe", "pipe"] });
let browser = null, outcome = "ok";
const failed = [];
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the rig did not announce itself in 30s")), 30_000);
    proc.stdout.on("data", (b) => { if (String(b).includes(`localhost:${port}`)) { clearTimeout(timer); resolve(); } });
    proc.on("exit", (c) => { clearTimeout(timer); reject(new Error(`the rig exited ${c} before serving`)); });
  });
  browser = await chromium.launch();
  say("started", { root: ROOT, serverPid: proc.pid, port });

  const readTour = (page) => page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const card = box(q(".wv-tour-card"));
    const pane = q(".wv-minimap")?.getBoundingClientRect(), paper = q(".wv-minimap .wv-tg-paper")?.getBoundingClientRect();
    let voidShare = null;
    if (pane && paper && pane.width > 0 && pane.height > 0) {
      const iw = Math.max(0, Math.min(pane.right, paper.right) - Math.max(pane.left, paper.left));
      const ih = Math.max(0, Math.min(pane.bottom, paper.bottom) - Math.max(pane.top, paper.top));
      voidShare = +(1 - (iw * ih) / (pane.width * pane.height)).toFixed(4);
    }
    const inside = (b, o) => b && o && b.x >= o.x - 0.5 && b.right <= o.right + 0.5 && b.y >= o.y - 0.5 && b.bottom <= o.bottom + 0.5;
    const screen = { x: 0, y: 0, right: innerWidth, bottom: innerHeight };
    const parts = [...document.querySelectorAll(".wv-tour-dot")].map(box).concat([".wv-tour-skip", ".wv-tour-back", ".wv-tour-next"].map((s) => box(q(s))));
    return { viewport: { w: innerWidth, h: innerHeight }, kicker: q(".wv-tour-kicker")?.textContent, title: q(".wv-tour-title")?.textContent, next: q(".wv-tour-next")?.textContent,
      body: (q(".wv-tour-body")?.innerText ?? "").trim(), card, cardOnScreen: inside(card, screen), controlsOnScreen: parts.every((b) => inside(b, screen)),
      sceneKind: q(".wv-tour-card")?.dataset.sceneKind ?? "", sceneIds: q(".wv-tour-card")?.dataset.scene ?? "",
      spot: q(".wv-tour-spot") && !q(".wv-tour-spot").hidden ? box(q(".wv-tour-spot")) : null, voidShare,
      inlineIcons: [...document.querySelectorAll(".wv-tour-body svg")].map(box) };
  });

  for (const vp of SIZES) {
    const ctx = await machineContext(browser, { viewport: vp.viewport, ...(vp.touch ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : {}) });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${port}/?lite=0`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForSelector(".wv-tour-card", { state: "visible", timeout: 90_000 });
    await page.waitForTimeout(1500);
    await page.waitForFunction(() => document.querySelectorAll(".wv-tour-dot").length === 5, null, { timeout: 30_000 });
    await page.waitForTimeout(900);
    for (let n = 1; n <= 5; n++) {
      await page.waitForTimeout(1400);   // the camera glide and the map's redraw settle
      const s = await readTour(page);
      const framed = s.sceneKind === "house" || s.sceneKind === "dot";
      const bad = framed && (s.voidShare == null || s.voidShare > VOID_MAX);
      if (bad) failed.push(`${vp.name} step ${n}: void ${s.voidShare}`);
      say(`${vp.name}-step${n}`, { ...s, voidMax: VOID_MAX, voidFail: bad });
      await page.screenshot({ path: join(OUT, `${LABEL}-${vp.name}-step${n}.png`), fullPage: false });
      if (n < 5) { await (vp.touch ? page.tap(".wv-tour-next") : page.click(".wv-tour-next")); await page.waitForTimeout(900); }
    }
    await ctx.close();
  }
  if (failed.length) { outcome = `VOID FAIL: ${failed.join("; ")}`; process.exitCode = 1; }
} catch (e) { outcome = `error: ${String(e?.message ?? e).slice(0, 300)}`; process.exitCode = 1; }
finally {
  try { await browser?.close(); } catch { /* gone */ }
  try { proc.kill(); } catch { /* gone */ }
  await new Promise((r) => setTimeout(r, 1500));
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  say("finished", { outcome, serverPid: proc.pid, serverAlive: alive(proc.pid) });
  process.exit(process.exitCode ?? 0);
}
