'use strict';

const { TWILIGHT_PRINCESS_PROFILE } = require('./twilight-princess.cjs');
const { WIND_WAKER_PROFILE } = require('./wind-waker.cjs');

const GAME_PROFILES = Object.freeze([
  TWILIGHT_PRINCESS_PROFILE,
  WIND_WAKER_PROFILE,
]);

function getGameProfileByRaGameId(gameId) {
  const numericGameId = Number(gameId);
  if (!Number.isFinite(numericGameId) || numericGameId <= 0) return null;
  return GAME_PROFILES.find((profile) => Number(profile.raGameId) === numericGameId) || null;
}

function getGameProfileByKey(key) {
  const normalized = String(key || '').trim();
  if (!normalized) return null;
  return GAME_PROFILES.find((profile) => profile.key === normalized) || null;
}

function detectProfileFromWindowTitle(title) {
  return GAME_PROFILES.find((profile) => profile.matchesWindowTitle?.(title)) || null;
}

function detectProfileFromRam(ram) {
  return GAME_PROFILES.find((profile) => profile.matchesRam?.(ram)) || null;
}

function resolveGameProfile({ dolphin = null, ram = null, raGameId = null } = {}) {
  const explicitProfile = getGameProfileByRaGameId(raGameId);
  if (explicitProfile) return { profile: explicitProfile, source: 'ra-game-id' };

  const dolphinProfile = getGameProfileByRaGameId(dolphin?.detectedGameId);
  if (dolphinProfile) return { profile: dolphinProfile, source: 'window-title' };

  const titleProfile = detectProfileFromWindowTitle(dolphin?.title);
  if (titleProfile) return { profile: titleProfile, source: 'window-title' };

  const ramProfile = detectProfileFromRam(ram);
  if (ramProfile) return { profile: ramProfile, source: 'ram' };

  return { profile: null, source: 'none' };
}

function publicGameDescriptor(profile, detectionSource = 'none') {
  if (!profile) {
    return {
      id: null,
      key: null,
      profile: 'No game active',
      platform: '',
      region: '',
      enhanced: false,
      autoDetected: false,
      active: false,
      detectionSource: 'none',
    };
  }

  return {
    id: Number(profile.raGameId),
    key: profile.key,
    profile: profile.title,
    platform: profile.platform || '',
    region: profile.region || '',
    enhanced: Boolean(profile.enhanced),
    autoDetected: true,
    active: true,
    detectionSource,
  };
}

module.exports = {
  GAME_PROFILES,
  getGameProfileByRaGameId,
  getGameProfileByKey,
  detectProfileFromWindowTitle,
  detectProfileFromRam,
  resolveGameProfile,
  publicGameDescriptor,
};
