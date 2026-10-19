// mark-icons.mjs — WHAT A MARK IS, AND WHAT STATE IT IS IN, AS ICONS.
//
// Ruled in the playground sitting, Darko 2026-10-15 17:36–17:40: "use icons and
// stuff as much as possible that are like self-explanatory. And then you can
// either hover or click on those icons to like basically get the compact flavor
// text". His models were Into the Breach and Slay the Spire, where a keyword is
// an icon that explains itself on hover, and Hades, a near-empty screen; never
// a hotbar, never a menu that opens a menu.
//
// So this is a CLOSED SET, and the whole of it is in the table below: one icon
// for what a mark is, and a few small badges for its state. No icon for an idea
// or a bounty ("idea and bounty are deprecating very soon"). Every icon has one
// line that says what it means, and that line is what every surface shows on
// hover: the map's pill (an SVG <title>), the nameplate and the column (a
// `title`), and the column spells it out beside the icon as well.
//
// ONE DRAWING, THREE SURFACES. Each glyph is a path in a 16-unit box. The map
// draws the path itself (`iconSVG`); the nameplate and the column draw an empty
// span whose CSS mask is the same path (`MARK_ICON_CSS`), so the column can stay
// a builder that never parses a string as HTML (home-column.mjs's one law).
//
// WHAT THE ICONS ARE READ FROM is the record, through the world's own readers:
// `entryLawOf` (the entry law, including the stairs class's default), `isStairs`
// and `isDungeon` (the classes' own instance rules). The caller hands in what
// only the page knows: the mark's minted class token, whether it is the
// reader's, its ✦ figure and who is inside it. Pure.
import { entryLawOf, isStairs, STAIRS_LINE } from "../tools/enter-exit.mjs";
import { isDungeon } from "../tools/portals.mjs";
import { isSited, isHeld } from "../tools/mark-kind.mjs"; // LOGOS v2 W2: a thing is kind: thing, still sited

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// THE TOKEN (play fix 43, Darko 20:16): a resident is drawn on the map as a round
// frame on two stubby legs, so that body IS the icon for a person — "replace our
// just like head and shoulders with the circle with two little stubby legs coming
// out the bottom". The same body stands for a creature, in its own red. Filled,
// so the mask and the map draw it alike.
const TOKEN_D = "M 3.4 6.6 a 4.6 4.6 0 1 0 9.2 0 a 4.6 4.6 0 1 0 -9.2 0 Z "
  + "M 5.9 10.4 L 7.0 10.7 L 6.3 14.2 L 5.2 13.9 Z M 10.1 10.4 L 9.0 10.7 L 9.7 14.2 L 10.8 13.9 Z";
const circle = (x, y, r) => `M ${x - r} ${y} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`;

// The vocabulary. `what` icons say what a mark is (one per mark at most);
// `state` badges say what is true of it now. `fill` glyphs are solid; the rest
// are drawn as a 1.6-unit line. THE DOOR IS A DOOR (play row 71, Darko 19:00:
// "the icon for door should just be like a door like a regular door image
// instead of the uh blueprint door image"): an upright door with a knob,
// never the plan view's leaf and swing.
export const MARK_ICONS = Object.freeze({
  place: { kind: "what", label: "place", meaning: "A place: a mark set down on the ground.",
    d: `M 8 14.5 C 8 14.5 3.5 9.6 3.5 6.6 A 4.5 4.5 0 0 1 12.5 6.6 C 12.5 9.6 8 14.5 8 14.5 Z ${circle(8, 6.6, 1.6)}` },
  home: { kind: "what", label: "home", meaning: "A home: a household's parcel of ground.",
    d: "M 2.5 8 L 8 3 L 13.5 8 M 4.2 6.6 V 13.5 H 11.8 V 6.6 M 6.9 13.5 V 10.4 H 9.1 V 13.5" },
  thing: { kind: "what", label: "thing", meaning: "A thing: an object in the world, not ground to stand on.",
    d: "M 8 2.5 L 13.5 5.2 V 10.8 L 8 13.5 L 2.5 10.8 V 5.2 Z M 2.5 5.2 L 8 7.9 L 13.5 5.2 M 8 7.9 V 13.5" },
  door: { kind: "what", label: "door", meaning: "A door: entering it takes you somewhere else.",
    d: `M 4 13.5 V 2.5 H 12 V 13.5 Z ${circle(9.6, 8.4, 0.5)}` },
  dungeon: { kind: "what", label: "dungeon", meaning: "A dungeon: a place with its own floors and rooms inside.",
    d: "M 3 14 V 5 H 5 V 3.2 H 7 V 5 H 9 V 3.2 H 11 V 5 H 13 V 14 Z M 6.5 14 V 10.6 A 1.5 1.5 0 0 1 9.5 10.6 V 14" },
  stairs: { kind: "what", label: "stairs", meaning: "Stairs: a way between floors.",
    d: "M 2.5 13.5 H 5.5 V 10.5 H 8.5 V 7.5 H 11.5 V 4.5 H 13.5" },
  vehicle: { kind: "what", label: "vehicle", meaning: "A vehicle: it moves, and you can ride it.",
    d: "M 2 9.6 H 14 L 12 13 H 4 Z M 8 9.6 V 2.5 L 12.2 8 H 8" },
  creature: { kind: "what", label: "creature", meaning: "A creature: something alive that answers what you do near it.", fill: true,
    d: TOKEN_D },
  yours: { kind: "state", label: "yours", meaning: "Yours: your household's mark.",
    d: "M 4 14 V 2.5 M 4 3 H 12.5 L 10.4 5.6 L 12.5 8.2 H 4" },
  locked: { kind: "state", label: "locked", meaning: "Locked: it refuses entry.",
    d: `M 3.8 7.4 H 12.2 V 13.6 H 3.8 Z M 5.6 7.4 V 5.4 A 2.4 2.4 0 0 1 10.4 5.4 V 7.4 M 8 9.8 V 11.4` },
  consent: { kind: "state", label: "asks consent", meaning: "Asks consent: it has terms you accept at the door before you go in.",
    d: "M 4 2.5 H 9.8 L 12.4 5.1 V 13.5 H 4 Z M 9.8 2.5 V 5.1 H 12.4 M 6 8.6 H 10.4 M 6 11 H 9" },
  staked: { kind: "state", label: "staked", meaning: "Staked: stamps are staked behind it.", fill: true,
    d: "M 8 1.5 L 9.6 6.4 L 14.5 8 L 9.6 9.6 L 8 14.5 L 6.4 9.6 L 1.5 8 L 6.4 6.4 Z" },
  inside: { kind: "state", label: "people inside", meaning: "People inside: someone is inside it now.", fill: true,
    d: TOKEN_D },
  soon: { kind: "state", label: "coming soon", meaning: "Coming soon: what it leads to is not built yet.",
    d: "M 4 2.5 H 12 M 4 13.5 H 12 M 5 2.5 C 5 6 8 7 8 8 C 8 9 5 10 5 13.5 M 11 2.5 C 11 6 8 7 8 8 C 8 9 11 10 11 13.5" },
});

// the ink each badge is drawn in — the page's own tokens, one meaning each
const INK = {
  yours: "var(--green, #84c98f)", locked: "var(--err, #d98a7a)", consent: "var(--amber, #e8c56a)",
  staked: "var(--stamp-violet, #aa8fd8)", soon: "var(--dim, #9a9280)",
  // green is a resident (sovereign green), red a creature, purple a stamp (play fix 43)
  inside: "var(--green, #84c98f)", creature: "#e6948c",
};
const WHAT_INK = "var(--paper, #e8e0cf)";
export const inkOf = (key) => INK[key] ?? WHAT_INK;

/** The creature classes, read from the record: the `creature` class and every
 *  class declared under it (WORLD/…/entity/creature/<kind>: `extends: creature`
 *  on the file, and its `parent` the creature class in the fold, which keeps
 *  the nesting and drops `extends`). Never a hard-coded list of animals. */
export function creatureClassesOf(marks = [], token = (c) => String(c ?? "").trim().toLowerCase()) {
  const out = new Set(["creature"]);
  const classes = (marks ?? []).filter((m) => m?.kind === "class");
  const creatureIds = new Set(classes.filter((m) => token(m.class) === "creature").map((m) => m.id));
  for (const m of classes) {
    if (!token(m.class)) continue;
    if (token(m.extends) === "creature" || (m.parent && creatureIds.has(m.parent))) out.add(token(m.class));
  }
  return out;
}

/** The thing classes, read from the record: `thing` and every class under it,
 *  however deep (a halloween-candy-bowl extends thing; LOGOS v2 part 2). A
 *  class names its parent by `extends` on the file and by `parent` in the
 *  fold, so both are followed, to a fixed point. */
export function thingClassesOf(marks = [], token = (c) => String(c ?? "").trim().toLowerCase()) {
  const out = new Set(["thing"]);
  const classes = (marks ?? []).filter((m) => m?.kind === "class" && token(m.class));
  const ids = new Set(classes.filter((m) => token(m.class) === "thing").map((m) => m.id));
  for (let grew = true; grew;) {
    grew = false;
    for (const m of classes) {
      const c = token(m.class);
      if (out.has(c)) continue;
      if (out.has(token(m.extends)) || (m.parent && ids.has(m.parent))) { out.add(c); ids.add(m.id); grew = true; }
    }
  }
  return out;
}

/** What a mark IS, as one icon key, or null. Order matters where a mark is two
 *  things: a dungeon or a stair is also a portal by its law, a door may be a
 *  thing. Only an instance on the ground or a parcel is anything here — a class
 *  declaration, a predicate or a naming carries no icon, and neither do an idea
 *  and a bounty (deprecating, Darko 2026-10-15). */
export function markWhat(mark, { cls = "", creatureClasses = new Set(["creature"]), thingClasses = new Set(["thing"]) } = {}) {
  if (!mark) return null;
  if (mark.kind === "parcel") return "home";
  if (isHeld(mark)) return "thing"; // in someone's hands: published, unplaced, and only a thing is held (POS-688)
  if (!isSited(mark)) return null; // either form (W2: kind names the class)
  if (cls === "idea" || cls === "bounty") return null;
  if (isDungeon(mark) || cls === "dungeon") return "dungeon";
  if (isStairs(mark) || cls === "stairs") return "stairs";
  if (cls === "portal-ground" || entryLawOf(mark)?.into) return "door";
  if (cls === "vehicle") return "vehicle";
  if (creatureClasses.has(cls)) return "creature";
  // a kind of thing is a thing (QA 10-17: a halloween-candy-bowl read "A place")
  if (cls === "thing" || thingClasses.has(cls)) return "thing";
  return "place";
}

/** The mark's state badges, in a fixed order. `soon` is the stairs class's
 *  answer (STAIRS_LINE: "…Coming Soon!") — a refusal that is a promise, so it
 *  is not also called locked. */
export function markStates(mark, { yours = false, weight = 0, inside = 0 } = {}) {
  if (!mark) return [];
  const out = [];
  if (yours) out.push({ key: "yours" });
  const law = entryLawOf(mark);
  const soon = !!law && law.word === "opposed" && law.consequence === STAIRS_LINE;
  if (law?.word === "opposed" && !soon) out.push({ key: "locked" });
  if (law?.edge) out.push({ key: "consent" });
  const w = Math.max(0, Number(weight) || 0);
  if (w > 0) out.push({ key: "staked", count: w });
  const n = Math.max(0, Number(inside) || 0);
  if (n > 0) out.push({ key: "inside", count: n });
  if (soon) out.push({ key: "soon" });
  return out;
}

/** Every icon a mark wears, what first: [{ key, kind, label, meaning, count? }]. */
export function markIcons(mark, opts = {}) {
  const what = markWhat(mark, opts);
  return [...(what ? [{ key: what }] : []), ...markStates(mark, opts)]
    .map((icon) => ({ ...icon, ...describe(icon) }));
}

function describe({ key, count = null }) {
  const icon = MARK_ICONS[key];
  if (!icon) return { kind: "state", label: key, meaning: key };
  let meaning = icon.meaning;
  if (key === "staked" && count) meaning = `Staked: ✦ ${Number(count).toLocaleString()} behind it.`;
  if (key === "inside" && count) meaning = `People inside: ${count} ${count === 1 ? "person is" : "people are"} inside it now.`;
  return { kind: icon.kind, label: icon.label, meaning };
}

/** The glyph as SVG markup in the map's own units: `size` units across, its
 *  top-left at (x, y). The <title> is the hover meaning. `ink` overrides the
 *  icon's own colour — the glyph cut into a pip is drawn in the page's dark. */
export function iconSVG(icon, { x = 0, y = 0, size = 10, ink = null } = {}) {
  const def = MARK_ICONS[icon?.key];
  if (!def) return "";
  const k = size / 16;
  const colour = ink ?? inkOf(icon.key);
  const paint = def.fill
    ? `fill="${colour}" stroke="none"`
    : `fill="none" stroke="${colour}" stroke-width="${ink ? 2.1 : 1.7}" stroke-linecap="round" stroke-linejoin="round"`;
  return `<g class="ov-ic ic-${icon.key}" transform="translate(${x} ${y}) scale(${k})">`
    + `<title>${esc(icon.meaning ?? def.meaning)}</title>`
    + `<rect width="16" height="16" fill="transparent" stroke="none"/>`
    + `<path d="${def.d}" ${paint}/></g>`;
}

/** The icon row as HTML (the nameplate's): an empty span per icon, drawn by its
 *  CSS mask, a count beside ✦ and people, the meaning as its `title`. */
export function iconsHTML(icons = []) {
  return (icons ?? []).map((icon) => `<span class="wv-icw" title="${esc(icon.meaning)}">`
    + `<span class="wv-ic ic-${esc(icon.key)}" aria-label="${esc(icon.label)}"></span>`
    + (icon.count ? `<span class="wv-icn">${esc(Number(icon.count).toLocaleString())}</span>` : "")
    + `</span>`).join("");
}

const maskURL = (def) => {
  const paint = def.fill ? "fill='black'" : "fill='none' stroke='black' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='${def.d}' ${paint}/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

/** The HTML surfaces' dress: one masked square per icon, in its own ink. */
export const MARK_ICON_CSS = `
.wv-icw { display:inline-flex; align-items:center; gap:2px; flex:none; }
.wv-ic { display:inline-block; width:15px; height:15px; flex:none; background:currentColor;
  -webkit-mask:var(--wv-ic) center/contain no-repeat; mask:var(--wv-ic) center/contain no-repeat; }
.wv-icn { font-family:var(--mono); font-size:.68rem; line-height:1; }
${Object.entries(MARK_ICONS).map(([key, def]) => `.wv-ic.ic-${key} { --wv-ic:${maskURL(def)}; color:${inkOf(key)}; }`).join("\n")}
.wv-icw:has(.ic-staked) .wv-icn { color:${inkOf("staked")}; }
.wv-icw:has(.ic-inside) .wv-icn { color:${inkOf("inside")}; }
`;
