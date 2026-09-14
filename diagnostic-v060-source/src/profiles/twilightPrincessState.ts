import { earnedHardcore, isFaronTearAchievement, isFaronTearObjectiveActive, isFaronTearObjectiveRelevant, isMissableAchievement, type ContextBuckets } from './twilightPrincess';

export type TwilightAchievementTone =
  | 'complete'
  | 'warning'
  | 'active'
  | 'upcoming'
  | 'danger'
  | 'neutral';

export type TwilightAchievementStateKind =
  | 'completed'
  | 'available'
  | 'in_progress'
  | 'upcoming'
  | 'missed'
  | 'ineligible'
  | 'pending'
  | 'tracked'
  | 'waiting';

export interface TwilightAchievementProgress {
  current: number;
  target: number;
  label: string;
  source: 'ram' | 'ra';
}

export interface TwilightAchievementState {
  kind: TwilightAchievementStateKind;
  label: string;
  tone: TwilightAchievementTone;
  source: 'ram' | 'context' | 'ra' | 'hybrid';
  detail?: string;
  progress?: TwilightAchievementProgress;
  coverage: 'deep' | 'counter' | 'context' | 'tracked';
}

export const TWILIGHT_GAME_STATE_ENGINE = 'tp-gz2e01-v3';

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

function achievementId(achievement: any) {
  return String(achievement?.ID ?? achievement?.id ?? achievement?.Title ?? achievement?.title ?? '');
}

function achievementTitle(achievement: any) {
  return normalize(achievement?.Title ?? achievement?.title ?? '');
}

function achievementText(achievement: any) {
  return normalize(`${achievement?.Title ?? achievement?.title ?? ''} ${achievement?.Description ?? achievement?.description ?? ''}`);
}

function firstFiniteNumber(...values: any[]) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function explicitTargetFromText(text: string, nounPattern: RegExp) {
  const match = text.match(new RegExp(`(?:collect|find|obtain|have|get|all)\\s+(?:all\\s+)?(\\d+)\\s+${nounPattern.source}`, 'i'))
    || text.match(new RegExp(`(\\d+)\\s+${nounPattern.source}`, 'i'));
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function ramCounter(achievement: any, ram?: Snapshot['ram']): TwilightAchievementProgress | null {
  const title = String(achievement?.Title ?? achievement?.title ?? '');
  const description = String(achievement?.Description ?? achievement?.description ?? '');
  const text = `${title} ${description}`;

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
    return { current: Math.max(0, measuredCurrent), target: measuredTarget, label: 'Progress', source: 'ra' };
  }

  if (!ram?.attached || ram?.stale || ram.gameCode !== 'GZ2E01') return null;

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
    // Faron Tears are a live objective only while the Faron Woods Tear hunt is
    // active. This prevents a stale 0-16 metric from following the player into
    // Forest Temple after the province story beat has moved on.
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

function state(
  kind: TwilightAchievementStateKind,
  label: string,
  tone: TwilightAchievementTone,
  source: TwilightAchievementState['source'],
  coverage: TwilightAchievementState['coverage'],
  detail?: string,
  progress?: TwilightAchievementProgress,
): TwilightAchievementState {
  return { kind, label, tone, source, coverage, detail, progress };
}

function deepStateForAchievement(achievement: any, ram?: Snapshot['ram']): TwilightAchievementState | null {
  if (!ram?.attached || ram?.stale || ram.gameCode !== 'GZ2E01') return null;
  const id = achievementId(achievement);
  const title = achievementTitle(achievement);
  const flags = ram.stateFlags || {};
  const story = ram.storyFlags || {};
  const stage = String(ram.stageCode || '');
  const human = ram.linkForm === 'human';

  const tearQuest = achievementText(achievement).match(/tears? of light.*return the light to (faron|eldin|lanayru)/i);
  if (tearQuest) {
    const province = tearQuest[1].toLowerCase() as 'faron' | 'eldin' | 'lanayru';
    const vesselOwned = Boolean(story[`${province}VesselObtained`]);
    const rawTears = province === 'faron' ? ram.faronTears : province === 'eldin' ? ram.eldinTears : ram.lanayruTears;
    const current = typeof rawTears === 'number' ? Math.min(Math.max(0, rawTears), 16) : 0;
    const progress = { current, target: 16, label: 'Tears of Light', source: 'ram' as const };

    if (province === 'faron' && !isFaronTearObjectiveRelevant(achievement, {
      live: true,
      stageCode: stage,
      storyFlags: story,
    })) {
      return null;
    }
    if (!vesselOwned) {
      return state('upcoming', 'Coming soon · Obtain the Vessel of Light', 'upcoming', 'ram', 'deep', `Obtain the ${province[0].toUpperCase()}${province.slice(1)} Vessel of Light to begin the Tear hunt.`, undefined);
    }
    if (province === 'faron' && !isFaronTearObjectiveActive(achievement, {
      live: true,
      stageCode: stage,
      storyFlags: story,
    })) {
      return null;
    }
    if (current >= 16) {
      return state('pending', `${current} / 16 Tears of Light`, 'active', 'ram', 'deep', `All 16 ${province[0].toUpperCase()}${province.slice(1)} Tears of Light are collected. Waiting for the RetroAchievements unlock if needed.`, progress);
    }
    return state('in_progress', `${current} / 16 Tears of Light`, 'active', 'ram', 'deep', `${province[0].toUpperCase()}${province.slice(1)} Vessel of Light obtained.`, progress);
  }

  if (id === '419985' || title === 'the hero of puppies') {
    const dog = ram.actors?.dog;
    if ((dog?.carried || 0) > 0) {
      return state('pending', 'Puppy in your arms', 'active', 'ram', 'deep', 'A live Dog actor is currently carried by Link. Waiting for the RetroAchievements unlock if needed.');
    }
    if ((dog?.currentRoom || 0) > 0) {
      return state('available', 'Puppy nearby', 'warning', 'ram', 'deep', `${dog?.currentRoom} puppy actor${dog?.currentRoom === 1 ? '' : 's'} detected in the current room.`);
    }
  }

  if (id === '419988' || title === "what's the matter mcfly chicken") {
    const cucco = ram.actors?.cucco;
    if ((cucco?.controlled || 0) > 0) {
      return state('pending', 'Cucco control active', 'active', 'ram', 'deep', 'A live Cucco actor is in ACTION_PLAY; the game has handed control to the Cucco.');
    }
    if ((cucco?.currentRoom || 0) > 0) {
      return state('available', 'Cucco nearby', 'warning', 'ram', 'deep', `${cucco?.currentRoom} Cucco actor${cucco?.currentRoom === 1 ? '' : 's'} detected in the current room.`);
    }
  }

  if (title === 'buzz off') {
    if (flags.buzzHanchAttackedByBees) {
      return state('pending', 'Condition triggered', 'active', 'ram', 'deep', 'Hanch has been attacked by the bees; waiting for the RA unlock if it has not arrived yet.');
    }
    if (flags.buzzHiveDroppedHawk || flags.buzzHiveDroppedSlingshot || story.faronTwilightStarted) {
      return state('missed', 'Missed on this save', 'danger', 'ram', 'deep', 'The hive was knocked down first or the opening Ordon opportunity has passed.');
    }
    if (stage === 'F_SP103' && human) return state('available', 'Available now', 'warning', 'ram', 'deep', 'The beehive is still intact in the opening Ordon state.');
    return state('upcoming', 'Upcoming', 'upcoming', 'ram', 'deep');
  }

  if (title === 'smiling politely') {
    if (flags.smilingPolitelyTriggered) return state('pending', 'Condition triggered', 'active', 'ram', 'deep', 'Jaggle has been angered by the pumpkin event.');
    if (story.faronTwilightStarted) return state('missed', 'Missed on this save', 'danger', 'ram', 'deep', 'The opening Jaggle setup is no longer available.');
    if (stage === 'F_SP103' && human) return state('available', 'Available now', 'warning', 'ram', 'deep');
    return state('upcoming', 'Upcoming', 'upcoming', 'ram', 'deep');
  }

  if (title === 'doing anything for money') {
    if (story.galeBoomerangObtained) return state('missed', 'Missed on this save', 'danger', 'ram', 'deep', 'The Gale Boomerang point of no return has been reached.');
    if ((stage === 'F_SP103' || stage === 'R_SP01') && human) return state('available', 'Available now', 'warning', 'ram', 'deep');
    return state('upcoming', 'Upcoming', 'upcoming', 'ram', 'deep');
  }

  if (id === '449436' || title === 'pump up the king') {
    const bottleItems = Array.isArray(ram.inventory) ? ram.inventory.slice(11, 15) : [];
    const bottleSlotPresent = bottleItems.some((item) => Number.isFinite(Number(item)) && Number(item) !== 0xff);
    const hasBottle = (typeof ram.bottleCount === 'number' && ram.bottleCount > 0) || bottleSlotPresent;
    const hasWaterBottle = bottleItems.some((item) => Number(item) === 0x67);
    const inVillage = stage === 'F_SP103';
    const nearOrdon = ['F_SP00', 'F_SP103', 'R_SP01'].includes(stage);

    if (inVillage && hasBottle) {
      if (ram.linkForm === 'wolf') {
        return state('available', 'Human form needed', 'warning', 'ram', 'deep', 'You own a bottle and are in Ordon Village. Return in human form, break an Ordon pumpkin and pour water on the new sprout.');
      }
      return state(
        'available',
        hasWaterBottle ? 'Ready now' : 'Available now',
        'warning',
        'ram',
        'deep',
        hasWaterBottle
          ? 'A bottle of water is ready. Break an Ordon pumpkin and pour the water on the new sprout.'
          : 'You own a bottle. Empty it if needed, fill it with water, then use the water on the sprout left by a broken Ordon pumpkin.',
      );
    }
    if (nearOrdon && hasBottle) {
      return state('available', 'Go to Ordon Village', 'active', 'ram', 'deep', 'Your bottle is detected. Head outside into Ordon Village, break a pumpkin and pour bottle water on the new sprout.');
    }
    if (inVillage) {
      return state('upcoming', 'Need a bottle', 'upcoming', 'ram', 'deep', 'Any bottle counts, even when it is currently filled.');
    }
  }

  if (title === 'link is the goat') {
    const current = Number(Boolean(flags.goatDay2Success)) + Number(Boolean(flags.goatDay3Success));
    const progress = { current, target: 2, label: 'Goat events', source: 'ram' as const };
    if (current >= 2) return state('pending', '2/2 conditions triggered', 'active', 'ram', 'deep', undefined, progress);
    if (story.faronTwilightStarted) return state('missed', `Missed · ${current}/2`, 'danger', 'ram', 'deep', 'One or both opening goat opportunities have passed.', progress);
    if (stage === 'F_SP00' || stage === 'F_SP103') return state('in_progress', `${current}/2 completed`, 'active', 'ram', 'deep', undefined, progress);
    return state('upcoming', `${current}/2 · Upcoming`, 'upcoming', 'ram', 'deep', undefined, progress);
  }

  if (title === "i'm just winging it") {
    if (story.trillPunishedEvildoers || flags.trillStealingAttackStarted) return state('pending', 'Event state triggered', 'active', 'ram', 'deep');
    if (story.faronTwilightStarted) return state('missed', 'Missed on this save', 'danger', 'ram', 'deep');
    if (stage === 'F_SP108' && human) return state('available', 'Available now', 'warning', 'ram', 'deep');
    return state('upcoming', 'Upcoming', 'upcoming', 'ram', 'deep');
  }

  if (title === "ordon't worry") {
    const pieces = [
      flags.ordonSeraPostKids,
      flags.ordonJagglePostKids,
      flags.ordonUliPostKids,
      flags.ordonFadoPostKids,
      flags.ordonPergiePostKids,
      flags.ordonHanchPostKids,
    ];
    const current = pieces.filter(Boolean).length;
    const progress = { current, target: 6, label: 'Villagers', source: 'ram' as const };
    if (current >= 6) return state('pending', '6/6 conversations done', 'active', 'ram', 'deep', undefined, progress);
    if (story.lanayruVesselObtained) return state('missed', `Missed · ${current}/6`, 'danger', 'ram', 'deep', 'Lanayru progression has passed the guide cutoff.', progress);
    if (story.returnedLightToEldin && ['F_SP00', 'F_SP103', 'R_SP01'].includes(stage)) {
      return state('in_progress', `${current}/6 villagers`, 'warning', 'ram', 'deep', undefined, progress);
    }
    return state('upcoming', `${current}/6 · Upcoming`, 'upcoming', 'ram', 'deep', undefined, progress);
  }

  if (title === 'no one could tame that horse') {
    if (story.eponaRecovered) return state('missed', 'Opportunity passed', 'danger', 'ram', 'deep');
    if (story.returnedLightToEldin && stage === 'F_SP109') return state('available', 'Available now', 'warning', 'ram', 'deep');
    return state('upcoming', 'Upcoming', 'upcoming', 'ram', 'deep');
  }

  if (title === "this does not bo'd well") {
    if (story.mayorBoSecondMatchDefeated) return state('missed', 'Opportunity passed', 'danger', 'ram', 'deep');
    if (story.returnedLightToEldin && ['F_SP103', 'R_SP01'].includes(stage)) return state('available', 'Available now', 'warning', 'ram', 'deep');
    return state('upcoming', 'Upcoming', 'upcoming', 'ram', 'deep');
  }

  if (title === 'call me halo') {
    if (story.goronMinesCleared && story.maloArcheryInProgress && stage === 'F_SP109') return state('available', 'Available now', 'warning', 'ram', 'deep');
    if (!story.goronMinesCleared) return state('upcoming', 'Upcoming', 'upcoming', 'ram', 'deep');
  }

  const challenge3Heart = new Set([
    "shot through the heart and you're to blame",
    "your cheatin' heart will tell on you",
    'owner of a lonely heart',
    "you're playin' with the queen of hearts",
    'heartbreaker dream maker love taker',
    'heartbreaker dream maker love taker 25',
    'kickstart my heart',
    'total eclipse of my heart',
    'cave of despair',
    'heart of gold',
  ]);
  if (challenge3Heart.has(title)) {
    const tooManyHearts = typeof ram.maxHearts === 'number' && ram.maxHearts > 3;
    const tooManyBottles = typeof ram.bottleCount === 'number' && ram.bottleCount > 1;
    const armorMatters = !new Set(["shot through the heart and you're to blame", "your cheatin' heart will tell on you"]).has(title);
    const armorInvalid = armorMatters && ram.magicArmorOwned === true;
    if (tooManyHearts || tooManyBottles || armorInvalid) {
      const reasons = [tooManyHearts ? `${ram.maxHearts} hearts` : '', tooManyBottles ? `${ram.bottleCount} bottles` : '', armorInvalid ? 'Magic Armor obtained' : ''].filter(Boolean);
      return state('ineligible', 'Not eligible on this save', 'danger', 'ram', 'deep', reasons.join(' · '));
    }
    return state('tracked', 'Challenge save eligible', 'neutral', 'ram', 'deep', '3 hearts / one bottle limits are still intact.');
  }

  return null;
}

export function testTwilightEventFlag(ram: Snapshot['ram'] | undefined, encoded: number, temporary = false) {
  const hex = String(temporary ? ram?.tempBitsHex || '' : ram?.eventBitsHex || '');
  if (hex.length < 512 || !Number.isFinite(encoded)) return false;
  const index = (encoded >>> 8) & 0xff;
  const mask = encoded & 0xff;
  const byte = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return Number.isFinite(byte) && (byte & mask) !== 0;
}

export function buildTwilightAchievementStates(
  achievements: any[],
  ram: Snapshot['ram'] | undefined,
  context: ContextBuckets,
) {
  const result = new Map<string, TwilightAchievementState>();
  const missableIds = new Set(context.missables.map(achievementId));
  const currentIds = new Set(context.current.map(achievementId));
  const comingIds = new Set(context.comingUp.map(achievementId));
  const relevantIds = new Set(context.relevantAll.map(achievementId));
  const liveUsa = Boolean(ram?.attached && !ram?.stale && ram?.gameCode === 'GZ2E01');

  for (const achievement of achievements) {
    const id = achievementId(achievement);
    if (!id) continue;

    if (earnedHardcore(achievement)) {
      result.set(id, state('completed', 'Completed', 'complete', 'ra', 'tracked'));
      continue;
    }

    const deep = deepStateForAchievement(achievement, ram);
    if (deep) {
      result.set(id, deep);
      continue;
    }

    const progress = ramCounter(achievement, ram);
    if (progress) {
      const completeByCounter = progress.current >= progress.target;
      result.set(id, completeByCounter
        ? state('pending', `${progress.current}/${progress.target} · Waiting for RA`, 'active', progress.source === 'ram' ? 'ram' : 'ra', 'counter', undefined, progress)
        : state('in_progress', `${progress.current}/${progress.target}`, 'active', progress.source === 'ram' ? 'ram' : 'ra', 'counter', undefined, progress));
      continue;
    }

    if (missableIds.has(id) || currentIds.has(id)) {
      result.set(id, state('available', 'Available now', isMissableAchievement(achievement) ? 'warning' : 'active', liveUsa ? 'hybrid' : 'context', 'context'));
      continue;
    }
    if (comingIds.has(id)) {
      result.set(id, state('upcoming', 'Coming soon', 'upcoming', liveUsa ? 'hybrid' : 'context', 'context'));
      continue;
    }
    if (relevantIds.has(id)) {
      result.set(id, state('available', 'Relevant now', 'active', liveUsa ? 'hybrid' : 'context', 'context'));
      continue;
    }

    if (liveUsa) {
      result.set(id, state('tracked', isMissableAchievement(achievement) ? 'Watching cutoff' : 'RAM tracked', 'neutral', 'ram', 'tracked'));
    } else {
      result.set(id, state('waiting', 'Waiting for game state', 'neutral', 'context', 'tracked'));
    }
  }

  return result;
}
