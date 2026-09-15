'use strict';

// Test 2 profile skeleton for The Legend of Zelda: The Wind Waker.
//
// This deliberately contains detection metadata only. It does not contain
// game-specific RAM addresses, story rules, achievement rules, or memory
// writes. The existing read-only Dolphin/rcheevos observer remains the only
// live runtime surface until Wind Waker RAM mappings are verified separately.
const WIND_WAKER_PROFILE = Object.freeze({
  key: 'wind-waker-gc-pal',
  raGameId: 9190,
  title: 'The Legend of Zelda: The Wind Waker',
  platform: 'GameCube',
  region: 'PAL / Europe',
  enhanced: false,
  gameCodes: Object.freeze(['GZLP01']),
  windowTitlePatterns: Object.freeze([/wind\s+waker/i]),

  matchesWindowTitle(title) {
    const value = String(title || '');
    return this.windowTitlePatterns.some((pattern) => pattern.test(value));
  },

  matchesRam(ram) {
    const code = String(ram?.gameCode || ram?.headerGameCode || '').trim().toUpperCase();
    return Boolean(
      ram?.mappingOpen &&
      this.gameCodes.includes(code),
    );
  },

  buildRamPresence() {
    // Official rcheevos Rich Presence stays authoritative for this test.
    return '';
  },
});

module.exports = {
  WIND_WAKER_PROFILE,
};
