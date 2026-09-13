# RA Companion Update Feed

This repository hosts RA Companion's update feed and installer build pipeline.

- `updates/latest.json` is the legacy prototype feed and currently remains pinned to v0.4.2.
- `build-source/` contains the verified source archive chunks used by CI.
- `.github/workflows/build-windows.yml` builds the standard NSIS installer, generates hashes, and runs antivirus checks.

Future public app updates will use standard Electron/NSIS update metadata and GitHub Releases rather than the earlier custom bootstrapper approach.
