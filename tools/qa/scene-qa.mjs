// scene-qa.mjs — THE ROOM SCENE, exercised through the one engine.
//
// Companion to town-fingerprint.mjs: that control proves the TOWN did not move;
// this one proves the ROOM actually works — mounted as its own scene, rendered
// by the same machinery, with the founder's conditions (painting-only default)
// as the baseline state. Run against a rig on PORT (default 4881):
//
//   node tools/qa/scene-qa.mjs [--shots DIR]
//
// THE RIG IS NOT IN THIS REPO ANY MORE. It was demo/serve.mjs, and demo/ left
// main at e383e992 (2026-08-30). What this file needs of a rig: the viewer
// served (spectator/server.mjs does that), an identity whose handles include a
// resident the enter-exit ledger puts inside a room (the viewer only asks
// /ops/whoami when a pm_key is in localStorage), and an apex door that takes
// `exit`, because the exit falsifier's exits are real acts. POS-206 ran it
// behind a proxy doing exactly those three things, with the ledger held in
// memory — so a re-run needs a restarted rig, not a reseed.
//
// Exits 1 on the first failed assertion, 0 with a receipt table when green.
// The rig's own WORLD record is the fixture: rei stands inside the Lanternstep
// House on the threshold ledger this branch carries.
import { chromium } from "file:///G:/Wright-HQ/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? "4881";
const shotDirArg = process.argv.indexOf("--shots");
const SHOTS = shotDirArg > -1 ? process.argv[shotDirArg + 1] : join(HERE, "..", "..", "qa-shots");
mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) { console.log("\nRED — stopping at the first falsifier that failed."); process.exit(1); }
};

const browser = await chromium.launch();
// PAINTING-ONLY DEFAULT ON PURPOSE: no localStorage seeding. This is the site's
// real condition and the one that hid the exit from the founder (b6 lesson).
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message.slice(0, 200)));

await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90000 });
await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
await page.waitForTimeout(1200);

// ── into the room: act as whichever resident the RIG's own record puts inside
// (the demo seeds its own git-ignored state, so the cast varies by worktree —
// the fixture is found, not assumed; jetto-scene's reproducibility lesson)
const roster = await page.evaluate(() =>
  [...document.querySelectorAll("[data-act-as]")].map((x) => x.dataset.actAs).filter((h) => h !== "__spectator__"));
let actor = null;
for (const handle of roster) {
  await page.evaluate((h) => {
    const b = [...document.querySelectorAll("[data-act-as]")].find((x) => x.dataset.actAs === h);
    b?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, handle);
  await page.waitForTimeout(2200);
  if (await page.evaluate(() => document.querySelector(".wv-minimap")?.classList.contains("is-scene-mark"))) {
    actor = handle; break;
  }
}
check("the rig offers an entered resident as the fixture", !!actor, actor ?? `roster: ${roster.join(", ")}`);

// ── THE ROOM CARD (POS-206, Keemin 2026-09-23): open at the pane's upper left
// in EVERY view mode, the way out inside it, and the corner dot that used to
// reveal it standing down. Measured against the pane's own rect, and run once
// per view mode below — the mode that hid the old telling exit is the default.
const roomCardReading = () => page.evaluate(() => {
  const box = document.querySelector(".wv-minimap");
  const bb = box?.getBoundingClientRect();
  const card = box?.querySelector(":scope > .wv-room-card");
  const cr = card?.getBoundingClientRect();
  const exits = [...document.querySelectorAll(".wv-int-exit-btn")];
  const exit = card?.querySelector(".wv-room-card-exit .wv-int-exit-btn");
  const eb = exit?.getBoundingClientRect();
  const dot = box?.querySelector(".wv-worldmark");
  const cell = card?.querySelector(".wv-card[data-id]");
  return {
    mode: document.querySelector(".wv")?.classList.contains("is-painting-only") ? "painting-only" : "telling open",
    open: !!cr && cr.width > 40 && cr.height > 40 && getComputedStyle(card).display !== "none",
    upperLeft: !!cr && !!bb && (cr.x - bb.x) < 30 && (cr.y - bb.y) < 30,
    keep: card?.hasAttribute("data-wv-keep") ?? false,
    names: cell?.dataset.id ?? null,
    roomId: exit?.dataset.mark ?? null,
    exitInCard: !!exit && eb.width > 0 && eb.y >= cr.y && eb.bottom <= cr.bottom + 1 && eb.y < window.innerHeight,
    exitCount: exits.length,
    dotHidden: !dot || getComputedStyle(dot).display === "none",
  };
});
const cardCheck = (r, where) => {
  check(`THE ROOM CARD is open at the pane's upper left — ${where}`, r.open && r.upperLeft,
    `${r.mode}; open=${r.open} upperLeft=${r.upperLeft}`);
  check(`…it is the room's own card, and remounts keep it — ${where}`, r.names && r.names === r.roomId && r.keep, `${r.names}`);
  check(`…THE WAY OUT is inside it, the page's one exit — ${where}`, r.exitInCard && r.exitCount === 1, `${r.exitCount} exit button(s)`);
  check(`…and the corner dot that used to reveal it stands down — ${where}`, r.dotHidden);
};

const inside = await page.evaluate(() => {
  const box = document.querySelector(".wv-minimap");
  const svg = box?.querySelector("svg");
  return {
    sceneMark: !!box?.classList.contains("is-scene-mark"),
    ground: !!svg?.querySelector(".wv-scene-ground"),
    paper: !!svg?.querySelector("#wv-scene-rule-pat") && !!svg?.querySelector(".wv-scene-wall"),
    placeholders: (() => {
      const blocks = [...(svg?.querySelectorAll("#wv-overlay .wv-ph-extent") ?? [])];
      const fills = new Set(blocks.map((b) => b.getAttribute("fill")));
      return { count: blocks.length, distinctFills: fills.size,
        lowSat: [...fills].every((f) => /hsl\(\d+ 22% 76%\)/.test(f ?? "")) };
    })(),
    atlasContent: !!svg?.querySelector("image[href*='atlas'], #the-water, .region-founder"),
    pips: svg?.querySelectorAll("#wv-overlay [data-id]").length ?? 0,
    mapctlVisible: (() => { const m = box?.querySelector(".wv-mapctl"); return !!m && getComputedStyle(m).display !== "none"; })(),
    viewBox: svg?.getAttribute("viewBox") ?? null,
    markerVar: svg?.querySelector("#wv-overlay")?.style.getPropertyValue("--wv-mk") || null,
  };
});
const cardDefault = await roomCardReading();
await page.screenshot({ path: join(SHOTS, "scene-a-inside.png") });
check("the scene mounts for an entered standpoint", inside.sceneMark);
check("the ground is the scene's own (placeholder present)", inside.ground);
check("…and it is the PAPER floor: squared rule + the room's wall", inside.paper);
check("art-less marks stand in as placeholder extents", inside.placeholders.count >= 1, `${inside.placeholders.count} blocks`);
check("placeholders are DISTINCT by hue and low-saturation by word",
  inside.placeholders.lowSat && (inside.placeholders.count < 2 || inside.placeholders.distinctFills >= 2),
  `${inside.placeholders.distinctFills} distinct fills`);
check("THE ROOF: no atlas content inside the room's svg", !inside.atlasContent);
check("the room's things draw as pips through the ONE overlay", inside.pips >= 1, `${inside.pips} pips`);
cardCheck(cardDefault, "the DEFAULT view mode");
// …and in the OTHER view mode: the card does not ride the telling, so folding
// or unfolding it must not move the card or its door
await page.evaluate(() => {
  document.querySelector(".wv-telling-toggle")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await page.waitForTimeout(900);
const cardOther = await roomCardReading();
await page.screenshot({ path: join(SHOTS, "scene-a2-inside-other-mode.png") });
check("the telling toggle really changed the view mode", cardOther.mode !== cardDefault.mode,
  `${cardDefault.mode} -> ${cardOther.mode}`);
cardCheck(cardOther, "the OTHER view mode");
await page.evaluate(() => {
  document.querySelector(".wv-telling-toggle")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await page.waitForTimeout(900);
check("the FULL RAIL is present in a mark scene (revised ruling)", inside.mapctlVisible);
check("the numeric regime is the town's own (marker var ≈ 1)",
  inside.markerVar === null || Math.abs(Number(inside.markerVar) - 1) < 0.7, `--wv-mk=${inside.markerVar}`);

// ── the camera is CLAMPED: zoom-in works; zoom-out stops at the whole room ──
// normalize first: act-as recenter may have lockOn-zoomed the view already
await page.evaluate(() => document.querySelector(".wv-map-home")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
await page.waitForTimeout(600);
const w0 = await page.evaluate(() => Number(document.querySelector(".wv-minimap svg")?.getAttribute("viewBox")?.split(/\s+/)[2]));
await page.mouse.move(1000, 500);
await page.mouse.wheel(0, -600);
await page.waitForTimeout(400);
const wIn = await page.evaluate(() => Number(document.querySelector(".wv-minimap svg")?.getAttribute("viewBox")?.split(/\s+/)[2]));
check("the wheel zooms IN to a room (revised ruling)", wIn < w0 * 0.9, `${w0} -> ${wIn}`);
await page.mouse.wheel(0, 4000);
await page.waitForTimeout(400);
const wOut = await page.evaluate(() => Number(document.querySelector(".wv-minimap svg")?.getAttribute("viewBox")?.split(/\s+/)[2]));
check("FALSIFIER: zoom-out stops at the whole room — never past the walls", Math.abs(wOut - w0) < w0 * 0.02, `${wOut} vs full ${w0}`);
const rail = await page.evaluate(() => {
  const box = document.querySelector(".wv-minimap");
  const fp = box?.querySelector(".wv-map-fp"); const cv = box?.querySelector(".wv-map-convo");
  fp?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const fpOn = (() => { const l = box?.querySelector("#wv-fp-layer"); return !!l && l.style.display !== "none" && l.childNodes.length > 0; })();
  fp?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  return { fpBtn: !!fp, cvBtn: !!cv, fpOn };
});
check("the footprint toggle draws extent outlines inside", rail.fpBtn && rail.fpOn);
check("the conversations toggle is on the rail inside", rail.cvBtn);

// ── hover: the glance rides the same machinery ──────────────────────────────
const hover = await page.evaluate(() => {
  const pip = document.querySelector(".wv-minimap #wv-overlay [data-id]");
  if (!pip) return { pip: false };
  const r = pip.getBoundingClientRect();
  return { pip: true, x: r.x + r.width / 2, y: r.y + r.height / 2, id: pip.dataset.id };
});
check("floor pips exist to hover", hover.pip);
await page.mouse.move(hover.x, hover.y);
await page.waitForTimeout(600);
const glanced = await page.evaluate(() =>
  !!document.querySelector(".wv-bubbles .wv-bubble") || !!document.querySelector("#wv-hl-layer *"));
await page.screenshot({ path: join(SHOTS, "scene-b-hover.png") });
check("hovering a room thing raises the same glance/highlight the town raises", glanced);

// ── click a thing: the same selection, in BOTH view modes ───────────────────
// The demo rig runs telling-open, where a selection lands on the CELL (the
// bubble is deliberately the painting-only affordance) — identical to the town.
await page.mouse.click(hover.x, hover.y);
await page.waitForTimeout(800);
const selected = await page.evaluate(() => document.querySelector(".is-mark-selected")?.dataset?.id ?? null);
check("clicking a room thing selects it (cell lights, telling-open mode)", selected === hover.id, `${selected}`);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
// …and in painting-only (the SITE's default), the same click raises the bubble
await page.evaluate(() => {
  document.querySelector(".wv-telling-toggle")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await page.waitForTimeout(800);
const hover2 = await page.evaluate(() => {
  const pip = document.querySelector(".wv-minimap #wv-overlay [data-id]");
  if (!pip) return null;
  const r = pip.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: pip.dataset.id };
});
check("pips survive the telling toggle", !!hover2);
await page.mouse.click(hover2.x, hover2.y);
await page.waitForTimeout(800);
const bubble = await page.evaluate(() => {
  // ANY pinned bubble is the pass: a mark's card, a walker's mini-card, or the
  // chooser are all correct outcomes of the town's own click precedence (a face
  // wins the click — that is parity, not a miss)
  const el = document.querySelector(".wv-bubble.is-pinned");
  return el && !el.hidden && el.innerHTML.length > 40 ? { over: true } : { over: false };
});
await page.screenshot({ path: join(SHOTS, "scene-c-thingclick.png") });
check("in painting-only, the same click opens the real pinned bubble over the floor", bubble.over);
await page.keyboard.press("Escape");
await page.evaluate(() => {
  document.querySelector(".wv-telling-toggle")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await page.waitForTimeout(600);

// ── click open floor: the walk desk arms, same verb as open ground ──────────
const floorSpot = await page.evaluate(() => {
  const svg = document.querySelector(".wv-minimap svg");
  const r = svg.getBoundingClientRect();
  return { x: r.x + r.width * 0.62, y: r.y + r.height * 0.25 };
});
await page.mouse.click(floorSpot.x, floorSpot.y);
await page.waitForTimeout(800);
const desk = await page.evaluate(() => {
  const d = document.querySelector(".wv-walkdesk");
  return d && !d.hidden && d.offsetParent !== null;
});
await page.screenshot({ path: join(SHOTS, "scene-d-floorclick.png") });
check("an open-floor click arms the walk desk (chooseWalkPoint, unchanged)", !!desk);

// ── out: the exit swaps scenes back — one level per crossing ────────────────
// A stacked entrant (the rig seeds one) exits INTO the outer room first: each
// exit is one threshold, and the scene follows the ledger level by level. The
// falsifier is that the LAST exit lands the town whole.
for (let level = 0; level < 4; level++) {
  const stillIn = await page.evaluate(() =>
    document.querySelector(".wv-minimap")?.classList.contains("is-scene-mark"));
  if (!stillIn) break;
  await page.evaluate(() => {
    document.querySelector(".wv-minimap > .wv-room-card .wv-int-exit-btn")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await page.waitForTimeout(4000);
}
const outside = await page.evaluate(() => {
  const box = document.querySelector(".wv-minimap");
  const svg = box?.querySelector("svg");
  return {
    sceneMark: !!box?.classList.contains("is-scene-mark"),
    atlasBack: !!svg?.querySelector("image"),
    cardGone: !box?.querySelector(".wv-room-card"),
    dotBack: (() => { const d = box?.querySelector(".wv-worldmark"); return !!d && getComputedStyle(d).display !== "none"; })(),
    pips: svg?.querySelectorAll("#wv-overlay [data-id]").length ?? 0,
  };
});
await page.screenshot({ path: join(SHOTS, "scene-e-outside.png") });
check("FALSIFIER: exiting remounts the town scene whole", !outside.sceneMark && outside.atlasBack, `pips=${outside.pips}`);
check("the room card leaves with the room, and the corner dot comes back", outside.cardGone && outside.dotBack);

check("zero page errors across the whole pass", errs.length === 0, errs[0] ?? "");
await browser.close();
console.log(`\nGREEN — ${results.length} checks. Shots in ${SHOTS}`);
