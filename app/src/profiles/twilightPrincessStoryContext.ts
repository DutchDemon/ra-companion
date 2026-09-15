import { buildTwilightContext } from './twilightPrincess';
import { getTwilightMissableGuide } from './twilightPrincessGuide';
import {
  findActiveTearHunt,
  isAreaOpportunityAchievement,
  isStoryProgressionAchievement,
  missableStoryWindowDecision,
  resolveTwilightStoryChapter,
  type TwilightStoryRamContext,
} from './twilightPrincessStoryRoute';

function earnedHardcore(achievement: any) {
  return Boolean(achievement?.DateEarnedHardcore || achievement?.dateEarnedHardcore);
}

function achievementId(achievement: any) {
  return String(achievement?.ID ?? achievement?.id ?? achievement?.Title ?? achievement?.title ?? '');
}

function achievementType(achievement: any) {
  return String(achievement?.Type ?? achievement?.type ?? '').trim().toLowerCase();
}

function isMissable(achievement: any) {
  return achievementType(achievement) === 'missable' || Boolean(getTwilightMissableGuide(achievement));
}

function unique(items: any[]) {
  const seen = new Set<string>();
  return items.filter((achievement) => {
    const id = achievementId(achievement);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function storyWindowAllows(achievement: any, ram?: TwilightStoryRamContext) {
  const decision = missableStoryWindowDecision(achievement, ram);
  return decision !== false;
}

/**
 * Walkthrough-aware post-processing layer for the legacy TP selector.
 *
 * The existing selector remains responsible for location/Rich Presence matching.
 * This layer adds chronology: true progression stays in Current/Next Story Beat,
 * optional location matches move to Area Opportunity, and curated missables are
 * suppressed until their real one-time story window is open.
 */
export function buildTwilightStoryAwareContext(
  achievements: any[],
  presenceMessage: string,
  ram?: TwilightStoryRamContext & Record<string, any>,
) {
  const base = buildTwilightContext(achievements, presenceMessage, ram as any);
  if (!ram?.live) {
    return {
      ...base,
      areaOpportunities: [],
      storyChapter: null,
    };
  }

  const storyChapter = resolveTwilightStoryChapter(ram);
  const activeTearHunt = findActiveTearHunt(achievements, ram);

  let missables = base.missables
    .filter((achievement: any) => !earnedHardcore(achievement))
    .filter((achievement: any) => storyWindowAllows(achievement, ram));

  // A missable which the legacy selector placed in Coming Up is still too early
  // when its curated story window says false. It must not leak into Next Story Beat.
  let comingUp = base.comingUp
    .filter((achievement: any) => !earnedHardcore(achievement))
    .filter((achievement: any) => !isMissable(achievement))
    .filter((achievement: any) => isStoryProgressionAchievement(achievement));

  const contextualOptional = base.current
    .filter((achievement: any) => !earnedHardcore(achievement))
    .filter((achievement: any) => !isMissable(achievement))
    .filter((achievement: any) => isAreaOpportunityAchievement(achievement));

  let current = base.current
    .filter((achievement: any) => !earnedHardcore(achievement))
    .filter((achievement: any) => isStoryProgressionAchievement(achievement));

  // The walkthrough defines each Vessel/Tear hunt as the active main-story phase.
  // This is intentionally stronger than a Kakariko/Faron/Lanayru text match.
  if (activeTearHunt?.achievement && !earnedHardcore(activeTearHunt.achievement)) {
    current = [activeTearHunt.achievement];
    comingUp = comingUp.filter((achievement: any) => achievementId(achievement) !== achievementId(activeTearHunt.achievement));
  }

  const currentIds = new Set(current.map(achievementId));
  const missableIds = new Set(missables.map(achievementId));
  const areaOpportunities = unique(contextualOptional)
    .filter((achievement: any) => !currentIds.has(achievementId(achievement)))
    .filter((achievement: any) => !missableIds.has(achievementId(achievement)))
    .slice(0, 3);

  comingUp = unique(comingUp)
    .filter((achievement: any) => !currentIds.has(achievementId(achievement)))
    .slice(0, 1);
  missables = unique(missables).slice(0, 3);

  const relevantAll = unique([
    ...missables,
    ...current,
    ...comingUp,
    ...areaOpportunities,
  ]);

  return {
    ...base,
    missables,
    current,
    comingUp,
    areaOpportunities,
    storyChapter,
    relevantAll,
    routeLabel: storyChapter
      ? `Guide ${storyChapter.code} · ${storyChapter.title}`
      : base.routeLabel,
  };
}
