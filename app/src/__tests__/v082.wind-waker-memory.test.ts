import { describe, expect, it } from 'vitest';
import {
  WIND_WAKER_PROFILE,
  buildProfileContext,
  getGameProfileByRaGameId,
  getGameProfileForRam,
  getProfileSessionStats,
} from '../profiles/registry';

describe('Wind Waker Test 3 normalized memory profile', () => {
  const ram = {
    enabled: true,
    ok: true,
    attached: true,
    stale: false,
    mappingOpen: true,
    gameCode: 'GZLP01',
    memoryProvider: 'dolphin-shared-memory',
    memoryProfile: 'wind-waker-gc-pal',
    stageCode: 'sea',
    stageName: 'Outset Island',
    room: 44,
    currentHearts: 3,
    maxHearts: 3,
    rupees: 37,
    timestamp: 1,
  } as Snapshot['ram'];

  it('registers RA game 9190 as a RAM-enabled PAL profile', () => {
    expect(getGameProfileByRaGameId(9190)).toBe(WIND_WAKER_PROFILE);
    expect(WIND_WAKER_PROFILE.enhanced).toBe(true);
    expect(WIND_WAKER_PROFILE.gameCodes).toContain('GZLP01');
    expect(getGameProfileForRam(ram)).toBe(WIND_WAKER_PROFILE);
  });

  it('normalizes area, hearts, rupees and stage/room for the dashboard', () => {
    const stats = getProfileSessionStats(WIND_WAKER_PROFILE, ram);
    expect(stats.live).toBe(true);
    expect(stats.location).toBe('Outset Island');
    expect(stats.hearts).toBe('3/3');
    expect(stats.form).toBe('Link');
    expect(stats.dashboardStats).toEqual([
      { label: 'Current form', value: 'Link' },
      { label: 'Area / context', value: 'Outset Island' },
      { label: 'Hearts', value: '3/3' },
      { label: 'Rupees', value: '37' },
      { label: 'Stage / room', value: 'sea · 44' },
    ]);
  });

  it('uses live RAM for context without replacing official RA Rich Presence', () => {
    const context = buildProfileContext(
      WIND_WAKER_PROFILE,
      [],
      'The Great Sea: Outset Island · 3 ♥',
      { live: true, stageCode: 'sea', stageName: 'Outset Island', room: 44 },
    );
    expect(context.context.label).toBe('Outset Island');
    expect(context.routeLabel).toBe('Wind Waker RAM context');
    expect(WIND_WAKER_PROFILE.getRamPresence(ram)).toBe('');
  });
});
