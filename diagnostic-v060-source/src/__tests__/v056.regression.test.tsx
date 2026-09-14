import { describe, expect, it } from 'vitest';
import { buildTwilightAchievementStates } from '../profiles/twilightPrincessState';

function achievement(id: number, title: string, description: string) {
  return { ID: id, Title: title, Description: description, HardcoreMode: false };
}

const emptyContext: any = { missables: [], current: [], comingUp: [], relevantAll: [] };
const baseRam: any = {
  attached: true,
  stale: false,
  gameCode: 'GZ2E01',
  stageCode: 'F_SP108',
  storyFlags: {},
  stateFlags: {},
  actors: {},
  faronTears: 0,
  eldinTears: 0,
  lanayruTears: 0,
};

describe('v0.5.6 Vessel of Light progress', () => {
  it('keeps the Faron achievement upcoming until the Faron Vessel is received', () => {
    const a = achievement(1, 'You Unlock This Door with the Key of Imagination', 'Collect all the Tears of Light and return the light to Faron');
    const state = buildTwilightAchievementStates([a], baseRam, emptyContext).get('1');
    expect(state?.kind).toBe('upcoming');
    expect(state?.label).toContain('Vessel not received');
  });

  it('tracks Faron Tears live after receiving the Faron Vessel', () => {
    const a = achievement(1, 'You Unlock This Door with the Key of Imagination', 'Collect all the Tears of Light and return the light to Faron');
    const ram = { ...baseRam, faronTears: 7, storyFlags: { faronVesselObtained: true } };
    const state = buildTwilightAchievementStates([a], ram, emptyContext).get('1');
    expect(state?.kind).toBe('in_progress');
    expect(state?.label).toBe('In progress · 7/16 Tears');
    expect(state?.progress).toMatchObject({ current: 7, target: 16 });
  });

  it('uses separate Vessel flags and counters for Faron, Eldin and Lanayru', () => {
    const faron = achievement(1, 'Faron', 'Collect all the Tears of Light and return the light to Faron');
    const eldin = achievement(2, 'Eldin', 'Collect all the Tears of Light and return the light to Eldin');
    const lanayru = achievement(3, 'Lanayru', 'Collect all the Tears of Light and return the light to Lanayru');
    const ram = {
      ...baseRam,
      faronTears: 5,
      eldinTears: 9,
      lanayruTears: 12,
      storyFlags: { faronVesselObtained: true, eldinVesselObtained: false, lanayruVesselObtained: true },
    };
    const states = buildTwilightAchievementStates([faron, eldin, lanayru], ram, emptyContext);
    expect(states.get('1')?.progress?.current).toBe(5);
    expect(states.get('2')?.kind).toBe('upcoming');
    expect(states.get('3')?.progress?.current).toBe(12);
  });

  it('marks a full Vessel as pending until RA confirms completion', () => {
    const a = achievement(1, 'You Unlock This Door with the Key of Imagination', 'Collect all the Tears of Light and return the light to Faron');
    const ram = { ...baseRam, faronTears: 16, storyFlags: { faronVesselObtained: true } };
    const state = buildTwilightAchievementStates([a], ram, emptyContext).get('1');
    expect(state?.kind).toBe('pending');
    expect(state?.progress).toMatchObject({ current: 16, target: 16 });
  });
});
