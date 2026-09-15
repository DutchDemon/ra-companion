// v0.7.2 validation anchor: this file intentionally exercises the final branch state.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FARON_PREVIOUS_STORY_ACHIEVEMENT_ID,
  FARON_TEAR_ACHIEVEMENT_ID,
  findPendingFaronVesselObjective,
} from '../profiles/faronNextStep';

function achievement(id: number, title: string, description: string, earned = false) {
  return { ID: id, Title: title, Description: description, Type: 'progression', Points: 5, ...(earned ? { DateEarnedHardcore: '2026-09-15 10:00:00' } : {}) };
}

describe('v0.7.2 unified RA setup and Faron context', () => {
  it('surfaces the exact Faron Tears achievement when the previous progression is earned even if the old twilight flag is false', () => {
    const previous = achievement(FARON_PREVIOUS_STORY_ACHIEVEMENT_ID, 'Courage Need Not Be Remembered', 'Follow the strange little imp to the person she wants you to meet', true);
    const tears = achievement(FARON_TEAR_ACHIEVEMENT_ID, 'You Unlock This Door with the Key of Imagination', 'Collect all the Tears of Light and return the light to Faron');
    const ram: any = {
      attached: true,
      stale: false,
      gameCode: 'GZ2E01',
      stageCode: 'F_SP102',
      storyFlags: {
        faronTwilightStarted: false,
        faronVesselObtained: false,
        forestTempleEntered: false,
        forestTempleCleared: false,
      },
    };

    expect(findPendingFaronVesselObjective([previous, tears], ram)?.ID).toBe(FARON_TEAR_ACHIEVEMENT_ID);
  });

  it('does not surface the pre-vessel fallback before the route begins or after the vessel/Forest Temple transition', () => {
    const tears = achievement(FARON_TEAR_ACHIEVEMENT_ID, 'You Unlock This Door with the Key of Imagination', 'Collect all the Tears of Light and return the light to Faron');
    const baseRam: any = { attached: true, stale: false, gameCode: 'GZ2E01', stageCode: 'F_SP00', storyFlags: {} };
    expect(findPendingFaronVesselObjective([tears], baseRam)).toBeNull();
    expect(findPendingFaronVesselObjective([tears], { ...baseRam, stageCode: 'F_SP108', storyFlags: { faronVesselObtained: true } })).toBeNull();
    expect(findPendingFaronVesselObjective([tears], { ...baseRam, stageCode: 'F_SP108', storyFlags: { forestTempleEntered: true } })).toBeNull();
  });

  it('keeps account and runtime setup in one settings panel with explicit diagnostics', () => {
    const root = path.resolve(__dirname, '..', '..');
    const pages = fs.readFileSync(path.join(root, 'src/AppPages.tsx'), 'utf8');
    const types = fs.readFileSync(path.join(root, 'src/global.d.ts'), 'utf8');

    expect(pages).toContain('RETROACHIEVEMENTS CONNECTION');
    expect(pages).toContain('One more step for live Rich Presence');
    expect(pages).toContain('Live runtime & Rich Presence');
    expect(pages).toContain('Runtime & Rich Presence diagnostics');
    expect(pages).toContain('Helper installed');
    expect(pages).toContain('rcheevos ready');
    expect(pages).toContain('Official patch loaded');
    expect(pages).toContain('Rich Presence');
    expect(types).toContain('dolphinAttached?: boolean');
    expect(types).toContain('gameCubeMemoryBridge?: boolean');
  });
});
