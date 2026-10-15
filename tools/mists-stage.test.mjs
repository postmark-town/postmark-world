// mists-stage.test.mjs — the Mists' motion rides the compositor, not the map
// (WLD-43, Darko 2026-10-13: "yes to the fix for everyone, then light mode").
//
//   node --test tools/mists-stage.test.mjs
//
// The drift and the creatures used to be CSS transforms on <g>s inside the map's
// svg, and an svg child's transform is laid out and painted with its whole svg:
// measured on prod at 4× CPU, the World page sat at 99% main thread with nobody
// touching it, one layout of the ~4,000-node map per frame. They now stand on an
// HTML stage laid over the svg (viewer.mjs § THE MISTS' MOTION ON A STAGE OF ITS
// OWN), so a frame of drift is the compositor's.
//
// The pure parts are read directly: the stage's camera against the svg's own
// mapping, the paint's markup, the creatures' HTML against their svg twins. The
// page is DRIVEN for the claim that matters (a regex over the source proves a
// line was typed, never that it reached the screen): with the Mists painted and
// a frame loop running, an idle stretch lays the map out zero times, the moving
// paint is nowhere inside the map's svg, and the stage maps every painting point
// where the svg does, at rest, after a zoom, and mid-drag.
// When Playwright is absent the page half SKIPS AND SAYS SO.

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { viewBoxTransform, mistsPaintHTML } from "../spectator/viewer.mjs";
import { MISTS_PAINT, mistsCreatureHTML, mistsCreatureSVG } from "../spectator/mists-render.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const reg = { originPx: { x: 700, y: 760 }, mPerPx: 5 };

// the matrix a transform string names, applied to a point
const apply = (t, x, y) => { const [a, , , d, e, f] = t.match(/matrix\(([^)]+)\)/)[1].split(",").map(Number); return [a * x + e, d * y + f]; };
const close = (got, want, msg) => assert.ok(Math.abs(got[0] - want[0]) < 1e-9 && Math.abs(got[1] - want[1]) < 1e-9, `${msg}: got ${got} want ${want}`);

test("the stage's camera is the svg's: a viewBox's corners land where preserveAspectRatio puts them", () => {
  const vb = { x: 100, y: 50, w: 400, h: 200 };
  // meet, centred (the map's own, the default): scale 1.5 by width, the height letterboxed
  let t = viewBoxTransform(vb, 600, 600);
  close(apply(t, 100, 50), [0, 150], "meet xMidYMid, top-left");
  close(apply(t, 500, 250), [600, 450], "meet xMidYMid, bottom-right");
  // slice, top-left aligned: scale 3 by height, the width overflows to the right
  t = viewBoxTransform(vb, 600, 600, { align: 2, meetOrSlice: 2 });
  close(apply(t, 100, 50), [0, 0], "slice xMinYMin, top-left");
  close(apply(t, 500, 250), [1200, 600], "slice xMinYMin, bottom-right");
  // none: each axis on its own
  t = viewBoxTransform(vb, 600, 600, { align: 1, meetOrSlice: 1 });
  close(apply(t, 500, 250), [600, 600], "none, bottom-right");
  // meet, bottom-right aligned
  t = viewBoxTransform(vb, 600, 600, { align: 10, meetOrSlice: 1 });
  close(apply(t, 500, 250), [600, 600], "meet xMaxYMax, bottom-right");
  assert.equal(viewBoxTransform(vb, 0, 600), "scale(0)", "a box with no size shows nothing, never a NaN matrix");
});

test("the paint's markup: the opaque layer holds still, the weather drifts by keyframes of its own, only where motion is welcome", () => {
  const box = { minX: -4000, minY: -3000, maxX: 4000, maxY: 3000 };
  const baked = MISTS_PAINT.layers.map((_, li) => ({ li, box, w: 8000, h: 6000, url: `blob:L${li}` }));
  const html = mistsPaintHTML(baked, { ...reg, layers: MISTS_PAINT.layers, creatures: "<i>c</i>" });
  const banks = html.match(/<div class="wv-mists-bank[^"]*">/g);
  assert.equal(banks.length, MISTS_PAINT.layers.length, "one box per layer");
  MISTS_PAINT.layers.forEach((L, li) => {
    if (L.driftM > 0) assert.match(banks[li], new RegExp(`wv-mists-drift wv-mists-l${li}"`), `layer ${li} drifts`);
    else assert.doesNotMatch(banks[li], /wv-mists-drift/, `layer ${li} holds still: no animation at all`);
  });
  assert.doesNotMatch(html, /var\(/, "no custom property in the drift: var() in keyframes costs a fuller style recalc every frame");
  assert.match(html, /^<style>@media \(prefers-reduced-motion:no-preference\)\{ @keyframes wv-mists-drift-1 \{ from \{ transform:translate\(-28\.0px,-12\.6px\); \} to \{ transform:translate\(28\.0px,12\.6px\); \} \}/,
    "layer 1's 140 m at 5 m/px, 0.45 of it across, and only where motion is welcome");
  assert.match(html, /\.wv-mists-cam \.wv-mists-drift\.wv-mists-l2 \{ animation:wv-mists-drift-2 37s ease-in-out infinite alternate; \}/, "layer 2's own period");
  // each bake stands where the svg's <image> stood: originPx + metres / mPerPx
  assert.match(html, /<img class="wv-mists-img" alt="" draggable="false" src="blob:L0" style="left:-100\.0px;top:160\.0px;width:1600\.0px;height:1200\.0px">/);
  assert.equal((html.match(/wv-mists-creatures/g) ?? []).length, 1, "the creatures stand in the back layer's banks, once");
  assert.ok(html.indexOf("wv-mists-creatures") < html.indexOf('wv-mists-l1"'), "under the front layers, which veil them");
});

test("a creature on the stage is its svg twin: the same place, scale, flip, path, eyes and motion phase", () => {
  for (const cr of [
    { kind: "wolf", x: 4321, y: -1234, sizeM: 610, flip: true, pose: "stand", eyes: true, phase: 0.37 },
    { kind: "bat", x: -880, y: 2210, sizeM: 230, flip: false, pose: "flit", eyes: false, phase: 0.912 },
    { kind: "raven", x: 15, y: 3, sizeM: 300, flip: false, pose: "lift", eyes: false, phase: 0 },
    { kind: "raven", x: -40, y: 77, sizeM: 320, flip: true, pose: "perch", eyes: false, phase: 0.5 },
  ]) {
    const svg = mistsCreatureSVG(cr, { ...reg, ink: "#2a2228" }), html = mistsCreatureHTML(cr, { ...reg, ink: "#2a2228" });
    const [, sx, sy, ss] = svg.match(/translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+) /);
    const [, hx, hy, hs] = html.match(/translate\(([-\d.]+)px,([-\d.]+)px\) scale\(([-\d.]+),/);
    assert.deepEqual([hx, hy, hs], [sx, sy, ss], `${cr.kind}: the same place and scale (flip in the sign)`);
    assert.equal(html.match(/ d="([^"]+)"/)[1], svg.match(/ d="([^"]+)"/)[1], `${cr.kind}: the same path`);
    const [, ax, ay] = svg.match(/<g transform="translate\(([-\d.]+) ([-\d.]+)\)"><path/);
    assert.match(html, new RegExp(`style="left:${ax}px;top:${ay}px"`), `${cr.kind}: drawn from the same feet`);
    assert.equal(html.match(/class="wv-mc [^"]*"/)[0], svg.match(/class="wv-mc [^"]*"/)[0], `${cr.kind}: the same motion class`);
    assert.equal(html.match(/wv-mc [^"]*" style="([^"]+)"/)[1], svg.match(/wv-mc [^"]*" style="([^"]+)"/)[1], `${cr.kind}: the same phase`);
    assert.equal(/wv-mc-eyes/.test(html), cr.eyes, `${cr.kind}: eyes only where the svg has them`);
  }
});

// ── the page ────────────────────────────────────────────────────────────────
async function loadChromium() { try { return (await import("playwright")).chromium; } catch { return null; } }
const freePort = () => new Promise((resolve, reject) => {
  const probe = createNetServer();
  probe.on("error", reject);
  probe.listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});
const CLEANUP = [];
after(() => { for (const stop of CLEANUP.reverse()) { try { stop(); } catch { /* gone */ } } });
async function bootRig() {
  const port = await freePort();
  const proc = spawn(process.execPath, [join(ROOT, "spectator", "server.mjs")], {
    cwd: ROOT, env: { ...process.env, PORT: String(port), ATLAS_ORIGIN: "http://127.0.0.1:1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  CLEANUP.push(() => proc.kill());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the rig did not announce itself in 30s")), 30_000);
    proc.stdout.on("data", (b) => { if (String(b).includes(`localhost:${port}`)) { clearTimeout(timer); resolve(); } });
    proc.on("exit", (c) => { clearTimeout(timer); reject(new Error(`the rig exited ${c} before serving`)); });
  });
  return port;
}

let chromium = null, browser = null, port = null;
before(async () => {
  chromium = await loadChromium();
  if (!chromium) return;
  port = await bootRig();
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
});

test("the page: an idle second of drift lays the map out zero times, and the stage maps every point where the svg does", async (t) => {
  if (!chromium) { t.skip("Playwright is not installed: the stage's compositing and camera went UNGUARDED"); return; }
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: "no-preference" });
  // crossing 247, five hours in: the Mists are on, whatever today's crossing is;
  // and a frame loop from the first byte, as the walk layer runs one
  await ctx.addInitScript(() => {
    const RealDate = Date, realNow = RealDate.now.bind(RealDate);
    const off = (Date.UTC(2026, 5, 12) + 247 * 12 * 3600e3 + 5 * 3600e3) - realNow();
    globalThis.Date = class extends RealDate { constructor(...a) { if (a.length === 0) super(realNow() + off); else super(...a); } static now() { return realNow() + off; } };
    const tick = () => requestAnimationFrame(tick); requestAnimationFrame(tick);
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
  // ?lite=0: the motion this test is about, whatever the machine (a 4-core CI runner would turn lite mode on)
  await page.goto(`http://localhost:${port}/?lite=0`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  // painted: wherever the paint stands (an <img> on the stage, an <image> in an svg), so a regression fails on its claim, not on a wait
  await page.waitForSelector(".wv-mists-paint :is(img, image)", { state: "attached", timeout: 120_000 });
  await page.waitForTimeout(4500);   // the roll-in done

  // THE CLAIM, first: an idle stretch with the drift running and a frame loop
  // asking for frames costs the map no layout (before WLD-43: one per frame)
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Performance.enable");
  const layouts = async () => (await cdp.send("Performance.getMetrics")).metrics.find((m) => m.name === "LayoutCount").value;
  const frames = () => page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = (t) => { n++; if (t - t0 < 1500) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); }));
  const l0 = await layouts(); const n = await frames(); const l1 = await layouts();
  assert.ok(n > 30, `frames ran (${n} in 1.5 s)`);
  assert.equal(l1 - l0, 0, `an idle 1.5 s of drift laid the page out ${l1 - l0} times over ${n} frames`);

  const where = await page.evaluate(() => {
    const svg = document.querySelector(".wv-minimap > svg"), stage = document.querySelector(".wv-minimap > .wv-mists-stage");
    const running = document.getAnimations().filter((a) => a.playState === "running");
    const r = (e) => { const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map((v) => Math.round(v)); };
    return {
      stageAfterSvg: stage?.previousElementSibling === svg,
      boxes: [r(svg), r(stage)],
      running: running.length,
      inSvg: running.filter((a) => a.effect?.target?.closest?.(".wv-minimap > svg")).map((a) => a.animationName),
      onStage: running.filter((a) => a.effect?.target?.closest?.(".wv-mists-stage")).length,
      paintInSvg: !!svg.querySelector(".wv-mists-paint, .wv-mists-drift, .wv-mc"),
      wallInSvg: !!svg.querySelector("#wv-mists-layer .wv-mists-wall"),
      topOrder: [...(stage?.querySelector(":scope > svg")?.children ?? [])].map((g) => g.id),
    };
  });
  assert.ok(where.stageAfterSvg, "the stage stands right after the map's svg, under the map's own controls");
  assert.deepEqual(where.boxes[1], where.boxes[0], "the stage is the svg's own box");
  assert.ok(where.onStage >= 2, `the drift runs on the stage (${where.onStage} animations there)`);
  assert.deepEqual(where.inSvg, [], "nothing animates inside the map's svg");
  assert.equal(where.paintInSvg, false, "the moving paint is not in the svg");
  assert.equal(where.wallInSvg, true, "the wall stays in the svg, where it takes the pointer");
  assert.deepEqual(where.topOrder, ["wv-convo-hover-layer", "wv-housemate-edge-layer"], "what drew above the Mists draws above them still");

  // the stage's camera is the svg's: each bake's corner lands where the svg puts the same painting point
  const agree = (label) => page.evaluate((label) => {
    const svg = document.querySelector(".wv-minimap > svg"), m = svg.getScreenCTM(), out = [];
    for (const img of document.querySelectorAll(".wv-mists-bank:not(.wv-mists-drift) .wv-mists-img")) {
      const p = new DOMPoint(parseFloat(img.style.left), parseFloat(img.style.top)).matrixTransform(m), b = img.getBoundingClientRect();
      out.push(Math.max(Math.abs(p.x - b.x), Math.abs(p.y - b.y)));
    }
    return { label, n: out.length, worst: Math.max(...out) };
  }, label);
  const check = (r) => { assert.ok(r.n >= 1, `${r.label}: a still bake to measure`); assert.ok(r.worst < 0.75, `${r.label}: the stage and the svg disagree by ${r.worst.toFixed(2)} px`); };
  check(await agree("at rest"));
  const box = await page.evaluate(() => { const b = document.querySelector(".wv-minimap").getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  await page.mouse.move(box.x + box.w * 0.8, box.y + box.h * 0.5);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(900);
  check(await agree("after a zoom"));
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.w * 0.8 - 15 * i, box.y + box.h * 0.5 - 6 * i);
  await page.waitForTimeout(200);
  const live = await page.evaluate(() => [document.querySelector(".wv-minimap > svg").style.transform, document.querySelector(".wv-mists-stage").style.transform]);
  assert.match(live[0], /^translate\(/, "mid-drag the svg is slid, not re-viewBoxed");
  assert.equal(live[1], live[0], "and the stage is slid the same");
  check(await agree("mid-drag"));
  await page.mouse.up();
  assert.deepEqual(errors, [], "no page errors");
  await ctx.close();
});
