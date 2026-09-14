import type { TwilightAchievementState } from './twilightPrincessState';

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function earnedHardcore(achievement: any) {
  return Boolean(achievement?.DateEarnedHardcore || achievement?.dateEarnedHardcore);
}

export function isPendingFaronVesselObjective(achievement: any, ram?: Snapshot['ram']) {
  if (!ram?.attached || ram?.stale || ram.gameCode !== 'GZ2E01') return false;
  if (ram.storyFlags?.faronTwilightStarted !== true || ram.storyFlags?.faronVesselObtained === true) return false;
  if (earnedHardcore(achievement)) return false;
  const text = normalize(`${achievement?.Title ?? achievement?.title ?? ''} ${achievement?.Description ?? achievement?.description ?? ''}`);
  return /tears? of light/.test(text) && /return the light to faron/.test(text);
}

export function findPendingFaronVesselObjective(achievements: any[], ram?: Snapshot['ram']) {
  return achievements.find((achievement) => isPendingFaronVesselObjective(achievement, ram)) || null;
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
