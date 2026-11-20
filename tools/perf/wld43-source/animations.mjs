// WLD-43: which animations run on the World page once it has settled (unthrottled, one load per case).
import { createRequire } from "node:module";
const require = createRequire("G:/Wright-HQ/package.json");
const { chromium } = require("playwright");
const shift = (to) => {
  const RealDate = Date, realNow = RealDate.now.bind(RealDate), EP = Date.UTC(2026, 5, 12), H = 12 * 3600 * 1000;
  const off = (EP + to * H + ((realNow() - EP) % H)) - realNow();
  class S extends RealDate { constructor(...a) { if (a.length === 0) super(realNow() + off); else super(...a); } static now() { return realNow() + off; } }
  globalThis.Date = S;
};
const browser = await chromium.launch({ channel: "chromium", headless: true });
for (const c of ["now", "c243"]) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  if (c === "c243") await ctx.addInitScript(shift, 243);
  const page = await ctx.newPage();
  await page.goto("https://postmark.town/world/", { waitUntil: "load" });
  await page.waitForSelector("#map-svg");
  await page.waitForTimeout(c === "now" ? 6000 : 4000);
  await page.click(".wv-tour-card button:has-text('skip')").catch(() => {});
  await page.waitForTimeout(5000);
  const list = await page.evaluate(() => {
    const out = {};
    for (const a of document.getAnimations()) {
      if (a.playState !== "running") continue;
      const t = a.effect?.target, name = a.animationName ?? a.transitionProperty ?? a.constructor.name;
      const where = t ? (t.closest("#map-svg") ? "map-svg " : "page ") + (t.getAttribute("class") || t.tagName) : "?";
      const k = `${name} @ ${where}`;
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  });
  console.log(c, JSON.stringify(list, null, 1));
  await ctx.close();
}
await browser.close();
