import { memo, useEffect, useMemo, useState } from "react";
import { fmtClock, fmtDate, fmtTime, loadIndex, loadMap, toMarkers } from "./data";
import { HEAT_GRADIENT, renderHeatmap } from "./heatmap";
import MapCanvas, { type Track } from "./MapCanvas";
import { MARKERS, MarkerIcon } from "./markers";
import type { DataIndex, EventKind, HeatLayer, MapData, MapId, Marker, MatchSummary } from "./types";

const HUMAN_COLORS = ["#35e0ff", "#7dff6a", "#ff5ad1", "#ffe14d", "#9d8bff", "#4dffc3"];
const BOT_COLOR = "#ff7a45";
const KINDS: EventKind[] = ["kill", "death", "storm", "loot"];
const HEAT_LAYERS: Array<{ id: HeatLayer; label: string }> = [
  { id: "none", label: "Off" },
  { id: "traffic", label: "Traffic" },
  { id: "kill", label: "Kills" },
  { id: "death", label: "Deaths" },
  { id: "storm", label: "Storm deaths" },
  { id: "loot", label: "Loot" },
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
  const [showPaths, setShowPaths] = useState(true);
  const [kinds, setKinds] = useState<Set<EventKind>>(new Set(["kill", "death", "storm"]));
  const [heatLayer, setHeatLayer] = useState<HeatLayer>("none");
  const [time, setTime] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);

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
  }, [matchId, map]);

  const { tracks, markers } = useMemo(() => {
    const tracks: Track[] = [];
    const markers: Marker[] = [];
    if (!mapData) return { tracks, markers };
    for (const s of scope) {
      let h = 0;
      for (const p of mapData[s.id]?.players ?? []) {
        if (p.bot ? !showBots : !showHumans) continue;
        tracks.push({ player: p, color: p.bot ? BOT_COLOR : HUMAN_COLORS[dense ? 0 : h++ % HUMAN_COLORS.length] });
        markers.push(...toMarkers(s.id, p));
      }
    }
    return { tracks, markers };
  }, [mapData, scope, showHumans, showBots, dense]);

  // loot first so combat markers are drawn on top
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
    if (heatLayer === "none" || !index) return null;
    const pts: Array<[number, number]> = [];
    if (heatLayer === "traffic") {
      for (const tr of tracks) {
        const p = tr.player.path;
        for (let i = 0; i < p.length; i += 3) pts.push([p[i + 1], p[i + 2]]);
      }
    } else {
      for (const m of markers) if (m.kind === heatLayer) pts.push([m.x, m.y]);
    }
    return renderHeatmap(pts, index.mapPx, heatLayer === "traffic" ? 2 : 4);
  }, [heatLayer, tracks, markers, index]);

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
      if (e.code === "Space" && (e.target as HTMLElement).tagName !== "INPUT") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (error) return <div className="splash">Could not load data: {error}</div>;
  if (!index) return <div className="splash">Loading telemetry…</div>;

  const shownTime = time ?? maxTime;

  return (
    <div className="app">
      <aside className="sidebar">
        <header>
          <h1>LILA BLACK</h1>
          <p>Player journey explorer</p>
        </header>

        <section>
          <h2>Map</h2>
          <div className="seg">
            {(Object.keys(index.maps) as MapId[]).map((m) => (
              <button key={m} className={m === map ? "on" : ""} onClick={() => setMap(m)}>
                {index.maps[m].label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2>
            Dates <span className="hint">(UTC)</span>
          </h2>
          <div className="chips">
            {index.dates.map((d) => (
              <button key={d} className={dates.has(d) ? "chip on" : "chip"} onClick={() => setDates(toggle(dates, d))}>
                {fmtDate(d)}
              </button>
            ))}
            <button className="chip link" onClick={() => setDates(new Set(index.dates))}>
              all
            </button>
          </div>
        </section>

        <section>
          <h2>Show</h2>
          <div className="toggles">
            <label>
              <input type="checkbox" checked={showHumans} onChange={(e) => setShowHumans(e.target.checked)} />
              <span className="swatch line" style={{ background: HUMAN_COLORS[0] }} /> Humans
            </label>
            <label>
              <input type="checkbox" checked={showBots} onChange={(e) => setShowBots(e.target.checked)} />
              <span className="swatch line dashed" style={{ borderColor: BOT_COLOR }} /> Bots
            </label>
            <label>
              <input type="checkbox" checked={showPaths} onChange={(e) => setShowPaths(e.target.checked)} /> Movement paths
            </label>
          </div>
          <div className="toggles markers">
            {KINDS.map((t) => (
              <label key={t}>
                <input type="checkbox" checked={kinds.has(t)} onChange={() => setKinds(toggle(kinds, t))} />
                <MarkerIcon kind={t} /> {MARKERS[t].label}
                <span className="count">{counts[t].toLocaleString()}</span>
              </label>
            ))}
            <p className="hint">Filled = logged by a human, hollow/grey = logged by a bot.</p>
          </div>
        </section>

        <section>
          <h2>Heatmap</h2>
          <div className="seg wrap">
            {HEAT_LAYERS.map((h) => (
              <button key={h.id} className={h.id === heatLayer ? "on" : ""} onClick={() => setHeatLayer(h.id)}>
                {h.label}
              </button>
            ))}
          </div>
          {heatLayer !== "none" && (
            <div className="heat-legend">
              <span>low</span>
              <div style={{ background: HEAT_GRADIENT }} />
              <span>high</span>
            </div>
          )}
        </section>

        <section className="matches">
          <h2>
            Matches <span className="hint">{filtered.length}</span>
          </h2>
          <div className="match-tools">
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="time">Sort: start time</option>
              <option value="combat">Sort: most combat</option>
              <option value="players">Sort: most players</option>
              <option value="duration">Sort: longest</option>
            </select>
            <label title="Only matches where more than one player or bot was tracked">
              <input type="checkbox" checked={onlyMulti} onChange={(e) => setOnlyMulti(e.target.checked)} /> multi-player
            </label>
          </div>
          <MatchList matches={filtered} selectedId={matchId} onSelect={setMatchId} />
        </section>
      </aside>

      <main>
        <div className="topbar">
          <div>
            <strong>{index.maps[map].label}</strong>
            <span className="muted">
              {selected
                ? ` · match ${selected.id.slice(0, 8)} · ${fmtDate(selected.date)} ${fmtClock(selected.start)} UTC · ${selected.humans} human${selected.humans === 1 ? "" : "s"}, ${selected.bots} bot${selected.bots === 1 ? "" : "s"} tracked`
                : ` · ${filtered.length} matches overlaid`}
            </span>
          </div>
          {!mapData && <span className="muted">loading map data…</span>}
        </div>
        <MapCanvas
          image={index.maps[map].image}
          mapPx={index.mapPx}
          heat={heat}
          tracks={tracks}
          markers={shownMarkers}
          showPaths={showPaths}
          time={time}
          dense={dense}
        />
        <div className="timeline">
          <button className="play" onClick={() => setPlaying(!playing)} title="Play / pause (space)">
            {playing ? "❚❚" : "▶"}
          </button>
          <span className="mono">{fmtTime(shownTime)}</span>
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
          <span className="mono muted">{fmtTime(maxTime)}</span>
          <div className="seg small">
            {SPEEDS.map((s) => (
              <button key={s} className={s === speed ? "on" : ""} onClick={() => setSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
        </div>
      </main>
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
              <span>
                {fmtDate(m.date)} · {fmtClock(m.start)}
              </span>
              <span className="muted">{fmtTime(m.duration)}</span>
            </div>
            <div className="row small">
              <span>
                {m.humans}H {m.bots > 0 && `· ${m.bots}B`}
              </span>
              <span className="muted">
                {m.kill} kills · {m.death} deaths
                {m.storm > 0 && ` · ${m.storm} storm`}
              </span>
            </div>
          </button>
        ))}
      </div>
    </>
  );
});
