'use strict';

const TWILIGHT_PRINCESS_PROFILE = Object.freeze({
  key: 'twilight-princess-gc-us',
  raGameId: 3934,
  title: 'The Legend of Zelda: Twilight Princess',
  platform: 'GameCube',
  region: 'USA',
  enhanced: true,
  gameCodes: Object.freeze(['GZ2E01']),
  windowTitlePatterns: Object.freeze([/twilight\s+princess/i]),

  matchesWindowTitle(title) {
    const value = String(title || '');
    return this.windowTitlePatterns.some((pattern) => pattern.test(value));
  },

  matchesRam(ram) {
    return Boolean(
      ram?.attached &&
      !ram?.stale &&
      this.gameCodes.includes(String(ram?.gameCode || '').trim()),
    );
  },

  buildRamPresence(ram) {
    if (!this.matchesRam(ram) || !ram?.mapped) return '';

    const contextMarker = ram?.kind === 'dungeon'
      ? '🏰'
      : ram?.kind === 'area'
        ? '🗺️'
        : ram?.kind === 'building'
          ? '🏠'
          : ram?.kind === 'cave'
            ? '🕳️'
            : '';
    if (!contextMarker) return '';

    const stageCode = String(ram?.stageCode || '').trim();
    const formMarker = ram?.linkForm === 'wolf' ? '🐺Link' : ram?.linkForm === 'human' ? '🧝Link' : '';
    const heartPart = typeof ram?.currentHearts === 'number' && typeof ram?.maxHearts === 'number'
      ? `❤️${ram.currentHearts}/${ram.maxHearts}`
      : '';
    const faronTears = ['F_SP108', 'R_SP108', 'D_SB10'].includes(stageCode)
      && ram?.storyFlags?.faronVesselObtained === true
      && typeof ram?.faronTears === 'number'
        ? `💧${Math.max(0, Math.min(16, ram.faronTears))}/16 Tears`
        : '';

    return [
      formMarker,
      `${contextMarker}${String(ram.stageName || ram.stageCode || '').trim()}${ram?.boss ? ` ☠️${String(ram.boss).trim()}` : ''}`,
      heartPart,
      typeof ram?.fusedShadows === 'number' ? `👥${ram.fusedShadows}/4` : '',
      typeof ram?.mirrorShards === 'number' ? `🧿${ram.mirrorShards}/4` : '',
      typeof ram?.poeSouls === 'number' ? `👻${ram.poeSouls}/60` : '',
      typeof ram?.goldenBugs === 'number' ? `🐜${ram.goldenBugs}/24` : '',
      typeof ram?.gameOvers === 'number' ? `💀${ram.gameOvers}` : '',
      faronTears,
    ].filter(Boolean).join(' ');
  },
});

module.exports = {
  TWILIGHT_PRINCESS_PROFILE,
};
