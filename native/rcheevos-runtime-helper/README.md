# RA Companion rcheevos runtime helper

This helper is the native evaluation boundary for RA Companion. It embeds the official RetroAchievements `rcheevos` C runtime while keeping Electron isolated from native C structs and ABI details.

## Current milestone

The helper and Electron observer layer now provide a working read-only evaluation path:

- pinned `RetroAchievements/rcheevos` **v12.5.0** at commit `1433173220a7eaede6a9ed7a18e94117be1821e0`;
- owns and safely initializes/destroys an `rc_runtime_t`;
- validates achievement parsing and measured evaluation in `--self-test`;
- communicates with Electron using newline-delimited JSON protocol version 1;
- attaches to modern Dolphin shared memory using `FILE_MAP_READ` only;
- maps GameCube RA logical memory `0x00000000-0x017FFFFF` directly to Dolphin MEM1 shared offsets;
- supports additive observer commands for raw achievement activation, frame evaluation, measured status and runtime events;
- has been validated on real Twilight Princess USA (`GZ2E01`) RAM: `rc_runtime_do_frame()` measured byte `0x46` through the native peek callback at RA address `0x0040AFC0`, matching a direct read of `F_SP104`;
- is packaged with the Windows app and covered by Defender/ClamAV validation.

`app/electron/services/observer-runtime-service.cjs` provides the game-level definition session above the helper. It accepts a RetroAchievements game ID, optional six-character GameCube code, and an array of `{ id, definition }` entries. Loads are atomic: any parse/activation failure deactivates definitions already loaded in that attempt and leaves the session unsealed. Before live evaluation it verifies that attached Dolphin memory contains a valid GameCube image and, when supplied, the expected game code.

## Protocol boundary

On startup the helper emits a `ready` message containing the protocol version and rcheevos version. Electron sends request objects containing an integer `id` and a `command`; the helper answers with a `response` carrying the same `id`.

Native observer commands currently include:

- `activateAchievement`
- `deactivateAchievement`
- `achievementStatus`
- `evaluateFrame`
- `attachDolphin` / `detachDolphin`
- `memoryStatus` / `readMemory`
- `reset`

The Electron observer service deliberately owns whole-game orchestration instead of teaching the native helper about RetroAchievements accounts or HTTP. A future authenticated RA data service can therefore fetch official definitions and pass them into the same `{ id, definition }` loader without changing the native memory/evaluation boundary.

## Authority and safety rules

The local runtime is an **observer only**. A local `triggered` event means only that the currently observed RAM satisfies the rcheevos definition. It does not mean the user officially earned the achievement.

Official RetroAchievements server progress remains the only authority for Completed/Locked state. The observer layer must not:

- start or imitate a RetroAchievements gameplay session;
- submit achievement unlocks or leaderboard results;
- write to Dolphin memory;
- merge local `triggered` events into official completion state;
- fabricate counters or measured progress.

Game/profile-specific context may still enrich the UI, but only when backed by validated mappings.
