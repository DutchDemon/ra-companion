const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const electronMainPath = path.join(root, 'app', 'electron', 'main.cjs');
const rendererMainPath = path.join(root, 'app', 'src', 'main.tsx');
const pagesPath = path.join(root, 'app', 'src', 'AppPages.tsx');
const globalTypesPath = path.join(root, 'app', 'src', 'global.d.ts');

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function write(file, value) {
  fs.writeFileSync(file, value, 'utf8');
}

function must(condition, message) {
  if (!condition) throw new Error(message);
}

function replaceOnce(source, search, replacement, message) {
  must(source.includes(search), message);
  return source.replace(search, replacement);
}

let electronMain = read(electronMainPath);

if (!electronMain.includes("require('./game-profiles/registry.cjs')")) {
  electronMain = replaceOnce(
    electronMain,
    "const { registerIpcHandlers } = require('./ipc/register.cjs');\n",
    "const { registerIpcHandlers } = require('./ipc/register.cjs');\nconst { detectProfileFromWindowTitle, resolveGameProfile, publicGameDescriptor } = require('./game-profiles/registry.cjs');\n",
    'Could not add Electron game-profile registry import.',
  );
}

electronMain = electronMain.replace("const TWILIGHT_PRINCESS_GAME_ID = 3934;\n", '');

const legacyWindowDetection = `        const title = data.title || '';
        const isTwilightPrincess = /twilight\\s+princess/i.test(title);
        resolve({
          running: true,
          supportedPlatform: true,
          title,
          pid: data.id || null,
          processName: data.processName || 'Dolphin',
          detectedGameId: isTwilightPrincess ? TWILIGHT_PRINCESS_GAME_ID : null,
        });`;
const profileWindowDetection = `        const title = data.title || '';
        const detectedProfile = detectProfileFromWindowTitle(title);
        resolve({
          running: true,
          supportedPlatform: true,
          title,
          pid: data.id || null,
          processName: data.processName || 'Dolphin',
          detectedGameId: detectedProfile?.raGameId ?? null,
          detectedProfileKey: detectedProfile?.key ?? null,
        });`;
if (electronMain.includes(legacyWindowDetection)) {
  electronMain = electronMain.replace(legacyWindowDetection, profileWindowDetection);
}

electronMain = electronMain.replace(
  'async function getRaProgress(gameId = TWILIGHT_PRINCESS_GAME_ID, force = false) {',
  'async function getRaProgress(gameId, force = false) {',
);

if (electronMain.includes('const ramDetectsTwilightPrincess = Boolean(')) {
  electronMain = electronMain.replace(
    /  const ramDetectsTwilightPrincess = Boolean\([\s\S]*?  const gameActive = Boolean\(dolphin\.running && gameId\);\n/,
    `  const detection = resolveGameProfile({ dolphin, ram });\n  const activeProfile = detection.profile;\n  const gameId = activeProfile?.raGameId ?? null;\n  const gameActive = Boolean(dolphin.running && activeProfile);\n`,
  );
}

if (electronMain.includes('const ramContextMarker =')) {
  electronMain = electronMain.replace(
    /  const ramContextMarker = [\s\S]*?  const hasLiveRamContext = Boolean\(ramPresenceMessage\);\n/,
    `  const ramPresenceMessage = activeProfile?.buildRamPresence?.(ram) || '';\n  const hasLiveRamContext = Boolean(ramPresenceMessage);\n`,
  );
}

const inactiveGameBlock = `      game: {
        id: null,
        profile: 'No game active',
        autoDetected: false,
        active: false,
      },`;
if (electronMain.includes(inactiveGameBlock)) {
  electronMain = electronMain.replace(inactiveGameBlock, '      game: publicGameDescriptor(null),');
}

if (electronMain.includes('profile: gameId === TWILIGHT_PRINCESS_GAME_ID')) {
  electronMain = electronMain.replace(
    /    game: \{\n      id: gameId,\n      profile: gameId === TWILIGHT_PRINCESS_GAME_ID \? 'The Legend of Zelda: Twilight Princess' : 'Unknown game',\n      autoDetected: Boolean\(dolphin\.detectedGameId \|\| ramDetectsTwilightPrincess\),\n      active: true,\n    \},/,
    '    game: publicGameDescriptor(activeProfile, detection.source),',
  );
}

must(electronMain.includes('resolveGameProfile({ dolphin, ram })'), 'Electron snapshot did not migrate to resolveGameProfile.');
must(electronMain.includes('publicGameDescriptor(activeProfile, detection.source)'), 'Electron snapshot did not expose profile descriptor.');
must(electronMain.includes('activeProfile?.buildRamPresence?.(ram)'), 'Electron RAM presence is not profile-owned.');
must(!electronMain.includes('TWILIGHT_PRINCESS_GAME_ID'), 'Twilight Princess game ID constant remains in Electron main.');
must(!electronMain.includes('ramDetectsTwilightPrincess'), 'Twilight Princess RAM detection remains in Electron main.');
must(!electronMain.includes('/twilight\\s+princess/i'), 'Twilight Princess title regex remains in Electron main.');

write(electronMainPath, electronMain);

let rendererMain = read(rendererMainPath);

const oldProfileImports = `import { buildTwilightContext, earnedHardcore, isFaronTearAchievement, isFaronTearObjectiveActive, isMissableAchievement } from './profiles/twilightPrincess';
import { getTwilightMissableGuide } from './profiles/twilightPrincessGuide';
import { buildTwilightAchievementStates, type TwilightAchievementState } from './profiles/twilightPrincessState';`;
const newProfileImports = `import {
  GAME_PROFILES,
  achievementCounterForProfile,
  buildProfileAchievementStates,
  buildProfileContext,
  earnedHardcore,
  getGameProfileByRaGameId,
  getGameProfileForRam,
  getProfileMissableGuide,
  getProfileRamPresence,
  getProfileSessionStats,
  isMissableForProfile,
  type AchievementCounter,
  type GameAchievementState,
  type RendererGameProfile,
} from './profiles/registry';`;
if (rendererMain.includes(oldProfileImports)) {
  rendererMain = rendererMain.replace(oldProfileImports, newProfileImports);
}

if (rendererMain.includes('function liveSessionStats(')) {
  rendererMain = rendererMain.replace(
    /function liveSessionStats\([\s\S]*?\nfunction useShortcutState\(\) \{/,
    `function liveSessionStats(ram: Snapshot['ram'] | undefined, profile: RendererGameProfile | null = getGameProfileForRam(ram)) {\n  return getProfileSessionStats(profile, ram);\n}\n\nfunction ramPresenceMessage(ram: Snapshot['ram'] | undefined, profile: RendererGameProfile | null = getGameProfileForRam(ram)) {\n  return getProfileRamPresence(profile, ram);\n}\n\nfunction useShortcutState() {`,
  );
}

if (rendererMain.includes('type AchievementCounter = {')) {
  rendererMain = rendererMain.replace(
    /type AchievementCounter = \{[\s\S]*?\nfunction OverlayAchievement\(/,
    `function achievementCounter(achievement: any, ram?: Snapshot['ram'], profile: RendererGameProfile | null = getGameProfileForRam(ram)): AchievementCounter | null {\n  return achievementCounterForProfile(profile, achievement, ram);\n}\n\nfunction OverlayAchievement(`,
  );
}

rendererMain = rendererMain.replaceAll('TwilightAchievementState', 'GameAchievementState');

const oldOverlayAchievementStart = `function OverlayAchievement({ achievement, ram, state }: { achievement: any; ram?: Snapshot['ram']; state?: GameAchievementState }) {
  const counter = state?.progress || achievementCounter(achievement, ram);
  const counterPct = counter ? Math.max(0, Math.min(100, (counter.current / counter.target) * 100)) : 0;
  const guide = getTwilightMissableGuide(achievement);`;
const newOverlayAchievementStart = `function OverlayAchievement({ achievement, ram, state, profile }: { achievement: any; ram?: Snapshot['ram']; state?: GameAchievementState; profile?: RendererGameProfile | null }) {
  const counter = state?.progress || achievementCounter(achievement, ram, profile || null);
  const counterPct = counter ? Math.max(0, Math.min(100, (counter.current / counter.target) * 100)) : 0;
  const guide = getProfileMissableGuide(profile, achievement);`;
if (rendererMain.includes(oldOverlayAchievementStart)) {
  rendererMain = rendererMain.replace(oldOverlayAchievementStart, newOverlayAchievementStart);
}

rendererMain = rendererMain.replace(
  "function OverlaySection({ kind, title, achievements, ram, states }: { kind: string; title: string; achievements: any[]; ram?: Snapshot['ram']; states?: Map<string, GameAchievementState> }) {",
  "function OverlaySection({ kind, title, achievements, ram, states, profile }: { kind: string; title: string; achievements: any[]; ram?: Snapshot['ram']; states?: Map<string, GameAchievementState>; profile?: RendererGameProfile | null }) {",
);
rendererMain = rendererMain.replace(
  '{achievements.map((achievement) => <OverlayAchievement key={achievementId(achievement)} achievement={achievement} ram={ram} state={states?.get(achievementId(achievement))} />)}',
  '{achievements.map((achievement) => <OverlayAchievement key={achievementId(achievement)} achievement={achievement} ram={ram} state={states?.get(achievementId(achievement))} profile={profile} />)}',
);

const legacyOverlayDetection = `  const liveRamDetectsGame = Boolean(
    liveRam?.attached &&
    !liveRam?.stale &&
    String(liveRam?.gameCode || '') === 'GZ2E01',
  );
  const gameActive = Boolean(snapshot?.game?.active || liveRamDetectsGame);
  const data = snapshot?.progress?.data;
  const achievements = useMemo(() => achievementArray(data), [data]);
  const serverPresenceMessage = snapshot?.presence?.ok && snapshot?.presence?.currentGameMatches ? snapshot.presence.message : '';
  const effectiveRam = liveRamDetectsGame ? liveRam : snapshot?.ram;
  const fastRamPresence = ramPresenceMessage(effectiveRam);`;
const profileOverlayDetection = `  const liveRamProfile = getGameProfileForRam(liveRam);
  const snapshotProfile = getGameProfileByRaGameId(snapshot?.game?.id);
  const activeProfile = snapshotProfile || liveRamProfile;
  const liveRamDetectsGame = Boolean(liveRamProfile);
  const gameActive = Boolean(snapshot?.game?.active || liveRamDetectsGame);
  const data = snapshot?.progress?.data;
  const achievements = useMemo(() => achievementArray(data), [data]);
  const serverPresenceMessage = snapshot?.presence?.ok && snapshot?.presence?.currentGameMatches ? snapshot.presence.message : '';
  const effectiveRam = liveRamProfile && (!snapshotProfile || liveRamProfile.key === activeProfile?.key) ? liveRam : snapshot?.ram;
  const fastRamPresence = ramPresenceMessage(effectiveRam, activeProfile);`;
if (rendererMain.includes(legacyOverlayDetection)) {
  rendererMain = rendererMain.replace(legacyOverlayDetection, profileOverlayDetection);
}

const legacyAppDetection = `  const liveRamDetectsGame = Boolean(
    liveRam?.attached &&
    !liveRam?.stale &&
    String(liveRam?.gameCode || '') === 'GZ2E01',
  );
  const gameActive = Boolean(snapshot?.game?.active || liveRamDetectsGame);
  const activeGameId = gameActive
    ? (Number(snapshot?.game?.id || (liveRamDetectsGame ? 3934 : 0)) || null)
    : null;
  const effectiveRam = liveRamDetectsGame ? liveRam : snapshot?.ram;
  const ramLive = Boolean(effectiveRam?.attached && !effectiveRam?.stale);
  const serverPresenceMessage = snapshot?.presence?.ok && snapshot?.presence?.currentGameMatches ? snapshot.presence.message : '';
  const fastRamPresence = ramPresenceMessage(effectiveRam);`;
const profileAppDetection = `  const liveRamProfile = getGameProfileForRam(liveRam);
  const snapshotProfile = getGameProfileByRaGameId(snapshot?.game?.id);
  const activeProfile = snapshotProfile || liveRamProfile;
  const liveRamDetectsGame = Boolean(liveRamProfile);
  const gameActive = Boolean(snapshot?.game?.active || liveRamDetectsGame);
  const activeGameId = gameActive
    ? (Number(snapshot?.game?.id || activeProfile?.raGameId || 0) || null)
    : null;
  const effectiveRam = liveRamProfile && (!snapshotProfile || liveRamProfile.key === activeProfile?.key) ? liveRam : snapshot?.ram;
  const ramLive = Boolean(effectiveRam?.attached && !effectiveRam?.stale);
  const serverPresenceMessage = snapshot?.presence?.ok && snapshot?.presence?.currentGameMatches ? snapshot.presence.message : '';
  const fastRamPresence = ramPresenceMessage(effectiveRam, activeProfile);`;
if (rendererMain.includes(legacyAppDetection)) {
  rendererMain = rendererMain.replace(legacyAppDetection, profileAppDetection);
}

rendererMain = rendererMain.replaceAll('buildTwilightContext(', 'buildProfileContext(activeProfile, ');
rendererMain = rendererMain.replaceAll('buildTwilightAchievementStates(', 'buildProfileAchievementStates(activeProfile, ');
rendererMain = rendererMain.replaceAll('liveSessionStats(effectiveRam)', 'liveSessionStats(effectiveRam, activeProfile)');
rendererMain = rendererMain.replaceAll('!isMissableAchievement(achievement)', '!isMissableForProfile(activeProfile, achievement)');

rendererMain = rendererMain.replaceAll('Boolean(getTwilightMissableGuide(a))', 'Boolean(getAchievementGuide(a, activeGameId))');
rendererMain = rendererMain.replaceAll('Boolean(getTwilightMissableGuide(achievement))', 'Boolean(getAchievementGuide(achievement, activeGameId))');
rendererMain = rendererMain.replace('const guide = getTwilightMissableGuide(selectedMissable);', 'const guide = getAchievementGuide(selectedMissable);');

const oldMissableFunctions = `  function isAchievementMissable(achievement: any, gameId?: number | null) {
    const type = String(achievement?.Type ?? achievement?.type ?? '').trim().toLowerCase();
    const numericGameId = Number(gameId ?? activeGameId ?? 0);
    return type === 'missable' || (numericGameId === 3934 && Boolean(getTwilightMissableGuide(achievement)));
  }

  function achievementListState(achievement: any, gameId?: number | null): GameAchievementState {
    const numericGameId = Number(gameId ?? activeGameId ?? 0);
    const isCurrent = Boolean(gameActive && activeGameId && numericGameId === Number(activeGameId));
    if (isCurrent && numericGameId === 3934) return missableState(achievement);`;
const newMissableFunctions = `  function getAchievementGuide(achievement: any, gameId?: number | null) {
    const directProfile = getGameProfileByRaGameId(Number(gameId ?? activeGameId ?? 0));
    if (directProfile) return getProfileMissableGuide(directProfile, achievement);
    for (const profile of GAME_PROFILES) {
      const guide = getProfileMissableGuide(profile, achievement);
      if (guide) return guide;
    }
    return null;
  }

  function isAchievementMissable(achievement: any, gameId?: number | null) {
    const numericGameId = Number(gameId ?? activeGameId ?? 0);
    const profile = getGameProfileByRaGameId(numericGameId);
    return isMissableForProfile(profile, achievement);
  }

  function achievementListState(achievement: any, gameId?: number | null): GameAchievementState {
    const numericGameId = Number(gameId ?? activeGameId ?? 0);
    const profile = getGameProfileByRaGameId(numericGameId);
    const isCurrent = Boolean(gameActive && activeGameId && numericGameId === Number(activeGameId));
    if (isCurrent && profile?.enhanced) return missableState(achievement);`;
if (rendererMain.includes(oldMissableFunctions)) {
  rendererMain = rendererMain.replace(oldMissableFunctions, newMissableFunctions);
}

rendererMain = rendererMain.replace(
  '    achievementLibrary,\n    libraryRefreshing,',
  '    achievementLibrary,\n    libraryRefreshing,',
);
rendererMain = rendererMain.replace(
  '    activeGameId,\n    isAchievementMissable,',
  '    activeGameId,\n    activeProfile,\n    getAchievementGuide,\n    isAchievementMissable,',
);

rendererMain = rendererMain.replaceAll('<OverlaySection kind="danger"', '<OverlaySection profile={activeProfile} kind="danger"');
rendererMain = rendererMain.replaceAll('<OverlaySection kind="current"', '<OverlaySection profile={activeProfile} kind="current"');
rendererMain = rendererMain.replaceAll('<OverlaySection kind="coming"', '<OverlaySection profile={activeProfile} kind="coming"');

rendererMain = rendererMain.replace(
  "? 'Waiting for RetroAchievements to report Twilight Princess as your active game.'",
  "? `Waiting for RetroAchievements to report ${activeProfile?.title || 'the current game'} as your active game.`",
);
rendererMain = rendererMain.replace(
  "'Start Twilight Princess in Dolphin and the companion will resume automatically.'",
  "'Start a supported game in Dolphin and the companion will resume automatically.'",
);
rendererMain = rendererMain.replace(
  "overlayStats.location || ramStage || 'Twilight Princess'",
  "overlayStats.location || ramStage || activeProfile?.title || snapshot?.game?.profile || 'Current game'",
);

must(rendererMain.includes("from './profiles/registry'"), 'Renderer did not migrate to the profile registry import.');
must(rendererMain.includes('const activeProfile = snapshotProfile || liveRamProfile;'), 'Renderer active profile selection is missing.');
must(rendererMain.includes('buildProfileContext(activeProfile,'), 'Renderer context is not profile-routed.');
must(rendererMain.includes('buildProfileAchievementStates(activeProfile,'), 'Renderer state engine is not profile-routed.');
must(!rendererMain.includes("from './profiles/twilightPrincess'"), 'Renderer still imports Twilight Princess context directly.');
must(!rendererMain.includes("from './profiles/twilightPrincessGuide'"), 'Renderer still imports Twilight Princess guide directly.');
must(!rendererMain.includes("from './profiles/twilightPrincessState'"), 'Renderer still imports Twilight Princess state directly.');
must(!rendererMain.includes("String(liveRam?.gameCode || '') === 'GZ2E01'"), 'Renderer still hardcodes the Twilight Princess game code in the app entrypoint.');
must(!rendererMain.includes('numericGameId === 3934'), 'Renderer still hardcodes the Twilight Princess RA game ID in list-state routing.');

write(rendererMainPath, rendererMain);

let pages = read(pagesPath);
pages = pages.replace("import { getTwilightMissableGuide } from './profiles/twilightPrincessGuide';\n", '');

pages = pages.replace(
  '    achievementListState,\n    effectiveRam,',
  '    achievementListState,\n    getAchievementGuide,\n    effectiveRam,',
);
pages = pages.replace(
  "  const hasGuide = Number(gameId ?? activeGameId ?? 0) === 3934 && Boolean(getTwilightMissableGuide(achievement));",
  '  const hasGuide = Boolean(getAchievementGuide(achievement, gameId));',
);
pages = pages.replace(
  '  const { missableState, setSelectedMissable } = useAppView();\n  const guide = getTwilightMissableGuide(achievement);',
  '  const { missableState, setSelectedMissable, getAchievementGuide } = useAppView();\n  const guide = getAchievementGuide(achievement);',
);
pages = pages.replaceAll(
  '    gameActive,\n    data,',
  '    gameActive,\n    activeProfile,\n    data,',
);
pages = pages.replace(
  "const heroTitle = gameActive ? (data?.Title || snapshot?.game?.profile || 'The Legend of Zelda: Twilight Princess') : 'No supported game detected';",
  "const heroTitle = gameActive ? (data?.Title || snapshot?.game?.profile || activeProfile?.title || 'Current game') : 'No supported game detected';",
);
pages = pages.replace(
  "<p>{gameActive ? 'GameCube · Hardcore achievement tracking' : 'Start Dolphin with Twilight Princess and RA Companion will attach automatically.'}</p>",
  "<p>{gameActive ? `${activeProfile?.platform || snapshot?.game?.platform || 'Game'} · Hardcore achievement tracking` : 'Start Dolphin with a supported game and RA Companion will attach automatically.'}</p>",
);
pages = pages.replace(
  "<span>Launch Twilight Princess in Dolphin. This panel will update automatically when live context becomes available.</span>",
  "<span>Launch a supported game in Dolphin. This panel will update automatically when live context becomes available.</span>",
);
pages = pages.replace(
  "<small>{gameActive ? 'Twilight Princess (GC · USA)' : 'Waiting for supported game'}</small>",
  "<small>{gameActive ? `${activeProfile?.title || snapshot?.game?.profile || 'Current game'}${activeProfile?.region ? ` · ${activeProfile.region}` : ''}` : 'Waiting for supported game'}</small>",
);
pages = pages.replace(
  "<h2>{gameActive ? (data?.Title || snapshot?.game?.profile || 'Twilight Princess') : 'No game active'}</h2>",
  "<h2>{gameActive ? (data?.Title || snapshot?.game?.profile || activeProfile?.title || 'Current game') : 'No game active'}</h2>",
);

must(!pages.includes("from './profiles/twilightPrincessGuide'"), 'AppPages still imports the Twilight Princess guide directly.');
must(!pages.includes('Number(gameId ?? activeGameId ?? 0) === 3934'), 'AppPages still hardcodes the Twilight Princess RA game ID.');
must(pages.includes('getAchievementGuide(achievement, gameId)'), 'AchievementRow is not guide-registry routed.');
write(pagesPath, pages);

let globalTypes = read(globalTypesPath);
if (!globalTypes.includes('detectedProfileKey?: string | null;')) {
  globalTypes = replaceOnce(
    globalTypes,
    '      detectedGameId: number | null;\n',
    '      detectedGameId: number | null;\n      detectedProfileKey?: string | null;\n',
    'Could not extend Dolphin snapshot profile metadata.',
  );
}
if (!globalTypes.includes('      key?: string | null;')) {
  globalTypes = replaceOnce(
    globalTypes,
    `    game: {
      id: number | null;
      profile: string;
      autoDetected: boolean;
      active: boolean;
    };`,
    `    game: {
      id: number | null;
      key?: string | null;
      profile: string;
      platform?: string;
      region?: string;
      enhanced?: boolean;
      detectionSource?: 'window-title' | 'ram' | 'ra-game-id' | 'none' | string;
      autoDetected: boolean;
      active: boolean;
    };`,
    'Could not extend game snapshot profile metadata.',
  );
}
write(globalTypesPath, globalTypes);

console.log('Applied v0.7 Game Profile Registry migration.');
