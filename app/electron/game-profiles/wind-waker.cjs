'use strict';

// Wind Waker PAL profile. Test 3 adds a verified read-only memory decoder for
// area/room, hearts and rupees while official RA server progress and rcheevos
// Rich Presence remain authoritative. No game-memory writes are permitted.
const WIND_WAKER_PROFILE = Object.freeze({
  key: 'wind-waker-gc-pal',
  raGameId: 9190,
  title: 'The Legend of Zelda: The Wind Waker',
  platform: 'GameCube',
  region: 'PAL / Europe',
  enhanced: true,
  gameCodes: Object.freeze(['GZLP01']),
  windowTitlePatterns: Object.freeze([/wind\s+waker/i]),

  matchesWindowTitle(title) {
    const value = String(title || '');
    return this.windowTitlePatterns.some((pattern) => pattern.test(value));
  },

  matchesRam(ram) {
    const code = String(ram?.gameCode || ram?.headerGameCode || '').trim().toUpperCase();
    return Boolean(
      ram?.attached &&
      !ram?.stale &&
      this.gameCodes.includes(code),
    );
  },

  buildRamPresence() {
    // Official rcheevos Rich Presence stays the preferred live display source.
    return '';
  },
});

module.exports = {
  WIND_WAKER_PROFILE,
};
