import type { TwilightAchievementState } from './twilightPrincessState';

export const FARON_TEAR_ACHIEVEMENT_ID = 416987;
export const FARON_PREVIOUS_STORY_ACHIEVEMENT_ID = 398928;

const FARON_ROUTE_STAGES = new Set(['R_SP107', 'F_SP102', 'F_SP108', 'R_SP108', 'D_SB10']);

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function achievementId(achievement: any) {
  return Number(achievement?.ID ?? achievement?.id ?? 0) || 0;
}

function earnedHardcore(achievement: any) {
  return Boolean(achievement?.DateEarnedHardcore || achievement?.dateEarnedHardcore);
}

function isFaronTearAchievement(achievement: any) {
  if (achievementId(achievement) === FARON_TEAR_ACHIEVEMENT_ID) return true;
  const text = normalize(`${achievement?.Title ?? achievement?.title ?? ''} ${achievement?.Description ?? achievement?.description ?? ''}`);
  return /you unlock this door with the key of imagination/.test(text)
    || (/tears? of light/.test(text) && /return the light to faron/.test(text));
}

function routeHasReachedFaronTwilight(achievements: any[], ram?: Snapshot['ram']) {
  if (!ram) return false;
  if (ram.storyFlags?.faronTwilightStarted === true) return true;
  if (FARON_ROUTE_STAGES.has(String(ram.stageCode || '').trim())) return true;
  return achievements.some((achievement) => achievementId(achievement) === FARON_PREVIOUS_STORY_ACHIEVEMENT_ID && earnedHardcore(achievement));
}

export function isPendingFaronVesselObjective(achievement: any, ram?: Snapshot['ram'], achievements: any[] = [achievement]) {
  if (!ram?.attached || ram?.stale || ram.gameCode !== 'GZ2E01') return false;
  if (!isFaronTearAchievement(achievement) || earnedHardcore(achievement)) return false;
  if (ram.storyFlags?.faronVesselObtained === true) return false;
  if (ram.storyFlags?.forestTempleEntered === true || ram.storyFlags?.forestTempleCleared === true) return false;
  return routeHasReachedFaronTwilight(achievements, ram);
}

export function findPendingFaronVesselObjective(achievements: any[], ram?: Snapshot['ram']) {
  const target = achievements.find((achievement) => achievementId(achievement) === FARON_TEAR_ACHIEVEMENT_ID)
    || achievements.find((achievement) => isFaronTearAchievement(achievement));
  if (!target) return null;
  return isPendingFaronVesselObjective(target, ram, achievements) ? target : null;
}

export function pendingFaronVesselState(): TwilightAchievementState {
  return {
    kind: 'upcoming',
    label: 'Coming soon · Obtain the Vessel of Light',
    tone: 'upcoming',
    source: 'ram',
    coverage: 'deep',
    detail: 'Obtain the Faron Vessel of Light to begin the Tear hunt.',
  };
}
