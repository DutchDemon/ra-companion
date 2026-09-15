from pathlib import Path

p = Path(__file__).resolve().parents[1] / 'app/src/profiles/twilightPrincess.ts'
text = p.read_bytes().decode('utf-8')
nl = '\r\n' if '\r\n' in text else '\n'
if nl != '\r\n':
    raise RuntimeError('Expected restored twilightPrincess.ts to use CRLF before patching')

def eol(s: str) -> str:
    return s.replace('\n', nl)

def rep(old: str, new: str, count: int = 1):
    global text
    old_e, new_e = eol(old), eol(new)
    actual = text.count(old_e)
    if actual != count:
        raise RuntimeError(f'expected {count}, found {actual}: {old[:100]!r}')
    text = text.replace(old_e, new_e)

rep(
    "export type PresenceKind = 'dungeon' | 'area' | 'building' | 'cave' | 'unknown';",
    "import {\n  findActiveTearHunt,\n  isAreaOpportunityAchievement,\n  isStoryProgressionAchievement,\n  missableStoryWindowDecision,\n  resolveTwilightStoryChapter,\n  type TwilightStoryChapter,\n} from './twilightPrincessStoryRoute';\n\nexport type PresenceKind = 'dungeon' | 'area' | 'building' | 'cave' | 'unknown';",
)
rep(
    "  storyFlags?: Record<string, boolean>;\n  stateFlags?: Record<string, boolean>;",
    "  storyFlags?: Record<string, boolean>;\n  stateFlags?: Record<string, boolean>;\n  faronTears?: number | null;\n  eldinTears?: number | null;\n  lanayruTears?: number | null;\n  fusedShadows?: number | null;\n  mirrorShards?: number | null;",
)
rep(
    "  missables: any[];\n  current: any[];\n  comingUp: any[];\n  source: ContextSource;",
    "  missables: any[];\n  current: any[];\n  comingUp: any[];\n  areaOpportunities: any[];\n  storyChapter: TwilightStoryChapter | null;\n  source: ContextSource;",
)
rep(
    "function liveRuleAllowsAchievement(achievement: any, ramBeat?: RamBeatContext) {\n  if (!ramBeat?.live) return true;\n  const rule = MISSABLE_CONTEXT_RULES[achievementTitle(achievement)];",
    "function liveRuleAllowsAchievement(achievement: any, ramBeat?: RamBeatContext) {\n  if (!ramBeat?.live) return true;\n  const storyWindowDecision = missableStoryWindowDecision(achievement, ramBeat);\n  if (storyWindowDecision !== null) return storyWindowDecision;\n  const rule = MISSABLE_CONTEXT_RULES[achievementTitle(achievement)];",
)
rep(
    "function isProgressionAchievement(achievement: any) {\n  const type = achievementType(achievement);\n  return type === 'progression' || type === 'win_condition';\n}",
    "function isProgressionAchievement(achievement: any) {\n  return isStoryProgressionAchievement(achievement);\n}",
)
rep(
    "export function buildTwilightContext(achievements: any[], presenceMessage: string, ramBeat?: RamBeatContext): ContextBuckets {\n  const context = parseTwilightPresence(presenceMessage);\n  const route = buildStoryRoute(achievements);\n  const strictRamBeat = Boolean(ramBeat?.live && ramBeat?.stageCode);",
    "export function buildTwilightContext(achievements: any[], presenceMessage: string, ramBeat?: RamBeatContext): ContextBuckets {\n  const context = parseTwilightPresence(presenceMessage);\n  const route = buildStoryRoute(achievements);\n  const strictRamBeat = Boolean(ramBeat?.live && ramBeat?.stageCode);\n  const storyChapter = resolveTwilightStoryChapter(ramBeat);\n  const activeTearHunt = findActiveTearHunt(achievements, ramBeat);",
)
rep(
    "          const tearObjectiveScore = strictRamBeat && isFaronTearObjectiveRelevant(achievement, ramBeat) ? 500 : 0;\n          return { achievement, score: Math.max(baseScore, liveRuleScore, tearObjectiveScore) };",
    "          const guideTearScore = strictRamBeat && activeTearHunt?.achievement === achievement ? 700 : 0;\n          const legacyFaronTearScore = strictRamBeat && isFaronTearObjectiveRelevant(achievement, ramBeat) ? 500 : 0;\n          return { achievement, score: Math.max(baseScore, liveRuleScore, guideTearScore, legacyFaronTearScore) };",
)
rep(
    "  let current: any[] = [];\n  let comingUp: any[] = [];\n  let rpMissables: any[] = [];",
    "  let current: any[] = [];\n  let comingUp: any[] = [];\n  let areaOpportunities: any[] = [];\n  let rpMissables: any[] = [];",
)
rep(
    "    const used = new Set([...bossRelated, ...rpMissables]);\n    current = rpLocked.filter((achievement) => !used.has(achievement)).slice(0, 3);\n    // In strict RAM mode keep the nearest same-dungeon boss missable visible as",
    "    const used = new Set([...bossRelated, ...rpMissables]);\n    const contextualOrdinary = rpLocked.filter((achievement) => !used.has(achievement));\n    current = strictRamBeat\n      ? contextualOrdinary.filter((achievement) => isProgressionAchievement(achievement)).slice(0, 2)\n      : contextualOrdinary.slice(0, 3);\n    areaOpportunities = strictRamBeat\n      ? contextualOrdinary.filter((achievement) => isAreaOpportunityAchievement(achievement)).slice(0, 3)\n      : [];\n    // In strict RAM mode keep the nearest same-dungeon boss missable visible as",
)
rep(
    "  // During the Faron Tear hunt the Vessel achievement is the story objective.\n  // Keep missables in their own warning section, but do not mix unrelated\n  // location matches into the Current Story Beat slot.\n  if (activeFaronTearObjectives.length) {\n    current = activeFaronTearObjectives.slice(0, 1);\n  } else if (upcomingFaronTearObjectives.length) {\n    comingUp = upcomingFaronTearObjectives.slice(0, 1);\n  }",
    "  // Tear hunts are explicit walkthrough story phases. Once the matching Vessel\n  // is owned, the province Tear achievement becomes Current Story Beat regardless\n  // of other optional achievements which happen to mention the same area.\n  if (activeTearHunt?.achievement && !earnedHardcore(activeTearHunt.achievement)) {\n    current = [activeTearHunt.achievement];\n    areaOpportunities = areaOpportunities.filter((achievement) => achievement !== activeTearHunt.achievement);\n  } else if (activeFaronTearObjectives.length) {\n    current = activeFaronTearObjectives.slice(0, 1);\n  } else if (upcomingFaronTearObjectives.length) {\n    comingUp = upcomingFaronTearObjectives.slice(0, 1);\n  }",
)
rep(
    "  const relevantAll = uniqueAchievements([...rpRelevant, ...missables, ...current, ...comingUp]);",
    "  const relevantAll = uniqueAchievements([...rpRelevant, ...missables, ...current, ...comingUp, ...areaOpportunities]);",
)
rep(
    "    missables,\n    current,\n    comingUp,\n    source,\n    routeLabel: route.routeLabel,",
    "    missables,\n    current,\n    comingUp,\n    areaOpportunities,\n    storyChapter,\n    source,\n    routeLabel: storyChapter ? `Guide ${storyChapter.code} · ${storyChapter.title}` : route.routeLabel,",
)

p.write_bytes(text.encode('utf-8'))
print('CRLF-safe Twilight Princess story route reapplied')
