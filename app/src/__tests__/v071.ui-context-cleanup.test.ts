import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findPendingFaronVesselObjective, isPendingFaronVesselObjective, pendingFaronVesselState } from '../profiles/faronNextStep';

function achievement(id: number, title: string, description: string, earned = false) {
  return { ID: id, Title: title, Description: description, Type: 'progression', DisplayOrder: id, Points: 5, ...(earned ? { DateEarnedHardcore: '2026-09-14 20:00:00' } : {}) };
}

describe('v0.7.1 UI cleanup and Faron prerequisite fallback', () => {
  it('finds the Faron Tear progression before the Vessel is owned and stops after it is obtained', () => {
    const previous = achievement(100, 'Courage Need Not Be Remembered', 'Previous story achievement', true);
    const tears = achievement(101, 'You Unlock This Door with the Key of Imagination', 'Collect all the Tears of Light and return the light to Faron');
    const ram: any = { attached: true, stale: false, gameCode: 'GZ2E01', stageCode: 'F_SP102', storyFlags: { faronTwilightStarted: true, faronVesselObtained: false } };

    expect(isPendingFaronVesselObjective(tears, ram)).toBe(true);
    expect(findPendingFaronVesselObjective([previous, tears], ram)?.Title).toBe('You Unlock This Door with the Key of Imagination');
    expect(pendingFaronVesselState().label).toBe('Coming soon · Obtain the Vessel of Light');
    expect(findPendingFaronVesselObjective([previous, tears], { ...ram, storyFlags: { faronTwilightStarted: true, faronVesselObtained: true } } as any)).toBeNull();
  });

  it('removes redundant widgets while retaining inline achievement counters and next-step wiring', () => {
    const root = path.resolve(__dirname, '..', '..');
    const renderer = fs.readFileSync(path.join(root, 'src/main.tsx'), 'utf8');
    const pages = fs.readFileSync(path.join(root, 'src/AppPages.tsx'), 'utf8');

    expect(renderer).not.toContain('v6-overlay-live-stats');
    expect(renderer).not.toContain('v7-overlay-live-counters');
    expect(pages).not.toContain('LIVE ACHIEVEMENT PROGRESS');
    expect(renderer).toContain('findPendingFaronVesselObjective');
    expect(renderer).toContain('...(pendingFaronVesselAchievement ? [pendingFaronVesselAchievement] : [])');
    expect(renderer).toContain('achievements={nextStoryAchievements}');
    expect(renderer).toContain('currentStoryIds.has(id) || nextStorySeen.has(id)');
    expect(renderer).toContain('achievementCounter(achievement, ram, profile || null, runtimeLive) || state?.progress');
    expect(pages).toContain('achievementCounter(achievement, isCurrentGame ? effectiveRam : undefined, isCurrentGame) || state.progress');
  });
});
