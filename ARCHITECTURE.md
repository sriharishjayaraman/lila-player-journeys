# Architecture

## Stack and why

| Piece | Choice | Why |
|---|---|---|
| Data pipeline | Python, pandas + pyarrow + Pillow (`pipeline/build_data.py`) | The data is small (89k rows, 34 MB). A one-shot script that runs in about 4 seconds beats a database or an API. pyarrow reads the extension-less parquet files directly. |
| Frontend | React 18 + TypeScript + Vite, drawing on a plain `<canvas>` | Thousands of path segments and markers redraw on every playback frame. Canvas 2D handles that easily, and SVG or DOM markers would not. No map or chart library is needed because the "map" is one image with a linear transform. |
| Stats and presets | Small pure functions in `analysis.ts`, recomputed from whatever is filtered | The answers on screen are always for the current map, dates and match, never pre-baked. |
| Heatmap | Hand-rolled: 256x256 density grid, 3-pass box blur (close to a gaussian), 99th-percentile normalisation, colour ramp | About 80 lines, no dependency, and it re-renders in a few ms when filters change. |
| Hosting | Static site on Netlify | No backend at all. The pipeline output is committed under `web/public/`, so the deploy is just `vite build`. |

## Data flow

```
player_data/February_XX/*.nakama-0  (1,243 parquet files, one per player per match)
        │  pipeline/build_data.py
        │   1. read every file, decode event bytes -> utf-8
        │   2. drop 1,505 exact duplicate rows
        │   3. fix timestamps (see below) and make t = seconds since the match's first event
        │   4. classify each journey as human or bot
        │   5. project (x, z) -> 1024px minimap space
        │   6. normalise 8 raw events into kill / death / storm / loot (+ cause: player, bot or unknown)
        │   7. group by map -> match -> player: flat path array + event list
        ▼
web/public/data/index.json            every match: map, date, start, duration, humans, bots, kill/death/storm/loot counts (130 KB)
web/public/data/{Map}.json            all journeys for one map (0.3-2.4 MB raw, 0.5 MB gzipped for the largest)
web/public/minimaps/{Map}.jpg         2048x2048 downscaled minimaps (from 4320, 2160 and 9000 px originals)
        │  browser
        ▼
index.json on load -> {Map}.json fetched and cached when that map is opened
-> filters (map, dates, match, humans/bots, event types) applied in memory
-> canvas: minimap -> heatmap -> paths up to time t -> markers up to time t -> player heads
```

Everything after the fetch runs client-side, so every filter combination is instant. Paths are stored flat (`[t, x, y, t, x, y, …]`) to keep the JSON small and fast to iterate.

## Coordinate mapping

The README gives a per-map scale and origin. Only `x` and `z` are used, since `y` is elevation:

```
u = (x - origin_x) / scale          v = (z - origin_z) / scale
px = u * 1024                       py = (1 - v) * 1024      // image y grows downward, world z grows "up"
```

| Map | scale | origin (x, z) |
|---|---|---|
| AmbroseValley | 900 | (-370, -473) |
| GrandRift | 581 | (-290, -290) |
| Lockdown | 1000 | (-500, -500) |

How I handled it:
1. **A fixed 1024 "map space", whatever the image resolution.** The README says the minimaps are 1024x1024, but they're actually 4320², 2160x2158 and 9000². Because the formula works in UV (0-1), I project into a virtual 1024px space in the pipeline and draw the image stretched into that same square on the canvas. Image resolution and coordinates stay independent. Zoom and pan are one transform applied to both.
2. **Grand Rift isn't quite square** (2160x2158). I resize it to a square 2048² before display. The 0.1% vertical stretch is under one pixel at 1024.
3. **Checked, not trusted.** I drew every path of every match onto each minimap and inspected them. Paths go around building blocks on Ambrose Valley, follow the roads between labelled areas on Grand Rift, and never enter the water on Lockdown. All 87,599 points land inside the 0-1 UV square (Ambrose u 0.05-0.75, v 0.10-0.93).
4. Points are rounded to 0.1 map px (about 0.09 world units on Ambrose Valley) to keep the JSON small.

## Assumptions where the data was ambiguous

| What I found | How I handled it |
|---|---|
| `ts` is typed `timestamp[ms]` and reads as 1970-01-21, so matches seem to last 0.4 "seconds". The integers are really unix seconds: read as seconds they fall exactly on Feb 9-14 2026, matches last 13-890 s, and position samples are 5 s apart. | Treat the raw value as seconds. Match time = `ts - min(ts in match)`. |
| The README rule "numeric user_id = bot" disagrees with the events: 3 numeric IDs (1379, 1402, 1429) send human `Position` + `Loot` events across 17 files. | Classify by movement event (`BotPosition` = bot, `Position` = human), with the ID as fallback only. With this rule every match has at least 1 human, and without it 17 matches would have none. |
| `BotKill` / `BotKilled` mean different things depending on who logged them. In a human file they mean "I killed a bot" / "a bot killed me". In a bot file they mean "I got a kill" / "I died", and bot-vs-bot kills exist. | Normalise to kill/death from the logger's point of view. Bot-logged events get cause `unknown`, are drawn hollow and are labelled honestly ("Bot got a kill"). |
| An event's position is the logger's own position, not the target's (paired human/bot kill events sit 5-20 units apart). | Kills are drawn where the shooter stood and deaths where the victim fell. That is what a level designer wants for sightline analysis. |
| 1,505 exact duplicate rows, mostly `Loot` (same player, ts, position). | Dropped. |
| One match (`ac049b28…`) spans the Feb 10/11 folders because it ran over midnight. | A match's date is the folder of its first event, emitted as an ISO date. |
| The 3 PvP `Kill`/`Killed` pairs log both events for the same player, at the same instant and spot. | Kept as-is (likely a trade or self-kill), and noted. |
| Most matches have telemetry for one human only. Bot journeys exist for just 52 matches. | The match list has a "multi-player" filter so designers can find the 52 richer replays. |
| Times are shown in UTC. | Noted in the UI. |

## Trade-offs

| Decision | Considered | Chose | Why |
|---|---|---|---|
| Where to process data | Parse parquet in the browser (duckdb-wasm / parquet-wasm) vs pre-process | Pre-process to JSON | Faster first paint, no 5 MB wasm bundle, and the quirks (timestamps, bot rule, duplicates) get fixed once in readable Python. Cost: re-run the script when new data lands. |
| Backend | API + DB vs static files | Static | 3.5 MB total, read-only, so a server adds hosting and cold starts for nothing. Would change at millions of rows (then Parquet/DuckDB behind an API with server-side aggregation). |
| Rendering | SVG / Leaflet / deck.gl vs Canvas 2D | Canvas 2D | Leaflet and deck.gl are built for geo tiles, and SVG slows down past a few thousand nodes during playback. Canvas plus one transform is simple and fast. |
| Heatmap scope | Respect the playback time or not | Full time range of the current filter | A time-sliced heatmap is less readable while it changes. Markers and paths already show "up to time t". |
| Heatmap normalisation | Max vs percentile | 99th percentile | One extreme cell would otherwise wash out the rest of the map. |
| Aggregate view | Separate "overview" page vs same canvas | Same canvas, "All N matches combined" entry | One mental model. The timeline also works across all matches ("where is everyone at minute 5?"). |
| Data per map vs per match | 796 tiny files vs 3 files | 3 files | Aggregate views need every match of a map anyway, and one gzipped fetch is faster than hundreds. |
