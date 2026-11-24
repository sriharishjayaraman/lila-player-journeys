import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { AREA_GRID, GRID, PRESETS, areaStats, coldCells, countGrid, outcome, pathPoints, type Ctx } from "./analysis";
import { describe, fmtDate, fmtStart, fmtTime, loadIndex, loadMap, toMarkers } from "./data";
import { HEAT_GRADIENT, renderCells, renderHeatmap } from "./heatmap";
import MapCanvas from "./MapCanvas";
import { MARKERS, MarkerIcon } from "./markers";
import type { DataIndex, EventKind, HeatLayer, MapData, MapId, Marker, MatchSummary, Track } from "./types";

const HUMAN_COLORS = ["#d4ff3a", "#5ad8ff", "#ff5ad1", "#ffe14d", "#a98bff", "#4dffc3"];
const BOT_COLOR = "#ff6b2c";
const COLD_COLOR = "rgba(90, 150, 255, 0.5)";
const KINDS: EventKind[] = ["kill", "death", "storm", "loot"];
const HEAT_LAYERS: Array<{ id: HeatLayer; label: string }> = [
  { id: "none", label: "Off" },
  { id: "traffic", label: "Traffic" },
  { id: "kill", label: "Kills" },
  { id: "death", label: "Deaths" },
  { id: "storm", label: "Storm" },
  { id: "loot", label: "Loot" },
  { id: "cold", label: "Ignored" },
];
const SPEEDS = [1, 5, 10, 30];
type Sort = "time" | "combat" | "players" | "duration";
const SORTS: Record<Sort, (a: MatchSummary, b: MatchSummary) => number> = {
  time: (a, b) => a.start - b.start,
  combat: (a, b) => b.kill + b.death - (a.kill + a.death),
  players: (a, b) => b.humans + b.bots - (a.humans + a.bots),
  duration: (a, b) => b.duration - a.duration,
};

function toggle<T>(set: Set<T>, v: T): Set<T> {
  const n = new Set(set);
  if (n.has(v)) n.delete(v);
  else n.add(v);
  return n;
}

export default function App() {
  const [index, setIndex] = useState<DataIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [map, setMap] = useState<MapId>("AmbroseValley");
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [dates, setDates] = useState<Set<string>>(new Set());
  const [matchId, setMatchId] = useState<string | null>(null);
  const [onlyMulti, setOnlyMulti] = useState(false);
  const [sort, setSort] = useState<Sort>("time");
  const [showHumans, setShowHumans] = useState(true);
  const [showBots, setShowBots] = useState(true);
  const [showPaths, setShowPaths] = useState(false);
  const [kinds, setKinds] = useState<Set<EventKind>>(new Set());
  const [heatLayer, setHeatLayer] = useState<HeatLayer>("traffic");
  const [presetId, setPresetId] = useState<string | null>("traffic");
  const [time, setTime] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);
  const [focus, setFocus] = useState<string | null>(null);
  const [area, setArea] = useState<{ cx: number; cy: number } | null>(null);

  useEffect(() => {
    loadIndex()
      .then((ix) => {
        setIndex(ix);
        setDates(new Set(ix.dates));
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    setMapData(null);
    setMatchId(null);
    setArea(null);
    loadMap(map).then(setMapData).catch((e) => setError(String(e)));
  }, [map]);

  const filtered = useMemo(() => {
    if (!index) return [];
    return index.matches.filter((m) => m.map === map && dates.has(m.date) && (!onlyMulti || m.humans + m.bots > 1)).sort(SORTS[sort]);
  }, [index, map, dates, onlyMulti, sort]);

  const selected = filtered.find((m) => m.id === matchId) ?? null;
  const scope = useMemo(() => (selected ? [selected] : filtered), [selected, filtered]);
  const maxTime = useMemo(() => Math.max(1, ...scope.map((m) => m.duration)), [scope]);
  const dense = !selected;

  useEffect(() => {
    setTime(null);
    setPlaying(false);
    setFocus(null);
  }, [matchId, map]);

  const applyPreset = useCallback((id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    setPresetId(id);
    setHeatLayer(p.heat);
    setKinds(new Set(p.kinds));
    setShowPaths(false);
  }, []);

  const selectMatch = useCallback(
    (id: string | null) => {
      setMatchId(id);
      if (id) {
        setShowPaths(true);
        setKinds(new Set(["kill", "death", "storm"]));
        setHeatLayer("none");
        setPresetId(null);
      } else applyPreset("traffic");
    },
    [applyPreset],
  );

  const custom = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPresetId(null);
  };

  const { tracks, markers } = useMemo(() => {
    const tracks: Track[] = [];
    const markers: Marker[] = [];
    if (!mapData) return { tracks, markers };
    for (const s of scope) {
      let h = 0;
      for (const p of mapData[s.id]?.players ?? []) {
        if (p.bot ? !showBots : !showHumans) continue;
        tracks.push({ key: `${s.id}:${p.id}`, player: p, color: p.bot ? BOT_COLOR : HUMAN_COLORS[dense ? 0 : h++ % HUMAN_COLORS.length] });
        markers.push(...toMarkers(s.id, p));
      }
    }
    return { tracks, markers };
  }, [mapData, scope, showHumans, showBots, dense]);

  // Every cell anyone ever walked on this map, regardless of filters
  const playable = useMemo(() => {
    if (!mapData || !index) return new Uint8Array(GRID * GRID);
    const all = Object.values(mapData).flatMap((m) => m.players.map((p) => ({ key: "", player: p, color: "" })));
    return Uint8Array.from(countGrid(pathPoints(all), GRID, index.mapPx), (v) => (v > 0 ? 1 : 0));
  }, [mapData, index]);

  const ctx: Ctx | null = useMemo(
    () => (index ? { tracks, markers, playable, playableCount: playable.reduce((a, b) => a + b, 0), mapPx: index.mapPx } : null),
    [tracks, markers, playable, index],
  );

  const shownMarkers = useMemo(
    () => markers.filter((m) => kinds.has(m.kind)).sort((a, b) => Number(a.kind !== "loot") - Number(b.kind !== "loot")),
    [markers, kinds],
  );

  const counts = useMemo(() => {
    const c: Record<EventKind, number> = { kill: 0, death: 0, storm: 0, loot: 0 };
    for (const m of markers) c[m.kind]++;
    return c;
  }, [markers]);

  const heat = useMemo(() => {
    if (heatLayer === "none" || !ctx) return null;
    if (heatLayer === "cold") return renderCells(coldCells(ctx), GRID, ctx.mapPx, COLD_COLOR);
    const pts = heatLayer === "traffic" ? pathPoints(tracks) : markers.filter((m) => m.kind === heatLayer).map((m): [number, number] => [m.x, m.y]);
    return renderHeatmap(pts, ctx.mapPx, heatLayer === "traffic" ? 2 : 4);
  }, [heatLayer, ctx, tracks, markers]);

  const preset = PRESETS.find((p) => p.id === presetId);
  const takeaway = useMemo(() => (preset && ctx ? preset.takeaway(ctx) : null), [preset, ctx]);
  const stats = useMemo(() => (area && ctx ? areaStats(ctx, area.cx, area.cy) : null), [area, ctx]);

  const combat = useMemo(() => markers.filter((m) => m.kind !== "loot").sort((a, b) => a.t - b.t), [markers]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = ((now - last) / 1000) * speed;
      last = now;
      setTime((t) => Math.min(maxTime, (t ?? 0) + dt));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, maxTime]);

  useEffect(() => {
    if (playing && time !== null && time >= maxTime) {
      setPlaying(false);
      setTime(null);
    }
  }, [playing, time, maxTime]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !["INPUT", "SELECT"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (error) return <div className="splash">Could not load data: {error}</div>;
  if (!index || !ctx) return <div className="splash">Loading telemetry…</div>;

  const cfg = index.maps[map];
  const toWorld = (x: number, y: number): [number, number] => [(x / index.mapPx) * cfg.scale + cfg.origin_x, (1 - y / index.mapPx) * cfg.scale + cfg.origin_z];
  const areaSize = index.mapPx / AREA_GRID;
  const shownTime = time ?? maxTime;
  const cutoff = time ?? Infinity;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="brand-mark">LILA BLACK</span>
          <span className="brand-sub">Field Intel</span>
        </div>
        <nav className="maps">
          {(Object.keys(index.maps) as MapId[]).map((m) => (
            <button key={m} className={m === map ? "on" : ""} onClick={() => setMap(m)}>
              {index.maps[m].label}
            </button>
          ))}
        </nav>
        <div className="dates">
          {index.dates.map((d) => (
            <button key={d} className={dates.has(d) ? "chip on" : "chip"} onClick={() => setDates(toggle(dates, d))}>
              {fmtDate(d)}
            </button>
          ))}
          <button className="chip ghost" onClick={() => setDates(new Set(index.dates))}>
            All
          </button>
        </div>
      </header>

      <aside className="left">
        <section>
          <h2>Ask the map</h2>
          <div className="questions">
            {PRESETS.map((p, i) => (
              <button key={p.id} className={p.id === presetId ? "q on" : "q"} onClick={() => applyPreset(p.id)}>
                <span className="q-num mono">{String(i + 1).padStart(2, "0")}</span>
                {p.question}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2>Layers</h2>
          <div className="toggles">
            <label>
              <input type="checkbox" checked={showHumans} onChange={(e) => setShowHumans(e.target.checked)} />
              <span className="swatch" style={{ background: HUMAN_COLORS[0] }} /> Humans
            </label>
            <label>
              <input type="checkbox" checked={showBots} onChange={(e) => setShowBots(e.target.checked)} />
              <span className="swatch dashed" style={{ borderColor: BOT_COLOR }} /> Bots
            </label>
            <label>
              <input type="checkbox" checked={showPaths} onChange={(e) => custom(setShowPaths)(e.target.checked)} /> Movement paths
            </label>
            {KINDS.map((t) => (
              <label key={t}>
                <input type="checkbox" checked={kinds.has(t)} onChange={() => custom(setKinds)(toggle(kinds, t))} />
                <MarkerIcon kind={t} /> {MARKERS[t].label}
                <span className="count mono">{counts[t].toLocaleString()}</span>
              </label>
            ))}
          </div>
          <h3>Heatmap</h3>
          <div className="seg">
            {HEAT_LAYERS.map((h) => (
              <button key={h.id} className={h.id === heatLayer ? "on" : ""} onClick={() => custom(setHeatLayer)(h.id)}>
                {h.label}
              </button>
            ))}
          </div>
        </section>

        <section className="matches">
          <h2>
            Matches <span className="mono dim">{filtered.length}</span>
          </h2>
          <div className="match-tools">
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="time">Start time</option>
              <option value="combat">Most combat</option>
              <option value="players">Most players</option>
              <option value="duration">Longest</option>
            </select>
            <label title="Only matches where more than one player or bot was tracked">
              <input type="checkbox" checked={onlyMulti} onChange={(e) => setOnlyMulti(e.target.checked)} /> Multi-player
            </label>
          </div>
          <MatchList matches={filtered} selectedId={matchId} onSelect={selectMatch} />
        </section>
      </aside>

      <main className="stage">
        <div className="frame">
          <MapCanvas
            image={cfg.image}
            mapPx={index.mapPx}
            heat={heat}
            tracks={tracks}
            markers={shownMarkers}
            showPaths={showPaths}
            time={time}
            dense={dense}
            focus={focus}
            area={area && { x: area.cx * areaSize, y: area.cy * areaSize, size: areaSize }}
            onMapClick={(x, y) => {
              const cx = Math.floor(x / areaSize);
              const cy = Math.floor(y / areaSize);
              setArea((a) => (a && a.cx === cx && a.cy === cy ? null : { cx, cy }));
            }}
            toWorld={toWorld}
          />
          <div className="brief">
            <span className="eyebrow">{selected ? `Match replay · ${fmtStart(selected.start)} UTC` : `${cfg.label} · ${filtered.length} matches`}</span>
            <strong>{preset ? preset.question : selected ? "What happened in this match?" : "Custom view"}</strong>
            {takeaway && <p>{takeaway}</p>}
            {heatLayer !== "none" && heatLayer !== "cold" && (
              <div className="ramp">
                <span>low</span>
                <i style={{ background: HEAT_GRADIENT }} />
                <span>high</span>
              </div>
            )}
          </div>
          <span className="tick tl" />
          <span className="tick tr" />
          <span className="tick bl" />
          <span className="tick br" />
        </div>

        <div className="timeline">
          <button className="play" onClick={() => setPlaying(!playing)} title="Play / pause (space)">
            {playing ? "❚❚" : "▶"}
          </button>
          <span className="mono clock">{fmtTime(shownTime)}</span>
          <div className="track">
            {selected && (
              <div className="ticks">
                {combat.map((m, i) => (
                  <button
                    key={i}
                    className={`tk ${m.kind}`}
                    style={{ left: `${(m.t / maxTime) * 100}%` }}
                    title={`${fmtTime(m.t)} ${describe(m)}`}
                    onClick={() => {
                      setPlaying(false);
                      setTime(Math.max(0, m.t - 3));
                    }}
                  />
                ))}
              </div>
            )}
            <input
              type="range"
              min={0}
              max={maxTime}
              step={1}
              value={shownTime}
              onChange={(e) => {
                const v = Number(e.target.value);
                setTime(v >= maxTime ? null : v);
              }}
            />
          </div>
          <span className="mono dim">{fmtTime(maxTime)}</span>
          <div className="speeds">
            {SPEEDS.map((s) => (
              <button key={s} className={s === speed ? "on" : ""} onClick={() => setSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
        </div>
      </main>

      <aside className="right">
        {stats && area && (
          <section className="card">
            <div className="card-head">
              <h2>Area {String.fromCharCode(65 + area.cx)}{area.cy + 1}</h2>
              <button className="x" onClick={() => setArea(null)} title="Close">×</button>
            </div>
            <p className="verdict">{stats.verdict}</p>
            <dl className="kv">
              <dt>Share of movement</dt>
              <dd className="mono">{(stats.traffic * 100).toFixed(1)}%</dd>
              <dt>Kills</dt>
              <dd className="mono">{stats.kills}</dd>
              <dt>Deaths</dt>
              <dd className="mono">
                {stats.deaths}
                {stats.dangerVsAvg !== null && <em> · {stats.dangerVsAvg.toFixed(1)}× avg risk</em>}
              </dd>
              <dt>Storm deaths</dt>
              <dd className="mono">{stats.storm}</dd>
              <dt>Loot</dt>
              <dd className="mono">
                {stats.loot}
                {stats.lootVsAvg !== null && <em> · {stats.lootVsAvg.toFixed(1)}× avg yield</em>}
              </dd>
            </dl>
            <p className="note">Risk and yield are per visit, compared with the whole selection.</p>
          </section>
        )}

        {selected ? (
          <>
            <section className="card">
              <h2>Players</h2>
              <p className="note">Click a player to focus their path.</p>
              <div className="players">
                {tracks.map((tr) => {
                  const o = outcome(tr.player);
                  const k = tr.player.events.filter((e) => e[0] === "kill").length;
                  const l = tr.player.events.filter((e) => e[0] === "loot").length;
                  return (
                    <button key={tr.key} className={`player ${focus === tr.key ? "on" : ""}`} onClick={() => setFocus(focus === tr.key ? null : tr.key)}>
                      <span className={tr.player.bot ? "dot dashed" : "dot"} style={{ background: tr.player.bot ? "transparent" : tr.color, borderColor: tr.color }} />
                      <span className="who">
                        {tr.player.bot ? `Bot ${tr.player.id}` : `Player ${tr.player.id.slice(0, 6)}`}
                        <small className={o.tone}>{o.label}</small>
                      </span>
                      <span className="mono dim">
                        {k}K {l}L
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
            <section className="card">
              <h2>Event feed</h2>
              <ol className="feed">
                {combat
                  .filter((m) => m.t <= cutoff)
                  .slice(-8)
                  .reverse()
                  .map((m, i) => (
                    <li key={i}>
                      <span className="mono dim">{fmtTime(m.t)}</span>
                      <MarkerIcon kind={m.kind} />
                      {describe(m)}
                    </li>
                  ))}
                {combat.filter((m) => m.t <= cutoff).length === 0 && <li className="dim">Nothing yet. Press play.</li>}
              </ol>
            </section>
          </>
        ) : (
          !stats && (
            <section className="card intro">
              <h2>How to read this</h2>
              <ul>
                <li>Pick a question on the left. The map and the summary update for the dates you have selected.</li>
                <li>Click anywhere on the map to see how risky and rewarding that area is.</li>
                <li>Pick a match to replay it. Kill and death ticks on the timeline jump straight to the fights.</li>
              </ul>
              <dl className="kv">
                <dt>Matches</dt>
                <dd className="mono">{filtered.length}</dd>
                <dt>Kills</dt>
                <dd className="mono">{counts.kill.toLocaleString()}</dd>
                <dt>Deaths</dt>
                <dd className="mono">{counts.death.toLocaleString()}</dd>
                <dt>Storm deaths</dt>
                <dd className="mono">{counts.storm}</dd>
                <dt>Loot pickups</dt>
                <dd className="mono">{counts.loot.toLocaleString()}</dd>
              </dl>
            </section>
          )
        )}
      </aside>
    </div>
  );
}

// Memoised so the list does not re-render on every playback frame
const MatchList = memo(function MatchList({ matches, selectedId, onSelect }: { matches: MatchSummary[]; selectedId: string | null; onSelect: (id: string | null) => void }) {
  return (
    <>
      <button className={`match all ${selectedId === null ? "on" : ""}`} onClick={() => onSelect(null)}>
        All {matches.length} matches combined
      </button>
      <div className="match-list">
        {matches.map((m) => (
          <button key={m.id} className={`match ${m.id === selectedId ? "on" : ""}`} onClick={() => onSelect(m.id)}>
            <div className="row">
              <span>{fmtStart(m.start)}</span>
              <span className="mono dim">{fmtTime(m.duration)}</span>
            </div>
            <div className="row small">
              <span>
                {m.humans}H{m.bots > 0 && ` · ${m.bots}B`}
              </span>
              <span className="dim">
                {m.kill}K · {m.death}D{m.storm > 0 && ` · ${m.storm} storm`}
              </span>
            </div>
          </button>
        ))}
      </div>
    </>
  );
});
