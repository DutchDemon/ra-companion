export type TwilightStoryChapterKind = 'story' | 'dungeon' | 'optional';

export interface TwilightStoryChapter {
  code: string;
  title: string;
  kind: TwilightStoryChapterKind;
}

export interface TwilightStoryRamContext {
  live?: boolean;
  stageCode?: string;
  stageName?: string;
  linkForm?: 'human' | 'wolf' | 'unknown';
  storyFlags?: Record<string, boolean>;
  stateFlags?: Record<string, boolean>;
  faronTears?: number | null;
  eldinTears?: number | null;
  lanayruTears?: number | null;
  fusedShadows?: number | null;
  mirrorShards?: number | null;
}

export const TWILIGHT_STORY_CHAPTERS: readonly TwilightStoryChapter[] = Object.freeze([
  { code: '0301', title: 'Ordona Province, First Visit', kind: 'story' },
  { code: '0302', title: 'Faron Province, First Visit', kind: 'story' },
  { code: '0303', title: 'Ordona Province, Second Visit', kind: 'story' },
  { code: '0304', title: 'Hyrule Castle, First Visit', kind: 'story' },
  { code: '0305', title: 'Ordona Province, Third Visit', kind: 'story' },
  { code: '0306', title: 'Faron Province, Second Visit', kind: 'story' },
  { code: '0307', title: 'Dungeon I: The Forest Temple', kind: 'dungeon' },
  { code: '0308', title: 'Eldin Province, First Visit', kind: 'story' },
  { code: '0309', title: 'Dungeon II: Goron Mines', kind: 'dungeon' },
  { code: '0310', title: 'Eldin Province, Second Visit', kind: 'story' },
  { code: '0311', title: 'Lanayru Province, First Visit', kind: 'story' },
  { code: '0312', title: 'Dungeon III: Lakebed Temple', kind: 'dungeon' },
  { code: '0313', title: 'Hyrule Castle, Second Visit', kind: 'story' },
  { code: '0314', title: 'Faron Province, Third Visit', kind: 'story' },
  { code: '0315', title: 'World Tour For Nifty Stuff', kind: 'optional' },
  { code: '0316', title: 'Lanayru Province, Second Visit', kind: 'story' },
  { code: '0317', title: 'Desert Province', kind: 'story' },
  { code: '0318', title: "Dungeon IV: Arbiter's Grounds", kind: 'dungeon' },
  { code: '0319', title: 'Peak Province', kind: 'story' },
  { code: '0320', title: 'Dungeon V: Snowpeak Ruins', kind: 'dungeon' },
  { code: '0321', title: 'Faron Province, Fourth Visit', kind: 'story' },
  { code: '0322', title: 'Dungeon VI: The Temple of Time', kind: 'dungeon' },
  { code: '0323', title: 'The Six Mysterious Statues', kind: 'story' },
  { code: '0324', title: 'Dungeon VII: The City in the Sky', kind: 'dungeon' },
  { code: '0325', title: 'Fun Things with the Double Clawshots', kind: 'optional' },
  { code: '0326', title: 'Dungeon VIII: The Palace of Twilight', kind: 'dungeon' },
  { code: '0327', title: 'Optional Dungeon: The Cave of Ordeals', kind: 'optional' },
  { code: '0328', title: 'A Few Final Things', kind: 'optional' },
  { code: '0329', title: 'Dungeon IX: Hyrule Castle', kind: 'dungeon' },
]);

const CHAPTER_BY_CODE = new Map(TWILIGHT_STORY_CHAPTERS.map((chapter) => [chapter.code, chapter]));

const DUNGEON_CHAPTER_BY_STAGE_PREFIX: ReadonlyArray<readonly [string, string]> = Object.freeze([
  ['D_MN05', '0307'],
  ['D_MN04', '0309'],
  ['D_MN01', '0312'],
  ['D_MN10', '0318'],
  ['D_MN11', '0320'],
  ['D_MN06', '0322'],
  ['D_MN07', '0324'],
  ['D_MN08', '0326'],
  ['D_MN09', '0329'],
  ['D_SB01', '0327'],
]);

const FARON_TEAR_STAGES = new Set(['F_SP108', 'R_SP108', 'D_SB10']);
const ELDIN_TEAR_STAGES = new Set(['F_SP109', 'R_SP109', 'F_SP110', 'F_SP111']);
const LANAYRU_TEAR_STAGES = new Set(['F_SP112', 'F_SP113', 'F_SP115', 'F_SP116', 'F_SP121', 'F_SP122', 'F_SP123']);

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function achievementText(achievement: any) {
  return normalize(`${achievement?.Title ?? achievement?.title ?? ''} ${achievement?.Description ?? achievement?.description ?? ''}`);
}

function achievementType(achievement: any) {
  return normalize(achievement?.Type ?? achievement?.type ?? '');
}

export function isStoryProgressionAchievement(achievement: any) {
  const type = achievementType(achievement);
  return type === 'progression' || type === 'win_condition';
}

export function isAreaOpportunityAchievement(achievement: any) {
  if (isStoryProgressionAchievement(achievement)) return false;
  return achievementType(achievement) !== 'missable';
}

export type TwilightTearProvince = 'faron' | 'eldin' | 'lanayru';

export interface ActiveTearHunt {
  province: TwilightTearProvince;
  current: number;
  target: 16;
  achievement: any | null;
  chapter: TwilightStoryChapter;
}

function tearAchievementProvince(achievement: any): TwilightTearProvince | null {
  const text = achievementText(achievement);
  if (!/tears? of light|light essences?/.test(text)) return null;
  if (/faron/.test(text)) return 'faron';
  if (/eldin/.test(text)) return 'eldin';
  if (/lanayru/.test(text)) return 'lanayru';
  return null;
}

function tearCount(ram: TwilightStoryRamContext, province: TwilightTearProvince) {
  const value = Number(ram[`${province}Tears` as 'faronTears' | 'eldinTears' | 'lanayruTears']);
  return Number.isFinite(value) ? Math.max(0, Math.min(16, value)) : null;
}

function vesselOwned(ram: TwilightStoryRamContext, province: TwilightTearProvince) {
  return ram.storyFlags?.[`${province}VesselObtained`] === true;
}

function tearStageMatches(ram: TwilightStoryRamContext, province: TwilightTearProvince) {
  const stage = String(ram.stageCode || '').trim();
  if (province === 'faron') return FARON_TEAR_STAGES.has(stage);
  if (province === 'eldin') return ELDIN_TEAR_STAGES.has(stage);
  return LANAYRU_TEAR_STAGES.has(stage);
}

export function findActiveTearHunt(achievements: any[], ram?: TwilightStoryRamContext): ActiveTearHunt | null {
  if (!ram?.live) return null;

  const candidates: ReadonlyArray<readonly [TwilightTearProvince, string]> = [
    ['faron', '0306'],
    ['eldin', '0308'],
    ['lanayru', '0311'],
  ];

  for (const [province, chapterCode] of candidates) {
    const current = tearCount(ram, province);
    if (!vesselOwned(ram, province) || current === null || current >= 16 || !tearStageMatches(ram, province)) continue;
    const achievement = achievements.find((entry) => tearAchievementProvince(entry) === province && isStoryProgressionAchievement(entry))
      || achievements.find((entry) => tearAchievementProvince(entry) === province)
      || null;
    return {
      province,
      current,
      target: 16,
      achievement,
      chapter: CHAPTER_BY_CODE.get(chapterCode)!,
    };
  }

  return null;
}

export function resolveTwilightStoryChapter(ram?: TwilightStoryRamContext): TwilightStoryChapter | null {
  if (!ram?.live) return null;
  const stage = String(ram.stageCode || '').trim();

  for (const [prefix, chapterCode] of DUNGEON_CHAPTER_BY_STAGE_PREFIX) {
    if (stage.startsWith(prefix)) return CHAPTER_BY_CODE.get(chapterCode) || null;
  }

  const flags = ram.storyFlags || {};
  const faronTears = tearCount(ram, 'faron');
  const eldinTears = tearCount(ram, 'eldin');
  const lanayruTears = tearCount(ram, 'lanayru');
  const mirrorShards = Number(ram.mirrorShards ?? 0);

  if (vesselOwned(ram, 'faron') && faronTears !== null && faronTears < 16 && FARON_TEAR_STAGES.has(stage)) return CHAPTER_BY_CODE.get('0306') || null;
  if (vesselOwned(ram, 'eldin') && eldinTears !== null && eldinTears < 16 && ELDIN_TEAR_STAGES.has(stage)) return CHAPTER_BY_CODE.get('0308') || null;
  if (vesselOwned(ram, 'lanayru') && lanayruTears !== null && lanayruTears < 16 && LANAYRU_TEAR_STAGES.has(stage)) return CHAPTER_BY_CODE.get('0311') || null;

  if (stage === 'R_SP107' && !flags.forestTempleCleared) return CHAPTER_BY_CODE.get('0304') || null;
  if (stage === 'F_SP124') return CHAPTER_BY_CODE.get('0317') || null;
  if (stage === 'F_SP114') return CHAPTER_BY_CODE.get('0319') || null;
  if (stage === 'F_SP128' || stage === 'R_SP128') return CHAPTER_BY_CODE.get('0323') || null;
  if (stage === 'F_SP125') return CHAPTER_BY_CODE.get(mirrorShards >= 4 ? '0326' : '0318') || null;

  if (stage === 'F_SP117' || stage === 'F_SP127') {
    if (!flags.masterSwordObtained) return CHAPTER_BY_CODE.get('0314') || null;
    return CHAPTER_BY_CODE.get(mirrorShards >= 2 ? '0321' : '0315') || null;
  }

  if (stage === 'F_SP109' || stage === 'R_SP109' || stage === 'F_SP110' || stage === 'F_SP111') {
    if (!flags.returnedLightToEldin) return CHAPTER_BY_CODE.get('0308') || null;
    if (!flags.goronMinesCleared) return CHAPTER_BY_CODE.get('0308') || null;
    if (!flags.lanayruVesselObtained) return CHAPTER_BY_CODE.get('0310') || null;
    if (lanayruTears !== null && lanayruTears < 16) return CHAPTER_BY_CODE.get('0311') || null;
  }

  if (stage === 'F_SP108' || stage === 'R_SP108' || stage === 'D_SB10') {
    if (!flags.forestTempleCleared) return CHAPTER_BY_CODE.get(flags.faronVesselObtained ? '0306' : '0302') || null;
    if (flags.lakebedTempleCleared && !flags.masterSwordObtained) return CHAPTER_BY_CODE.get('0314') || null;
    if (flags.masterSwordObtained && mirrorShards >= 2) return CHAPTER_BY_CODE.get('0321') || null;
  }

  return null;
}

type MissableWindowRule = {
  stages?: readonly string[];
  stagePrefixes?: readonly string[];
  requireStoryAll?: readonly string[];
  forbidStoryAny?: readonly string[];
  requireStateAll?: readonly string[];
  forbidStateAny?: readonly string[];
  minTears?: Partial<Record<TwilightTearProvince, number>>;
  maxTears?: Partial<Record<TwilightTearProvince, number>>;
};

const MISSABLE_WINDOWS: Readonly<Record<string, MissableWindowRule>> = Object.freeze({
  'spank the monkey': { stagePrefixes: ['D_MN05B'] },
  "don't spit at dinner time": { stagePrefixes: ['D_MN05A'] },
  'no one could tame that horse': { stages: ['F_SP109'], requireStoryAll: ['returnedLightToEldin'], forbidStoryAny: ['eponaRecovered'] },
  "ordon't worry": { stages: ['F_SP00', 'F_SP103', 'R_SP01'], requireStoryAll: ['returnedLightToEldin'], forbidStoryAny: ['lanayruVesselObtained'] },
  "this does not bo'd well": { stages: ['R_SP01', 'F_SP103'], requireStoryAll: ['returnedLightToEldin'], forbidStoryAny: ['mayorBoSecondMatchDefeated'] },
  'this fight is boaring': { stages: ['F_SP109', 'F_SP121', 'F_SP122', 'F_SP123'], requireStoryAll: ['returnedLightToEldin'], forbidStoryAny: ['goronMinesCleared'], forbidStateAny: ['horsebackBattleCleared'] },
  'a bridge too far': { stages: ['F_SP121', 'F_SP122', 'F_SP123'], requireStoryAll: ['returnedLightToEldin'], forbidStoryAny: ['goronMinesCleared'], forbidStateAny: ['horsebackBattleCleared'] },
  'just roll with it': { stages: ['F_SP110'], requireStoryAll: ['returnedLightToEldin'], forbidStoryAny: ['goronMinesCleared'] },
  'you want sumo this': { stages: ['F_SP110', 'R_SP110'], requireStoryAll: ['returnedLightToEldin'], forbidStoryAny: ['goronMinesCleared'] },
  'armored goron guard': { stagePrefixes: ['D_MN04B'] },
  "you can't fyrus": { stagePrefixes: ['D_MN04A'] },
  'weight duel': { stagePrefixes: ['D_MN04A'] },
  'call me halo': { stages: ['F_SP109'], requireStoryAll: ['goronMinesCleared'] },
  'water under the bridge': { stages: ['F_SP115', 'F_SP121', 'F_SP122', 'F_SP123'], requireStoryAll: ['lanayruVesselObtained'], forbidStoryAny: ['lakebedTempleCleared'], minTears: { lanayru: 16 } },
  'jump on the bandwagon': { stages: ['F_SP115', 'F_SP121', 'F_SP122', 'F_SP123', 'F_SP109'], requireStoryAll: ['lanayruVesselObtained'], forbidStoryAny: ['lakebedTempleCleared'], minTears: { lanayru: 16 } },
  'adrenaline': { stagePrefixes: ['D_MN01B'] },
  "where do you think you're going": { stagePrefixes: ['D_MN01A'] },
  'my heart will go on': { stages: ['R_SP127'] },
  "on geno's side": { stages: ['F_SP117'] },
  "you've suffered a terrible fate haven't you": { stages: ['F_SP117'], forbidStoryAny: ['masterSwordObtained'] },
  'statue of limitations': { stages: ['F_SP117'], forbidStoryAny: ['masterSwordObtained'] },
  'hostile takeover': { stages: ['F_SP116', 'R_SP116', 'R_SP160'] },
  'the greatest adventurer of the 9th century': { stages: ['F_SP124'] },
  "it's not easy being green": { stages: ['F_SP124'] },
  'in the shadows of the abyss': { stagePrefixes: ['D_MN10B'] },
  'what a bonehead': { stagePrefixes: ['D_MN10A'] },
  'knights duel': { stagePrefixes: ['D_MN11B'] },
  'playing on the ice': { stagePrefixes: ['D_MN11A'] },
  "you hadn't forgotten about me": { stages: ['F_SP117'], requireStoryAll: ['masterSwordObtained'] },
  'duel of the titans': { stagePrefixes: ['D_MN06B'] },
  'a crushing defeat': { stagePrefixes: ['D_MN06A'] },
  'spider puree': { stagePrefixes: ['D_MN06A'] },
  "you're pretty good": { stages: ['F_SP128'] },
  "you're grounded": { stagePrefixes: ['D_MN07B'] },
  'dragon barbecue': { stagePrefixes: ['D_MN07A'] },
  'the deadly challenge': { stagePrefixes: ['D_MN08A', 'D_MN08B', 'D_MN08C'] },
  "it's like taking candy from a child": { stagePrefixes: ['D_MN08D'] },
  'he always did have an inflated opinion of himself': { stagePrefixes: ['D_MN08D'] },
  'if only link could learn that trick': { stagePrefixes: ['D_MN09', 'D_MN09B'] },
  "shot through the heart and you're to blame": { stagePrefixes: ['D_MN04'] },
  "your cheatin' heart will tell on you": { stagePrefixes: ['D_MN01'] },
  'owner of a lonely heart': { stagePrefixes: ['D_MN10'] },
  "you're playin' with the queen of hearts": { stagePrefixes: ['D_MN11'] },
  'heartbreaker dream maker love taker': { stagePrefixes: ['D_MN06'] },
  'heartbreaker dream maker love taker 25': { stagePrefixes: ['D_MN06'] },
  'kickstart my heart': { stagePrefixes: ['D_MN07'] },
  'total eclipse of my heart': { stagePrefixes: ['D_MN08'] },
  'cave of despair': { stagePrefixes: ['D_SB01'] },
  'heart of gold': { stagePrefixes: ['D_MN09'] },
});

export function missableStoryWindowDecision(achievement: any, ram?: TwilightStoryRamContext): boolean | null {
  if (!ram?.live) return null;
  const title = normalize(achievement?.Title ?? achievement?.title ?? '');
  const rule = MISSABLE_WINDOWS[title];
  if (!rule) return null;

  const stage = String(ram.stageCode || '').trim();
  if (rule.stages?.length && !rule.stages.includes(stage)) return false;
  if (rule.stagePrefixes?.length && !rule.stagePrefixes.some((prefix) => stage.startsWith(prefix))) return false;

  const story = ram.storyFlags || {};
  const state = ram.stateFlags || {};
  if (rule.requireStoryAll?.some((flag) => story[flag] !== true)) return false;
  if (rule.forbidStoryAny?.some((flag) => story[flag] === true)) return false;
  if (rule.requireStateAll?.some((flag) => state[flag] !== true)) return false;
  if (rule.forbidStateAny?.some((flag) => state[flag] === true)) return false;

  for (const [province, minimum] of Object.entries(rule.minTears || {})) {
    const current = tearCount(ram, province as TwilightTearProvince);
    if (current === null || current < Number(minimum)) return false;
  }
  for (const [province, maximum] of Object.entries(rule.maxTears || {})) {
    const current = tearCount(ram, province as TwilightTearProvince);
    if (current === null || current > Number(maximum)) return false;
  }

  return true;
}
