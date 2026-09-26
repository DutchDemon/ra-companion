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
assert.strictEqual(windWaker.enhanced, true, 'Wind Waker should expose the verified Test 3 RAM profile.');
assert.deepStrictEqual([...windWaker.gameCodes], ['GZLP01']);
assert.strictEqual(getGameProfileByKey('wind-waker-gc-pal'), windWaker);
assert(GAME_PROFILES.includes(windWaker));

const fromTitle = detectProfileFromWindowTitle('Dolphin 2509 | The Legend of Zelda: The Wind Waker');
assert.strictEqual(fromTitle, windWaker, 'Dolphin window title must activate the Wind Waker skeleton.');

const fromLiveRam = detectProfileFromRam({
  attached: true,
  stale: false,
  mappingOpen: true,
  gameCode: 'GZLP01',
});
assert.strictEqual(fromLiveRam, windWaker, 'Verified GZLP01 RAM state must activate the Wind Waker profile.');

const fromRawHeader = detectProfileFromRam({
  attached: false,
  mappingOpen: true,
  headerGameCode: 'GZLP01',
});
assert.strictEqual(fromRawHeader, null, 'A raw header alone must not claim a live RAM profile.');

const resolved = resolveGameProfile({
  dolphin: {
    running: true,
    title: 'Dolphin | The Legend of Zelda: The Wind Waker',
    detectedGameId: 9190,
  },
  ram: {
    attached: true,
    stale: false,
    mappingOpen: true,
    gameCode: 'GZLP01',
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
  enhanced: true,
  autoDetected: true,
  active: true,
  detectionSource: 'window-title',
});

const twilight = getGameProfileByRaGameId(3934);
assert(twilight, 'Twilight Princess profile must remain registered.');
assert.strictEqual(twilight.enhanced, true);
assert.strictEqual(twilight.matchesRam({ attached: true, stale: false, gameCode: 'GZ2E01' }), true);
assert.strictEqual(windWaker.matchesRam({ attached: true, stale: false, gameCode: 'GZ2E01' }), false);

console.log('Wind Waker profile detection regression: PASS');
