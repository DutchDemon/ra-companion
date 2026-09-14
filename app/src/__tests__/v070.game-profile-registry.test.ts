import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  achievementCounterForProfile,
  getGameProfileByRaGameId,
  getGameProfileForRam,
  getProfileRamPresence,
} from '../profiles/registry';

function source(relative: string) {
  return fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');
}

describe('v0.7 game profile registry', () => {
  it('registers Twilight Princess as the first enhanced GameCube profile', () => {
    const profile = getGameProfileByRaGameId(3934);
    expect(profile?.key).toBe('twilight-princess-gc-us');
    expect(profile?.title).toBe('The Legend of Zelda: Twilight Princess');
    expect(profile?.platform).toBe('GameCube');
    expect(profile?.region).toBe('USA');
    expect(profile?.enhanced).toBe(true);
    expect(profile?.gameCodes).toContain('GZ2E01');
  });

  it('selects an enhanced profile only from a proven live RAM signature', () => {
    expect(getGameProfileForRam({ attached: true, stale: false, gameCode: 'GZ2E01' } as any)?.raGameId).toBe(3934);
    expect(getGameProfileForRam({ attached: true, stale: true, gameCode: 'GZ2E01' } as any)).toBeNull();
    expect(getGameProfileForRam({ attached: true, stale: false, gameCode: 'UNKNOWN' } as any)).toBeNull();
  });

  it('keeps measured RA counters generic while profile RAM counters remain game-owned', () => {
    const measured = achievementCounterForProfile(null, { MeasuredProgress: 7, MeasuredTarget: 20 }, undefined);
    expect(measured).toMatchObject({ current: 7, target: 20, source: 'ra' });

    const profile = getGameProfileByRaGameId(3934);
    const poe = achievementCounterForProfile(
      profile,
      { Title: 'Poe Hunter', Description: 'Collect 20 Poe Souls' },
      { attached: true, stale: false, gameCode: 'GZ2E01', poeSouls: 8 } as any,
    );
    expect(poe).toMatchObject({ current: 8, target: 20, source: 'ram' });
  });

  it('preserves Twilight Princess local rich presence through the profile adapter', () => {
    const profile = getGameProfileByRaGameId(3934);
    const message = getProfileRamPresence(profile, {
      attached: true,
      stale: false,
      mapped: true,
      gameCode: 'GZ2E01',
      kind: 'dungeon',
      stageName: 'Forest Temple',
      stageCode: 'D_MN05',
      linkForm: 'human',
      currentHearts: 5,
      maxHearts: 6,
      poeSouls: 2,
      goldenBugs: 1,
    } as any);
    expect(message).toContain('Forest Temple');
    expect(message).toContain('❤️5/6');
    expect(message).toContain('👻2/60');
  });

  it('routes Electron and renderer selection through registries instead of TP constants in app entrypoints', () => {
    const electronMain = source('electron/main.cjs');
    const electronRegistry = source('electron/game-profiles/registry.cjs');
    const electronProfile = source('electron/game-profiles/twilight-princess.cjs');
    const rendererMain = source('src/main.tsx');
    const pages = source('src/AppPages.tsx');

    expect(electronMain).toContain("require('./game-profiles/registry.cjs')");
    expect(electronMain).toContain('resolveGameProfile({ dolphin, ram })');
    expect(electronMain).not.toContain('TWILIGHT_PRINCESS_GAME_ID');
    expect(electronMain).not.toContain('/twilight\\s+princess/i');
    expect(electronRegistry).toContain('detectProfileFromRam');
    expect(electronProfile).toContain("gameCodes: Object.freeze(['GZ2E01'])");

    expect(rendererMain).toContain("from './profiles/registry'");
    expect(rendererMain).not.toContain("from './profiles/twilightPrincess'");
    expect(rendererMain).not.toContain("from './profiles/twilightPrincessGuide'");
    expect(rendererMain).not.toContain('String(liveRam?.gameCode || \'\') === \'GZ2E01\'');
    expect(rendererMain).not.toContain('numericGameId === 3934');
    expect(pages).not.toContain("from './profiles/twilightPrincessGuide'");
    expect(pages).not.toContain('Number(gameId ?? activeGameId ?? 0) === 3934');
  });
});
