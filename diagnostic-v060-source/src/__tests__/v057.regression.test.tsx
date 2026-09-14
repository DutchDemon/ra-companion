import { describe, expect, it } from 'vitest';
import { buildTwilightContext } from '../profiles/twilightPrincess';
import { buildTwilightAchievementStates } from '../profiles/twilightPrincessState';

function achievement(id: number, title: string, description: string, type = 'progression') {
  return { ID: id, Title: title, Description: description, type, HardcoreMode: false };
}

const faronTears = achievement(1, 'You Unlock This Door with the Key of Imagination', 'Collect all the Tears of Light and return the light to Faron');

describe('v0.5.7 Faron Tears current-objective gating', () => {
  it('makes the Faron Tears achievement the only current story objective during the Faron Woods Tear hunt', () => {
    const unrelated = achievement(2, 'Faron Woods Detour', 'Complete another task in Faron Woods');
    const context = buildTwilightContext(
      [faronTears, unrelated],
      '🗺️Faron Woods 🐺',
      {
        live: true,
        stageCode: 'F_SP108',
        stageName: 'Faron Woods',
        linkForm: 'wolf',
        storyFlags: { faronVesselObtained: true },
      },
    );

    expect(context.current.map((a: any) => a.ID)).toEqual([1]);
  });

  it('keeps live 0-16 Faron Tear progress while the player is in Faron Woods', () => {
    const ram: any = {
      attached: true,
      stale: false,
      gameCode: 'GZ2E01',
      stageCode: 'F_SP108',
      faronTears: 7,
      storyFlags: { faronVesselObtained: true },
      stateFlags: {},
      actors: {},
    };
    const context = buildTwilightContext([faronTears], '🗺️Faron Woods 🐺', {
      live: true,
      stageCode: 'F_SP108',
      stageName: 'Faron Woods',
      linkForm: 'wolf',
      storyFlags: ram.storyFlags,
    });
    const state = buildTwilightAchievementStates([faronTears], ram, context).get('1');

    expect(state?.kind).toBe('in_progress');
    expect(state?.progress).toMatchObject({ current: 7, target: 16 });
  });

  it('does not carry the Faron Tears metric into Forest Temple', () => {
    const ram: any = {
      attached: true,
      stale: false,
      gameCode: 'GZ2E01',
      stageCode: 'D_MN05',
      faronTears: 7,
      storyFlags: { faronVesselObtained: true },
      stateFlags: {},
      actors: {},
    };
    const context = buildTwilightContext([faronTears], '🏰Forest Temple 🧝', {
      live: true,
      stageCode: 'D_MN05',
      stageName: 'Forest Temple',
      linkForm: 'human',
      storyFlags: ram.storyFlags,
    });
    const state = buildTwilightAchievementStates([faronTears], ram, context).get('1');

    expect(context.current).toEqual([]);
    expect(context.relevantAll).toEqual([]);
    expect(state?.kind).toBe('tracked');
    expect(state?.progress).toBeUndefined();
  });
});
