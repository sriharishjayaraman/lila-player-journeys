# LILA BLACK Player Journey Explorer

A browser tool for level designers to see how players move, fight, loot and die on LILA BLACK's maps, built from 5 days of production telemetry.

**Live:** _deploy URL goes here_

- [ARCHITECTURE.md](ARCHITECTURE.md): stack, data flow, coordinate mapping, assumptions, trade-offs
- [INSIGHTS.md](INSIGHTS.md): three findings from the data, with evidence and suggested actions

## What it does

- **Three maps** with every player path drawn on the correct minimap (world `x, z` mapped to minimap pixels)
- **Humans vs bots:** humans are solid coloured lines (one colour per human in a single match), bots are orange dashed lines; either can be hidden
- **Event markers:** kill (red triangle), death (white X), storm death (purple diamond), loot (yellow square). Filled means a human logged it, hollow or grey means a bot did. Hover a marker for details
- **Filters:** map, any set of dates, a single match or all matches combined, sort the match list by time / combat / players / length, or keep only matches where more than one player was tracked
- **Timeline:** play, pause (space) and scrub at 1x to 30x. It works for one match and for all matches overlaid (where is everyone at minute 5?)
- **Heatmaps:** traffic, kills, deaths, storm deaths and loot, for whatever is currently filtered
- **Pan and zoom** with the mouse wheel and drag, or the buttons

## Tech stack

- **Pipeline:** Python 3.10+, pandas, pyarrow, Pillow
- **Frontend:** React 18, TypeScript, Vite, Canvas 2D (no map or chart libraries)
- **Hosting:** static build on Netlify

## Run it locally

Pre-built data is already committed in `web/public/`, so to just run the tool:

```bash
cd web
npm install
npm run dev
```

Requires Node 18+ (built with Node 22). Open the URL Vite prints.

## Rebuild the data from the raw zip

```bash
unzip player_data.zip -d raw/
pip install -r pipeline/requirements.txt
python pipeline/build_data.py            # reads raw/player_data, writes web/public/{data,minimaps}
```

The raw data is git-ignored. The script prints the row count before and after de-duplication and the number of matches per map.

## Deploy

Netlify, configured by [netlify.toml](netlify.toml): base `web`, build `npm run build`, publish `dist`, Node 22. Import the GitHub repo in Netlify and it picks these up. No environment variables are needed, because the app is fully static.

## Repo layout

```
pipeline/build_data.py   parquet -> JSON + web-sized minimaps
web/src/App.tsx          filters, match list, timeline, state
web/src/MapCanvas.tsx    canvas rendering, pan/zoom, hover tooltips
web/src/heatmap.ts       density grid -> blurred colour-mapped overlay
web/src/markers.tsx      marker shapes shared by the canvas and the legend
web/src/data.ts          loading, event labels, path interpolation
web/public/data          generated JSON (committed)
web/public/minimaps      generated 2048px minimaps (committed)
```
