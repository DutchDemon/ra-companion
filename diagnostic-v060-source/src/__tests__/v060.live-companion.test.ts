import { describe, expect, it } from 'vitest';
import { buildTwilightContext, isFaronTearObjectiveActive, isFaronTearObjectiveRelevant } from '../profiles/twilightPrincess';
import { buildTwilightAchievementStates, TWILIGHT_GAME_STATE_ENGINE } from '../profiles/twilightPrincessState';

function achievement(id: number, title: string, description: string, type = '') {
  return { ID: id, Title: title, Description: description, Type: type, DisplayOrder: id, Points: 5 };
}

describe('v0.6.0 live companion reliability', () => {
  it('shows Faron Vessel objective before the vessel and a live 16-tear counter afterwards', () => {
    const tears = achievement(1, 'You Unlock This Door with the Key of Imagination', 'Collect 16 Tears of Light and return the light to Faron', 'progression');
    const beforeRam: any = { attached: true, stale: false, gameCode: 'GZ2E01', stageCode: 'F_SP108', storyFlags: { faronVesselObtained: false }, stateFlags: {}, faronTears: 0 };
    const before = buildTwilightAchievementStates([tears], beforeRam, buildTwilightContext([tears], '🗺️Faron Woods', { live: true, stageCode: 'F_SP108', storyFlags: beforeRam.storyFlags })).get('1');
    expect(isFaronTearObjectiveRelevant(tears, { live: true, stageCode: 'F_SP108', storyFlags: beforeRam.storyFlags })).toBe(true);
    expect(isFaronTearObjectiveActive(tears, { live: true, stageCode: 'F_SP108', storyFlags: beforeRam.storyFlags })).toBe(false);
    expect(before?.label).toBe('Coming soon · Obtain the Vessel of Light');

    const afterRam: any = { ...beforeRam, storyFlags: { faronVesselObtained: true }, faronTears: 7 };
    const after = buildTwilightAchievementStates([tears], afterRam, buildTwilightContext([tears], '🗺️Faron Woods', { live: true, stageCode: 'F_SP108', storyFlags: afterRam.storyFlags })).get('1');
    expect(after?.label).toBe('7 / 16 Tears of Light');
    expect(after?.progress?.current).toBe(7);
    expect(after?.progress?.target).toBe(16);
  });

  it('keeps Forest Temple boss missables visible as coming-up without marking them active early', () => {
    const ook = achievement(2, 'Spank the Monkey', 'Defeat Ook, the boss monkey without taking damage and only allowing him to throw his boomerang 2 times', 'missable');
    const diababa = achievement(3, "Don't Spit at Dinner Time", 'Defeat Diababa without taking damage and without letting her spit poison', 'missable');
    const context = buildTwilightContext([ook, diababa], '🏰Forest Temple 🧝Link', { live: true, stageCode: 'D_MN05', stageName: 'Forest Temple', storyFlags: {}, stateFlags: {} });
    expect(context.missables).toHaveLength(0);
    expect(context.comingUp.map((item) => item.Title)).toContain('Spank the Monkey');
  });

  it('promotes an exact Forest Temple boss missable only in the boss stage', () => {
    const ook = achievement(2, 'Spank the Monkey', 'Defeat Ook, the boss monkey without taking damage and only allowing him to throw his boomerang 2 times', 'missable');
    const context = buildTwilightContext([ook], '🏰Forest Temple ☠️Ook 🧝Link', { live: true, stageCode: 'D_MN05B', stageName: 'Forest Temple', storyFlags: {}, stateFlags: {} });
    expect(context.missables.map((item) => item.Title)).toContain('Spank the Monkey');
  });

  it('bumps the deep state engine after the v0.6.0 context changes', () => {
    expect(TWILIGHT_GAME_STATE_ENGINE).toBe('tp-gz2e01-v3');
  });
});
