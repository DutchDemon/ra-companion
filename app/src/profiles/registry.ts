import {
  earnedHardcore,
  isFaronTearAchievement,
  isFaronTearObjectiveActive,
  isMissableAchievement,
} from './twilightPrincess';
import { buildTwilightStoryAwareContext } from './twilightPrincessStoryContext';
import { getTwilightMissableGuide } from './twilightPrincessGuide';
import { buildTwilightAchievementStates, type TwilightAchievementState } from './twilightPrincessState';

export type GameAchievementState = TwilightAchievementState;

export type AchievementCounter = {
  current: number;
  target: number;
  label: string;
  source: 'rcheevos' | 'ram' | 'ra';
  text?: string;
};

export type GameSessionStats = {
  live: boolean;
  location: string;
  form: string;
  hearts: string;
  poeSouls: string;
  goldenBugs: string;
  contextStat: string;
};

export type RendererGameProfile = {
  key: string;
  raGameId: number;
  title: string;
  platform: string;
  region: string;
  enhanced: boolean;
  gameCodes: readonly string[];
  matchesRam: (ram?: Snapshot['ram']) => boolean;
  buildContext: (achievements: any[], presenceMessage: string, options: any) => any;
  buildAchievementStates: (achievements: any[], ram: Snapshot['ram'] | undefined, companion: any) => Map<string, GameAchievementState>;
  getMissableGuide: (achievement: any) => any;
  isMissableAchievement: (achievement: any) => boolean;
  getSessionStats: (ram?: Snapshot['ram']) => GameSessionStats;
  getRamPresence: (ram?: Snapshot['ram']) => string;
  getRamCounter: (achievement: any, ram?: Snapshot['ram']) => AchievementCounter | null;
};

function firstFiniteNumber(...values: any[]) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function explicitTargetFromText(text: string, nounPattern: RegExp) {
  const noun = `(?:${nounPattern.source})`;
  const match = text.match(new RegExp(`(?:collect|find|obtain|have|get|all)\\s+(?:all\\s+)?(\\d+)\\s+${noun}`, 'i'))
    || text.match(new RegExp(`(\\d+)\\s+${noun}`, 'i'));
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function runtimeMeasuredAchievementCounter(achievement: any, runtimeLive?: RuntimeObserverLiveState): AchievementCounter | null {
  if (!runtimeLive?.active || runtimeLive.stale) return null;
  const achievementId = Number(achievement?.ID ?? achievement?.id ?? 0);
  if (!Number.isInteger(achievementId) || achievementId <= 0) return null;
  const status = runtimeLive.statuses?.find((item) => Number(item?.achievementId || 0) === achievementId);
  if (!status?.measured) return null;
  const current = Number(status.measuredValue);
  const target = Number(status.measuredTarget);
  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) return null;
  return {
    current: Math.max(0, Math.min(current, target)),
    target,
    label: 'RA measured',
    source: 'rcheevos',
    text: String(status.measuredText || '').trim(),
  };
}

function measuredAchievementCounter(achievement: any): AchievementCounter | null {
  const measuredCurrent = firstFiniteNumber(
    achievement?.MeasuredProgress,
    achievement?.measuredProgress,
    achievement?.MeasuredValue,
    achievement?.measuredValue,
  );
  const measuredTarget = firstFiniteNumber(
    achievement?.MeasuredTarget,
    achievement?.measuredTarget,
    achievement?.Target,
    achievement?.target,
  );
  if (measuredCurrent !== null && measuredTarget !== null && measuredTarget > 0) {
    return {
      current: Math.max(0, measuredCurrent),
      target: measuredTarget,
      label: 'Progress',
      source: 'ra',
    };
  }
  return null;
}

function twilightSessionStats(ram?: Snapshot['ram']): GameSessionStats {
  const live = Boolean(ram?.attached && !ram?.stale && ram?.mapped && ram?.gameCode === 'GZ2E01');
  const location = live ? String(ram?.stageName || ram?.stageCode || '').trim() : '';
  const form = ram?.linkForm === 'wolf' ? 'Wolf Link' : ram?.linkForm === 'human' ? 'Human Link' : 'Unknown';
  const hearts = typeof ram?.currentHearts === 'number' && typeof ram?.maxHearts === 'number' ? `${ram.currentHearts}/${ram.maxHearts}` : '—';
  const poeSouls = typeof ram?.poeSouls === 'number' ? `${ram.poeSouls}/60` : '—';
  const goldenBugs = typeof ram?.goldenBugs === 'number' ? `${ram.goldenBugs}/24` : '—';
  const stageCode = String(ram?.stageCode || '').trim();
  const faronTearsActive = ['F_SP108', 'R_SP108', 'D_SB10'].includes(stageCode)
    && ram?.storyFlags?.faronVesselObtained === true
    && typeof ram?.faronTears === 'number';
  const contextStat = faronTearsActive
    ? `Tears of Light ${Math.max(0, Math.min(16, Number(ram?.faronTears || 0)))}/16`
    : typeof ram?.fusedShadows === 'number' && ram.fusedShadows > 0 && ram.fusedShadows < 4
      ? `Fused Shadows ${ram.fusedShadows}/4`
      : typeof ram?.mirrorShards === 'number' && ram.mirrorShards > 0 && ram.mirrorShards < 4
        ? `Mirror Shards ${ram.mirrorShards}/4`
        : '';
  return { live, location, form, hearts, poeSouls, goldenBugs, contextStat };
}

function twilightRamPresence(ram?: Snapshot['ram']) {
  const stats = twilightSessionStats(ram);
  if (!stats.live) return '';
  const marker = ram?.kind === 'dungeon' ? '🏰' : ram?.kind === 'area' ? '🗺️' : ram?.kind === 'building' ? '🏠' : ram?.kind === 'cave' ? '🕳️' : '';
  if (!marker || !stats.location) return '';
  const formMarker = ram?.linkForm === 'wolf' ? '🐺Link' : ram?.linkForm === 'human' ? '🧝Link' : 'Link';
  return [
    formMarker,
    `${marker}${stats.location}${ram?.boss ? ` ☠️${String(ram.boss).trim()}` : ''}`,
    stats.hearts !== '—' ? `❤️${stats.hearts}` : '',
    stats.poeSouls !== '—' ? `👻${stats.poeSouls}` : '',
    stats.goldenBugs !== '—' ? `🐜${stats.goldenBugs}` : '',
    stats.contextStat ? `· ${stats.contextStat}` : '',
  ].filter(Boolean).join(' ');
}

function twilightRamCounter(achievement: any, ram?: Snapshot['ram']): AchievementCounter | null {
  if (!ram?.attached || ram?.stale) return null;

  const title = String(achievement?.Title ?? achievement?.title ?? '');
  const description = String(achievement?.Description ?? achievement?.description ?? '');
  const text = `${title} ${description}`;

  if (/poe\s*souls?|poes?\b/i.test(text)) {
    const target = explicitTargetFromText(text, /poe\s*souls?|poes?/i);
    if (target && typeof ram.poeSouls === 'number') {
      return { current: Math.min(Math.max(0, ram.poeSouls), target), target, label: 'Poe Souls', source: 'ram' };
    }
  }

  if (/golden\s+bugs?|bugs?\b/i.test(text)) {
    const target = explicitTargetFromText(text, /(?:golden\s+)?bugs?/i);
    if (target && typeof ram.goldenBugs === 'number') {
      return { current: Math.min(Math.max(0, ram.goldenBugs), target), target, label: 'Golden Bugs', source: 'ram' };
    }
  }

  if (/fused\s+shadows?/i.test(text)) {
    const target = explicitTargetFromText(text, /fused\s+shadows?/i);
    if (target && typeof ram.fusedShadows === 'number') {
      return { current: Math.min(Math.max(0, ram.fusedShadows), target), target, label: 'Fused Shadows', source: 'ram' };
    }
  }

  if (/mirror(?:\s+of\s+twilight)?\s+(?:shards?|fragments?|pieces?)/i.test(text)) {
    const target = explicitTargetFromText(text, /mirror(?:\s+of\s+twilight)?\s+(?:shards?|fragments?|pieces?)/i);
    if (target && typeof ram.mirrorShards === 'number') {
      return { current: Math.min(Math.max(0, ram.mirrorShards), target), target, label: 'Mirror Shards', source: 'ram' };
    }
  }

  if (/tears?\s+of\s+light/i.test(text)) {
    if (isFaronTearAchievement(achievement) && !isFaronTearObjectiveActive(achievement, {
      live: true,
      stageCode: ram.stageCode,
      storyFlags: ram.storyFlags,
    })) return null;

    const target = explicitTargetFromText(text, /tears?\s+of\s+light/i);
    const regionValue = /faron/i.test(text) ? ram.faronTears : /eldin/i.test(text) ? ram.eldinTears : /lanayru/i.test(text) ? ram.lanayruTears : null;
    if (target && typeof regionValue === 'number') {
      return { current: Math.min(Math.max(0, regionValue), target), target, label: 'Tears of Light', source: 'ram' };
    }
  }

  if (/game\s+overs?/i.test(text)) {
    const target = explicitTargetFromText(text, /game\s+overs?/i);
    if (target && typeof ram.gameOvers === 'number') {
      return { current: Math.min(Math.max(0, ram.gameOvers), target), target, label: 'Game Overs', source: 'ram' };
    }
  }

  return null;
}

const TWILIGHT_PRINCESS_GAME_CODES: readonly string[] = Object.freeze(['GZ2E01']);

export const TWILIGHT_PRINCESS_PROFILE: RendererGameProfile = Object.freeze({
  key: 'twilight-princess-gc-us',
  raGameId: 3934,
  title: 'The Legend of Zelda: Twilight Princess',
  platform: 'GameCube',
  region: 'USA',
  enhanced: true,
  gameCodes: TWILIGHT_PRINCESS_GAME_CODES,
  matchesRam(ram) {
    return Boolean(ram?.attached && !ram?.stale && TWILIGHT_PRINCESS_GAME_CODES.includes(String(ram?.gameCode || '').trim()));
  },
  buildContext: buildTwilightStoryAwareContext,
  buildAchievementStates: buildTwilightAchievementStates,
  getMissableGuide: getTwilightMissableGuide,
  isMissableAchievement,
  getSessionStats: twilightSessionStats,
  getRamPresence: twilightRamPresence,
  getRamCounter: twilightRamCounter,
});

export const GAME_PROFILES: readonly RendererGameProfile[] = Object.freeze([
  TWILIGHT_PRINCESS_PROFILE,
]);

export function getGameProfileByRaGameId(gameId?: number | null) {
  const numericGameId = Number(gameId);
  if (!Number.isFinite(numericGameId) || numericGameId <= 0) return null;
  return GAME_PROFILES.find((profile) => profile.raGameId === numericGameId) || null;
}

export function getGameProfileForRam(ram?: Snapshot['ram']) {
  return GAME_PROFILES.find((profile) => profile.matchesRam(ram)) || null;
}

export function getProfileMissableGuide(profile: RendererGameProfile | null | undefined, achievement: any) {
  return profile?.getMissableGuide?.(achievement) || null;
}

export function isMissableForProfile(profile: RendererGameProfile | null | undefined, achievement: any) {
  const type = String(achievement?.Type ?? achievement?.type ?? '').trim().toLowerCase();
  return type === 'missable' || Boolean(profile?.isMissableAchievement?.(achievement)) || Boolean(getProfileMissableGuide(profile, achievement));
}

export function buildProfileContext(profile: RendererGameProfile | null | undefined, achievements: any[], presenceMessage: string, options: any) {
  if (profile?.buildContext) return profile.buildContext(achievements, presenceMessage, options);
  return {
    context: { label: '', kind: '', boss: null },
    missables: [],
    current: [],
    comingUp: [],
    areaOpportunities: [],
    storyChapter: null,
    relevantAll: [],
    routeLabel: presenceMessage ? 'RetroAchievements context' : 'Game context',
  };
}

export function buildProfileAchievementStates(profile: RendererGameProfile | null | undefined, achievements: any[], ram: Snapshot['ram'] | undefined, companion: any) {
  if (profile?.buildAchievementStates) return profile.buildAchievementStates(achievements, ram, companion);
  return new Map<string, GameAchievementState>();
}

export function getProfileSessionStats(profile: RendererGameProfile | null | undefined, ram?: Snapshot['ram']): GameSessionStats {
  if (profile?.getSessionStats) return profile.getSessionStats(ram);
  return { live: false, location: '', form: 'Unknown', hearts: '—', poeSouls: '—', goldenBugs: '—', contextStat: '' };
}

export function getProfileRamPresence(profile: RendererGameProfile | null | undefined, ram?: Snapshot['ram']) {
  return profile?.getRamPresence?.(ram) || '';
}

export function achievementCounterForProfile(profile: RendererGameProfile | null | undefined, achievement: any, ram?: Snapshot['ram'], runtimeLive?: RuntimeObserverLiveState): AchievementCounter | null {
  return runtimeMeasuredAchievementCounter(achievement, runtimeLive)
    || measuredAchievementCounter(achievement)
    || profile?.getRamCounter?.(achievement, ram)
    || null;
}

export { earnedHardcore };
