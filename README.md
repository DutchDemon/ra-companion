# RA Companion Update Feed

This repository hosts RA Companion's update feed and installer build pipeline.

Current development baseline: **v0.4.6 – Silent In-App Updates**.

- `build-source/` contains the verified v0.4.4 source archive chunks used as the clean CI baseline.
- `build-overrides/` contains readable renderer/Electron source overrides plus the incremental v0.4.5 and v0.4.6 patches.
- `.github/workflows/build-windows.yml` builds the standard assisted NSIS installer, generates hashes, and runs Microsoft Defender + ClamAV checks.
- v0.4.6 changes the in-app updater to `quitAndInstall(true, true)`: downloaded updates install silently and RA Companion restarts automatically afterward.
- The normal assisted NSIS installer remains available for first-time installation and manual reinstalls.
- CI explicitly fails if the updater regresses to the interactive `quitAndInstall(false, true)` path.
- The v0.4.5 guide-backed Twilight Princess missable warnings and read-only Dolphin RAM context layer remain unchanged.
- `updates/latest.json` is the old prototype feed and remains legacy-only; normal updates use Electron/NSIS GitHub Release metadata.

Guide source: https://github.com/RetroAchievements/guides/wiki/The-Legend-of-Zelda:-Twilight-Princess-(Gamecube)
