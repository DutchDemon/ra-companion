from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding='utf-8').replace('\r\n', '\n')


def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8', newline='\n')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Expected one match for {label}, found {count}')
    return text.replace(old, new, 1)


def sub_once(text, pattern, repl, label):
    updated, count = re.subn(pattern, repl, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'Expected one regex match for {label}, found {count}')
    return updated

# AppPages: remove dedicated live-progress cards. Per-achievement counters remain.
path = 'app/src/AppPages.tsx'
text = read(path)
text = sub_once(text, r'\nfunction LiveAchievementCounterList\([\s\S]*?\n\}\n\nexport function MissableRow', '\nexport function MissableRow', 'LiveAchievementCounterList')
text = text.replace('    liveAchievementCounters,\n', '')
text = sub_once(text, r'\n          \{gameActive && liveAchievementCounters\.length > 0 && \(\n            <div className="v7-session-counter-block">[\s\S]*?\n          \)\}', '', 'Dashboard live progress block')
text = sub_once(text, r'\n          \{gameActive && liveAchievementCounters\.length > 0 && \(\n            <article className="v5-panel v7-live-progress-panel">[\s\S]*?\n          \)\}', '', 'Current Game live progress block')
write(path, text)

# New isolated helper for the prerequisite that the strict TP context selector currently hides.
write('app/src/profiles/faronNextStep.ts', """import type { TwilightAchievementState } from './twilightPrincessState';

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\\s+/g, ' ')
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
""")

# main.tsx: remove redundant widgets and wire pre-Vessel fallback into both overlay and main page.
path = 'app/src/main.tsx'
text = read(path)
text = replace_once(text, "} from './profiles/registry';\nimport { AppViewContext, Dashboard, CurrentGamePage, AchievementsPage, OverlayPage, SettingsPage, UpdateBanner, UpdateCard } from './AppPages';\n", "} from './profiles/registry';\nimport { findPendingFaronVesselObjective, pendingFaronVesselState } from './profiles/faronNextStep';\nimport { AppViewContext, Dashboard, CurrentGamePage, AchievementsPage, OverlayPage, SettingsPage, UpdateBanner, UpdateCard } from './AppPages';\n", 'helper import')
text = sub_once(text, r'\ntype LiveAchievementCounterItem[\s\S]*?\nfunction OverlayAchievement', '\nfunction OverlayAchievement', 'dedicated counter selector helpers')
text = sub_once(text, r'\n  const liveAchievementCounters = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[achievements, companion, effectiveRam\?\.timestamp, runtimeLive\?\.lastFrameAt, runtimeLive\?\.stale\]\);', '', 'Overlay counter selector')
text = sub_once(text, r'\n        \{gameActive && liveAchievementCounters\.length > 0 && \([\s\S]*?\n        \)\}\n\n        \{!gameActive \? \(', '\n\n        {!gameActive ? (', 'Overlay live progress widget')
text = sub_once(text, r'\n        \{gameActive && ramLive && \(\n          <div className="v6-overlay-live-stats">[\s\S]*?\n        \)\}', '', 'Overlay stats strip')
text = sub_once(text, r'\n  const liveAchievementCounters = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[achievements, currentNextAchievements, relevantAchievements, companion\.context\.label, effectiveRam\?\.timestamp, effectiveRam\?\.stageName, runtimeLive\?\.lastFrameAt, runtimeLive\?\.stale\]\);', '', 'App counter selector')
text = text.replace('    liveAchievementCounters,\n', '')

state_block = """  const achievementStates = useMemo(
    () => buildProfileAchievementStates(activeProfile, achievements, effectiveRam, companion),
    [achievements, companion, effectiveRam?.timestamp, effectiveRam?.eventBitsHex, effectiveRam?.stateFlags, effectiveRam?.storyFlags, effectiveRam?.actors],
  );
"""
state_replacement = """  const pendingFaronVesselAchievement = useMemo(
    () => findPendingFaronVesselObjective(achievements, effectiveRam),
    [achievements, effectiveRam?.attached, effectiveRam?.stale, effectiveRam?.storyFlags?.faronTwilightStarted, effectiveRam?.storyFlags?.faronVesselObtained],
  );
  const achievementStates = useMemo(() => {
    const states = buildProfileAchievementStates(activeProfile, achievements, effectiveRam, companion);
    if (pendingFaronVesselAchievement) states.set(achievementId(pendingFaronVesselAchievement), pendingFaronVesselState());
    return states;
  }, [achievements, companion, pendingFaronVesselAchievement, effectiveRam?.timestamp, effectiveRam?.eventBitsHex, effectiveRam?.stateFlags, effectiveRam?.storyFlags, effectiveRam?.actors]);
"""
if text.count(state_block) != 2:
    raise SystemExit(f'Expected two achievement state blocks, found {text.count(state_block)}')
# Overlay block.
text = text.replace(state_block, state_replacement, 1)
text = replace_once(text, "  const contextIds = useMemo(() => new Set(companion.relevantAll.map(achievementId)), [companion.relevantAll]);\n", "  const contextIds = useMemo(() => new Set([\n    ...companion.relevantAll,\n    ...(pendingFaronVesselAchievement ? [pendingFaronVesselAchievement] : []),\n  ].map(achievementId)), [companion.relevantAll, pendingFaronVesselAchievement]);\n", 'Overlay context IDs')
text = replace_once(text, "  const contextTotal = companion.relevantAll.length + fallbackAchievements.length;\n", "  const contextTotal = new Set([\n    ...companion.relevantAll,\n    ...fallbackAchievements,\n    ...(pendingFaronVesselAchievement ? [pendingFaronVesselAchievement] : []),\n  ].map(achievementId)).size;\n", 'Overlay context total')
text = replace_once(text, "        ) : companion.relevantAll.length ? (\n", "        ) : companion.relevantAll.length || pendingFaronVesselAchievement ? (\n", 'Overlay fallback condition')
text = replace_once(text, "                <OverlaySection runtimeLive={runtimeLive} profile={activeProfile} kind=\"coming\" title=\"◉ Next Story Beat\" achievements={companion.comingUp} ram={effectiveRam} states={achievementStates} />\n", "                <OverlaySection runtimeLive={runtimeLive} profile={activeProfile} kind=\"coming\" title=\"◉ Next Story Beat\" achievements={pendingFaronVesselAchievement ? [pendingFaronVesselAchievement] : companion.comingUp} ram={effectiveRam} states={achievementStates} />\n", 'Overlay next beat')
text = replace_once(text, "                {!companion.missables.length && !companion.current.length && !companion.comingUp.length && !fallbackAchievements.length && !deepLiveAchievements.length && (\n", "                {!companion.missables.length && !companion.current.length && !companion.comingUp.length && !pendingFaronVesselAchievement && !fallbackAchievements.length && !deepLiveAchievements.length && (\n", 'Overlay clear-state guard')
# Main app block.
text = text.replace(state_block, state_replacement, 1)
text = replace_once(text, "  const relevantAchievements = uniqueAchievements([\n    ...deepLiveAchievements,\n", "  const relevantAchievements = uniqueAchievements([\n    ...(pendingFaronVesselAchievement ? [pendingFaronVesselAchievement] : []),\n    ...deepLiveAchievements,\n", 'main relevant fallback')
text = replace_once(text, "  const currentNextAchievements = uniqueAchievements([\n    ...deepLiveAchievements,\n", "  const currentNextAchievements = uniqueAchievements([\n    ...(pendingFaronVesselAchievement ? [pendingFaronVesselAchievement] : []),\n    ...deepLiveAchievements,\n", 'main next fallback')
write(path, text)

# Remove CSS only for UI that is no longer rendered.
path = 'app/src/styles.css'
text = read(path)
text = sub_once(text, r'\n\.v6-overlay-live-stats \{[\s\S]*?\n\}', '', 'overlay stats CSS')
marker = '/* v0.7.0 — live measured achievement counters */'
if marker not in text:
    raise SystemExit('Missing dedicated live counter CSS marker')
text = text[:text.index(marker)].rstrip() + '\n'
write(path, text)

# Counter contract: data and inline counters remain; dedicated panel is intentionally gone.
path = 'scripts/test-live-achievement-counters.cjs'
text = read(path)
old = """assert(renderer.includes('selectLiveAchievementCounters'), 'Live counter selection is missing.');
assert(renderer.includes(\"counter.source === 'rcheevos' ? 'RA measured · rcheevos'\"), 'Visible rcheevos counter provenance is missing.');
assert(renderer.includes('achievementCounter(achievement, ram, profile || null, runtimeLive) || state?.progress'), 'Overlay must prefer live rcheevos counters over older mapped progress.');
assert(pages.includes('LIVE ACHIEVEMENT PROGRESS'), 'Dashboard/Current Game live counter presentation is missing.');
assert(pages.includes('achievementCounter(achievement, isCurrentGame ? effectiveRam : undefined, isCurrentGame) || state.progress'), 'Achievement rows do not prefer live current-game counters.');
"""
new = """assert(!renderer.includes('selectLiveAchievementCounters'), 'Dedicated live counter widget selection should be removed.');
assert(!renderer.includes('v7-overlay-live-counters'), 'Dedicated overlay live-progress widget should be removed.');
assert(!pages.includes('LIVE ACHIEVEMENT PROGRESS'), 'Dedicated Dashboard/Current Game live-progress presentation should be removed.');
assert(renderer.includes('achievementCounter(achievement, ram, profile || null, runtimeLive) || state?.progress'), 'Relevant overlay achievements must still prefer live rcheevos counters over older mapped progress.');
assert(pages.includes('achievementCounter(achievement, isCurrentGame ? effectiveRam : undefined, isCurrentGame) || state.progress'), 'Achievement rows must still prefer live current-game counters.');
"""
text = replace_once(text, old, new, 'counter contract')
write(path, text)

# Focused regression test.
write('app/src/__tests__/v071.ui-context-cleanup.test.ts', """import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findPendingFaronVesselObjective, isPendingFaronVesselObjective, pendingFaronVesselState } from '../profiles/faronNextStep';

function achievement(id: number, title: string, description: string, earned = false) {
  return { ID: id, Title: title, Description: description, Type: 'progression', DisplayOrder: id, Points: 5, ...(earned ? { DateEarnedHardcore: '2026-09-14 20:00:00' } : {}) };
}

describe('v0.7.1 UI cleanup and Faron prerequisite fallback', () => {
  it('finds the Faron Tear progression before the Vessel is owned and stops after it is obtained', () => {
    const previous = achievement(100, 'Courage Need Not Be Remembered', 'Previous story achievement', true);
    const tears = achievement(101, 'You Unlock This Door with the Key of Imagination', 'Collect all the Tears of Light and return the light to Faron');
    const ram: any = { attached: true, stale: false, gameCode: 'GZ2E01', stageCode: 'F_SP102', storyFlags: { faronTwilightStarted: true, faronVesselObtained: false } };

    expect(isPendingFaronVesselObjective(tears, ram)).toBe(true);
    expect(findPendingFaronVesselObjective([previous, tears], ram)?.Title).toBe('You Unlock This Door with the Key of Imagination');
    expect(pendingFaronVesselState().label).toBe('Coming soon · Obtain the Vessel of Light');
    expect(findPendingFaronVesselObjective([previous, tears], { ...ram, storyFlags: { faronTwilightStarted: true, faronVesselObtained: true } } as any)).toBeNull();
  });

  it('removes redundant widgets while retaining inline achievement counters and next-step wiring', () => {
    const root = path.resolve(__dirname, '..', '..');
    const renderer = fs.readFileSync(path.join(root, 'src/main.tsx'), 'utf8');
    const pages = fs.readFileSync(path.join(root, 'src/AppPages.tsx'), 'utf8');
    const styles = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');

    expect(renderer).not.toContain('v6-overlay-live-stats');
    expect(renderer).not.toContain('v7-overlay-live-counters');
    expect(pages).not.toContain('LIVE ACHIEVEMENT PROGRESS');
    expect(styles).not.toContain('.v6-overlay-live-stats');
    expect(styles).not.toContain('.v7-overlay-live-counters');
    expect(renderer).toContain('findPendingFaronVesselObjective');
    expect(renderer).toContain('pendingFaronVesselAchievement ? [pendingFaronVesselAchievement] : companion.comingUp');
    expect(renderer).toContain('achievementCounter(achievement, ram, profile || null, runtimeLive) || state?.progress');
    expect(pages).toContain('achievementCounter(achievement, isCurrentGame ? effectiveRam : undefined, isCurrentGame) || state.progress');
  });
});
""")

print('Final v0.7.1 patch applied')
