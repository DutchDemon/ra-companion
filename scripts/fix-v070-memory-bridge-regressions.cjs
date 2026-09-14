const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

// This migration is intentionally idempotent: CI runs it before every validation
// build until the validated renderer/profile changes are promoted to source.
function patchFile(filePath, broken, fixed, label) {
  let source = fs.readFileSync(filePath, 'utf8');
  if (source.includes(fixed)) {
    console.log(`${label} already applied.`);
    return;
  }
  if (source.includes(broken)) {
    source = source.replace(broken, fixed);
    fs.writeFileSync(filePath, source);
    console.log(`Applied ${label}.`);
    return;
  }
  throw new Error(`Could not find expected source for ${label}: ${filePath}`);
}

const mainPath = path.join(root, 'app', 'src', 'main.tsx');
const brokenMain = "return Boolean(getTwilightMissableGuide(achievement) && mapped?.coverage === 'deep' && mapped.kind === 'upcoming' && !earnedHardcore(achievement));";
const fixedMain = "return Boolean(getAchievementGuide(achievement, activeGameId) && mapped?.coverage === 'deep' && mapped.kind === 'upcoming' && !earnedHardcore(achievement));";
patchFile(mainPath, brokenMain, fixedMain, 'profile-backed deep-upcoming missable lookup');

const registryPath = path.join(root, 'app', 'src', 'profiles', 'registry.ts');
const gameCodesDeclaration = "const TWILIGHT_PRINCESS_GAME_CODES: readonly string[] = Object.freeze(['GZ2E01']);";
let registrySource = fs.readFileSync(registryPath, 'utf8');
if (registrySource.includes(gameCodesDeclaration)) {
  console.log('typed Twilight Princess game-code constant already applied.');
} else {
  const profileDeclaration = "export const TWILIGHT_PRINCESS_PROFILE: RendererGameProfile = Object.freeze({";
  if (!registrySource.includes(profileDeclaration)) {
    throw new Error('Could not find Twilight Princess profile declaration.');
  }
  registrySource = registrySource.replace(profileDeclaration, `${gameCodesDeclaration}\n\n${profileDeclaration}`);
  fs.writeFileSync(registryPath, registrySource);
  console.log('Applied typed Twilight Princess game-code constant.');
}

patchFile(
  registryPath,
  "  gameCodes: Object.freeze(['GZ2E01']),",
  '  gameCodes: TWILIGHT_PRINCESS_GAME_CODES,',
  'profile game-code constant wiring',
);
patchFile(
  registryPath,
  "    return Boolean(ram?.attached && !ram?.stale && this.gameCodes.includes(String(ram?.gameCode || '').trim()));",
  "    return Boolean(ram?.attached && !ram?.stale && TWILIGHT_PRINCESS_GAME_CODES.includes(String(ram?.gameCode || '').trim()));",
  'type-safe profile RAM matcher',
);

const finalMain = fs.readFileSync(mainPath, 'utf8');
if (finalMain.includes('getTwilightMissableGuide(achievement)')) {
  throw new Error('Renderer still contains the stale getTwilightMissableGuide call.');
}
if (!finalMain.includes(fixedMain)) {
  throw new Error('Renderer did not retain the generic profile-backed missable lookup.');
}

const finalRegistry = fs.readFileSync(registryPath, 'utf8');
const declarationCount = finalRegistry.split(gameCodesDeclaration).length - 1;
if (declarationCount !== 1) {
  throw new Error(`Expected exactly one Twilight Princess game-code constant, found ${declarationCount}.`);
}
if (finalRegistry.includes('this.gameCodes.includes')) {
  throw new Error('Profile registry still relies on the loosely typed object this.gameCodes lookup.');
}
