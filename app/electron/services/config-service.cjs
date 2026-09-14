const fs = require('fs');
const path = require('path');

function createConfigService({ app, safeStorage, defaultOverlay, minOverlayWidth, minOverlayHeight, defaultShortcuts }) {
  function configPath() {
    return path.join(app.getPath('userData'), 'config.json');
  }

  function clampOpacity(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return defaultOverlay.opacity;
    return Math.max(0.65, Math.min(1, Math.round(n * 100) / 100));
  }

  function normalizeBounds(input) {
    if (!input || typeof input !== 'object') return null;
    const x = Number(input.x);
    const y = Number(input.y);
    const width = Number(input.width);
    const height = Number(input.height);
    if (![x, y, width, height].every(Number.isFinite)) return null;
    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(minOverlayWidth, Math.round(width)),
      height: Math.max(minOverlayHeight, Math.round(height)),
    };
  }

  function normalizeOverlay(input = {}) {
    const mode = 'full';
    const corners = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
    const corner = corners.has(input.corner) ? input.corner : defaultOverlay.corner;
    return {
      mode,
      clickThrough: Boolean(input.clickThrough),
      corner,
      opacity: clampOpacity(input.opacity),
      manualPlacement: Boolean(input.manualPlacement),
      bounds: normalizeBounds(input.bounds),
    };
  }

  function decryptApiKey(raw) {
    if (raw?.apiKeyEncrypted && safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(Buffer.from(raw.apiKeyEncrypted, 'base64'));
      } catch {
        return '';
      }
    }
    return String(raw?.apiKey || '');
  }

  function readRawConfig() {
    try {
      return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    } catch {
      return {};
    }
  }

  function normalizeAccelerator(value, fallback) {
    const trimmed = String(value || '').trim();
    return trimmed || fallback;
  }

  function normalizeShortcuts(input = {}) {
    return {
      overlayToggle: normalizeAccelerator(input.overlayToggle, defaultShortcuts.overlayToggle),
      clickThrough: normalizeAccelerator(input.clickThrough, defaultShortcuts.clickThrough),
    };
  }

  function readConfig() {
    const raw = readRawConfig();
    return {
      username: String(raw.username || '').trim(),
      apiKey: decryptApiKey(raw).trim(),
      overlay: normalizeOverlay(raw.overlay || defaultOverlay),
      shortcuts: normalizeShortcuts(raw.shortcuts || {}),
      verifiedUsername: String(raw.verifiedUsername || '').trim(),
      lastVerifiedAt: Number(raw.lastVerifiedAt || 0) || 0,
    };
  }

  function persistConfig(config) {
    const raw = {
      username: String(config.username || '').trim(),
      overlay: normalizeOverlay(config.overlay || defaultOverlay),
      shortcuts: normalizeShortcuts(config.shortcuts || {}),
      verifiedUsername: String(config.verifiedUsername || '').trim(),
      lastVerifiedAt: Number(config.lastVerifiedAt || 0) || 0,
    };

    const apiKey = String(config.apiKey || '').trim();
    if (apiKey && safeStorage.isEncryptionAvailable()) {
      raw.apiKeyEncrypted = safeStorage.encryptString(apiKey).toString('base64');
    } else if (apiKey) {
      // Fallback only when OS encryption is unavailable.
      raw.apiKey = apiKey;
    }

    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(raw, null, 2), 'utf8');
  }

  function publicConfig() {
    const config = readConfig();
    return {
      username: config.username || '',
      hasApiKey: Boolean(config.apiKey),
      apiKeyEncrypted: Boolean(readRawConfig().apiKeyEncrypted),
      verifiedUsername: config.verifiedUsername || '',
      lastVerifiedAt: config.lastVerifiedAt || 0,
      shortcuts: config.shortcuts,
    };
  }

  return {
    normalizeBounds,
    normalizeOverlay,
    normalizeShortcuts,
    readRawConfig,
    readConfig,
    persistConfig,
    publicConfig,
  };
}

module.exports = { createConfigService };
