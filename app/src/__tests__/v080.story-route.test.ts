import { describe, expect, it } from 'vitest';
import { buildTwilightStoryAwareContext } from '../profiles/twilightPrincessStoryContext';
import { resolveTwilightStoryChapter, TWILIGHT_STORY_CHAPTERS } from '../profiles/twilightPrincessStoryRoute';

function achievement(id: number, title: string, description: string, type = '', displayOrder = id) {
  return { ID: id, Title: title, Description: description, Type: type, DisplayOrder: displayOrder, Points: 5 };
}

describe('full Twilight Princess story-route companion', () => {
  it('contains the complete 0301-0329 GameCube walkthrough chapter spine', () => {
    expect(TWILIGHT_STORY_CHAPTERS).toHaveLength(29);
    expect(TWILIGHT_STORY_CHAPTERS[0]).toMatchObject({ code: '0301', title: 'Ordona Province, First Visit' });
    expect(TWILIGHT_STORY_CHAPTERS.at(-1)).toMatchObject({ code: '0329', title: 'Dungeon IX: Hyrule Castle' });
  });

  it('uses Eldin Tears as the Current Story Beat while Kakariko area achievements stay optional', () => {
    const tears = achievement(410001, 'Beyond Is a Dimension of Sound, Sight and Mind', 'Collect all 16 Tears of Light and return the light to Eldin', 'progression', 30);
    const villageSecrets = achievement(410002, 'Village Secrets', 'Find the hidden Silver Rupee in Kakariko Village', '', 31);
    const bandwagon = achievement(410003, 'Jump on the Bandwagon', 'Guide the Zora-prince escort wagon to Kakariko Village without letting it catch fire', 'missable', 32);
    const achievements = [tears, villageSecrets, bandwagon];
    const ram: any = {
      live: true,
      stageCode: 'F_SP109',
      stageName: 'Kakariko Village',
      linkForm: 'wolf',
      storyFlags: {
        eldinVesselObtained: true,
        returnedLightToEldin: false,
        lanayruVesselObtained: false,
        lakebedTempleCleared: false,
      },
      stateFlags: {},
      eldinTears: 4,
      lanayruTears: 0,
      mirrorShards: 0,
    };

    const context = buildTwilightStoryAwareContext(achievements, '🐺Link 🗺️Kakariko Village 💧4/16 Tears', ram);
    expect(context.current.map((item: any) => item.Title)).toEqual(['Beyond Is a Dimension of Sound, Sight and Mind']);
    expect(context.areaOpportunities.map((item: any) => item.Title)).toContain('Village Secrets');
    expect(context.missables.map((item: any) => item.Title)).not.toContain('Jump on the Bandwagon');
    expect(context.storyChapter).toMatchObject({ code: '0308', title: 'Eldin Province, First Visit' });
  });

  it('only opens Jump on the Bandwagon in the later Lanayru escort window', () => {
    const bandwagon = achievement(410003, 'Jump on the Bandwagon', 'Guide the Zora-prince escort wagon to Kakariko Village without letting it catch fire', 'missable');
    const context = buildTwilightStoryAwareContext([bandwagon], '🧝Link 🗺️Kakariko Village', {
      live: true,
      stageCode: 'F_SP109',
      storyFlags: {
        lanayruVesselObtained: true,
        lakebedTempleCleared: false,
      },
      stateFlags: {},
      lanayruTears: 16,
    });
    expect(context.missables.map((item: any) => item.Title)).toContain('Jump on the Bandwagon');
  });

  it('maps every main dungeon stage family to its walkthrough chapter', () => {
    const cases: Array<[string, string]> = [
      ['D_MN05', '0307'], ['D_MN04A', '0309'], ['D_MN01B', '0312'],
      ['D_MN10A', '0318'], ['D_MN11B', '0320'], ['D_MN06A', '0322'],
      ['D_MN07A', '0324'], ['D_MN08D', '0326'], ['D_MN09', '0329'],
    ];
    for (const [stageCode, chapterCode] of cases) {
      expect(resolveTwilightStoryChapter({ live: true, stageCode })?.code).toBe(chapterCode);
    }
  });
});
