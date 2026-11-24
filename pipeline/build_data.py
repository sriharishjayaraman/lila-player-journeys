"""Turn the raw LILA BLACK parquet telemetry into static JSON + web-sized minimaps.

Usage: python pipeline/build_data.py [raw_dir] [out_dir]
  raw_dir defaults to raw/player_data (the unzipped player_data.zip)
  out_dir defaults to web/public
"""

import json
import os
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "raw", "player_data")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "web", "public")

MAPS = {
    "AmbroseValley": {"scale": 900, "origin_x": -370, "origin_z": -473, "image": "AmbroseValley_Minimap.png", "label": "Ambrose Valley"},
    "GrandRift": {"scale": 581, "origin_x": -290, "origin_z": -290, "image": "GrandRift_Minimap.png", "label": "Grand Rift"},
    "Lockdown": {"scale": 1000, "origin_x": -500, "origin_z": -500, "image": "Lockdown_Minimap.jpg", "label": "Lockdown"},
}
MAP_PX = 1024  # coordinate space used by the frontend, whatever the image's real resolution
IMAGE_PX = 2048  # web-sized minimap
MOVES = {"Position", "BotPosition"}

# Raw event -> (kind, cause). Every event is logged by the file's owner at the owner's own position,
# so a kill sits where the shooter stood and a death where the victim fell.
EVENT_MAP = {
    "Kill": ("kill", "player"),
    "BotKill": ("kill", "bot"),
    "Killed": ("death", "player"),
    "BotKilled": ("death", "bot"),
    "KilledByStorm": ("storm", None),
    "Loot": ("loot", None),
}


def load_raw():
    frames = []
    for day in sorted(d for d in os.listdir(RAW) if d.startswith("February_")):
        for name in os.listdir(os.path.join(RAW, day)):
            if name.startswith("."):
                continue
            try:
                t = pq.read_table(os.path.join(RAW, day, name)).to_pandas()
            except Exception as e:
                print(f"skip {day}/{name}: {e}")
                continue
            t["day"] = day
            frames.append(t)
    df = pd.concat(frames, ignore_index=True)
    df["event"] = df["event"].astype("category").cat.rename_categories(lambda b: b.decode("utf-8")).astype(str)
    # ts is typed timestamp[ms] but the stored integers are unix *seconds* (1970-01-21 x 1000 = Feb 2026)
    df["t_unix"] = df["ts"].astype("int64").astype("float64")
    return df


def to_px(x, z, cfg):
    u = (x - cfg["origin_x"]) / cfg["scale"]
    v = (z - cfg["origin_z"]) / cfg["scale"]
    return u * MAP_PX, (1 - v) * MAP_PX


def build():
    df = load_raw()
    n_raw = len(df)
    df = df.drop_duplicates(["user_id", "match_id", "ts", "event", "x", "y", "z"]).copy()
    print(f"rows {n_raw} -> {len(df)} after dropping exact duplicates")

    # A journey is a bot if it moves with BotPosition; the README's numeric-id rule is wrong for 3 ids
    journey = df.groupby(["match_id", "user_id"])["event"]
    df["bot"] = journey.transform(lambda s: (s == "BotPosition").any())
    no_moves = ~journey.transform(lambda s: s.isin(MOVES).any())
    df.loc[no_moves, "bot"] = df.loc[no_moves, "user_id"].str.fullmatch(r"\d+")

    first = df.groupby("match_id")["t_unix"].transform("min")
    df["t"] = df["t_unix"] - first
    # A match that ran past midnight is split across two day folders; date it by its first event
    first_rows = df.loc[df.groupby("match_id")["t_unix"].idxmin()].set_index("match_id")
    year = datetime.fromtimestamp(df["t_unix"].min(), timezone.utc).year
    to_date = lambda folder: datetime.strptime(f"{folder} {year}", "%B_%d %Y").date().isoformat()

    index_matches = []
    os.makedirs(os.path.join(OUT, "data"), exist_ok=True)

    for map_id, cfg in MAPS.items():
        mdf = df[df["map_id"] == map_id]
        px, py = to_px(mdf["x"].to_numpy(), mdf["z"].to_numpy(), cfg)
        mdf = mdf.assign(t=mdf["t"].round().astype(int), px=px.round(1), py=py.round(1)).sort_values("t")
        matches = {}
        for match_id, g in mdf.groupby("match_id", sort=False):
            players = []
            counts = {"kill": 0, "death": 0, "storm": 0, "loot": 0}
            for user_id, p in g.groupby("user_id", sort=False):
                bot = bool(p["bot"].iloc[0])
                pos = p[p["event"].isin(MOVES)]
                path = np.column_stack([pos["t"], pos["px"], pos["py"]]).ravel().tolist()
                events = []
                for ev, t, x, y in p.loc[p["event"].isin(EVENT_MAP), ["event", "t", "px", "py"]].itertuples(index=False):
                    kind, cause = EVENT_MAP[ev]
                    if bot and cause is not None:
                        cause = "unknown"  # bot logs never say who the other side was
                    events.append([kind, cause, int(t), float(x), float(y)])
                    counts[kind] += 1
                players.append({"id": user_id, "bot": bot, "path": path, "events": events})
            players.sort(key=lambda pl: (pl["bot"], pl["id"]))
            short = match_id.replace(".nakama-0", "")
            matches[short] = {"players": players}
            humans = sum(not pl["bot"] for pl in players)
            index_matches.append({
                "id": short,
                "map": map_id,
                "date": to_date(first_rows.at[match_id, "day"]),
                "start": int(first_rows.at[match_id, "t_unix"]),
                "duration": int(g["t"].max()),
                "humans": humans,
                "bots": len(players) - humans,
                **counts,
            })
        with open(os.path.join(OUT, "data", f"{map_id}.json"), "w") as f:
            json.dump(matches, f, separators=(",", ":"))
        print(f"{map_id}: {len(matches)} matches")

    index = {
        "maps": {m: {"label": c["label"], "image": f"minimaps/{m}.jpg"} for m, c in MAPS.items()},
        "mapPx": MAP_PX,
        "dates": sorted({m["date"] for m in index_matches}),
        "matches": sorted(index_matches, key=lambda m: m["start"]),
    }
    with open(os.path.join(OUT, "data", "index.json"), "w") as f:
        json.dump(index, f, separators=(",", ":"))

    os.makedirs(os.path.join(OUT, "minimaps"), exist_ok=True)
    for map_id, cfg in MAPS.items():
        img = Image.open(os.path.join(RAW, "minimaps", cfg["image"])).convert("RGB")
        # GrandRift ships as 2160x2158; the UV mapping assumes a square image, so stretch to square
        img.resize((IMAGE_PX, IMAGE_PX), Image.LANCZOS).save(os.path.join(OUT, "minimaps", f"{map_id}.jpg"), quality=85, optimize=True)


if __name__ == "__main__":
    build()
