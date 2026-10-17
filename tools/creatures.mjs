// creatures.mjs — the creatures from the Mists: the hidden schedule and the fold (WLD-56).
//
// Ruled in Sitting E (Darko, 2026-10-14 §§ 3, 6, 7; the record is Starstory
// docs/2026-10-14/halloween/sitting-E-entities.md). A creature is a living node: its
// spawn is a LIVE create by `the-town`, its reactions are its own live acts, and it
// leaves by a live withdraw, reason `faded` (12 h after its spawn) or `fled` (the
// only leaving by outcome). Each crossing's save photographs the living ones.
// Engineering settled by Wright on WLD-56 (W1–W8), from Plumb's gap read.
//
// Everything here is PURE: no clock, no store, no network. The office's writer tick
// calls it to know what is due, and the save calls it to know what is alive; anyone
// holding the log calls it to check both.
//
// ── THE SEED: COMMIT, THEN REVEAL (W2) ─────────────────────────────────────────
// "The schedule stays hidden until each spawn" and "afterwards it's public in the
// log and can be re-derived" (Darko 21:12, 21:31). So each crossing has its own
// secret, secret_N = HMAC-SHA256(master, "creatures/" + N), and the master key lives
// only on the box. At the window's first tick `the-town` writes a `seed` act
// carrying the world sha the window is pinned to and
// commitment_N = sha256(secret_N | world_sha): public, and it says nothing about
// the schedule, but it binds both the secret and the law and marks the schedule is
// derived from. At the window's close it writes a `reveal` act carrying secret_N,
// and anyone re-derives the whole window (`scheduleFor`, with the inputs read at
// that sha) and checks it against the commitment and the spawns (`auditWindow`).
// A per-crossing secret is why one reveal never exposes the next window.
//
// ── THE SCHEDULE ────────────────────────────────────────────────────────────────
// A pure function of (N, secret_N, the window's dials, the Mists at N, the town's
// keep-out at the window's opening sha). Each spawn has a kind, a minute in the
// window, and a place: in the band on the clear side of the wall, never inside it,
// never in a clearing, never on or near the town's ground (tools/mists-keep.mjs),
// never on the town's water (the sea, the main channel).
// A spawn with no place found after a bounded search is not made, and the schedule
// says so (`unplaced`), the same way on every replay.
//
// THE NUMBERS ARE LAW (D1, D2; Darko 2026-10-15 12:09, as recommended): the band
// is the 400 m fringe on the clear side of the wall, open country only; per window
// a wolf 2, a raven 4, a bat 3, each at its own seeded minute. They live on the
// creature class's dials and each kind's `count_per_window` (WORLD/marks/…/entity/
// creature/), read by `creatureLaw`; nothing here hard-codes a creature's numbers.
//
// THE KINDS IN TURN (Darko 2026-10-17 13:58, WLD-56): one creature per window, a
// bat first, then raven, then wolf, and round again. The class's `rotation` dial lists the kinds in turn; window N
// brings only `rotation[(N - from_crossing) mod length]`, at that kind's
// `count_per_window`. Absent or null, every kind comes at its own count.
//
// ── THE FOLD (W4, W5) ──────────────────────────────────────────────────────────
// A creature is a fold of the log's rows: `spawn` (the-town, object = its id),
// its reactions (action `react`, actor = its id; payload `moods_after` and
// `flags_after`, a sorted array of the set flags, are its state from then on), and
// `withdraw` (object = its id, by the-town or itself, payload.reason faded | fled;
// any other withdraw is not the record's and is ignored).
//
// EVERY ROW CARRIES ITS WRITE TIME; THE SCHEDULE RIDES IN THE PAYLOAD. The log is
// append-only and nobody back-dates it: a spawn written 20 s after its minute is
// dated when it was written, with the minute in `payload.at`; a fade is dated when
// the tick wrote it, with the span's end in `payload.fades_at`.
//
// Two readings of the same rows:
//   - the WRITTEN fold (`creaturesWritten`): spawned and not yet withdrawn. The
//     crossing save photographs this, so a fade the tick has not yet written is
//     still in the photograph and still due afterwards (`dueFades`).
//   - the LIVING read (`creaturesAt`): the written fold with the span cut. Past
//     `fades_at` a creature is gone whether or not its withdraw is written yet.
// Both fold a crossing's snapshot plus the rows written since it, never the whole
// history (snapshot per settlement, delta only). The creature's short memory is
// NOT here and is never saved: "for its own span only" (§ 7).

import { createHash, createHmac } from "node:crypto";
import { mistsAt, mistsHere } from "./world-engine.mjs";
import { mistsKeepRects, keptByTheTown } from "./mists-keep.mjs";
import { CROSSING_EPOCH_UTC, CROSSING_MS } from "./walk.mjs";
import { pointInPolygon, polygonOf } from "./geometry.mjs";

export const TOWN = "the-town";
export const DESPAWN_REASONS = Object.freeze(["faded", "fled"]);
export const ID_PREFIX = "creature:";
/** A creature's own act: its reaction, as the office writes it (POS-637 W4). */
export const REACT_ACTION = "react";

/** Where the creature class and its kinds stand in the world: the one directory a
 *  reader at a ref (the office's tick) lists and parses to read the law. A mark's
 *  directory never moves (the frozen filing), so this is a durable address. */
export const CREATURE_LAW_DIR = "WORLD/marks/let-there-be-light/the-town-centre/the-keeping-works/postmark-node/entity/creature";

/** The dials the schedule reads, each from the creature class (or a kind's mark). */
export const CREATURE_DIAL_NAMES = Object.freeze(["band_from_m", "band_to_m", "keep_m", "apart_m", "span_h"]);

/**
 * The creature law as the class marks write it: { fromCrossing, dials, kinds }.
 *   fromCrossing  the class's launch dial (null is off, W6)
 *   dials         { counts: { <kind>: count_per_window }, band_from_m, band_to_m, keep_m, apart_m, span_h }
 *   kinds         [{ kind, kind_file }], by name
 * `marks` are parsed mark records (`loadMarks`, or `parseRecord` on each file read
 * at a ref). Only the-town's classes count. Null when there is no creature class:
 * no class, no creatures. A class missing a dial, or a kind with no whole count or
 * no kind file, throws: the law is read whole or not at all.
 */
export function creatureLaw(marks) {
  const classes = (marks ?? []).filter((m) => m?.kind === "class" && m.by === TOWN);
  const c = classes.find((m) => String(m.class) === "creature");
  if (!c) return null;
  const dials = { counts: {} };
  for (const k of CREATURE_DIAL_NAMES) {
    const v = c.dials?.[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new Error(`creatureLaw: the creature class's ${k} dial is ${JSON.stringify(v)}, not a number ≥ 0`);
    dials[k] = v;
  }
  const kinds = [];
  for (const m of classes.filter((x) => x.extends === "creature").sort((a, b) => (String(a.class) < String(b.class) ? -1 : 1))) {
    const kind = String(m.class), n = m.dials?.count_per_window;
    if (!Number.isInteger(n) || n < 0) throw new Error(`creatureLaw: ${kind}'s count_per_window is ${JSON.stringify(n)}, not a whole number`);
    if (typeof m.kind_file !== "string" || !m.kind_file) throw new Error(`creatureLaw: ${kind} names no kind_file`);
    dials.counts[kind] = n;
    kinds.push({ kind, kind_file: m.kind_file });
  }
  const rotation = rotationOf(c.dials?.rotation ?? null, dials.counts);
  if (rotation) dials.rotation = rotation;
  return { fromCrossing: c.dials?.from_crossing ?? null, dials, kinds };
}

/** The rotation dial, read whole: text naming the class's own kinds in turn
 *  ("bat raven wolf", the one form that is also a LOGOS v2 property's free-text
 *  value), or null for none. Anything else throws. */
function rotationOf(v, counts) {
  if (v === null) return null;
  const list = typeof v === "string" ? v.trim().split(/\s+/).filter(Boolean) : null;
  if (!list?.length || !list.every((k) => Object.hasOwn(counts, k)))
    throw new Error(`creatureLaw: the creature class's rotation dial is ${JSON.stringify(v)}, not its kinds in turn`);
  return list;
}

/** The kinds crossing N brings and how many of each: every kind at its count, or,
 *  under a rotation, only the kind whose turn N is (counted from the launch dial). */
export function countsFor(crossing, dials, fromCrossing) {
  const counts = dials?.counts ?? {};
  const rotation = dials?.rotation ?? null;
  if (!rotation) return counts;
  const from = Number(fromCrossing), len = rotation.length;
  const kind = rotation[((((crossing | 0) - from) % len) + len) % len];
  return { [kind]: counts[kind] ?? 0 };
}

/** A plain object: {…} or Object.create(null); never an array, a date or a boxed value. */
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v)
  && [Object.prototype, null].includes(Object.getPrototypeOf(v));

// ── the seed ────────────────────────────────────────────────────────────────────
/** secret_N: the crossing's own key, from the box's master key. Hex. */
export function secretFor(masterKey, crossing) {
  if (!masterKey) throw new Error("secretFor: no master key");
  return createHmac("sha256", String(masterKey)).update(`creatures/${crossing | 0}`).digest("hex");
}

/** commitment_N: what the seed act publishes before any spawn, binding the secret
 *  and the world sha the window is pinned to. Hex. */
export function commitmentOf(secret, worldSha) {
  if (!worldSha) throw new Error("commitmentOf: no world sha to bind");
  return createHash("sha256").update(`${secret}|${worldSha}`).digest("hex");
}

/** A uniform draw in [0, 1) from a secret, named by its key: sha256(secret | key), first 48 bits. */
function draw(secret, key) {
  const b = createHash("sha256").update(`${secret}|${key}`).digest();
  return (b.readUIntBE(0, 6)) / 2 ** 48;
}

// ── the window ──────────────────────────────────────────────────────────────────
/** Crossing N's window, [start, end), in ms. */
export function windowOf(crossing) {
  const startMs = CROSSING_EPOCH_UTC + (crossing | 0) * CROSSING_MS;
  return { crossing: crossing | 0, startMs, endMs: startMs + CROSSING_MS };
}

/** A creature's id: `creature:<kind>-<crossing>-<i>`. The colon keeps it out of the
 *  handle namespace (W8). */
export const creatureId = (kind, crossing, i) => `${ID_PREFIX}${kind}-${crossing | 0}-${i}`;
export const isCreatureId = (id) => typeof id === "string" && id.startsWith(ID_PREFIX);

/** Is the dial on for crossing N? It fails closed: only a whole crossing number
 *  (or a string of digits) turns it on; null, absent, false, "", [] and anything
 *  else is off. */
export function creaturesOn(crossing, fromCrossing) {
  const from = Number.isInteger(fromCrossing) ? fromCrossing
    : typeof fromCrossing === "string" && /^\d+$/.test(fromCrossing) ? Number(fromCrossing) : null;
  return from !== null && from >= 0 && (crossing | 0) >= from;
}

// ── the place ───────────────────────────────────────────────────────────────────
/** A point in the band: a side of the clear box weighted by its length, a place
 *  along it, and a depth into the clear ground from the wall's face. */
function bandPoint(m, u1, u2, from, to) {
  const c = m.clear;
  const sides = [
    { len: c.maxX - c.minX, at: (s, d) => ({ x: c.minX + s, y: c.minY + d }) },   // north face, inward is +y
    { len: c.maxX - c.minX, at: (s, d) => ({ x: c.minX + s, y: c.maxY - d }) },   // south
    { len: c.maxY - c.minY, at: (s, d) => ({ x: c.minX + d, y: c.minY + s }) },   // west
    { len: c.maxY - c.minY, at: (s, d) => ({ x: c.maxX - d, y: c.minY + s }) },   // east
  ];
  const total = sides.reduce((a, s) => a + Math.max(0, s.len), 0);
  if (!(total > 0)) return null;
  let u = u1 * total, side = sides[sides.length - 1];
  for (const s of sides) { if (u < s.len) { side = s; break; } u -= s.len; }
  const p = side.at(u, from + (to - from) * u2);
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

/** THE TOWN'S WATER (Darko 2026-10-15 13:17, review of #219 F2): open country is
 *  land. A creature never spawns on the sea or the main channel, for all three
 *  kinds. The water is the town's own marks with these features, by their drawn
 *  polygons (`points:`), read from the same marks as the keep-out. */
export const TOWN_WATERS = Object.freeze(["the-sea", "the-main-channel"]);
const townsOwn = (mk) => mk?.by === TOWN || mk?.household === TOWN || String(mk?.id ?? "").startsWith(`${TOWN}/`);
/** The water rings among `marks`: [[{x, y}…]…], one per town water mark with a drawn polygon. */
export function townWaterRings(marks) {
  return (marks ?? []).filter((mk) => townsOwn(mk) && TOWN_WATERS.includes(mk.feature))
    .map((mk) => polygonOf(mk)).filter(Boolean);
}

/** Does p stand in the band, on the clear box's ground (not a clearing's), off the town's, on land? */
function placeable(m, p, from, to, keep, waters = []) {
  const c = m.clear;
  if (!(p.x >= c.minX && p.x <= c.maxX && p.y >= c.minY && p.y <= c.maxY)) return false;
  const boxWallM = Math.min(p.x - c.minX, c.maxX - p.x, p.y - c.minY, c.maxY - p.y);
  if (boxWallM < from || boxWallM > to) return false;
  const here = mistsHere(p, m);
  if (here.inWall) return false;
  if ((m.clearings ?? []).some((k) => Math.hypot(p.x - k.x, p.y - k.y) <= k.r)) return false;
  if (waters.some((ring) => pointInPolygon(p.x, p.y, ring))) return false;
  return !keptByTheTown(keep, p.x, p.y);
}

const TRIES = 64;

/**
 * Crossing N's schedule, from its secret. Returns { crossing, spawns, unplaced }:
 * spawns are [{ id, kind, index, crossing, at_ms, at, fades_at, x, y }] in time order
 * (ties by id), unplaced [{ id, kind, index }] the spawns no place was found for.
 *
 *   mists        the skeleton's `mists` block at the window's opening sha
 *   marks        the standing marks at that sha (the town's keep-out is read from them)
 *   dials        { counts, rotation?, band_from_m, band_to_m, keep_m, apart_m, span_h }: creatureLaw's
 *   fromCrossing the creature class's launch dial; null is off (W6)
 *
 * Empty when the dial is off for N or the Mists are out of season (mistsAt null).
 */
export function scheduleFor(crossing, secret, { mists, marks = [], dials = null, fromCrossing = null } = {}) {
  const N = crossing | 0;
  const out = { crossing: N, spawns: [], unplaced: [] };
  if (!creaturesOn(N, fromCrossing)) return out;
  const m = mistsAt(N, mists);
  if (!m) return out;
  if (!secret) throw new Error("scheduleFor: no secret for this crossing");
  if (!dials) throw new Error("scheduleFor: no dials (read them with creatureLaw)");
  const { startMs } = windowOf(N);
  const spanMs = Number(dials.span_h) * 3600 * 1000;
  const from = Number(dials.band_from_m), to = Number(dials.band_to_m), apart = Number(dials.apart_m) || 0;
  const keep = mistsKeepRects(marks, mists?.clearings_m ?? [], Number(dials.keep_m));
  const waters = townWaterRings(marks);
  const minutes = CROSSING_MS / 60000;
  // Each spawn's draws are named by its own id (its minute, then two per try), so
  // another kind's count never moves it; only "apart" couples spawns, in a fixed
  // order (kinds by name, then index).
  const placed = [];
  const counts = countsFor(N, dials, fromCrossing);
  for (const kind of Object.keys(counts).sort()) {
    const n = Math.max(0, Math.floor(Number(counts[kind]) || 0));
    for (let i = 1; i <= n; i += 1) {
      const id = creatureId(kind, N, i);
      const minute = Math.floor(draw(secret, `${id}|minute`) * minutes);
      let at = null;
      for (let t = 0; t < TRIES && !at; t += 1) {
        const p = bandPoint(m, draw(secret, `${id}|side|${t}`), draw(secret, `${id}|depth|${t}`), from, to);
        if (p && placeable(m, p, from, to, keep, waters) && placed.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= apart)) at = p;
      }
      if (!at) { out.unplaced.push({ id, kind, index: i }); continue; }
      placed.push(at);
      const atMs = startMs + minute * 60000;
      out.spawns.push({ id, kind, index: i, crossing: N, at_ms: atMs, at: new Date(atMs).toISOString(),
        fades_at: new Date(atMs + spanMs).toISOString(), x: at.x, y: at.y });
    }
  }
  out.spawns.sort((a, b) => a.at_ms - b.at_ms || (a.id < b.id ? -1 : 1));
  return out;
}

/** The spawns due by `nowMs`: what the tick may write. Nothing later is ever told. */
export function dueSpawns(schedule, nowMs) {
  return schedule.spawns.filter((s) => s.at_ms <= nowMs);
}

/**
 * Check a closed window against its log. Exactly one seed and one reveal; the
 * seed's world sha is the one the caller's inputs were read at; the reveal hashes,
 * with that sha, to the seed's commitment; and the spawns logged are exactly the
 * schedule the revealed secret derives, each id once (ids, kinds, scheduled minutes
 * in `payload.at`, places), none written before its minute. Returns
 * { ok, problems: [string] }.
 *   acts    the window's rows (seed, reveal, spawn)
 *   inputs  as scheduleFor's, plus `world_sha`: the sha they were read at
 */
export function auditWindow(crossing, acts, inputs) {
  const N = crossing | 0, problems = [];
  const mine = acts.filter((a) => a.actor === TOWN && Number(a.payload?.crossing) === N);
  const seeds = mine.filter((a) => a.action === "seed"), reveals = mine.filter((a) => a.action === "reveal");
  if (seeds.length === 0) problems.push(`crossing ${N}: no seed act`);
  if (seeds.length > 1) problems.push(`crossing ${N}: ${seeds.length} seed acts (one window, one seed)`);
  if (reveals.length === 0) problems.push(`crossing ${N}: no reveal act`);
  if (reveals.length > 1) problems.push(`crossing ${N}: ${reveals.length} reveal acts (one window, one reveal)`);
  if (problems.length) return { ok: false, problems };
  const seed = seeds[0].payload, secret = reveals[0].payload.secret;
  if (!seed.world_sha) problems.push(`crossing ${N}: the seed names no world sha`);
  else if (seed.world_sha !== inputs?.world_sha)
    problems.push(`crossing ${N}: the seed pins world ${seed.world_sha}, and these inputs were read at ${inputs?.world_sha ?? "no sha"}: read them at the seed's sha`);
  else if (commitmentOf(secret, seed.world_sha) !== seed.commitment)
    problems.push(`crossing ${N}: the revealed secret and the seed's world sha do not hash to the seed's commitment`);
  if (problems.length) return { ok: false, problems };
  const want = scheduleFor(N, secret, inputs).spawns;
  const key = (s) => `${s.id}|${s.kind}|${s.at}|${s.x}|${s.y}`;
  const wantK = new Set(want.map(key));
  const seen = new Map(), matched = new Set();
  for (const a of mine.filter((r) => r.action === "spawn")) {
    seen.set(a.object, (seen.get(a.object) ?? 0) + 1);
    const p = a.payload ?? {}, scheduled = Date.parse(p.at);
    const k = key({ id: a.object, kind: p.kind, at: Number.isFinite(scheduled) ? new Date(scheduled).toISOString() : String(p.at), x: p.x, y: p.y });
    if (wantK.has(k)) matched.add(k);
    else problems.push(`crossing ${N}: the logged spawn ${k} is not the schedule's`);
    if (Number.isFinite(scheduled) && Date.parse(a.at) < scheduled) problems.push(`crossing ${N}: ${a.object} was written at ${a.at}, before its minute ${p.at}`);
  }
  for (const [id, n] of seen) if (n > 1) problems.push(`crossing ${N}: ${id} is spawned ${n} times (each spawn is written once)`);
  for (const s of want) if (!matched.has(key(s))) problems.push(`crossing ${N}: the schedule's spawn ${key(s)} is not in the log`);
  return { ok: problems.length === 0, problems };
}

// ── the fold ────────────────────────────────────────────────────────────────────
const msOf = (v) => (typeof v === "number" ? v : Date.parse(v));

/**
 * The living creatures at `atMs`: the written fold with the span cut. Past
 * `fades_at` a creature has faded, written or not. Returns a Map id → { id, kind,
 * crossing, x, y, spawned_at, fades_at, moods, flags }.
 *
 *   snapshot  a crossing save's creatures.json (or null: start from nothing)
 *   acts      rows { at, actor, action, object, payload }, `at` their write time
 */
export function creaturesAt(snapshot, acts, atMs) {
  const living = creaturesWritten(snapshot, acts, atMs);
  for (const [id, c] of living) if (msOf(c.fades_at) <= atMs) living.delete(id);
  return living;
}

/** The fades due by `nowMs`: creatures past their span whose withdraw is not yet
 *  written. The tick writes each as a `withdraw` by the-town, dated now, with
 *  payload { reason: "faded", fades_at }. */
export function dueFades(snapshot, acts, nowMs) {
  return [...creaturesWritten(snapshot, acts, nowMs).values()]
    .filter((c) => msOf(c.fades_at) <= nowMs)
    .map((c) => ({ id: c.id, reason: "faded", fades_at: c.fades_at }));
}

/** Is this row a withdraw the record honours? By the-town or the creature itself,
 *  for a reason in DESPAWN_REASONS. */
const lawfulWithdraw = (a) => a.action === "withdraw" && isCreatureId(a.object)
  && (a.actor === TOWN || a.actor === a.object) && DESPAWN_REASONS.includes(a.payload?.reason);

/** The written fold: spawned, revised by its own acts, removed only by a lawful
 *  withdraw, over the rows written after the snapshot's instant and by `atMs`. */
export function creaturesWritten(snapshot, acts, atMs) {
  const living = new Map();
  const fromMs = snapshot ? msOf(snapshot.evaluated_at) : -Infinity;
  for (const c of snapshot?.creatures ?? []) living.set(c.id, { ...c, moods: { ...c.moods }, flags: [...(c.flags ?? [])] });
  const rows = acts
    .filter((a) => { const t = msOf(a.at); return t > fromMs && t <= atMs; })
    .map((a, i) => ({ a, i }))
    .sort((p, q) => msOf(p.a.at) - msOf(q.a.at) || p.i - q.i)
    .map((p) => p.a);
  for (const a of rows) {
    if (a.actor === TOWN && a.action === "spawn" && isCreatureId(a.object)) {
      const p = a.payload ?? {};
      living.set(a.object, {
        id: a.object, kind: p.kind, crossing: p.crossing, x: p.x, y: p.y,
        spawned_at: new Date(msOf(p.at ?? a.at)).toISOString(), fades_at: p.fades_at,
        moods: isPlainObject(p.moods) ? { ...p.moods } : {}, flags: Array.isArray(p.flags) ? [...p.flags].sort() : [],
      });
    } else if (lawfulWithdraw(a)) {
      living.delete(a.object);
    } else if (a.action === REACT_ACTION && isCreatureId(a.actor) && living.has(a.actor)) {
      // the reaction row as the office writes it (POS-637 W4): its state after, in the payload
      const c = living.get(a.actor), p = a.payload ?? {};
      // a plain object only: an array would fold as {"0": …}. Flags are kept sorted on
      // the live read as in the photograph, so the two reads never differ by order.
      if (isPlainObject(p.moods_after)) c.moods = { ...p.moods_after };
      if (Array.isArray(p.flags_after)) c.flags = [...p.flags_after].sort();
    }
  }
  return living;
}

/** The crossing save's photograph, STATE/snapshot/<N>/creatures.json (W5): the
 *  WRITTEN fold at the boundary (the previous photograph plus the rows written
 *  since), by id. A creature whose fade is not yet written is still in it, so the
 *  fade is still due after the save. No memory: it lives for a creature's span only
 *  and is never saved. */
export function creaturesSnapshot(crossing, evaluatedAtMs, previous, acts) {
  const creatures = [...creaturesWritten(previous, acts, evaluatedAtMs).values()]
    .map((c) => ({ id: c.id, kind: c.kind, crossing: c.crossing, x: c.x, y: c.y, spawned_at: c.spawned_at, fades_at: c.fades_at,
      moods: Object.fromEntries(Object.keys(c.moods ?? {}).sort().map((k) => [k, c.moods[k]])), flags: [...(c.flags ?? [])].sort() }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    crossing: crossing | 0,
    evaluated_at: new Date(evaluatedAtMs).toISOString(),
    grammar: "creatures: the creatures spawned and not yet withdrawn at evaluated_at, folded from the log (spawn, their own acts, withdraw); one whose fades_at has passed is gone to every read and its fade is still due; a creature's memory is never saved",
    creature_count: creatures.length,
    creatures,
  };
}
