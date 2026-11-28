// walker-roster.mjs — the roster `publicResidents` is asked about (WLD-105 A2).
//
// Its own module with NO imports, so a reader that cannot import the engine's tree can still take it as one file: the 3D
// view's live mode reads the engine from the site over HTTP, and a node server cannot import that. tools/where-is.mjs
// re-exports it, so every existing caller keeps its import.

/**
 * The roster `publicResidents` is asked about: everyone with a walk record, then every parcel's household, empty
 * handles dropped, in that order (duplicates left for `publicResidents` to fold). The local spectator
 * (spectator/server.mjs) built this inline; the 3D view's movement read built its own copy (HANDOFF A2), and a roster
 * with the households' lists added drew 62 residents with no walk and no home at the porch. One function, every caller
 * (WLD-105). `world` is the folded world-state (its `parcels`), or null for a ledger-only answer.
 */
export function walkerRoster(departures, world = null) {
  return [
    ...(departures ?? []).map((d) => d.handle),
    ...((world?.parcels ?? []).map((pc) => pc.household)),
  ].filter(Boolean);
}
