# RA Companion rcheevos runtime helper

This helper is the native evaluation boundary for RA Companion. It embeds the official RetroAchievements `rcheevos` C runtime while keeping Electron isolated from native C structs and ABI details.

## Current milestone

The helper currently proves the foundation only:

- pinned `RetroAchievements/rcheevos` **v12.5.0** at commit `1433173220a7eaede6a9ed7a18e94117be1821e0`;
- owns and safely initializes/destroys an `rc_runtime_t`;
- validates achievement parsing in `--self-test`;
- communicates with Electron using newline-delimited JSON protocol version 1;
- supports `ping`, `status`, `reset`, and `shutdown`;
- is packaged with the Windows app and covered by Defender/ClamAV validation.

It does **not** currently decide whether an achievement is completed in RA Companion. Official RetroAchievements user progress remains authoritative.

## Protocol boundary

On startup the helper emits a `ready` message containing the protocol version and rcheevos version. Electron sends request objects containing an integer `id` and a `command`; the helper answers with a `response` carrying the same `id`.

The next runtime milestone will add explicit commands for loading official RA achievement definitions and evaluating frames against read-only Dolphin memory. Those commands must preserve this versioned protocol rather than exposing `rc_runtime_t` or other native data structures directly.

## Safety rules

The helper is read/evaluate-only with respect to emulated game memory. It must never write into Dolphin memory, patch RetroAchievements state, fabricate measured progress, or promote local runtime events into authoritative Completed/Locked state. Game/profile-specific live context remains opt-in and must be backed by proven mappings.
