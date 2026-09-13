# RA Companion Update Feed

This repository hosts RA Companion's update feed and installer build pipeline.

Current development baseline: **v0.4.5 – Guide-Backed Missable Warnings**.

- `build-source/` contains the verified v0.4.4 source archive chunks used as the clean CI baseline.
- `build-overrides/` contains the readable source overrides and the v0.4.5 patch applied on top of that verified baseline.
- `.github/workflows/build-windows.yml` builds the standard assisted NSIS installer, generates hashes, and runs Microsoft Defender + ClamAV checks.
- The read-only Dolphin RAM context layer still provides Human/Wolf form, stage/room context and curated story/event flags for precise missable filtering.
- v0.4.5 adds curated, paraphrased guidance from the RetroAchievements Twilight Princess GameCube missables guide: how to approach a missable, its point of no return, and retry/save advice where applicable.
- RetroAchievements' live `type: missable` flag remains the primary signal, while the guide layer and existing safety fallbacks cover older/odd payloads and newer set revisions.
- `updates/latest.json` is the old prototype feed and remains legacy-only; normal updates use Electron/NSIS GitHub Release metadata.

Guide source: https://github.com/RetroAchievements/guides/wiki/The-Legend-of-Zelda:-Twilight-Princess-(Gamecube)
