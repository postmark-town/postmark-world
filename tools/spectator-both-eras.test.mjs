// spectator-both-eras.test.mjs — the local spectator reads every walk, both eras (WLD-98).
//
// From Jetto's 3D handoff § C2 (2026-10-21): the local spectator read only
// WORLD/walk-ledger.md, frozen at 2026-08-10T20:25Z, so it missed every walk since
// the seam. It reads movement-records.mjs now (the engine's one movement read):
// the ledger and STATE/log's departures, on /api/walks and on a local
// /api/world2/walks in the office's own shape, which the viewer reads first.
//
// THE CAN-FAIL FLIPS (each reds a case below): read the ledger alone in
// spectatorDepartures; let a synthetic WORLD_DIR read this clone's STATE/log;
// drop the since cut from officeWalks.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { spectatorDepartures, officeWalks } from "./movement-records.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER = "# Walk ledger\n\n- 2026-07-29T22:33:50.375Z · wright · from 575,-2600 · toward -210,-1093 · at 95.8803\n";
const STORE = JSON.stringify({ at: "2026-10-21T00:10:19.731Z", type: "departure", actor: "neth", seq: 21140,
  payload: { from: { x: 1304, y: 2093.5 }, toward: { x: 1329, y: 2083 }, crossing: 262.0143440277778, within: { h: 4, w: 4 }, to: "neth/little-free-library", pace: 60 } });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "spectator-eras-"));
  mkdirSync(join(root, "WORLD"));
  mkdirSync(join(root, "STATE", "log"), { recursive: true });
  writeFileSync(join(root, "WORLD", "walk-ledger.md"), LEDGER);
  writeFileSync(join(root, "STATE", "log", "262.jsonl"), `${STORE}\n{"at":"2026-10-21T00:11:00Z","type":"emission","actor":"neth"}\n`);
  return root;
}

test("both eras, oldest first: the frozen ledger's walk and the store's walk since the seam", () => {
  const root = fixture();
  const { departures } = spectatorDepartures(root);
  assert.deepEqual(departures.map((d) => [d.handle, d.era]), [["wright", "ledger"], ["neth", "store"]]);
  const neth = departures[1];
  assert.deepEqual([neth.from, neth.toward, neth.at, neth.targetMarkId, neth.pace], [{ x: 1304, y: 2093.5 }, { x: 1329, y: 2083 }, 262.0143440277778, "neth/little-free-library", 60]);
  // a new log file is read on the next call (the kept read moves with the record)
  writeFileSync(join(root, "STATE", "log", "263.jsonl"), `${STORE.replace("neth", "kai").replace("2026-10-21T00:10:19.731Z", "2026-10-21T12:00:00.000Z")}\n`);
  assert.deepEqual(spectatorDepartures(root).departures.map((d) => d.handle), ["wright", "neth", "kai"]);
});

test("a synthetic WORLD_DIR is its ledger alone, as before: never this clone's STATE/log", () => {
  const root = fixture();
  const world = join(root, "WORLD");
  assert.deepEqual(spectatorDepartures(root, { worldDir: world }).departures.map((d) => d.handle), ["wright"]);
});

test("the office's own shape, cut at since", () => {
  const { departures } = spectatorDepartures(fixture());
  const all = officeWalks(departures);
  assert.deepEqual(all.walks[1], { iso: "2026-10-21T00:10:19.731Z", handle: "neth", from: { x: 1304, y: 2093.5 }, toward: { x: 1329, y: 2083 },
    at: 262.0143440277778, within: { h: 4, w: 4 }, to: "neth/little-free-library", pace: 60 });
  assert.deepEqual(officeWalks(departures, { since: "2026-10-01T00:00:00.000Z" }).walks.map((w) => w.handle), ["neth"]);
});

const freePort = () => new Promise((resolve) => { const s = createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

test("the server, on this clone's real record: /api/walks and /api/world2/walks both carry walks since the seam", async () => {
  const port = await freePort();
  const child = spawn(process.execPath, [join(ROOT, "spectator", "server.mjs")], { env: { ...process.env, PORT: String(port), WORLD_DIR: "" }, stdio: ["ignore", "pipe", "pipe"] });
  try {
    await new Promise((resolve, reject) => {
      child.stdout.on("data", (d) => { if (String(d).includes("world-spectator")) resolve(); });
      child.on("exit", (c) => reject(new Error(`the server exited (${c})`)));
      setTimeout(() => reject(new Error("the server did not start")), 15000);
    });
    const get = async (path) => { const r = await fetch(`http://localhost:${port}${path}`); return { status: r.status, body: await r.json() }; };
    const seam = "2026-08-10T20:25:00.000Z";
    const walks = await get(`/api/world2/walks?since=${seam}`);
    assert.equal(walks.status, 200);
    assert.ok(walks.body.walks.length > 0, "walks since the seam are on this clone's disk");
    assert.ok(walks.body.walks.every((w) => w.iso >= seam));
    const { departures: ledgerOnly } = spectatorDepartures(ROOT, { worldDir: join(ROOT, "WORLD") });
    const api = await get("/api/walks");
    assert.ok(api.body.departures > ledgerOnly.length, `/api/walks counts both eras (${api.body.departures}), not the ledger's ${ledgerOnly.length}`);
    assert.equal((await get("/api/world2/walks?since=soon")).status, 400);
  } finally {
    child.kill();
  }
});
