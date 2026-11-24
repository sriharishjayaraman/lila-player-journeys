# Three things the data says about LILA BLACK

All numbers come from the 5 days of telemetry (Feb 10 to 14, 796 matches, 798 human journeys) after de-duplication. Every insight can be reproduced in the tool with the filters named under it.

---

## 1. Players are fighting bots, not each other

**What caught my eye.** With the Kills and Deaths markers on and all matches overlaid, every map is covered in bot kills. Player-vs-player markers are almost impossible to find.

**The evidence.**
- 3 player kills in 796 matches. In the same period humans killed 2,209 bots.
- Of the 443 human deaths, 401 were to bots, 39 to the storm and 3 to other players. Bots cause 99% of combat deaths.
- Every match in the data has exactly one tracked human (794 matches with 1, 2 with 2). Kill and death events are logged from the human's own point of view, so a PvP fight would still show up even if the other human wasn't tracked. It almost never does.

**What to do about it.**
- The kill and death heatmaps are really maps of where bots are placed. Treat bot spawn and patrol layout as a level design lever, as much as cover and sightlines are.
- If PvP tension is part of the extraction fantasy, look at matchmaking and the population per match before reworking map layouts for PvP.
- Metrics this moves: PvP encounters per match, deaths per match by cause, extraction rate, session length.

**Why a level designer should care.** Hot zones that look like "contested POIs" are bot zones. Moving a bot patrol changes the kill map. Moving cover around a POI does nothing if no other player ever turns up.

*In the tool:* any map, all dates, Heatmap = Deaths, then hover the markers. Nearly every tooltip says "killed by a bot".

---

## 2. The storm is a much bigger killer on Lockdown and Grand Rift than on Ambrose Valley

**What caught my eye.** Storm-death diamonds show up on Lockdown far more often than its share of matches would suggest.

**The evidence.**
- Storm deaths per match: Ambrose Valley 17 in 566 (3.0%), Lockdown 17 in 171 (9.9%), Grand Rift 5 in 59 (8.5%).
- Every storm death happened late, between 10:55 and 14:47 into the match. So the fair comparison is players still alive at ~10:40. Of those, **17% die to the storm on Ambrose Valley, 47% on Lockdown and 56% on Grand Rift** (102, 36 and 9 players).
- Lockdown is the small close-quarters map, so the late-game route to extraction should be the easiest there. Instead it's the hardest.

**What to do about it.**
- Check storm speed and extraction point placement on Lockdown first, then Grand Rift: distance from the late-game hot zones to the nearest extract, and whether the storm cuts across the main routes to it.
- Try one change at a time (an extra extract on the storm-trailing side, or a slower final storm phase) and watch the late-game storm death share.
- Metrics this moves: storm death rate among late survivors, extraction rate, and probably retention for players who lose a full run of loot to the storm.

**Why a level designer should care.** Dying to the storm after 11 minutes of looting is the most punishing way to lose in an extraction shooter. A rate three times higher on one map points to layout or pacing, not player skill.

*In the tool:* Lockdown, Storm deaths markers only, scrub the timeline. Nothing appears until about 11:00, then they cluster in the last few minutes.

---

## 3. On Ambrose Valley, the best loot is in the safest places

**What caught my eye.** With the Loot heatmap on next to the Deaths heatmap, the brightest loot areas in the south-west and along the west edge have almost no deaths. The deaths are packed into a block in the middle-west, between them.

**The evidence** (map split into an 8x8 grid of 128px cells, humans only):
- The 5 deadliest of the 64 cells hold 69% of all Ambrose Valley deaths. They form one block in the middle-west of the map (minimap x ≈ 256-640, y ≈ 384-640). The worst cell sees 2.4 deaths per 100 position samples, about 3x the map average of 0.83.
- The cell with the most loot pickups per visit, south-west (x ≈ 256-384, y ≈ 768-896), had 593 loot pickups over 1,404 position samples and zero deaths. A second west-edge cell (x ≈ 0-128, y ≈ 384-512) had 474 pickups and zero deaths.
- So the loot rate in those safe cells is 37-42 per 100 samples, against a map average of 25. The best loot carries no risk.

**What to do about it.**
- Either move loot value toward the danger block, or add bot pressure or a reason to fight near the safe loot cells.
- Metrics this moves: loot per minute by area, deaths per visit by area, and spread of traffic (today the top 10% of visited cells hold 44% of all movement on Ambrose Valley).

**Why a level designer should care.** Extraction shooters work on risk against reward. When the richest areas are also the safest, players learn one safe route and the rest of the map goes unused, which is also why the traffic heatmap shows large quiet areas.

*In the tool:* Ambrose Valley, all dates, switch the Heatmap between Loot and Deaths and compare the south-west.
