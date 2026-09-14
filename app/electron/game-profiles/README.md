# RA Companion game profiles

The v0.7 game-profile registry separates generic RetroAchievements support from game-specific enhanced context.

## Support tiers

- **Generic RA support**: persistent achievement library, official Hardcore completion state, measured progress when RetroAchievements provides it, and offline remembered game data.
- **Enhanced profile support**: proven game/emulator identification plus game-owned read-only RAM context, contextual missables, counters, local rich presence, and other mappings that have been validated for that exact game/revision.

A game must never receive enhanced RAM behavior merely because its title looks similar to a known game. Region/revision-specific memory mappings belong to the profile that proves them.

## Current enhanced profile

`twilight-princess-gc-us` is the first enhanced profile:

- RetroAchievements game ID: `3934`
- Platform: GameCube
- Region: USA
- Proven Dolphin RAM game code: `GZ2E01`

Twilight Princess-specific title matching, RAM identification and live-presence behavior live behind the profile registry rather than in the Electron/renderer entrypoints.

## Invariants

Official RetroAchievements game-progress data remains the only authority for Completed/Locked state. Local RAM/profile state may provide live context but must not fabricate an unlock. Counters are exposed only when they come from official measured progress or a proven read-only RAM mapping.
