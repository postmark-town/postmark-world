// movement-records.mjs — the movement record, both eras, in one place.
//
// The town has recorded movement two ways. `WORLD/walk-ledger.md` is the
// founding era's record and was FROZEN at 2026-08-10T20:25Z with its own seam
// line; `STATE/log/<crossing>.jsonl` is the record after it. Neither is wrong
// and neither is complete: a resident set down ashore at the freeze has that
// record in the store and nowhere else, and a resident who has not moved since
// July has theirs in the ledger and nowhere else. Reading either alone puts real
// residents in places they left.
//
// THIS EXISTS BECAUSE THE JOIN WAS BEING WRITTEN OUT LONGHAND, AGAIN. Position
// already survived one round of this: `where-is.mjs`'s own header names the four
// independent implementations of "where is this resident" whose disagreements
// were every position bug the town had. The era join was on the same road — the
// office has one (`departuresAcrossEras`, with a flag and a disclosure it needs),
// `boarding-flip-disclosure.mjs` had a second, and the position-seed manifest
// would have been the third. Three copies of a merge rule is how the fourth one
// silently disagrees.
//
// Pure-ish: reads the two files it is pointed at, nothing else. No fold, no
// engine, no clock of its own — the caller passes the instant it means.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { parseWalkLedger } from "./walk.mjs";

export const LEDGER_REL = "WORLD/walk-ledger.md";
export const LOG_REL = "STATE/log";

/** The founding era. Absent file = no records, never an error: a fresh clone is not a broken one. */
export function ledgerRecords(root) {
  const path = join(root, LEDGER_REL);
  if (!existsSync(path)) return [];
  const { departures } = parseWalkLedger(readFileSync(path, "utf8"));
  return departures.map((d) => ({ ...d, era: "ledger" }));
}

/**
 * Stage D. The store's journal, one JSON object per line, keeping only what the
 * ledger's grammar also carries — so a record from either era answers to the
 * same arithmetic in walk.mjs.
 *
 * A line that does not parse is SKIPPED rather than fatal, matching the ledger's
 * own `unrecognized` tolerance: a journal is append-only and a half-written last
 * line at a crash is a normal thing to find, not a reason to lose the other 536.
 */
export function storeRecords(root) {
  const dir = join(root, LOG_REL);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const file of readdirSync(dir).filter((n) => n.endsWith(".jsonl")).sort()) {
    for (const raw of readFileSync(join(dir, file), "utf8").split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      if (ev.type !== "departure") continue;
      const p = ev.payload ?? {};
      out.push({
        iso: ev.at, handle: ev.actor, era: "store",
        from: p.from, toward: p.toward, at: p.crossing,
        targetExtent: p.within ?? null, targetMarkId: p.to ?? null, pace: p.pace ?? null,
        source: file,
      });
    }
  }
  return out;
}

/**
 * Both eras, ordered, latest last — the order `currentDeparture` reads.
 *
 * THE TIE RULE, and it is not arbitrary: the ledger cannot gain a line after the
 * freeze, so a store row at the same instant is by construction the later
 * statement. Ties therefore go to the store.
 *
 * `atMs` drops records the caller's instant has not reached yet. A record with
 * no from/toward/crossing is not a movement and is dropped here rather than
 * left to produce NaN coordinates three call-frames away.
 */
export function mergedRecords(root, { atMs = Date.now() } = {}) {
  return [...ledgerRecords(root), ...storeRecords(root)]
    .sort((a, b) => {
      const ta = Date.parse(a.iso), tb = Date.parse(b.iso);
      if (ta !== tb) return ta - tb;
      return a.era === b.era ? 0 : (a.era === "ledger" ? -1 : 1);
    })
    .filter((r) => Date.parse(r.iso) <= atMs && r.from && r.toward && Number.isFinite(r.at));
}

// ── THE SPECTATOR'S ONE MOVEMENT READ (WLD-98) ─────────────────────────────
//
// The local spectator read the frozen ledger alone, so every walk since the seam
// was missing from its walkers and its Lately. It reads THIS module now, both eras,
// the same join the engine's other readers use (3D's reconvergence A1 wants the
// same one read).

/**
 * Both eras as the spectator serves them: `{ departures, unrecognized }`, the
 * ledger's grammar, oldest first. `worldDir` (a perf run's synthetic world) has no
 * store era, so it is its ledger alone, exactly as before. Kept per change of the
 * record (the ledger's size and time, the log's file list), so a polling viewer
 * does not re-read every STATE/log file each time.
 */
const kept = { key: null, value: null };
export function spectatorDepartures(root, { worldDir = null } = {}) {
  const ledgerPath = worldDir ? join(worldDir, "walk-ledger.md") : join(root, LEDGER_REL);
  const logDir = join(root, LOG_REL);
  const ledgerStat = existsSync(ledgerPath) ? statSync(ledgerPath) : null;
  const logs = !worldDir && existsSync(logDir) ? readdirSync(logDir).filter((n) => n.endsWith(".jsonl")) : [];
  const key = JSON.stringify([ledgerPath, ledgerStat?.size ?? null, ledgerStat?.mtimeMs ?? null, logs.length, logs.at(-1) ?? null,
    logs.length ? statSync(join(logDir, [...logs].sort().at(-1))).mtimeMs : null]);
  if (kept.key === key) return kept.value;
  const ledger = ledgerStat ? parseWalkLedger(readFileSync(ledgerPath, "utf8")) : { departures: [], unrecognized: [] };
  const departures = worldDir ? ledger.departures
    : [...ledger.departures.map((d) => ({ ...d, era: "ledger" })), ...storeRecords(root)]
      .sort((a, b) => (Date.parse(a.iso) - Date.parse(b.iso)) || (a.era === b.era ? 0 : a.era === "ledger" ? -1 : 1))
      .filter((r) => r.from && r.toward && Number.isFinite(r.at));
  kept.key = key;
  kept.value = { departures, unrecognized: ledger.unrecognized };
  return kept.value;
}

/**
 * The office's `/world2/walks` shape, so the viewer's office-first loader reads
 * the same record locally: `{ walks: [{ iso, handle, from, toward, at, within, to,
 * pace }] }`, the store's column names (`within`, `to`) for what walk.mjs calls
 * targetExtent and targetMarkId, from `since` on (ISO with a fixed Z offset
 * compares as a string, as the viewer compares it).
 */
export function officeWalks(departures, { since = null } = {}) {
  return {
    walks: departures.filter((d) => !since || String(d.iso) >= since).map((d) => ({
      iso: d.iso, handle: d.handle, from: d.from, toward: d.toward, at: d.at,
      within: d.targetExtent ?? null, to: d.targetMarkId ?? null, pace: d.pace ?? null,
    })),
  };
}
