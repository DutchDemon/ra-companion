# RA Companion v0.4.4

Windows desktop companion for RetroAchievements + Dolphin.

## v0.4.4 - Context-Aware Missables

- Reads Link form (Human/Wolf), player-control state, cutscene state, minigame ID and curated story/event flags directly from Dolphin shared MEM1.
- Missable warnings can now be gated by live form, exact stage and permanent story flags instead of only achievement display order/location text.
- Fixes early `Ordon't Worry` warnings while Link is still a wolf / before Eldin is restored.
- Adds precise early-game gates for `Doing Anything for Money`, `What Happened Here?`, `Buzz Off!`, `I'm Just Winging It`, `You Herd Me!`, `No One Could Tame That Horse!`, `This Does Not Bo'd Well`, and `Call Me Halo`.
- Keeps the existing strict dungeon/boss filtering and route fallback for contexts that do not yet have a dedicated live rule.

## Distribution

Use **RA Companion Setup 0.4.4.exe**. The assisted installer supports per-user or all-users installation, custom destination folders and normal UAC elevation for protected locations.

The RAM reader is read-only and uses Dolphin shared memory; it does not inject into or write to the game process.
