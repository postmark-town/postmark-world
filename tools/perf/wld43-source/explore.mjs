// WLD-43 explore: load prod's World page once, unthrottled, and describe the map.
import { createRequire } from "node:module";
const require = createRequire("G:/Wright-HQ/package.json");
const { chromium } = require("playwright");
const OUT = new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

const browser = await chromium.launch({ channel: "chromium", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => { try { localStorage.setItem("pm_world_tour_seen", "1"); } catch {} });
const page = await ctx.newPage();
const t0 = Date.now();
await page.goto("https://postmark.town/world/", { waitUntil: "load" });
console.log("load", Date.now() - t0, "ms; visibility", await page.evaluate(() => document.visibilityState));
await page.waitForSelector(".wv-mists-paint", { timeout: 60000 }).then(() => console.log("mists paint at", Date.now() - t0)).catch((e) => console.log("no mists paint", e.message));
await page.waitForTimeout(3000);
const info = await page.evaluate(() => {
  const svgs = [...document.querySelectorAll("svg")].map((s) => ({ cls: s.getAttribute("class"), id: s.id, vb: s.getAttribute("viewBox"), w: s.clientWidth, h: s.clientHeight, kids: s.childElementCount, nodes: s.querySelectorAll("*").length }));
  const big = svgs.sort((a, b) => b.nodes - a.nodes).slice(0, 4);
  const imgs = [...document.querySelectorAll(".wv-mists-paint image")].map((i) => [i.getAttribute("width"), i.getAttribute("height")]);
  return { big, mistsImages: imgs.length, imgs: imgs.slice(0, 12), nodes: document.querySelectorAll("*").length, tour: !!document.querySelector(".wv-tour-card:not([hidden])"), drift: document.querySelectorAll(".wv-mists-drift").length, creatures: document.querySelectorAll(".wv-mists-creatures > *").length, gpu: (() => { try { const gl = document.createElement("canvas").getContext("webgl"); const e = gl.getExtension("WEBGL_debug_renderer_info"); return gl.getParameter(e.UNMASKED_RENDERER_WEBGL); } catch (x) { return String(x); } })() };
});
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: OUT + "explore-live.png" });
const box = await page.evaluate(() => { const r = document.getElementById("map-svg").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
console.log("map box", box);
await page.click(".wv-tour-card button:has-text('skip')");
await page.waitForTimeout(5000);
await page.screenshot({ path: OUT + "explore-skipped.png" });
console.log("wall", await page.evaluate(() => { const g = document.querySelector(".wv-mists-paint"); const r = g.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
await page.mouse.move(box.x + box.w * 0.5, box.y + box.h * 0.5);
for (let i = 0; i < 2; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(400); }
await page.waitForTimeout(1500);
console.log("vb out", await page.evaluate(() => document.getElementById("map-svg").getAttribute("viewBox")));
await page.screenshot({ path: OUT + "explore-out.png" });
await browser.close();
