export type MapId = "AmbroseValley" | "GrandRift" | "Lockdown";

export interface MapConfig {
  label: string;
  image: string;
  scale: number; // used to show world coordinates under the cursor
  origin_x: number;
  origin_z: number;
}

export interface MatchSummary {
  id: string;
  map: MapId;
  date: string;
  start: number;
  duration: number;
  humans: number;
  bots: number;
  kill: number;
  death: number;
  storm: number;
  loot: number;
}

export interface DataIndex {
  maps: Record<MapId, MapConfig>;
  mapPx: number;
  dates: string[];
  matches: MatchSummary[];
}

export type EventKind = "kill" | "death" | "storm" | "loot";
// who was on the other side: unknown when a bot logged it, null for storm and loot
export type Cause = "player" | "bot" | "unknown" | null;
export type RawEvent = [EventKind, Cause, number, number, number];

export interface Player {
  id: string;
  bot: boolean;
  path: number[]; // flat [t, x, y, t, x, y, ...] in seconds and 1024px map space
  events: RawEvent[];
}

export type MapData = Record<string, { players: Player[] }>;

export interface Marker {
  kind: EventKind;
  bot: boolean;
  cause: Cause;
  t: number;
  x: number;
  y: number;
  player: string;
  match: string;
  key: string; // match:player, same as Track.key
}

export type HeatLayer = "none" | "traffic" | "cold" | EventKind;

export interface Track {
  key: string; // match:player
  player: Player;
  color: string;
}
