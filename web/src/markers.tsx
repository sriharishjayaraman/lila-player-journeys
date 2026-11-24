import type { EventKind } from "./types";

// One shape per event kind, in a 14x14 box centred on 0,0; used by both the canvas and the legend
export const MARKERS: Record<EventKind, { label: string; color: string; d: string }> = {
  kill: { label: "Kill", color: "#ff4040", d: "M0,-6 L5.4,4.2 L-5.4,4.2 Z" },
  death: { label: "Death", color: "#f4f4f4", d: "M-4.5,-4.5 L4.5,4.5 M4.5,-4.5 L-4.5,4.5" },
  storm: { label: "Storm death", color: "#c46bff", d: "M0,-6.5 L5,0 L0,6.5 L-5,0 Z" },
  loot: { label: "Loot", color: "#ffd23f", d: "M-3.5,-3.5 H3.5 V3.5 H-3.5 Z" },
};

export const isStroked = (kind: EventKind) => kind === "death";

export function MarkerIcon({ kind }: { kind: EventKind }) {
  const { color, d } = MARKERS[kind];
  return (
    <svg width="14" height="14" viewBox="-7 -7 14 14" className="icon">
      {isStroked(kind) ? <path d={d} stroke={color} strokeWidth="2.2" /> : <path d={d} fill={color} stroke="#000" />}
    </svg>
  );
}
