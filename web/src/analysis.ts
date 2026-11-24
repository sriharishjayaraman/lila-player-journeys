import { fmtTime } from "./data";
import type { HeatLayer, Marker, Player, Track } from "./types";

export const GRID = 32; // cells used for "share of the map" stats
export const AREA_GRID = 16; // cells used for click-for-area stats

type Pt = [number, number];

export function countGrid(points: Pt[], n: number, mapPx: number): Float32Array {
  const g = new Float32Array(n * n);
  const k = n / mapPx;
  for (const [x, y] of points) {
    const gx = Math.floor(x * k);
    const gy = Math.floor(y * k);
    if (gx >= 0 && gy >= 0 && gx < n && gy < n) g[gy * n + gx]++;
  }
  return g;
}

export function pathPoints(tracks: Track[]): Pt[] {
  const pts: Pt[] = [];
  for (const tr of tracks) {
    const p = tr.player.path;
    for (let i = 0; i < p.length; i += 3) pts.push([p[i + 1], p[i + 2]]);
  }
  return pts;
}

// Share of the playable map that holds half of the points
function halfArea(points: Pt[], playable: number, mapPx: number): string {
  const vals = Array.from(countGrid(points, GRID, mapPx)).filter((v) => v > 0).sort((a, b) => b - a);
  const total = vals.reduce((a, b) => a + b, 0);
  let acc = 0;
  let i = 0;
  while (acc < total / 2) acc += vals[i++];
  return pct(i / Math.max(1, playable));
}

const pct = (v: number) => `${v < 0.1 ? (v * 100).toFixed(1) : Math.round(v * 100)}%`;

export interface Ctx {
  tracks: Track[];
  markers: Marker[];
  playable: Uint8Array;
  playableCount: number;
  mapPx: number;
}

export interface Preset {
  id: string;
  question: string;
  heat: HeatLayer;
  kinds: Marker["kind"][];
  takeaway: (c: Ctx) => string;
}

const of = (c: Ctx, kind: Marker["kind"]) => c.markers.filter((m) => m.kind === kind);
const pts = (ms: Marker[]): Pt[] => ms.map((m) => [m.x, m.y]);

export const PRESETS: Preset[] = [
  {
    id: "traffic",
    question: "Where do players go?",
    heat: "traffic",
    kinds: [],
    takeaway: (c) => {
      const p = pathPoints(c.tracks);
      return p.length ? `Half of all movement happens on just ${halfArea(p, c.playableCount, c.mapPx)} of the map.` : "No movement in this selection.";
    },
  },
  {
    id: "fights",
    question: "Where do fights break out?",
    heat: "kill",
    kinds: ["kill"],
    takeaway: (c) => {
      const k = of(c, "kill");
      if (!k.length) return "No kills in this selection.";
      const pvp = k.filter((m) => m.cause === "player").length;
      return `${k.length.toLocaleString()} kills, ${pvp} of them player vs player. Half of them happen on ${halfArea(pts(k), c.playableCount, c.mapPx)} of the map.`;
    },
  },
  {
    id: "deaths",
    question: "Where do players die?",
    heat: "death",
    kinds: ["death"],
    takeaway: (c) => {
      const d = of(c, "death").filter((m) => !m.bot);
      if (!d.length) return "No player deaths in this selection.";
      const byBot = d.filter((m) => m.cause === "bot").length;
      return `${pct(byBot / d.length)} of ${d.length.toLocaleString()} player deaths are to bots. Half happen on ${halfArea(pts(d), c.playableCount, c.mapPx)} of the map.`;
    },
  },
  {
    id: "storm",
    question: "Where does the storm catch players?",
    heat: "storm",
    kinds: ["storm"],
    takeaway: (c) => {
      const s = of(c, "storm");
      if (!s.length) return "Nobody died to the storm in this selection.";
      const ts = s.map((m) => m.t);
      return `${s.length} storm deaths, all between ${fmtTime(Math.min(...ts))} and ${fmtTime(Math.max(...ts))} into the match.`;
    },
  },
  {
    id: "loot",
    question: "Where is the loot?",
    heat: "loot",
    kinds: [],
    takeaway: (c) => {
      const l = of(c, "loot");
      return l.length ? `${l.length.toLocaleString()} pickups. Half come from ${halfArea(pts(l), c.playableCount, c.mapPx)} of the map.` : "No loot pickups in this selection.";
    },
  },
  {
    id: "cold",
    question: "Which areas get ignored?",
    heat: "cold",
    kinds: [],
    takeaway: (c) => {
      const cold = coldCells(c).filter(Boolean).length;
      return `${pct(cold / Math.max(1, c.playableCount))} of the playable map gets under a fifth of average traffic (shown as blue squares).`;
    },
  },
];

// Playable cells that get under 20% of the average traffic per playable cell
export function coldCells(c: Ctx): Uint8Array {
  const g = countGrid(pathPoints(c.tracks), GRID, c.mapPx);
  let total = 0;
  for (let i = 0; i < g.length; i++) if (c.playable[i]) total += g[i];
  const threshold = (0.2 * total) / Math.max(1, c.playableCount);
  return Uint8Array.from(g, (v, i) => (c.playable[i] && v < threshold ? 1 : 0));
}

export interface AreaStats {
  traffic: number;
  kills: number;
  deaths: number;
  storm: number;
  loot: number;
  dangerVsAvg: number | null;
  lootVsAvg: number | null;
  verdict: string;
}

export function areaStats(c: Ctx, cx: number, cy: number): AreaStats {
  const size = c.mapPx / AREA_GRID;
  const inCell = (x: number, y: number) => Math.floor(x / size) === cx && Math.floor(y / size) === cy;
  const all = pathPoints(c.tracks);
  const here = all.filter(([x, y]) => inCell(x, y)).length;
  const count = (kind: Marker["kind"], where: boolean) => c.markers.filter((m) => m.kind === kind && (!where || inCell(m.x, m.y))).length;
  const deaths = count("death", true);
  const loot = count("loot", true);
  // per-visit rates, compared with the same rate over the whole selection
  const ratio = (n: number, total: number) => (here >= 20 && total > 0 ? n / here / (total / all.length) : null);
  const dangerVsAvg = ratio(deaths, count("death", false));
  const lootVsAvg = ratio(loot, count("loot", false));

  let verdict = "About average for this map.";
  if (here < 20) verdict = "Barely visited. Too little traffic to judge.";
  else if ((dangerVsAvg ?? 0) >= 1.5 && (lootVsAvg ?? 1) < 0.8) verdict = "Dangerous and poor in loot. A spot players pay for crossing.";
  else if ((dangerVsAvg ?? 0) >= 1.5) verdict = "A hotspot: players die here far more than average.";
  else if ((dangerVsAvg ?? 1) <= 0.5 && (lootVsAvg ?? 0) >= 1.3) verdict = "Safe and rich: loot here comes with little risk.";
  else if ((lootVsAvg ?? 0) >= 1.3) verdict = "Loot-rich for the traffic it gets.";

  return { traffic: all.length ? here / all.length : 0, kills: count("kill", true), deaths, storm: count("storm", true), loot, dangerVsAvg, lootVsAvg, verdict };
}

export function outcome(p: Player): { label: string; tone: "good" | "bad" | "storm" } {
  const death = p.events.find((e) => e[0] === "death" || e[0] === "storm");
  if (!death) return { label: p.bot ? "Survived" : "Survived / extracted", tone: "good" };
  if (death[0] === "storm") return { label: `Storm at ${fmtTime(death[2])}`, tone: "storm" };
  const by = death[1] === "unknown" ? "" : ` by ${death[1]}`;
  return { label: `Killed${by} at ${fmtTime(death[2])}`, tone: "bad" };
}
