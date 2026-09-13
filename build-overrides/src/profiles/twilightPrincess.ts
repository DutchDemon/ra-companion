export type PresenceKind = 'dungeon' | 'area' | 'building' | 'cave' | 'unknown';

export interface TwilightPresenceContext {
  raw: string;
  label: string;
  kind: PresenceKind;
  boss: string;
  linkForm: 'human' | 'wolf' | 'unknown';
}

export interface RamBeatContext {
  live?: boolean;
  stageCode?: string;
  stageName?: string;
  room?: number | null;
  linkForm?: 'human' | 'wolf' | 'unknown';
  playerControl?: boolean | null;
  inCutscene?: boolean | null;
  minigameId?: number | null;
  areaEntranceId?: number | null;
  roomBuildingId?: number | null;
  grottoId?: number | null;
  storyFlags?: Record<string, boolean>;
}

export type ContextSource = 'rich-presence' | 'story-route' | 'hybrid' | 'none';

export interface ContextBuckets {
  context: TwilightPresenceContext;
  relevantAll: any[];
  missables: any[];
  current: any[];
  comingUp: any[];
  source: ContextSource;
  routeLabel: string;
}

type DungeonRule = {
  keywords: string[];
  bosses: string[];
};

const DUNGEON_RULES: Record<string, DungeonRule> = {
  'forest temple': {
    keywords: ['forest temple', 'gale boomerang', 'ook', 'diababa'],
    bosses: ['ook', 'diababa'],
  },
  'goron mines': {
    keywords: ['goron mines', 'hero\'s bow', 'heros bow', 'dangoro', 'fyrus'],
    bosses: ['dangoro', 'fyrus'],
  },
  'lakebed temple': {
    keywords: ['lakebed temple', 'obtain the clawshot', 'deku toad', 'morpheel'],
    bosses: ['deku toad', 'morpheel'],
  },
  "arbiter's grounds": {
    keywords: ["arbiter's grounds", 'arbiters grounds', 'spinner', 'death sword', 'stallord'],
    bosses: ['death sword', 'stallord'],
  },
  'snowpeak ruins': {
    keywords: ['snowpeak ruins', 'ball and chain', 'darkhammer', 'blizzeta'],
    bosses: ['darkhammer', 'blizzeta'],
  },
  'temple of time': {
    keywords: ['temple of time', 'dominion rod', 'armogohma'],
    bosses: ['armogohma'],
  },
  'city in the sky': {
    keywords: ['city in the sky', 'double clawshot', 'double clawshots', 'aeralfos', 'argorok'],
    bosses: ['aeralfos', 'argorok'],
  },
  'palace of twilight': {
    keywords: ['palace of twilight', 'zant'],
    bosses: ['zant'],
  },
  'hyrule castle': {
    keywords: ['hyrule castle', 'ganondorf', 'ganon', 'king bulblin'],
    bosses: ['king bulblin', 'ganondorf', 'ganon'],
  },
};

// Do not collapse early Twilight Hyrule Castle into the late-game Hyrule Castle dungeon.
// They are separate story beats and share only part of their name.
const CONTEXT_ALIASES: Record<string, string> = {};

const CONTEXT_SYNONYMS: Record<string, string[]> = {
  'twilight hyrule castle': ['dark hyrule castle'],
};

type StoryBeatRule = {
  titles?: string[];
  terms?: string[];
};

// RAM strict-mode rules. A beat with an explicit rule is allow-list only.
// More beats can be added room-by-room as we validate them in live play.
const STORY_BEAT_RULES: Record<string, StoryBeatRule> = {
  'R_SP107': {
    titles: ['what happened here'],
    terms: ['dark hyrule castle'],
  },
};

// Small safety net for older/odd API payloads. v0.3.1 primarily trusts RA's official `type: missable` field.
const MANUAL_MISSABLE_TITLES = new Set([
  'doing anything for money',
  'what happened here',
]);

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

type MissableContextRule = {
  requiredForm?: 'human' | 'wolf';
  stages?: string[];
  requireFlagsAll?: string[];
  forbidFlagsAny?: string[];
  minigameIds?: number[];
};

// v0.4.4: live relevance gates for missables that are especially easy to show
// at the wrong time when only location/display-order context is used. The keys
// are normalized RA achievement titles. Unknown missables still use the strict
// stage/boss filtering below, so this table can grow safely over time.
const MISSABLE_CONTEXT_RULES: Record<string, MissableContextRule> = {
  'buzz off': {
    requiredForm: 'human',
    stages: ['F_SP103'],
    forbidFlagsAny: ['faronTwilightStarted'],
  },
  'smiling politely': {
    requiredForm: 'human',
    stages: ['F_SP103'],
    forbidFlagsAny: ['faronTwilightStarted'],
  },
  'link is the goat': {
    requiredForm: 'human',
    stages: ['F_SP00', 'F_SP103'],
  },
  'doing anything for money': {
    requiredForm: 'human',
    stages: ['F_SP103', 'R_SP01'],
    forbidFlagsAny: ['galeBoomerangObtained'],
  },
  "i'm just winging it": {
    requiredForm: 'human',
    stages: ['F_SP108'],
    forbidFlagsAny: ['faronTwilightStarted', 'trillPunishedEvildoers'],
  },
  'you herd me': {
    requiredForm: 'human',
    stages: ['F_SP00'],
    minigameIds: [2],
  },
  'what happened here': {
    requiredForm: 'wolf',
    stages: ['R_SP107'],
  },
  'no one could tame that horse': {
    requiredForm: 'human',
    stages: ['F_SP109'],
    requireFlagsAll: ['returnedLightToEldin'],
    forbidFlagsAny: ['eponaRecovered'],
  },
  "ordon't worry": {
    requiredForm: 'human',
    stages: ['F_SP00', 'F_SP103', 'R_SP01'],
    requireFlagsAll: ['returnedLightToEldin'],
    forbidFlagsAny: ['lanayruVesselObtained'],
  },
  "this does not bo'd well": {
    requiredForm: 'human',
    stages: ['F_SP103', 'R_SP01'],
    requireFlagsAll: ['returnedLightToEldin'],
    forbidFlagsAny: ['mayorBoSecondMatchDefeated'],
  },
  'just roll with it': {
    requiredForm: 'human',
    stages: ['F_SP110'],
    requireFlagsAll: ['returnedLightToEldin'],
    forbidFlagsAny: ['goronMinesCleared'],
  },
  'you want sumo this': {
    requiredForm: 'human',
    stages: ['F_SP110', 'R_SP110'],
    requireFlagsAll: ['returnedLightToEldin'],
  },
  'call me halo': {
    requiredForm: 'human',
    stages: ['F_SP109'],
    requireFlagsAll: ['goronMinesCleared', 'maloArcheryInProgress'],
  },
};

function liveRuleAllowsAchievement(achievement: any, ramBeat?: RamBeatContext) {
  if (!ramBeat?.live) return true;
  const rule = MISSABLE_CONTEXT_RULES[achievementTitle(achievement)];
  if (!rule) return true;

  const stageCode = String(ramBeat.stageCode || '').trim();
  if (rule.requiredForm && ramBeat.linkForm !== rule.requiredForm) return false;
  if (rule.stages?.length && !rule.stages.includes(stageCode)) return false;

  const flags = ramBeat.storyFlags || {};
  if (rule.requireFlagsAll?.some((flag) => flags[flag] !== true)) return false;
  if (rule.forbidFlagsAny?.some((flag) => flags[flag] === true)) return false;

  if (rule.minigameIds?.length) {
    const minigameId = Number(ramBeat.minigameId);
    if (!Number.isFinite(minigameId) || !rule.minigameIds.includes(minigameId)) return false;
  }

  return true;
}

function canonicalContextLabel(value: unknown) {
  const normalized = normalize(value);
  return CONTEXT_ALIASES[normalized] || normalized;
}

function achievementText(achievement: any) {
  return normalize(`${achievement?.Title ?? achievement?.title ?? ''} ${achievement?.Description ?? achievement?.description ?? ''}`);
}

function achievementTitle(achievement: any) {
  return normalize(achievement?.Title ?? achievement?.title ?? '');
}

function achievementType(achievement: any) {
  return normalize(achievement?.type ?? achievement?.Type ?? '');
}

function displayOrder(achievement: any) {
  const value = Number(achievement?.DisplayOrder ?? achievement?.displayOrder);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

export function earnedHardcore(achievement: any) {
  return Boolean(achievement?.DateEarnedHardcore || achievement?.dateEarnedHardcore);
}

function extractPresenceValue(message: string, marker: string) {
  const start = message.indexOf(marker);
  if (start < 0) return '';
  const tail = message.slice(start + marker.length);
  const markers = ['🏰', '🗺️', '🏠', '🕳️', '☠️', '❤️', '👥', '🧿', '👻', '🐜', '💀', '🕙', '🧝', '🐺'];
  let end = tail.length;
  for (const next of markers) {
    const index = tail.indexOf(next);
    if (index >= 0 && index < end) end = index;
  }
  return tail.slice(0, end).trim();
}

export function parseTwilightPresence(message: string): TwilightPresenceContext {
  const raw = String(message || '').trim();
  const dungeon = extractPresenceValue(raw, '🏰');
  const area = extractPresenceValue(raw, '🗺️');
  const building = extractPresenceValue(raw, '🏠');
  const cave = extractPresenceValue(raw, '🕳️');
  const boss = extractPresenceValue(raw, '☠️');
  const linkForm = raw.includes('🐺') ? 'wolf' : raw.includes('🧝') ? 'human' : 'unknown';

  if (dungeon) return { raw, label: dungeon, kind: 'dungeon', boss, linkForm };
  if (area) return { raw, label: area, kind: 'area', boss, linkForm };
  if (building) return { raw, label: building, kind: 'building', boss, linkForm };
  if (cave) return { raw, label: cave, kind: 'cave', boss, linkForm };
  return { raw, label: '', kind: 'unknown', boss, linkForm };
}

export function isMissableAchievement(achievement: any) {
  if (achievementType(achievement) === 'missable') return true;
  const title = achievementTitle(achievement);
  if (MANUAL_MISSABLE_TITLES.has(title)) return true;

  // Legacy fallback only. The official RA type is the primary signal.
  const text = achievementText(achievement);
  return /\b(before|without|in a single session|under [0-9]|only allowing|without taking damage|without recovering|without getting hit|no damage|do not|don't)\b/.test(text);
}

function isProgressionAchievement(achievement: any) {
  const type = achievementType(achievement);
  return type === 'progression' || type === 'win_condition';
}

function scoreAchievement(achievement: any, context: TwilightPresenceContext) {
  if (!context.label) return 0;
  const text = achievementText(achievement);
  const location = canonicalContextLabel(context.label);
  const boss = normalize(context.boss);
  let score = 0;

  if (location && text.includes(location)) score += 100;
  for (const synonym of CONTEXT_SYNONYMS[location] || []) {
    if (text.includes(normalize(synonym))) score += 100;
  }
  if (boss && text.includes(boss)) score += 300;

  const rule = DUNGEON_RULES[location];
  if (rule) {
    for (const keyword of rule.keywords) {
      if (text.includes(normalize(keyword))) score += normalize(keyword) === location ? 0 : 80;
    }
  }

  if (score > 0 && isProgressionAchievement(achievement)) score += 25;
  if (score > 0 && isMissableAchievement(achievement)) score += 35;
  return score;
}

function referencesKnownBoss(achievement: any, context: TwilightPresenceContext) {
  const rule = DUNGEON_RULES[canonicalContextLabel(context.label)];
  if (!rule) return false;
  const text = achievementText(achievement);
  return rule.bosses.some((boss) => text.includes(normalize(boss)));
}

function knownBossOrder(achievement: any, context: TwilightPresenceContext) {
  const rule = DUNGEON_RULES[canonicalContextLabel(context.label)];
  if (!rule) return Number.MAX_SAFE_INTEGER;
  const text = achievementText(achievement);
  const index = rule.bosses.findIndex((boss) => text.includes(normalize(boss)));
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function referencesCurrentBoss(achievement: any, context: TwilightPresenceContext) {
  const boss = normalize(context.boss);
  return Boolean(boss && achievementText(achievement).includes(boss));
}

function ownedDungeonContexts(achievement: any) {
  const text = achievementText(achievement);
  const owners = new Set<string>();

  for (const [location, rule] of Object.entries(DUNGEON_RULES)) {
    const strongTerms = [location, ...rule.bosses, ...rule.keywords.filter((keyword) => normalize(keyword) !== normalize(location))];
    if (strongTerms.some((term) => term && text.includes(normalize(term)))) owners.add(location);
  }
  return owners;
}

function routeAchievementAllowedInContext(achievement: any, context: TwilightPresenceContext) {
  if (!context.label) return true;
  const location = canonicalContextLabel(context.label);
  const owners = ownedDungeonContexts(achievement);
  if (owners.size) return owners.has(location);

  // With a live mapped RAM context, do not inject an unrelated route missable just
  // because it happens to be nearby in RA display order. Direct location mentions
  // are still accepted. Unknown/unmapped contexts keep the old route fallback.
  const text = achievementText(achievement);
  if (text.includes(location)) return true;
  return false;
}

function strictBeatAchievementAllowed(achievement: any, context: TwilightPresenceContext, ramBeat?: RamBeatContext) {
  if (!ramBeat?.live || !ramBeat?.stageCode) return true;
  if (!liveRuleAllowsAchievement(achievement, ramBeat)) return false;

  const stageCode = String(ramBeat.stageCode).trim();
  const title = achievementTitle(achievement);
  const text = achievementText(achievement);
  const location = canonicalContextLabel(context.label);
  const explicit = STORY_BEAT_RULES[stageCode];

  if (explicit) {
    const titleMatch = (explicit.titles || []).some((allowed) => title === normalize(allowed));
    const termMatch = (explicit.terms || []).some((term) => text.includes(normalize(term)));
    return titleMatch || termMatch;
  }

  // Boss-stage codes are exact beats. Only the active boss challenge belongs here.
  if (context.boss) return referencesCurrentBoss(achievement, context);

  const dungeon = DUNGEON_RULES[location];
  if (dungeon) {
    // A boss achievement should not appear merely because the player is somewhere
    // in the same dungeon. The RAM reader exposes separate boss stages for that.
    if (referencesKnownBoss(achievement, context)) return false;

    if (text.includes(location)) return true;
    return dungeon.keywords
      .filter((keyword) => !dungeon.bosses.includes(keyword))
      .some((keyword) => text.includes(normalize(keyword)));
  }

  if (location && text.includes(location)) return true;
  return (CONTEXT_SYNONYMS[location] || []).some((term) => text.includes(normalize(term)));
}

function uniqueAchievements(items: any[]) {
  const seen = new Set<string>();
  return items.filter((achievement) => {
    const key = String(achievement?.ID ?? achievement?.id ?? achievementTitle(achievement));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Hardcore-safe route inference.
 *
 * RA Rich Presence is intentionally slow server-side. The TP set itself is ordered roughly along
 * story progression, and RA marks missables explicitly. We therefore use the last Hardcore-earned
 * progression achievement as a route frontier and keep nearby locked missables visible even when
 * Rich Presence is stale.
 */
function buildStoryRoute(achievements: any[]) {
  const sorted = [...achievements].sort((a, b) => displayOrder(a) - displayOrder(b));
  const progressionIndexes = sorted
    .map((achievement, index) => ({ achievement, index }))
    .filter(({ achievement }) => isProgressionAchievement(achievement));

  const earnedProgression = progressionIndexes.filter(({ achievement }) => earnedHardcore(achievement));
  const frontierIndex = earnedProgression.length
    ? Math.max(...earnedProgression.map(({ index }) => index))
    : -1;

  const nextProgressionEntry = progressionIndexes.find(({ achievement, index }) => index > frontierIndex && !earnedHardcore(achievement));
  const nextProgressionIndex = nextProgressionEntry?.index ?? Math.min(sorted.length - 1, frontierIndex + 18);

  // Keep a little history as well as look-ahead. Some TP missables expire shortly after a story
  // milestone, so being slightly noisy is safer than silently hiding a still-actionable missable.
  const start = Math.max(0, frontierIndex - 7);
  const end = Math.min(sorted.length, Math.max(nextProgressionIndex + 10, frontierIndex + 18));
  const window = sorted.slice(start, end + 1);

  let routeMissables = window.filter((achievement) => !earnedHardcore(achievement) && isMissableAchievement(achievement));

  // If the current display-order window has no missable, proactively show the next ones in route
  // order. This is deliberately conservative: a warning a little early is preferable to a miss.
  if (!routeMissables.length) {
    routeMissables = sorted
      .slice(Math.max(0, frontierIndex + 1))
      .filter((achievement) => !earnedHardcore(achievement) && isMissableAchievement(achievement))
      .slice(0, 2);
  }

  const lastProgression = earnedProgression.length ? earnedProgression[earnedProgression.length - 1]?.achievement : null;
  const routeLabel = lastProgression
    ? `After ${lastProgression?.Title ?? lastProgression?.title ?? 'last progression unlock'}`
    : 'Early-game route';

  return {
    missables: routeMissables.slice(0, 2),
    nextProgression: nextProgressionEntry?.achievement ? [nextProgressionEntry.achievement] : [],
    routeLabel,
  };
}

export function buildTwilightContext(achievements: any[], presenceMessage: string, ramBeat?: RamBeatContext): ContextBuckets {
  const context = parseTwilightPresence(presenceMessage);
  const route = buildStoryRoute(achievements);
  const strictRamBeat = Boolean(ramBeat?.live && ramBeat?.stageCode);

  const scored = context.label
    ? achievements
        .map((achievement) => ({ achievement, score: scoreAchievement(achievement, context) }))
        .filter((item) => item.score > 0 && (!strictRamBeat || strictBeatAchievementAllowed(item.achievement, context, ramBeat)))
        .sort((a, b) => b.score - a.score || Number(b.achievement?.Points ?? b.achievement?.points ?? 0) - Number(a.achievement?.Points ?? a.achievement?.points ?? 0))
    : [];

  const hardcoreEarnedTitles = new Set(achievements.filter(earnedHardcore).map(achievementTitle));
  const boomerangMissableExpired = hardcoreEarnedTitles.has('windy warrior') || normalize(context.boss) === 'diababa';
  const rpRelevant = scored
    .map((item) => item.achievement)
    .filter((achievement) => !(achievementTitle(achievement) === 'doing anything for money' && boomerangMissableExpired));
  const rpLocked = rpRelevant.filter((achievement) => !earnedHardcore(achievement));

  let current: any[] = [];
  let comingUp: any[] = [];
  let rpMissables: any[] = [];

  if (context.label && context.boss) {
    current = rpLocked.filter((achievement) => referencesCurrentBoss(achievement, context)).slice(0, 2);
    const otherBossAchievements = new Set(
      rpLocked.filter((achievement) => referencesKnownBoss(achievement, context) && !referencesCurrentBoss(achievement, context)),
    );
    const used = new Set([...current, ...otherBossAchievements]);
    rpMissables = rpLocked.filter((achievement) => !used.has(achievement) && isMissableAchievement(achievement)).slice(0, 1);
    rpMissables.forEach((achievement) => used.add(achievement));
    comingUp = rpLocked.filter((achievement) => !used.has(achievement)).slice(0, 1);
  } else if (context.label) {
    const bossRelated = rpLocked
      .filter((achievement) => referencesKnownBoss(achievement, context))
      .sort((a, b) => knownBossOrder(a, context) - knownBossOrder(b, context));
    rpMissables = rpLocked
      .filter((achievement) => !bossRelated.includes(achievement) && isMissableAchievement(achievement))
      .slice(0, 1);
    const used = new Set([...bossRelated, ...rpMissables]);
    current = rpLocked.filter((achievement) => !used.has(achievement)).slice(0, 3);
    comingUp = strictRamBeat ? [] : bossRelated.slice(0, 1);
  }

  const contextualRouteMissables = strictRamBeat
    ? []
    : context.label
      ? route.missables.filter((achievement) => routeAchievementAllowedInContext(achievement, context))
      : route.missables;

  const missables = uniqueAchievements([...rpMissables, ...contextualRouteMissables])
    .filter((achievement) => !earnedHardcore(achievement))
    .filter((achievement) => liveRuleAllowsAchievement(achievement, ramBeat))
    .slice(0, 2);

  const primaryUsed = new Set(uniqueAchievements([...missables, ...current]));
  comingUp = comingUp.filter((achievement) => !primaryUsed.has(achievement));
  const used = new Set(uniqueAchievements([...missables, ...current, ...comingUp]));

  // Live RAM used to suppress route.nextProgression entirely. That prevented useful
  // immediate story guidance (for example, showing the next main-story unlock while
  // the player is still completing the current beat). Re-enable exactly one *true*
  // progression/win-condition achievement as "Next Story Beat". Do not let missables,
  // boss challenges, collectibles, or other side achievements leak in through this path.
  const routeComingUp = route.nextProgression.filter((achievement) => {
    if (used.has(achievement) || earnedHardcore(achievement)) return false;
    if (!isProgressionAchievement(achievement) || isMissableAchievement(achievement)) return false;

    // If a progression achievement explicitly references a boss, it belongs to that
    // boss beat and should only appear once RAM says that boss is active.
    const owners = ownedDungeonContexts(achievement);
    const text = achievementText(achievement);
    const referencedBosses = Object.values(DUNGEON_RULES)
      .flatMap((rule) => rule.bosses)
      .filter((boss) => text.includes(normalize(boss)));
    if (referencedBosses.length && !referencesCurrentBoss(achievement, context)) return false;

    // In strict RAM mode, dungeon ownership alone is allowed for a real story progression
    // achievement: it is explicitly presented as "next", never as something to do now.
    // Non-progression dungeon challenges are already rejected above.
    void owners;
    return true;
  });
  comingUp = uniqueAchievements([...comingUp, ...routeComingUp]).slice(0, 1);

  const relevantAll = uniqueAchievements([...rpRelevant, ...missables, ...current, ...comingUp]);
  const source: ContextSource = context.label && (route.missables.length || route.nextProgression.length)
    ? 'hybrid'
    : context.label
      ? 'rich-presence'
      : (route.missables.length || route.nextProgression.length)
        ? 'story-route'
        : 'none';

  return {
    context,
    relevantAll,
    missables,
    current,
    comingUp,
    source,
    routeLabel: route.routeLabel,
  };
}
