const { app, BrowserWindow, ipcMain, globalShortcut, screen, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

// Keep settings in the same location used by the development/portable builds.
app.setPath('userData', path.join(app.getPath('appData'), 'ra-companion'));
if (process.platform === 'win32') {
  app.setAppUserModelId('com.dutchdemon.racompanion');
}

function getNativePowerShellPath() {
  if (process.platform !== 'win32') return 'powershell.exe';
  const windowsDir = process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows';
  // If Electron/Node itself is a 32-bit process on 64-bit Windows, System32 is
  // file-system redirected. Sysnative explicitly reaches native 64-bit PS.
  if (process.arch === 'ia32' && process.env.PROCESSOR_ARCHITEW6432) {
    return path.join(windowsDir, 'Sysnative', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  }
  return path.join(windowsDir, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

let appUpdater = null;
let updateStatusCache = null;

function broadcastUpdateStatus(status) {
  updateStatusCache = status;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:status-changed', status);
  }
  return status;
}

function getUpdater() {
  if (appUpdater) return appUpdater;
  if (process.platform !== 'win32' || !app.isPackaged) return null;

  const updater = autoUpdater;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowDowngrade = false;

  updater.on('download-progress', (info) => {
    const percent = Math.max(0, Math.min(100, Number(info?.percent) || 0));
    broadcastUpdateStatus({
      ...(updateStatusCache || {}),
      ok: true,
      currentVersion: app.getVersion(),
      available: true,
      packaged: app.isPackaged,
      installing: false,
      phase: 'downloading',
      progress: percent,
      transferred: Number(info?.transferred) || 0,
      total: Number(info?.total) || 0,
      bytesPerSecond: Number(info?.bytesPerSecond) || 0,
      message: `Downloading update… ${Math.round(percent)}%`,
    });
  });

  updater.on('update-downloaded', () => {
    broadcastUpdateStatus({
      ...(updateStatusCache || {}),
      ok: true,
      currentVersion: app.getVersion(),
      available: true,
      packaged: app.isPackaged,
      installing: false,
      phase: 'downloaded',
      progress: 100,
      message: 'Update downloaded. Preparing installation…',
    });
  });

  updater.on('error', (error) => {
    broadcastUpdateStatus({
      ...(updateStatusCache || {}),
      ok: false,
      currentVersion: app.getVersion(),
      available: Boolean(updateStatusCache?.available),
      installing: false,
      phase: 'error',
      error: error?.message || 'Update check failed.',
      message: 'Update failed. You can try again.',
      packaged: app.isPackaged,
    });
  });
  appUpdater = updater;
  return updater;
}

function releaseNotesText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === 'string' ? item : item?.note || '').filter(Boolean).join('\n');
  }
  return String(value?.note || '');
}

async function checkForUpdates(force = false) {
  const currentVersion = app.getVersion();
  if (process.platform !== 'win32' || !app.isPackaged) {
    return {
      ok: true,
      currentVersion,
      latestVersion: currentVersion,
      available: false,
      packaged: app.isPackaged,
      message: 'Update checks are available in the installed Windows build.',
    };
  }

  if (!force && updateStatusCache?.ok && updateStatusCache.checkedAt && Date.now() - updateStatusCache.checkedAt < 5 * 60 * 1000) {
    return updateStatusCache;
  }

  try {
    const updater = getUpdater();
    const result = await updater.checkForUpdates();
    const info = result?.updateInfo || {};
    const latestVersion = String(info.version || currentVersion);
    const available = compareVersions(latestVersion, currentVersion) > 0;
    updateStatusCache = {
      ok: true,
      currentVersion,
      latestVersion,
      available,
      notes: releaseNotesText(info.releaseNotes),
      packaged: app.isPackaged,
      checkedAt: Date.now(),
    };
    return updateStatusCache;
  } catch (error) {
    updateStatusCache = {
      ok: false,
      currentVersion,
      available: false,
      packaged: app.isPackaged,
      checkedAt: Date.now(),
      error: error?.message || 'Could not check for updates.',
    };
    return updateStatusCache;
  }
}

async function installAvailableUpdate() {
  const status = await checkForUpdates(true);
  if (!status.ok) return status;
  if (!status.available) return { ...status, installing: false, phase: 'current', message: 'RA Companion is already up to date.' };

  try {
    const updater = getUpdater();
    broadcastUpdateStatus({ ...status, installing: false, phase: 'downloading', progress: 0, message: 'Starting update download…' });
    await updater.downloadUpdate();
    await new Promise((resolve) => setTimeout(resolve, 900));

    const result = broadcastUpdateStatus({
      ...status,
      ok: true,
      available: true,
      installing: true,
      phase: 'installing',
      progress: 100,
      message: `RA Companion ${status.latestVersion} is ready. Installing silently and restarting…`,
    });
    setTimeout(() => updater.quitAndInstall(true, true), 1400);
    return result;
  } catch (error) {
    return broadcastUpdateStatus({
      ...status,
      ok: false,
      installing: false,
      phase: 'error',
      error: error?.message || 'Could not download or install the update.',
      message: 'Update failed. You can try again.',
    });
  }
}

function versionParts(version) {
  return String(version || '0').replace(/^v/i, '').split('.').map((part) => {
    const n = Number.parseInt(part, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

function compareVersions(a, b) {
  const left = versionParts(a);
  const right = versionParts(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const l = left[i] || 0;
    const r = right[i] || 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}

const TWILIGHT_PRINCESS_GAME_ID = 3934;
const OVERLAY_GAP = 24;
const OVERLAY_SIZES = {
  compact: { width: 420, height: 360 },
  full: { width: 440, height: 640 },
};
const DEFAULT_OVERLAY = {
  mode: 'full',
  clickThrough: false,
  corner: 'top-right',
  opacity: 0.94,
  manualPlacement: false,
  bounds: null,
};
const MIN_OVERLAY_WIDTH = 260;
const MIN_OVERLAY_HEIGHT = 180;

let mainWindow;
let overlayWindow;
let appIsQuitting = false;
let overlayBoundsTimer = null;
let suppressOverlayBoundsEventsUntil = 0;
let overlayResizeSession = null;
let overlayMoveSession = null;

const DEFAULT_SHORTCUTS = {
  overlayToggle: 'CommandOrControl+Shift+O',
  clickThrough: 'CommandOrControl+Shift+C',
  overlayToggleFallback: 'CommandOrControl+Alt+O',
  clickThroughFallback: 'CommandOrControl+Alt+C',
};

const shortcutState = {
  overlayToggle: {
    registered: false,
    accelerator: DEFAULT_SHORTCUTS.overlayToggle,
    primary: DEFAULT_SHORTCUTS.overlayToggle,
    fallback: DEFAULT_SHORTCUTS.overlayToggleFallback,
    usingFallback: false,
    lastReceivedAt: null,
    callbackCount: 0,
    lastResult: 'never',
    lastRegistrationAt: null,
    lastRegistrationError: '',
  },
  clickThrough: {
    registered: false,
    accelerator: DEFAULT_SHORTCUTS.clickThrough,
    primary: DEFAULT_SHORTCUTS.clickThrough,
    fallback: DEFAULT_SHORTCUTS.clickThroughFallback,
    usingFallback: false,
    lastReceivedAt: null,
    callbackCount: 0,
    lastResult: 'never',
    lastRegistrationAt: null,
    lastRegistrationError: '',
  },
};
let shortcutHealthTimer = null;

function publicShortcutState() {
  return JSON.parse(JSON.stringify(shortcutState));
}

function broadcastShortcutState() {
  const state = publicShortcutState();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('shortcuts:state-changed', state);
  }
  return state;
}

function registerShortcutBinding(key, primary, fallback, callback) {
  const binding = shortcutState[key];
  const previousAccelerators = new Set([
    binding.accelerator,
    binding.primary,
    binding.fallback,
    primary,
    fallback,
  ].filter(Boolean));
  for (const accelerator of previousAccelerators) {
    try { globalShortcut.unregister(accelerator); } catch { /* best effort */ }
  }

  binding.registered = false;
  binding.accelerator = primary;
  binding.primary = primary;
  binding.fallback = fallback;
  binding.usingFallback = false;
  binding.lastRegistrationError = '';

  const wrappedCallback = () => {
    binding.lastReceivedAt = Date.now();
    binding.callbackCount = Number(binding.callbackCount || 0) + 1;
    binding.lastResult = 'received';
    try {
      callback();
      binding.lastResult = 'handled';
    } catch (error) {
      binding.lastResult = 'error';
      binding.lastRegistrationError = error?.message || String(error || 'Shortcut callback failed.');
      console.warn(`[shortcuts] Callback failed for ${key}:`, error);
    }
    broadcastShortcutState();
  };

  const candidates = [...new Set([primary, fallback].filter(Boolean))];
  for (let index = 0; index < candidates.length; index += 1) {
    const accelerator = candidates[index];
    try {
      const accepted = globalShortcut.register(accelerator, wrappedCallback);
      const confirmed = accepted && globalShortcut.isRegistered(accelerator);
      if (confirmed) {
        binding.registered = true;
        binding.accelerator = accelerator;
        binding.usingFallback = index > 0;
        binding.lastRegistrationAt = Date.now();
        return true;
      }
      binding.lastRegistrationError = `Windows did not accept ${accelerator}.`;
    } catch (error) {
      binding.lastRegistrationError = error?.message || `Failed to register ${accelerator}.`;
      console.warn(`[shortcuts] Failed to register ${accelerator}:`, error);
    }
  }

  binding.lastRegistrationAt = Date.now();
  return false;
}

function registerGlobalShortcuts() {
  const config = readConfig();
  const shortcuts = config.shortcuts || {};
  registerShortcutBinding(
    'overlayToggle',
    shortcuts.overlayToggle || DEFAULT_SHORTCUTS.overlayToggle,
    DEFAULT_SHORTCUTS.overlayToggleFallback,
    () => toggleOverlay(),
  );
  registerShortcutBinding(
    'clickThrough',
    shortcuts.clickThrough || DEFAULT_SHORTCUTS.clickThrough,
    DEFAULT_SHORTCUTS.clickThroughFallback,
    () => toggleClickThrough(),
  );
  return broadcastShortcutState();
}

function shortcutRegistrationsHealthy() {
  return Object.values(shortcutState).every((binding) => {
    if (!binding.registered || !binding.accelerator) return false;
    try { return globalShortcut.isRegistered(binding.accelerator); } catch { return false; }
  });
}

function ensureGlobalShortcutsRegistered() {
  if (!shortcutRegistrationsHealthy()) return registerGlobalShortcuts();
  return publicShortcutState();
}
let raProgressCache = { gameId: null, username: '', fetchedAt: 0, result: null, pending: null };
const RA_PROGRESS_CACHE_MS = 15000;
let raRecentCache = { username: '', fetchedAt: 0, result: null, pending: null };
const RA_RECENT_CACHE_MS = 8000;
let raProfileCache = { username: '', fetchedAt: 0, result: null, pending: null };
const RA_PROFILE_CACHE_MS = 15000;
let dolphinCache = { fetchedAt: 0, result: null, pending: null };
const DOLPHIN_CACHE_MS = 750;

let ramReaderProcess = null;
let ramReaderPid = null;
let ramReaderBuffer = '';
let ramLatest = {
  enabled: true,
  ok: false,
  attached: false,
  processId: null,
  error: 'RAM reader not started.',
  timestamp: 0,
};

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}


const ACHIEVEMENT_LIBRARY_VERSION = 1;

function achievementLibraryPath() {
  return path.join(app.getPath('userData'), 'achievement-library.json');
}

function readAchievementLibraryStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(achievementLibraryPath(), 'utf8'));
    if (parsed && typeof parsed === 'object' && parsed.accounts && typeof parsed.accounts === 'object') {
      return {
        version: Number(parsed.version || ACHIEVEMENT_LIBRARY_VERSION),
        accounts: parsed.accounts,
      };
    }
  } catch {
    // First run, deleted cache, or an invalid cache: start clean.
  }
  return { version: ACHIEVEMENT_LIBRARY_VERSION, accounts: {} };
}

function writeAchievementLibraryStore(store) {
  const target = achievementLibraryPath();
  const tmp = `${target}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify({
    version: ACHIEVEMENT_LIBRARY_VERSION,
    accounts: store?.accounts || {},
  }, null, 2), 'utf8');
  try {
    fs.renameSync(tmp, target);
  } catch {
    fs.copyFileSync(tmp, target);
    fs.unlinkSync(tmp);
  }
}

function achievementLibraryAccountKey(username) {
  return String(username || '').trim().toLowerCase();
}

function achievementLibraryEntry(gameId, data, previous = null) {
  const rawAchievements = data?.Achievements || {};
  const achievements = Array.isArray(rawAchievements)
    ? rawAchievements.map((achievement) => ({ ...achievement }))
    : Object.fromEntries(Object.entries(rawAchievements).map(([id, achievement]) => [id, { ...achievement }]));
  const achievementList = Array.isArray(achievements) ? achievements : Object.values(achievements);
  const unlockedFromList = achievementList.filter((achievement) => Boolean(achievement?.DateEarnedHardcore || achievement?.dateEarnedHardcore)).length;
  const total = Number(data?.NumAchievements ?? data?.numAchievements ?? achievementList.length) || achievementList.length;
  const unlocked = Number(data?.NumAwardedToUserHardcore ?? data?.numAwardedToUserHardcore ?? unlockedFromList) || unlockedFromList;
  return {
    gameId: Number(gameId),
    title: String(data?.Title || data?.title || previous?.title || `RetroAchievements Game ${gameId}`),
    consoleId: Number(data?.ConsoleID ?? data?.consoleId ?? previous?.consoleId ?? 0) || null,
    consoleName: String(data?.ConsoleName || data?.consoleName || previous?.consoleName || ''),
    imageIcon: String(data?.ImageIcon || data?.imageIcon || previous?.imageIcon || ''),
    imageTitle: String(data?.ImageTitle || data?.imageTitle || previous?.imageTitle || ''),
    numAchievements: total,
    numAwardedToUserHardcore: unlocked,
    achievements,
    lastSyncedAt: Date.now(),
  };
}

function rememberAchievementGame(username, gameId, data) {
  const cleanUsername = String(username || '').trim();
  const numericGameId = Number(gameId);
  if (!cleanUsername || !Number.isFinite(numericGameId) || numericGameId <= 0 || !data) return null;

  const store = readAchievementLibraryStore();
  const accountKey = achievementLibraryAccountKey(cleanUsername);
  const account = store.accounts[accountKey] && typeof store.accounts[accountKey] === 'object'
    ? store.accounts[accountKey]
    : { username: cleanUsername, games: {} };
  account.username = cleanUsername;
  account.games = account.games && typeof account.games === 'object' ? account.games : {};
  const gameKey = String(numericGameId);
  const entry = achievementLibraryEntry(numericGameId, data, account.games[gameKey]);
  account.games[gameKey] = entry;
  store.accounts[accountKey] = account;
  writeAchievementLibraryStore(store);

  const current = readConfig();
  const verified = current.username && current.verifiedUsername
    && current.username.toLowerCase() === current.verifiedUsername.toLowerCase();
  if (verified && current.username.toLowerCase() === cleanUsername.toLowerCase()) {
    broadcastAchievementLibraryChanged();
  }
  return entry;
}

function getAchievementLibrary() {
  const config = readConfig();
  const username = String(config.username || '').trim();
  const verified = username && config.verifiedUsername
    && username.toLowerCase() === String(config.verifiedUsername).trim().toLowerCase();
  if (!verified) {
    return { version: ACHIEVEMENT_LIBRARY_VERSION, username: '', games: [] };
  }

  const store = readAchievementLibraryStore();
  const account = store.accounts[achievementLibraryAccountKey(username)] || { games: {} };
  const games = Object.values(account.games || {})
    .filter((game) => Number(game?.gameId) > 0)
    .sort((a, b) => Number(b?.lastSyncedAt || 0) - Number(a?.lastSyncedAt || 0) || String(a?.title || '').localeCompare(String(b?.title || '')));
  return {
    version: ACHIEVEMENT_LIBRARY_VERSION,
    username,
    games,
  };
}

function broadcastAchievementLibraryChanged() {
  const library = getAchievementLibrary();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('library:changed', library);
  }
  return library;
}

async function refreshAchievementLibrary() {
  const config = readConfig();
  const verified = config.username && config.verifiedUsername
    && config.username.toLowerCase() === config.verifiedUsername.toLowerCase();
  if (!verified || !config.apiKey) {
    return { ...getAchievementLibrary(), ok: false, error: 'Connect and verify a RetroAchievements account first.' };
  }

  const known = getAchievementLibrary();
  for (const game of known.games) {
    // User-triggered refresh only. Keep requests sequential so adding more games later
    // does not hammer RetroAchievements with a burst of parallel calls.
    await getRaProgress(Number(game.gameId), true);
  }
  return { ...getAchievementLibrary(), ok: true };
}

function clampOpacity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_OVERLAY.opacity;
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
    width: Math.max(MIN_OVERLAY_WIDTH, Math.round(width)),
    height: Math.max(MIN_OVERLAY_HEIGHT, Math.round(height)),
  };
}

function normalizeOverlay(input = {}) {
  const mode = 'full';
  const corners = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
  const corner = corners.has(input.corner) ? input.corner : DEFAULT_OVERLAY.corner;
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
    overlayToggle: normalizeAccelerator(input.overlayToggle, DEFAULT_SHORTCUTS.overlayToggle),
    clickThrough: normalizeAccelerator(input.clickThrough, DEFAULT_SHORTCUTS.clickThrough),
  };
}

function readConfig() {
  const raw = readRawConfig();
  return {
    username: String(raw.username || '').trim(),
    apiKey: decryptApiKey(raw).trim(),
    overlay: normalizeOverlay(raw.overlay || DEFAULT_OVERLAY),
    shortcuts: normalizeShortcuts(raw.shortcuts || {}),
    verifiedUsername: String(raw.verifiedUsername || '').trim(),
    lastVerifiedAt: Number(raw.lastVerifiedAt || 0) || 0,
  };
}

function persistConfig(config) {
  const raw = {
    username: String(config.username || '').trim(),
    overlay: normalizeOverlay(config.overlay || DEFAULT_OVERLAY),
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

function resetRaCaches() {
  raProgressCache = { gameId: null, username: '', fetchedAt: 0, result: null, pending: null };
  raRecentCache = { username: '', fetchedAt: 0, result: null, pending: null };
  raProfileCache = { username: '', fetchedAt: 0, result: null, pending: null };
}

function writeConfig(next) {
  const existing = readConfig();
  const suppliedKey = String(next?.apiKey || '').trim();
  const requestedUsername = String(next?.username ?? existing.username).trim();
  const accountChanged = requestedUsername !== existing.username || Boolean(suppliedKey);
  const merged = {
    username: requestedUsername,
    apiKey: suppliedKey || existing.apiKey,
    overlay: existing.overlay,
    shortcuts: existing.shortcuts,
    verifiedUsername: accountChanged ? '' : existing.verifiedUsername,
    lastVerifiedAt: accountChanged ? 0 : existing.lastVerifiedAt,
  };
  persistConfig(merged);
  resetRaCaches();
  broadcastAchievementLibraryChanged();
  return publicConfig();
}

function disconnectRaAccount() {
  const existing = readConfig();
  persistConfig({
    ...existing,
    username: '',
    apiKey: '',
    verifiedUsername: '',
    lastVerifiedAt: 0,
  });
  resetRaCaches();
  broadcastAchievementLibraryChanged();
  return publicConfig();
}

function updateShortcutSettings(patch) {
  const existing = readConfig();
  const shortcuts = normalizeShortcuts({
    ...existing.shortcuts,
    ...(patch || {}),
  });
  persistConfig({ ...existing, shortcuts });
  return registerGlobalShortcuts();
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

function getOverlayState() {
  const config = readConfig();
  const liveBounds = overlayWindow && !overlayWindow.isDestroyed() ? normalizeBounds(overlayWindow.getBounds()) : null;
  return {
    visible: Boolean(overlayWindow?.isVisible()),
    ...config.overlay,
    bounds: liveBounds || config.overlay.bounds,
  };
}

function broadcastOverlayState() {
  const state = getOverlayState();
  for (const win of [mainWindow, overlayWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send('overlay:state-changed', state);
  }
  return state;
}

function getOverlayDisplay() {
  if (!screen) return null;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    const bounds = overlayWindow.getBounds();
    return screen.getDisplayMatching(bounds);
  }
  return screen.getPrimaryDisplay();
}

function markProgrammaticBoundsChange() {
  suppressOverlayBoundsEventsUntil = Date.now() + 450;
}

function positionOverlay(corner, animate = false) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const display = getOverlayDisplay() || screen.getPrimaryDisplay();
  const { workArea } = display;
  const [width, height] = overlayWindow.getSize();
  const isRight = corner.endsWith('right');
  const isBottom = corner.startsWith('bottom');
  const x = isRight ? workArea.x + workArea.width - width - OVERLAY_GAP : workArea.x + OVERLAY_GAP;
  const y = isBottom ? workArea.y + workArea.height - height - OVERLAY_GAP : workArea.y + OVERLAY_GAP;
  markProgrammaticBoundsChange();
  overlayWindow.setPosition(Math.round(x), Math.round(y), animate);
}

function persistCurrentOverlayBounds(manualPlacement = true) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return getOverlayState();
  const config = readConfig();
  const overlay = normalizeOverlay({
    ...config.overlay,
    bounds: overlayWindow.getBounds(),
    manualPlacement,
  });
  persistConfig({ ...config, overlay });
  return broadcastOverlayState();
}

function scheduleOverlayBoundsSave() {
  if (overlayMoveSession || overlayResizeSession) return;
  if (Date.now() < suppressOverlayBoundsEventsUntil) return;
  if (overlayBoundsTimer) clearTimeout(overlayBoundsTimer);
  overlayBoundsTimer = setTimeout(() => {
    overlayBoundsTimer = null;
    if (Date.now() < suppressOverlayBoundsEventsUntil) return;
    persistCurrentOverlayBounds(true);
  }, 220);
}

function applyOverlaySettings(settings, { broadcast = true, initial = false } = {}) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return getOverlayState();
  const normalized = normalizeOverlay(settings);

  overlayWindow.setOpacity(normalized.opacity);
  overlayWindow.setFocusable(!normalized.clickThrough);
  overlayWindow.setIgnoreMouseEvents(normalized.clickThrough, { forward: true });

  if (initial) {
    if (normalized.bounds) {
      markProgrammaticBoundsChange();
      overlayWindow.setBounds(normalized.bounds, false);
    } else {
      const size = OVERLAY_SIZES[normalized.mode];
      markProgrammaticBoundsChange();
      overlayWindow.setSize(size.width, size.height, false);
      positionOverlay(normalized.corner);
    }
  }

  if (broadcast) return broadcastOverlayState();
  return { visible: overlayWindow.isVisible(), ...normalized, bounds: normalizeBounds(overlayWindow.getBounds()) };
}

function updateOverlaySettings(patch) {
  const config = readConfig();
  const wantsSnap = patch && Object.prototype.hasOwnProperty.call(patch, 'corner');
  const overlay = normalizeOverlay({
    ...config.overlay,
    ...(patch || {}),
    manualPlacement: wantsSnap ? false : config.overlay.manualPlacement,
  });
  persistConfig({ ...config, overlay });
  applyOverlaySettings(overlay, { broadcast: false });

  if (wantsSnap && overlayWindow && !overlayWindow.isDestroyed()) {
    positionOverlay(overlay.corner);
    const snapped = normalizeOverlay({ ...overlay, bounds: overlayWindow.getBounds(), manualPlacement: false });
    persistConfig({ ...config, overlay: snapped });
  }

  return broadcastOverlayState();
}


function beginOverlayResize(direction, screenX, screenY, sender) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return false;
  if (sender !== overlayWindow.webContents) return false;
  const config = readConfig();
  if (config.overlay.clickThrough) return false;
  const validDirections = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);
  if (!validDirections.has(direction)) return false;

  overlayResizeSession = {
    direction,
    startX: Number(screenX) || 0,
    startY: Number(screenY) || 0,
    startBounds: overlayWindow.getBounds(),
  };
  return true;
}

function moveOverlayResize(screenX, screenY, sender) {
  if (!overlayResizeSession || !overlayWindow || overlayWindow.isDestroyed()) return false;
  if (sender !== overlayWindow.webContents) return false;

  const currentX = Number(screenX) || 0;
  const currentY = Number(screenY) || 0;
  const { direction, startX, startY, startBounds } = overlayResizeSession;
  const dx = currentX - startX;
  const dy = currentY - startY;
  const right = startBounds.x + startBounds.width;
  const bottom = startBounds.y + startBounds.height;

  let x = startBounds.x;
  let y = startBounds.y;
  let width = startBounds.width;
  let height = startBounds.height;

  if (direction.includes('e')) {
    width = Math.max(MIN_OVERLAY_WIDTH, startBounds.width + dx);
  }
  if (direction.includes('s')) {
    height = Math.max(MIN_OVERLAY_HEIGHT, startBounds.height + dy);
  }
  if (direction.includes('w')) {
    width = Math.max(MIN_OVERLAY_WIDTH, startBounds.width - dx);
    x = right - width;
  }
  if (direction.includes('n')) {
    height = Math.max(MIN_OVERLAY_HEIGHT, startBounds.height - dy);
    y = bottom - height;
  }

  suppressOverlayBoundsEventsUntil = Date.now() + 120;
  overlayWindow.setBounds({
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  }, false);
  return true;
}

function endOverlayResize(sender) {
  if (!overlayResizeSession) return getOverlayState();
  if (!overlayWindow || overlayWindow.isDestroyed() || sender !== overlayWindow.webContents) {
    overlayResizeSession = null;
    return getOverlayState();
  }
  overlayResizeSession = null;
  suppressOverlayBoundsEventsUntil = 0;
  return persistCurrentOverlayBounds(true);
}


function beginOverlayMove(screenX, screenY, sender) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return false;
  if (sender !== overlayWindow.webContents) return false;
  const config = readConfig();
  if (config.overlay.clickThrough || overlayResizeSession) return false;

  overlayMoveSession = {
    startX: Number(screenX) || 0,
    startY: Number(screenY) || 0,
    startBounds: overlayWindow.getBounds(),
  };
  return true;
}

function moveOverlayMove(screenX, screenY, sender) {
  if (!overlayMoveSession || !overlayWindow || overlayWindow.isDestroyed()) return false;
  if (sender !== overlayWindow.webContents) return false;

  const currentX = Number(screenX) || 0;
  const currentY = Number(screenY) || 0;
  const dx = currentX - overlayMoveSession.startX;
  const dy = currentY - overlayMoveSession.startY;
  suppressOverlayBoundsEventsUntil = Date.now() + 120;
  overlayWindow.setBounds({
    x: Math.round(overlayMoveSession.startBounds.x + dx),
    y: Math.round(overlayMoveSession.startBounds.y + dy),
    width: overlayMoveSession.startBounds.width,
    height: overlayMoveSession.startBounds.height,
  }, false);
  return true;
}

function endOverlayMove(sender) {
  if (!overlayMoveSession) return getOverlayState();
  if (!overlayWindow || overlayWindow.isDestroyed() || sender !== overlayWindow.webContents) {
    overlayMoveSession = null;
    return getOverlayState();
  }
  const currentBounds = overlayWindow.getBounds();
  const lockedBounds = {
    x: currentBounds.x,
    y: currentBounds.y,
    width: overlayMoveSession.startBounds.width,
    height: overlayMoveSession.startBounds.height,
  };
  markProgrammaticBoundsChange();
  overlayWindow.setBounds(lockedBounds, false);
  overlayMoveSession = null;
  suppressOverlayBoundsEventsUntil = 0;
  return persistCurrentOverlayBounds(true);
}

function resetOverlayToPreset() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return getOverlayState();
  const config = readConfig();
  const size = OVERLAY_SIZES[config.overlay.mode];
  markProgrammaticBoundsChange();
  overlayWindow.setSize(size.width, size.height, false);
  if (!config.overlay.manualPlacement) positionOverlay(config.overlay.corner);
  const overlay = normalizeOverlay({ ...config.overlay, bounds: overlayWindow.getBounds() });
  persistConfig({ ...config, overlay });
  return broadcastOverlayState();
}

function toggleOverlay(force) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return false;
  const shouldShow = typeof force === 'boolean' ? force : !overlayWindow.isVisible();
  if (shouldShow) overlayWindow.showInactive();
  else overlayWindow.hide();
  broadcastOverlayState();
  return shouldShow;
}

function toggleOverlayMode() {
  const state = getOverlayState();
  return updateOverlaySettings({ mode: state.mode === 'compact' ? 'full' : 'compact' });
}

function toggleClickThrough() {
  const state = getOverlayState();
  return updateOverlaySettings({ clickThrough: !state.clickThrough });
}

function detectDolphin() {
  if (process.platform !== 'win32') {
    return Promise.resolve({ running: false, supportedPlatform: false, title: '', pid: null, detectedGameId: null });
  }

  const now = Date.now();
  if (dolphinCache.result && now - dolphinCache.fetchedAt < DOLPHIN_CACHE_MS) {
    return Promise.resolve(dolphinCache.result);
  }
  if (dolphinCache.pending) return dolphinCache.pending;

  const command = [
    "$p = Get-Process | Where-Object { $_.ProcessName -match '^Dolphin' } | Select-Object -First 1;",
    "if ($p) { [PSCustomObject]@{ id=$p.Id; processName=$p.ProcessName; title=$p.MainWindowTitle } | ConvertTo-Json -Compress }"
  ].join(' ');

  const request = new Promise((resolve) => {
    execFile(getNativePowerShellPath(), ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 3000 }, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve({ running: false, supportedPlatform: true, title: '', pid: null, detectedGameId: null });
        return;
      }

      try {
        const data = JSON.parse(stdout.trim());
        const title = data.title || '';
        const isTwilightPrincess = /twilight\s+princess/i.test(title);
        resolve({
          running: true,
          supportedPlatform: true,
          title,
          pid: data.id || null,
          processName: data.processName || 'Dolphin',
          detectedGameId: isTwilightPrincess ? TWILIGHT_PRINCESS_GAME_ID : null,
        });
      } catch {
        resolve({ running: true, supportedPlatform: true, title: '', pid: null, detectedGameId: null });
      }
    });
  });

  dolphinCache.pending = request;
  return request.then((result) => {
    dolphinCache = { fetchedAt: Date.now(), result, pending: null };
    return result;
  }).catch((error) => {
    dolphinCache.pending = null;
    throw error;
  });
}

function broadcastRamState() {
  const state = getRamSnapshot();
  for (const win of [mainWindow, overlayWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send('ram:state-changed', state);
  }
  return state;
}

function resetRamState(error = 'RAM reader not started.') {
  ramLatest = {
    enabled: true,
    ok: false,
    attached: false,
    processId: null,
    error,
    timestamp: Date.now(),
  };
  if (app.isReady()) broadcastRamState();
}

function stopRamReader(reason = 'RAM reader stopped.') {
  if (ramReaderProcess) {
    try {
      ramReaderProcess.removeAllListeners();
      if (!ramReaderProcess.killed) ramReaderProcess.kill();
    } catch {
      // Best effort only; Dolphin shutdown can race the helper process.
    }
  }
  ramReaderProcess = null;
  ramReaderPid = null;
  ramReaderBuffer = '';
  resetRamState(reason);
}

function parseRamReaderChunk(chunk) {
  ramReaderBuffer += String(chunk || '');
  while (true) {
    const newline = ramReaderBuffer.indexOf('\n');
    if (newline < 0) break;
    const line = ramReaderBuffer.slice(0, newline).trim();
    ramReaderBuffer = ramReaderBuffer.slice(newline + 1);
    if (!line) continue;

    try {
      const parsed = JSON.parse(line);
      ramLatest = {
        enabled: true,
        ...parsed,
        processId: Number(parsed?.processId || ramReaderPid || 0) || null,
        timestamp: Number(parsed?.timestamp || Date.now()),
      };
      broadcastRamState();
    } catch {
      // PowerShell should only emit JSON lines. Keep the previous good sample if
      // a host/environment warning unexpectedly reaches stdout.
    }
  }
}

function startRamReader(pid) {
  if (process.platform !== 'win32' || !pid) return;
  if (ramReaderProcess && ramReaderPid === pid && !ramReaderProcess.killed) return;

  stopRamReader('Starting RAM reader…');
  ramReaderPid = pid;
  ramLatest = {
    enabled: true,
    ok: false,
    attached: false,
    processId: pid,
    error: 'Attaching to Dolphin MEM1…',
    timestamp: Date.now(),
  };

  const scriptPath = path.join(__dirname, '..', 'tools', 'ram-reader.ps1');
  const child = spawn(
    getNativePowerShellPath(),
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-TargetPid', String(pid), '-PollMs', '100'],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  ramReaderProcess = child;

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', parseRamReaderChunk);
  child.stderr.on('data', (chunk) => {
    const message = String(chunk || '').trim();
    if (!message) return;
    ramLatest = {
      ...ramLatest,
      enabled: true,
      ok: false,
      attached: false,
      processId: pid,
      error: message.split(/\r?\n/).slice(-1)[0],
      timestamp: Date.now(),
    };
  });

  child.on('error', (error) => {
    if (ramReaderProcess !== child) return;
    ramReaderProcess = null;
    ramReaderPid = null;
    ramLatest = {
      enabled: true,
      ok: false,
      attached: false,
      processId: pid,
      error: error?.message || 'Could not start RAM reader.',
      timestamp: Date.now(),
    };
  });

  child.on('exit', (code) => {
    if (ramReaderProcess !== child) return;
    ramReaderProcess = null;
    ramReaderPid = null;
    ramLatest = {
      ...ramLatest,
      enabled: true,
      ok: false,
      attached: false,
      processId: pid,
      error: ramLatest?.error || `RAM reader exited (${code ?? 'unknown'}).`,
      timestamp: Date.now(),
    };
  });
}

function ensureRamReader(dolphin) {
  if (process.platform !== 'win32') {
    if (ramReaderProcess || ramReaderPid) stopRamReader('RAM reader is Windows-only.');
    return ramLatest;
  }

  if (!dolphin?.running || !dolphin?.pid) {
    if (ramReaderProcess || ramReaderPid) stopRamReader('Dolphin is not running.');
    return ramLatest;
  }

  if (ramReaderPid !== dolphin.pid || !ramReaderProcess) startRamReader(dolphin.pid);
  return ramLatest;
}

function getRamSnapshot() {
  const ageMs = ramLatest?.timestamp ? Date.now() - Number(ramLatest.timestamp) : null;
  const stale = Boolean(ramLatest?.attached && ageMs !== null && ageMs > 3500);
  return {
    enabled: true,
    ...ramLatest,
    stale,
    ageMs,
  };
}

async function getRaProgress(gameId = TWILIGHT_PRINCESS_GAME_ID, force = false) {
  const config = readConfig();
  if (!config.username || !config.apiKey) {
    return { ok: false, needsConfig: true, error: 'RetroAchievements username/API key missing.' };
  }

  const now = Date.now();
  const sameTarget = raProgressCache.gameId === gameId && raProgressCache.username === config.username;
  if (!force && sameTarget && raProgressCache.result && now - raProgressCache.fetchedAt < RA_PROGRESS_CACHE_MS) {
    return raProgressCache.result;
  }
  if (!force && sameTarget && raProgressCache.pending) {
    return raProgressCache.pending;
  }

  const request = (async () => {
    const url = new URL('https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php');
    url.searchParams.set('y', config.apiKey);
    url.searchParams.set('u', config.username);
    url.searchParams.set('g', String(gameId));
    url.searchParams.set('a', '1');

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': `RA-Companion/${app.getVersion()} (Windows; desktop companion)` },
      });
      if (!response.ok) {
        return { ok: false, error: `RetroAchievements returned HTTP ${response.status}.` };
      }
      const data = await response.json();
      if (data?.Error) return { ok: false, error: data.Error, owner: config.username };
      return { ok: true, data, owner: config.username };
    } catch (error) {
      return { ok: false, error: error?.message || 'Could not reach RetroAchievements.', owner: config.username };
    }
  })();

  raProgressCache = {
    gameId,
    username: config.username,
    fetchedAt: now,
    result: sameTarget ? raProgressCache.result : null,
    pending: request,
  };

  const result = await request;
  raProgressCache = {
    gameId,
    username: config.username,
    fetchedAt: Date.now(),
    result,
    pending: null,
  };
  const currentConfig = readConfig();
  if (result?.ok && result?.data && currentConfig.username === config.username) {
    rememberAchievementGame(config.username, gameId, result.data);
  }
  return result;
}

async function verifyRaAccount() {
  const config = readConfig();
  if (!config.username || !config.apiKey) {
    return {
      ok: false,
      username: config.username || '',
      progressOwner: '',
      lastVerifiedAt: 0,
      error: 'RetroAchievements username/API key missing.',
    };
  }

  const requestedUsername = config.username;
  const result = await getRaProfile(true);
  const current = readConfig();
  if (current.username !== requestedUsername) {
    return {
      ok: false,
      username: current.username,
      progressOwner: '',
      lastVerifiedAt: 0,
      error: 'Account changed while verification was in progress. Please try again.',
    };
  }
  if (!result?.ok) {
    return {
      ok: false,
      username: requestedUsername,
      progressOwner: '',
      lastVerifiedAt: 0,
      error: result?.error || 'RetroAchievements verification failed.',
    };
  }

  const lastVerifiedAt = Date.now();
  persistConfig({
    ...current,
    verifiedUsername: requestedUsername,
    lastVerifiedAt,
  });
  broadcastAchievementLibraryChanged();
  return {
    ok: true,
    ...publicConfig(),
    username: requestedUsername,
    progressOwner: requestedUsername,
    lastVerifiedAt,
  };
}


async function getRaRecentAchievements() {
  const config = readConfig();
  if (!config.username || !config.apiKey) {
    return { ok: false, needsConfig: true, error: 'RetroAchievements username/API key missing.' };
  }

  const now = Date.now();
  const sameTarget = raRecentCache.username === config.username;
  if (sameTarget && raRecentCache.result && now - raRecentCache.fetchedAt < RA_RECENT_CACHE_MS) {
    return raRecentCache.result;
  }
  if (sameTarget && raRecentCache.pending) return raRecentCache.pending;

  const request = (async () => {
    const url = new URL('https://retroachievements.org/API/API_GetUserRecentAchievements.php');
    url.searchParams.set('y', config.apiKey);
    url.searchParams.set('u', config.username);
    url.searchParams.set('m', '60');
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': `RA-Companion/${app.getVersion()} (Windows; desktop companion)` },
      });
      if (!response.ok) return { ok: false, error: `RetroAchievements returned HTTP ${response.status}.` };
      const data = await response.json();
      if (data?.Error) return { ok: false, error: data.Error };
      return { ok: true, data: Array.isArray(data) ? data : [] };
    } catch (error) {
      return { ok: false, error: error?.message || 'Could not reach RetroAchievements recent unlocks.' };
    }
  })();

  raRecentCache = {
    username: config.username,
    fetchedAt: now,
    result: sameTarget ? raRecentCache.result : null,
    pending: request,
  };
  const result = await request;
  raRecentCache = { username: config.username, fetchedAt: Date.now(), result, pending: null };
  return result;
}

function mergeRecentHardcoreUnlocks(progress, recent, gameId) {
  if (!progress?.ok || !progress?.data || !recent?.ok || !Array.isArray(recent.data)) return progress;

  const rawAchievements = progress.data.Achievements;
  if (!rawAchievements) return progress;

  const achievements = Array.isArray(rawAchievements)
    ? rawAchievements.map((achievement) => ({ ...achievement }))
    : Object.fromEntries(Object.entries(rawAchievements).map(([id, achievement]) => [id, { ...achievement }]));

  let mergedCount = 0;
  for (const unlock of recent.data) {
    const unlockGameId = Number(unlock?.GameID ?? unlock?.gameId ?? 0);
    const hardcore = Boolean(Number(unlock?.HardcoreMode ?? (unlock?.hardcoreMode ? 1 : 0)));
    if (unlockGameId !== gameId || !hardcore) continue;

    const id = String(unlock?.AchievementID ?? unlock?.achievementId ?? '');
    if (!id) continue;
    const date = String(unlock?.Date ?? unlock?.date ?? new Date().toISOString());

    if (Array.isArray(achievements)) {
      const target = achievements.find((achievement) => String(achievement?.ID ?? achievement?.id ?? '') === id);
      if (target && !(target.DateEarnedHardcore || target.dateEarnedHardcore)) {
        target.DateEarnedHardcore = date;
        mergedCount += 1;
      }
    } else if (achievements[id]) {
      if (!(achievements[id].DateEarnedHardcore || achievements[id].dateEarnedHardcore)) {
        achievements[id].DateEarnedHardcore = date;
        mergedCount += 1;
      }
    }
  }

  if (!mergedCount) return progress;

  const list = Array.isArray(achievements) ? achievements : Object.values(achievements);
  const hardcoreCount = list.filter((achievement) => Boolean(achievement?.DateEarnedHardcore || achievement?.dateEarnedHardcore)).length;
  return {
    ...progress,
    data: {
      ...progress.data,
      Achievements: achievements,
      NumAwardedToUserHardcore: hardcoreCount,
    },
    recentMergeCount: mergedCount,
  };
}

async function getRaProfile(force = false) {
  const config = readConfig();
  if (!config.username || !config.apiKey) {
    return { ok: false, needsConfig: true, error: 'RetroAchievements username/API key missing.' };
  }

  const now = Date.now();
  const sameTarget = raProfileCache.username === config.username;
  if (!force && sameTarget && raProfileCache.result && now - raProfileCache.fetchedAt < RA_PROFILE_CACHE_MS) {
    return raProfileCache.result;
  }
  if (!force && sameTarget && raProfileCache.pending) return raProfileCache.pending;

  const request = (async () => {
    const url = new URL('https://retroachievements.org/API/API_GetUserProfile.php');
    url.searchParams.set('y', config.apiKey);
    url.searchParams.set('u', config.username);
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': `RA-Companion/${app.getVersion()} (Windows; desktop companion)` },
      });
      if (!response.ok) return { ok: false, error: `RetroAchievements returned HTTP ${response.status}.` };
      const data = await response.json();
      if (data?.Error) return { ok: false, error: data.Error };
      return {
        ok: true,
        data,
        message: String(data?.RichPresenceMsg ?? data?.richPresenceMsg ?? '').trim(),
        lastGameId: Number(data?.LastGameID ?? data?.lastGameId ?? 0) || null,
      };
    } catch (error) {
      return { ok: false, error: error?.message || 'Could not reach RetroAchievements.' };
    }
  })();

  raProfileCache = {
    username: config.username,
    fetchedAt: now,
    result: sameTarget ? raProfileCache.result : null,
    pending: request,
  };
  const result = await request;
  raProfileCache = { username: config.username, fetchedAt: Date.now(), result, pending: null };
  return result;
}

async function getSnapshot(forceRa = false) {
  const dolphin = await detectDolphin();
  ensureRamReader(dolphin);
  const ram = getRamSnapshot();

  const ramDetectsTwilightPrincess = Boolean(
    ram?.attached &&
    !ram?.stale &&
    String(ram?.gameCode || '') === 'GZ2E01',
  );
  const gameId = dolphin.detectedGameId || (ramDetectsTwilightPrincess ? TWILIGHT_PRINCESS_GAME_ID : null);
  const gameActive = Boolean(dolphin.running && gameId);

  // Never keep presenting cached context after the emulator/game closes.
  if (!gameActive) {
    return {
      timestamp: Date.now(),
      dolphin,
      ram,
      game: {
        id: null,
        profile: 'No game active',
        autoDetected: false,
        active: false,
      },
      progress: { ok: false, inactive: true, error: 'No supported game is currently active.' },
      recent: { ok: false, count: 0 },
      presence: { ok: false, inactive: true, error: 'No game active.', message: '', lastGameId: null, currentGameMatches: false, source: 'none' },
    };
  }

  const ramContextMarker = ram?.kind === 'dungeon' ? '🏰' : ram?.kind === 'area' ? '🗺️' : ram?.kind === 'building' ? '🏠' : ram?.kind === 'cave' ? '🕳️' : '';
  const ramStageCode = String(ram?.stageCode || '').trim();
  const ramFormMarker = ram?.linkForm === 'wolf' ? '🐺Link' : ram?.linkForm === 'human' ? '🧝Link' : '';
  const ramHeartPart = typeof ram?.currentHearts === 'number' && typeof ram?.maxHearts === 'number'
    ? `❤️${ram.currentHearts}/${ram.maxHearts}`
    : '';
  const ramFaronTears = ['F_SP108', 'R_SP108', 'D_SB10'].includes(ramStageCode)
    && ram?.storyFlags?.faronVesselObtained === true
    && typeof ram?.faronTears === 'number'
      ? `💧${Math.max(0, Math.min(16, ram.faronTears))}/16 Tears`
      : '';
  const ramPresenceMessage = ramDetectsTwilightPrincess && ram?.mapped && ramContextMarker
    ? [
        ramFormMarker,
        `${ramContextMarker}${String(ram.stageName || ram.stageCode || '').trim()}${ram?.boss ? ` ☠️${String(ram.boss).trim()}` : ''}`,
        ramHeartPart,
        typeof ram?.fusedShadows === 'number' ? `👥${ram.fusedShadows}/4` : '',
        typeof ram?.mirrorShards === 'number' ? `🧿${ram.mirrorShards}/4` : '',
        typeof ram?.poeSouls === 'number' ? `👻${ram.poeSouls}/60` : '',
        typeof ram?.goldenBugs === 'number' ? `🐜${ram.goldenBugs}/24` : '',
        typeof ram?.gameOvers === 'number' ? `💀${ram.gameOvers}` : '',
        ramFaronTears,
      ].filter(Boolean).join(' ')
    : '';
  const hasLiveRamContext = Boolean(ramPresenceMessage);
  const [baseProgress, recent, profile] = await Promise.all([
    getRaProgress(gameId, forceRa),
    getRaRecentAchievements(),
    hasLiveRamContext ? Promise.resolve(null) : getRaProfile(),
  ]);
  const progress = baseProgress;

  let presence;
  if (hasLiveRamContext) {
    presence = {
      ok: true,
      message: ramPresenceMessage,
      lastGameId: gameId,
      currentGameMatches: true,
      source: 'ram',
    };
  } else if (profile?.ok) {
    presence = {
      ok: true,
      message: profile.message || '',
      lastGameId: profile.lastGameId,
      currentGameMatches: profile.lastGameId === gameId,
      source: 'retro-achievements',
    };
  } else {
    presence = {
      ok: false,
      error: profile?.error || (ram?.error ? `RAM: ${ram.error}` : 'Context unavailable.'),
      message: '',
      lastGameId: null,
      currentGameMatches: false,
      source: 'none',
    };
  }

  return {
    timestamp: Date.now(),
    dolphin,
    ram,
    game: {
      id: gameId,
      profile: gameId === TWILIGHT_PRINCESS_GAME_ID ? 'The Legend of Zelda: Twilight Princess' : 'Unknown game',
      autoDetected: Boolean(dolphin.detectedGameId || ramDetectsTwilightPrincess),
      active: true,
    },
    progress,
    recent: { ok: Boolean(recent?.ok), count: Array.isArray(recent?.data) ? recent.data.length : 0 },
    presence,
  };
}

function createMainWindow() {
  const windowTitle = `RA Companion v${app.getVersion()}`;
  const appIconPath = path.join(__dirname, 'ra-icon.ico');
  mainWindow = new BrowserWindow({
    icon: appIconPath,
    width: 1360,
    height: 860,
    minWidth: 1020,
    minHeight: 680,
    backgroundColor: '#0a0d12',
    autoHideMenuBar: true,
    title: windowTitle,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.platform === 'win32') {
    mainWindow.setIcon(appIconPath);
    mainWindow.setAppDetails({
      appId: 'com.dutchdemon.racompanion',
      appIconPath,
      appIconIndex: 0,
      relaunchCommand: process.execPath,
      relaunchDisplayName: 'RA Companion',
    });
  }

  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
    if (!mainWindow.isDestroyed()) mainWindow.setTitle(windowTitle);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    // The overlay is a hidden BrowserWindow, so Electron would otherwise keep
    // the process alive after the user closes the visible main window.
    if (!appIsQuitting) app.quit();
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) mainWindow.loadURL(devUrl);
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

function focusOrCreateMainWindow() {
  if (!app.isReady()) return;
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createOverlayWindow() {
  const config = readConfig();
  const size = OVERLAY_SIZES[config.overlay.mode];
  const savedBounds = config.overlay.bounds;

  const appIconPath = path.join(__dirname, 'ra-icon.ico');
  overlayWindow = new BrowserWindow({
    icon: appIconPath,
    width: savedBounds?.width || size.width,
    height: savedBounds?.height || size.height,
    minWidth: MIN_OVERLAY_WIDTH,
    minHeight: MIN_OVERLAY_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    thickFrame: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  applyOverlaySettings(config.overlay, { broadcast: false, initial: true });

  overlayWindow.on('move', scheduleOverlayBoundsSave);
  overlayWindow.on('resize', scheduleOverlayBoundsSave);

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) overlayWindow.loadURL(`${devUrl}#overlay`);
  else overlayWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: 'overlay' });

  overlayWindow.webContents.on('did-finish-load', () => broadcastOverlayState());
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // If an old hidden overlay instance survived unexpectedly, a new launch
    // must still restore a usable main window instead of silently doing nothing.
    focusOrCreateMainWindow();
  });
}

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;
  // Migrate the old plaintext config to Windows/macOS/Linux safeStorage when available.
  const startupConfig = readConfig();
  const rawStartup = readRawConfig();
  if (startupConfig.apiKey && rawStartup.apiKey && safeStorage.isEncryptionAvailable()) {
    persistConfig(startupConfig);
  }

  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('config:get', () => publicConfig());
  ipcMain.handle('update:check', (_event, force) => checkForUpdates(Boolean(force)));
  ipcMain.handle('update:install', () => installAvailableUpdate());
  ipcMain.handle('config:save', (_event, config) => writeConfig(config));
  ipcMain.handle('account:verify', () => verifyRaAccount());
  ipcMain.handle('account:disconnect', () => disconnectRaAccount());
  ipcMain.handle('library:get', () => getAchievementLibrary());
  ipcMain.handle('library:refresh', () => refreshAchievementLibrary());
  ipcMain.handle('snapshot:get', (_event, forceRa) => getSnapshot(Boolean(forceRa)));
  ipcMain.handle('ram:get', () => getRamSnapshot());
  ipcMain.handle('overlay:toggle', (_event, force) => toggleOverlay(force));
  ipcMain.handle('overlay:state', () => getOverlayState());
  ipcMain.handle('overlay:update', (_event, patch) => updateOverlaySettings(patch));
  ipcMain.handle('overlay:reset-preset', () => resetOverlayToPreset());
  ipcMain.handle('shortcuts:state', () => publicShortcutState());
  ipcMain.handle('shortcuts:reregister', () => registerGlobalShortcuts());
  ipcMain.handle('shortcuts:update', (_event, patch) => updateShortcutSettings(patch));
  ipcMain.on('overlay:resize-start', (event, payload) => beginOverlayResize(payload?.direction, payload?.screenX, payload?.screenY, event.sender));
  ipcMain.on('overlay:resize-move', (event, payload) => moveOverlayResize(payload?.screenX, payload?.screenY, event.sender));
  ipcMain.on('overlay:resize-end', (event) => endOverlayResize(event.sender));
  ipcMain.on('overlay:move-start', (event, payload) => beginOverlayMove(payload?.screenX, payload?.screenY, event.sender));
  ipcMain.on('overlay:move-move', (event, payload) => moveOverlayMove(payload?.screenX, payload?.screenY, event.sender));
  ipcMain.on('overlay:move-end', (event) => endOverlayMove(event.sender));

  createMainWindow();
  createOverlayWindow();

  registerGlobalShortcuts();
  if (shortcutHealthTimer) clearInterval(shortcutHealthTimer);
  shortcutHealthTimer = setInterval(() => ensureGlobalShortcutsRegistered(), 15000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      createOverlayWindow();
    }
  });
});

app.on('before-quit', () => {
  appIsQuitting = true;
});
app.on('will-quit', () => {
  stopRamReader('Application closed.');
  if (shortcutHealthTimer) clearInterval(shortcutHealthTimer);
  shortcutHealthTimer = null;
  globalShortcut.unregisterAll();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
