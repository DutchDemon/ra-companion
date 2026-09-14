const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mainPath = path.join(root, 'app', 'src', 'main.tsx');
let source = fs.readFileSync(mainPath, 'utf8');

const broken = "return Boolean(getTwilightMissableGuide(achievement) && mapped?.coverage === 'deep' && mapped.kind === 'upcoming' && !earnedHardcore(achievement));";
const fixed = "return Boolean(getAchievementGuide(achievement, activeGameId) && mapped?.coverage === 'deep' && mapped.kind === 'upcoming' && !earnedHardcore(achievement));";

if (source.includes(broken)) {
  source = source.replace(broken, fixed);
  fs.writeFileSync(mainPath, source);
  console.log('Fixed deep-upcoming missable lookup to use the profile registry.');
} else if (source.includes(fixed) && !source.includes('getTwilightMissableGuide(achievement)')) {
  console.log('Renderer regression fix already applied.');
} else {
  throw new Error('Could not find the expected deep-upcoming missable lookup in app/src/main.tsx.');
}

const finalSource = fs.readFileSync(mainPath, 'utf8');
if (finalSource.includes('getTwilightMissableGuide(achievement)')) {
  throw new Error('Renderer still contains the stale getTwilightMissableGuide call.');
}
if (!finalSource.includes(fixed)) {
  throw new Error('Renderer did not retain the generic profile-backed missable lookup.');
}
