import type { DataIndex, MapData, MapId, Marker, Player } from "./types";

const mapCache = new Map<MapId, Promise<MapData>>();

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

export const loadIndex = () => fetchJson<DataIndex>("/data/index.json");

export function loadMap(map: MapId): Promise<MapData> {
  if (!mapCache.has(map)) mapCache.set(map, fetchJson<MapData>(`/data/${map}.json`));
  return mapCache.get(map)!;
}

export function toMarkers(matchId: string, p: Player): Marker[] {
  return p.events.map(([kind, cause, t, x, y]) => ({ kind, cause, t, x, y, bot: p.bot, player: p.id, match: matchId, key: `${matchId}:${p.id}` }));
}

export function describe(m: Marker): string {
  const who = m.bot ? "Bot" : "Player";
  switch (m.kind) {
    case "kill":
      return m.cause === "unknown" ? `${who} got a kill` : `${who} killed a ${m.cause}`;
    case "death":
      return m.cause === "unknown" ? `${who} died` : `${who} killed by a ${m.cause}`;
    case "storm":
      return `${who} died to the storm`;
    case "loot":
      return `${who} looted an item`;
  }
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const fmtDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// Real UTC start; can differ from the match's date folder for matches that ran over midnight
export function fmtStart(unix: number): string {
  const iso = new Date(unix * 1000).toISOString();
  return `${fmtDate(iso.slice(0, 10))} · ${iso.slice(11, 16)}`;
}

// Position at time t, linearly interpolated between the 5s samples; null before the first or after the last sample
export function positionAt(path: number[], t: number): [number, number] | null {
  const n = path.length / 3;
  if (n === 0 || t < path[0] || t > path[(n - 1) * 3]) return null;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path[mid * 3] <= t) lo = mid;
    else hi = mid;
  }
  const t0 = path[lo * 3];
  const t1 = path[hi * 3];
  const f = t1 > t0 ? Math.min(1, (t - t0) / (t1 - t0)) : 0;
  return [path[lo * 3 + 1] + (path[hi * 3 + 1] - path[lo * 3 + 1]) * f, path[lo * 3 + 2] + (path[hi * 3 + 2] - path[lo * 3 + 2]) * f];
}
