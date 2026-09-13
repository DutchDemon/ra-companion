# RA Companion Update Feed

This repository hosts RA Companion's update feed.

- `updates/latest.json` tells installed bootstrapper EXEs which app version is current.
- `updates/app_payload.zip` contains the Electron app payload.
- The bootstrapper verifies the payload SHA-256 before replacing the installed app.

The stable update URL is:
`https://raw.githubusercontent.com/DutchDemon/ra-companion/main/updates/latest.json`
