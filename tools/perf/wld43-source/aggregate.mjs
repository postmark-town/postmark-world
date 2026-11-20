// WLD-43: fold the runs into medians with their ranges and denominators.
import fs from "node:fs";
const DIR = "G:/temp/claude/G--Wright-HQ/80359049-1e77-4fcb-92bb-19363501e34d/scratchpad/wld43/results";
const files = fs.readdirSync(DIR).filter((f) => /-r\d+\.json$/.test(f));
const runs = files.map((f) => JSON.parse(fs.readFileSync(`${DIR}/${f}`, "utf8")));
const q = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const med = (a) => q(a, 0.5);
const f0 = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString("en-US") : "–");
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : "–");
const stat = (a, f = f0) => `${f(med(a))} [${f(Math.min(...a))}–${f(Math.max(...a))}]`;

function perRun(o) {
  const ph = o.phases, r = {};
  const inPh = (t, [a, b]) => t >= a && t <= b;
  for (const k of ["load", "rollin", "idle", "pan"]) {
    const lt = o.lt.filter(([s]) => inPh(s, ph[k]));
    const fr = o.frames.filter((t) => inPh(t, ph[k]));
    const d = fr.slice(1).map((t, i) => t - fr[i]);
    const prev = k === "load" ? o.metrics.start : o.metrics[{ rollin: "load", idle: "rollin", pan: "idle" }[k]];
    const busy = (o.metrics[k].TaskDuration - prev.TaskDuration) * 1000;
    const dm = (n) => (o.metrics[k][n] - prev[n]) * 1000;
    r[k] = { cpu: dm("ThreadTime"), script: dm("ScriptDuration"), layout: dm("LayoutDuration"), style: dm("RecalcStyleDuration"), layouts: o.metrics[k].LayoutCount - prev.LayoutCount, styles: o.metrics[k].RecalcStyleCount - prev.RecalcStyleCount, ltN: lt.length, ltMs: lt.reduce((a, [, x]) => a + x, 0), ltMax: lt.reduce((a, [, x]) => Math.max(a, x), 0), frames: d.length, p50: q(d, 0.5), p95: q(d, 0.95), over50: d.filter((x) => x > 50).length, busyMs: busy, spanMs: ph[k][1] - ph[k][0], busyPct: 100 * busy / (ph[k][1] - ph[k][0]) };
  }
  // the bake, per layer: the main band's three layers, and the clearings' two
  const bakes = o.bake ?? [];
  const mainBox = bakes.find((b) => b.layer === 2)?.box;   // only the main band bakes the front layer
  r.bake = {};
  for (const b of bakes) {
    const k = (b.box === mainBox ? "main" : "clearings") + " L" + b.layer;
    const e = (r.bake[k] ??= { cpu: 0, wall: 0, px: 0, n: 0, maxSlice: 0, slices: 0 });
    e.cpu += b.cpuMs; e.wall += (b.tEnd ?? NaN) - b.t0; e.px += b.w * b.h; e.n++; e.maxSlice = Math.max(e.maxSlice, b.maxSliceMs); e.slices += b.slices;
  }
  r.raster = (o.raster ?? []).reduce((a, x) => ({ cpu: a.cpu + x.cpuMs, maxSlice: Math.max(a.maxSlice, x.maxSliceMs), n: a.n + 1 }), { cpu: 0, maxSlice: 0, n: 0 });
  const t0s = [...bakes.map((b) => b.t0), ...(o.raster ?? []).map((x) => x.t0)], tEnds = bakes.map((b) => b.tEnd ?? 0);
  r.bakeWall = t0s.length ? Math.max(...tEnds) - Math.min(...t0s) : NaN;
  r.bakeCpu = bakes.reduce((a, b) => a + b.cpuMs, 0) + r.raster.cpu;
  r.feather = (o.calls?.bakeSheetFeather?.ms ?? 0);
  r.featherMax = (o.calls?.bakeSheetFeather?.max ?? 0);
  r.dataURL = (o.calls?.["canvas.toDataURL (sync PNG encode)"]?.ms ?? 0);
  r.dataURLMax = (o.calls?.["canvas.toDataURL (sync PNG encode)"]?.max ?? 0);
  r.creatures = (o.calls?.mistsCreatures?.ms ?? 0) + (o.calls?.mistsCreatureSVG?.ms ?? 0);
  r.toBlobMs = (o.toBlob ?? []).reduce((a, x) => Math.max(a, x.ms), 0);
  r.bakedPx = bakes.reduce((a, b) => a + b.w * b.h, 0);
  r.heapLoad = o.metrics.load.JSHeapUsedSize / 2 ** 20;
  r.heapPan = o.metrics.pan.JSHeapUsedSize / 2 ** 20;
  r.heapGC = o.metrics.afterGC.JSHeapUsedSize / 2 ** 20;
  r.heapTotal = o.metrics.pan.JSHeapTotalSize / 2 ** 20;
  r.nodes = o.dom.nodes; r.mapNodes = o.dom.mapNodes;
  r.mapAt = o.mapAtMs; r.mistsAt = o.mistsPaintAtMs; r.loadEnd = ph.load[1];
  r.cal = o.calibrationMs; r.moves = o.panMoves; r.vb = o.vb; r.crossing = o.crossing; r.vis = o.vis.join(",");
  r.ltAll = o.lt.length; r.ltAllMs = o.lt.reduce((a, [, x]) => a + x, 0);
  return r;
}

const groups = {};
for (const o of runs) (groups[`${o.case}${o.nogpu ? "-nogpu" : ""} x${o.throttle}`] ??= []).push({ o, r: perRun(o) });
const lines = [];
const P = (s = "") => lines.push(s);
for (const [g, list] of Object.entries(groups).sort()) {
  const R = list.map((x) => x.r), n = R.length;
  const col = (fn, f) => stat(R.map(fn).filter(Number.isFinite), f);
  P(`## ${g}  (n = ${n} runs; crossings ${[...new Set(R.map((r) => r.crossing))].join("/")}; visibility ${[...new Set(R.map((r) => r.vis))].join(" | ")}; calibration loop ${col((r) => r.cal)} ms)`);
  P(`load: map at ${col((r) => r.mapAt)} ms; Mists painted at ${col((r) => r.mistsAt)} ms; settled (2 s quiet) at ${col((r) => r.loadEnd)} ms`);
  for (const k of ["load", "rollin", "idle", "pan"]) {
    P(`  ${k.padEnd(6)} long tasks ${col((r) => r[k].ltN)} (total ${col((r) => r[k].ltMs)} ms, max ${col((r) => r[k].ltMax)} ms); renderer task time ${col((r) => r[k].busyMs)} ms of ${col((r) => r[k].spanMs)} ms = ${col((r) => r[k].busyPct, f1)} %; real main-thread CPU ${col((r) => r[k].cpu)} ms (script ${col((r) => r[k].script)}, layout ${col((r) => r[k].layout)} ms x${col((r) => r[k].layouts)}, style ${col((r) => r[k].style)} ms x${col((r) => r[k].styles)}); frames ${col((r) => r[k].frames)}, p50 ${col((r) => r[k].p50, f1)} ms, p95 ${col((r) => r[k].p95, f1)} ms, >50 ms ${col((r) => r[k].over50)}`);
  }
  if (R.some((r) => Object.keys(r.bake).length)) {
    P(`  bake: wall ${col((r) => r.bakeWall)} ms, CPU ${col((r) => r.bakeCpu)} ms (keep raster ${col((r) => r.raster.cpu)} ms, max slice ${col((r) => r.raster.maxSlice)} ms); baked px ${col((r) => r.bakedPx)}; slowest toBlob ${col((r) => r.toBlobMs)} ms`);
    for (const k of Object.keys(R[0].bake).sort()) P(`    ${k}: CPU ${col((r) => r.bake[k]?.cpu)} ms, wall ${col((r) => r.bake[k]?.wall)} ms, ${col((r) => r.bake[k]?.px)} px in ${col((r) => r.bake[k]?.n)} canvas(es), slices ${col((r) => r.bake[k]?.slices)}, max slice ${col((r) => r.bake[k]?.maxSlice, f1)} ms`);
    P(`  sheet feather: bakeSheetFeather ${col((r) => r.feather)} ms (max one call ${col((r) => r.featherMax)}), sync toDataURL ${col((r) => r.dataURL)} ms (max one ${col((r) => r.dataURLMax)}); creatures ${col((r) => r.creatures, f1)} ms`);
  }
  P(`  heap MiB: after load ${col((r) => r.heapLoad, f1)}, after pan ${col((r) => r.heapPan, f1)}, after GC ${col((r) => r.heapGC, f1)} (total ${col((r) => r.heapTotal, f1)}); DOM nodes ${col((r) => r.nodes)} (map ${col((r) => r.mapNodes)}); pan moves ${col((r) => r.moves)}, camera writes ${col((r) => r.vb)}`);
  P(`  all long tasks over the run: ${col((r) => r.ltAll)} totalling ${col((r) => r.ltAllMs)} ms`);
  P();
}

// profiles: self-time per function, summed then divided by the run count
const profs = fs.readdirSync(DIR).filter((f) => f.endsWith(".cpuprofile"));
const byKind = {};
for (const f of profs) {
  const [, tag, kind] = f.match(/^(.*)-prof\d+\.(\w+)\.cpuprofile$/);
  const p = JSON.parse(fs.readFileSync(`${DIR}/${f}`, "utf8"));
  const self = new Map(), node = new Map(p.nodes.map((n) => [n.id, n]));
  for (let i = 0; i < p.samples.length; i++) { const dt = (p.timeDeltas[i + 1] ?? 0) / 1000; self.set(p.samples[i], (self.get(p.samples[i]) ?? 0) + dt); }
  const agg = ((byKind[`${tag} ${kind}`] ??= { runs: 0, fn: new Map(), total: 0 }));
  agg.runs++;
  for (const [id, ms] of self) {
    const cf = node.get(id).callFrame;
    const file = cf.url ? cf.url.replace(/^.*\/(world-engine|_astro)\//, "$1/") : "";
    const key = `${cf.functionName || "(anonymous)"} ${file}${file ? ":" + (cf.lineNumber + 1) : ""}`;
    agg.fn.set(key, (agg.fn.get(key) ?? 0) + ms);
    if (cf.functionName !== "(idle)") agg.total += ms;
  }
}
P("## CPU profiles: self-time, mean per run (ms), excluding (idle)");
for (const [k, a] of Object.entries(byKind).sort()) {
  P(`### ${k} (n = ${a.runs} runs; non-idle total ${f0(a.total / a.runs)} ms per run)`);
  const byFile = new Map(); for (const [key, ms] of a.fn) { const f = key.split(" ")[1]?.replace(/:\d+$/, "") || key.split(" ")[0]; byFile.set(f, (byFile.get(f) ?? 0) + ms); }
  P("  by file: " + [...byFile].filter(([f]) => f !== "(idle)").sort((x, y) => y[1] - x[1]).slice(0, 8).map(([f, ms]) => f + " " + f0(ms / a.runs)).join(" · "));
  const rows = [...a.fn].filter(([key]) => !key.startsWith("(idle)")).sort((x, y) => y[1] - x[1]).slice(0, 14);
  for (const [key, ms] of rows) P(`  ${f0(ms / a.runs).padStart(7)}  ${key}`);
}
const text = lines.join("\n");
fs.writeFileSync(`${DIR}/../summary.txt`, text);
console.log(text);
