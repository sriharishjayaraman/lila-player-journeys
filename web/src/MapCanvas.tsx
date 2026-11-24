import { useEffect, useMemo, useRef, useState } from "react";
import { describe, fmtTime, positionAt } from "./data";
import { MARKERS, isStroked } from "./markers";
import type { EventKind, Marker, Track } from "./types";

interface Props {
  image: string;
  mapPx: number;
  heat: HTMLCanvasElement | null;
  tracks: Track[];
  markers: Marker[];
  showPaths: boolean;
  time: number | null; // null = whole match, no playback cursor
  dense: boolean;
  focus: string | null; // track key to highlight; others are dimmed
  area: { x: number; y: number; size: number } | null; // selected area, in map px
  onMapClick: (x: number, y: number) => void;
  toWorld: (x: number, y: number) => [number, number];
}

const MAX_ZOOM = 12;
const ACCENT = "#d4ff3a";
const SHAPES = Object.fromEntries(Object.entries(MARKERS).map(([k, m]) => [k, new Path2D(m.d)])) as Record<EventKind, Path2D>;

export default function MapCanvas({ image, mapPx, heat, tracks, markers, showPaths, time, dense, focus, area, onMapClick, toWorld }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 800 });
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [hover, setHover] = useState<{ m: Marker; sx: number; sy: number } | null>(null);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  const cutoff = time ?? Infinity;
  const visible = useMemo(() => markers.filter((m) => m.t <= cutoff), [markers, cutoff]);

  useEffect(() => {
    const el = new Image();
    el.onload = () => setImg(el);
    el.src = image;
    setView({ zoom: 1, x: 0, y: 0 });
  }, [image]);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(wrapRef.current!);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    canvasRef.current!.width = size.w * dpr;
    canvasRef.current!.height = size.h * dpr;
  }, [size]);

  // map px -> screen px: screen = map * k + off
  const base = (Math.min(size.w, size.h) * 0.94) / mapPx;
  const k = base * view.zoom;
  const centerX = (size.w - mapPx * base) / 2;
  const centerY = (size.h - mapPx * base) / 2;
  const offX = centerX + view.x;
  const offY = centerY + view.y;

  useEffect(() => {
    const ctx = canvasRef.current!.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.translate(offX, offY);
    ctx.scale(k, k);
    if (img) ctx.drawImage(img, 0, 0, mapPx, mapPx);
    if (heat) {
      ctx.globalAlpha = 0.85;
      ctx.drawImage(heat, 0, 0, mapPx, mapPx);
      ctx.globalAlpha = 1;
    }
    const dim = (key: string) => focus !== null && key !== focus;

    if (showPaths) {
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for (const tr of tracks) {
        const p = tr.player.path;
        if (p.length < 3 || p[0] > cutoff) continue;
        ctx.strokeStyle = tr.color;
        ctx.globalAlpha = dim(tr.key) ? 0.22 : dense ? (tr.player.bot ? 0.25 : 0.35) : 0.9;
        ctx.lineWidth = (dense ? 1 : tr.player.bot ? 1.5 : tr.key === focus ? 3 : 2.2) / k;
        ctx.setLineDash(tr.player.bot && !dense ? [4 / k, 3 / k] : []);
        ctx.beginPath();
        ctx.moveTo(p[1], p[2]);
        let i = 3;
        for (; i < p.length && p[i] <= cutoff; i += 3) ctx.lineTo(p[i + 1], p[i + 2]);
        const head = i < p.length ? positionAt(p, cutoff) : null;
        if (head) ctx.lineTo(head[0], head[1]);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    const s = (dense ? 0.6 : 0.85) / k;
    for (const m of visible) {
      ctx.globalAlpha = dim(m.key) ? 0.2 : 1;
      drawMarker(ctx, m, s);
    }
    ctx.globalAlpha = 1;

    if (time !== null || !dense) {
      for (const tr of tracks) {
        const pos = positionAt(tr.player.path, cutoff);
        if (!pos) continue;
        ctx.globalAlpha = dim(tr.key) ? 0.25 : 1;
        ctx.beginPath();
        ctx.arc(pos[0], pos[1], (tr.player.bot ? 4 : 6) / k, 0, Math.PI * 2);
        ctx.fillStyle = tr.color;
        ctx.fill();
        ctx.lineWidth = 1.5 / k;
        ctx.strokeStyle = "#000";
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    if (area) {
      ctx.lineWidth = 2 / k;
      ctx.strokeStyle = ACCENT;
      ctx.setLineDash([6 / k, 4 / k]);
      ctx.strokeRect(area.x, area.y, area.size, area.size);
      ctx.setLineDash([]);
    }
  }, [img, heat, tracks, visible, showPaths, time, cutoff, dense, focus, area, size, k, offX, offY, mapPx]);

  const toLocal = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const onWheel = (e: React.WheelEvent) => {
    const [sx, sy] = toLocal(e);
    const zoom = Math.min(MAX_ZOOM, Math.max(1, view.zoom * Math.exp(-e.deltaY * 0.0015)));
    // keep the map point under the cursor fixed
    const mx = (sx - offX) / k;
    const my = (sy - offY) / k;
    setView({ zoom, x: sx - centerX - mx * base * zoom, y: sy - centerY - my * base * zoom });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const d = drag.current;
    if (d) {
      if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true;
      if (d.moved) setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }));
      return;
    }
    const [sx, sy] = toLocal(e);
    const mx = (sx - offX) / k;
    const my = (sy - offY) / k;
    setCursor(mx >= 0 && my >= 0 && mx < mapPx && my < mapPx ? [mx, my] : null);
    let best: Marker | null = null;
    let bestD = 100; // 10px, squared
    for (const m of visible) {
      const dx = m.x * k + offX - sx;
      const dy = m.y * k + offY - sy;
      if (dx * dx + dy * dy < bestD) {
        bestD = dx * dx + dy * dy;
        best = m;
      }
    }
    if (best !== hover?.m) setHover(best ? { m: best, sx, sy } : null);
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (drag.current && !drag.current.moved) {
      const [sx, sy] = toLocal(e);
      const mx = (sx - offX) / k;
      const my = (sy - offY) / k;
      if (mx >= 0 && my >= 0 && mx < mapPx && my < mapPx) onMapClick(mx, my);
    }
    drag.current = null;
  };

  return (
    <div className="map-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h }}
        onWheel={onWheel}
        onMouseDown={(e) => (drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false })}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          drag.current = null;
          setHover(null);
          setCursor(null);
        }}
        onMouseMove={onMouseMove}
      />
      {hover && (
        <div className="tooltip" style={{ left: hover.sx + 14, top: hover.sy + 14 }}>
          <strong>{describe(hover.m)}</strong>
          <span>at {fmtTime(hover.m.t)} into the match</span>
          <span className="mono">
            {hover.m.bot ? `bot ${hover.m.player}` : hover.m.player.slice(0, 8)} · match {hover.m.match.slice(0, 8)}
          </span>
        </div>
      )}
      <div className="readout mono">
        {cursor ? (() => {
          const [wx, wz] = toWorld(cursor[0], cursor[1]);
          return `X ${wx.toFixed(1)}   Z ${wz.toFixed(1)}`;
        })() : "hover the map for world coordinates"}
        <span>{Math.round(view.zoom * 100)}%</span>
      </div>
      <div className="zoom-ctl">
        <button onClick={() => setView((v) => ({ ...v, zoom: Math.min(MAX_ZOOM, v.zoom * 1.5) }))} title="Zoom in">+</button>
        <button onClick={() => setView((v) => ({ ...v, zoom: Math.max(1, v.zoom / 1.5) }))} title="Zoom out">−</button>
        <button onClick={() => setView({ zoom: 1, x: 0, y: 0 })} title="Reset view">⟲</button>
      </div>
    </div>
  );
}

// Filled = logged by a human; hollow/grey = logged by a bot, so a human's own actions stand out
function drawMarker(ctx: CanvasRenderingContext2D, m: Marker, s: number) {
  const { color } = MARKERS[m.kind];
  const shape = SHAPES[m.kind];
  const scale = m.kind === "loot" ? s * 0.8 : s;
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.scale(scale, scale);
  if (isStroked(m.kind)) {
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#000";
    ctx.stroke(shape);
    ctx.lineWidth = 2;
    ctx.strokeStyle = m.bot ? "#9aa0a6" : color;
    ctx.stroke(shape);
  } else {
    ctx.lineWidth = 1.2;
    ctx.fillStyle = m.bot ? "rgba(0,0,0,0.55)" : color;
    ctx.strokeStyle = m.bot ? color : "#000";
    ctx.fill(shape);
    ctx.stroke(shape);
  }
  ctx.restore();
}
