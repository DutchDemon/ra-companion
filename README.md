# RA Companion Update Feed

This repository hosts RA Companion's update feed and installer build pipeline.

Current development baseline: **v0.4.4 – Context-Aware Missables**.

- `build-source/` contains the verified source archive chunks used by CI.
- `.github/workflows/build-windows.yml` builds the standard assisted NSIS installer, generates hashes, and runs Microsoft Defender + ClamAV checks.
- The v0.4.4 RAM context layer reads Dolphin shared memory read-only and adds Human/Wolf form plus curated story/event flags for precise missable filtering.
- `updates/latest.json` is the old prototype feed and remains legacy-only; normal updates use Electron/NSIS GitHub Release metadata.
