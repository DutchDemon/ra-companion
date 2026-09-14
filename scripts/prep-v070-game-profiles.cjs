const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'app', 'src', 'main.tsx');
let source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

const oldBlock = `  function isAchievementMissable(achievement: any, gameId?: number | null) {
    const type = String(achievement?.Type ?? achievement?.type ?? '').trim().toLowerCase();
    const numericGameId = Number(gameId ?? activeGameId ?? 0);
    return type === 'missable' || (numericGameId === 3934 && Boolean(getTwilightMissableGuide(achievement)));
  }

  function achievementListState(achievement: any, gameId?: number | null): TwilightAchievementState {
    const numericGameId = Number(gameId ?? activeGameId ?? 0);
    const isCurrent = Boolean(gameActive && activeGameId && numericGameId === Number(activeGameId));
    if (isCurrent && numericGameId === 3934) return missableState(achievement);`;

const newBlock = `  function getAchievementGuide(achievement: any, gameId?: number | null) {
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

if (source.includes(oldBlock)) {
  source = source.replace(oldBlock, newBlock);
} else if (!source.includes('function getAchievementGuide(achievement: any, gameId?: number | null)')) {
  throw new Error('Could not find achievement routing block to migrate.');
}

// Normalize the state-engine call before the main migration. The source has
// moved between formatter layouts over time; a regex keeps this step stable
// while still requiring the final migration to verify the profile boundary.
source = source.replace(
  /\bbuildTwilightAchievementStates\s*\(/g,
  'buildProfileAchievementStates(activeProfile, ',
);

if (!source.includes('buildProfileAchievementStates(activeProfile,')) {
  throw new Error('Could not route the achievement state engine through the active profile.');
}

fs.writeFileSync(file, source, 'utf8');
console.log('Prepared profile-aware achievement routing and state engine.');
