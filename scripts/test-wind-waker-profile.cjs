'use strict';

const assert = require('assert');
const {
  GAME_PROFILES,
  getGameProfileByRaGameId,
  getGameProfileByKey,
  detectProfileFromWindowTitle,
  detectProfileFromRam,
  resolveGameProfile,
  publicGameDescriptor,
} = require('../app/electron/game-profiles/registry.cjs');

const windWaker = getGameProfileByRaGameId(9190);
assert(windWaker, 'Wind Waker RA game 9190 must be registered.');
assert.strictEqual(windWaker.key, 'wind-waker-gc-pal');
assert.strictEqual(windWaker.title, 'The Legend of Zelda: The Wind Waker');
assert.strictEqual(windWaker.platform, 'GameCube');
assert.strictEqual(windWaker.region, 'PAL / Europe');
assert.strictEqual(windWaker.enhanced, false, 'Test 2 must not claim verified Wind Waker RAM mappings yet.');
assert.deepStrictEqual([...windWaker.gameCodes], ['GZLP01']);
assert.strictEqual(getGameProfileByKey('wind-waker-gc-pal'), windWaker);
assert(GAME_PROFILES.includes(windWaker));

const fromTitle = detectProfileFromWindowTitle('Dolphin 2509 | The Legend of Zelda: The Wind Waker');
assert.strictEqual(fromTitle, windWaker, 'Dolphin window title must activate the Wind Waker skeleton.');

const fromRawHeader = detectProfileFromRam({
  attached: false,
  mappingOpen: true,
  headerGameCode: 'GZLP01',
});
assert.strictEqual(fromRawHeader, windWaker, 'Read-only raw MEM1 header detection must work without game-specific offsets.');

const resolved = resolveGameProfile({
  dolphin: {
    running: true,
    title: 'Dolphin | The Legend of Zelda: The Wind Waker',
    detectedGameId: 9190,
  },
  ram: {
    attached: false,
    mappingOpen: true,
    headerGameCode: 'GZLP01',
  },
});
assert.strictEqual(resolved.profile, windWaker);
assert.strictEqual(resolved.source, 'window-title');

const descriptor = publicGameDescriptor(windWaker, resolved.source);
assert.deepStrictEqual(descriptor, {
  id: 9190,
  key: 'wind-waker-gc-pal',
  profile: 'The Legend of Zelda: The Wind Waker',
  platform: 'GameCube',
  region: 'PAL / Europe',
  enhanced: false,
  autoDetected: true,
  active: true,
  detectionSource: 'window-title',
});

const twilight = getGameProfileByRaGameId(3934);
assert(twilight, 'Twilight Princess profile must remain registered.');
assert.strictEqual(twilight.enhanced, true);
assert.strictEqual(twilight.matchesRam({ attached: true, stale: false, gameCode: 'GZ2E01' }), true);
assert.strictEqual(windWaker.matchesRam({ mappingOpen: true, headerGameCode: 'GZ2E01' }), false);

console.log('Wind Waker Test 2 profile skeleton regression: PASS');
