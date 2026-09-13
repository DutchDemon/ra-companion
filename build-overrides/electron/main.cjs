const { app, BrowserWindow, ipcMain, globalShortcut, screen, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

// Keep settings in the same location used by the development/portable builds.
app.setPath('userData', path.join(app.getPath('appData'), 'ra-companion'));

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

function getUpdater() {
  if (appUpdater) return appUpdater;
  if (process.platform !== 'win32' || !app.isPackaged) return null;

  const updater = autoUpdater;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowDowngrade = false;

  updater.on('error', (error) => {
    updateStatusCache = {
      ok: false,
      currentVersion: app.getVersion(),
      available: false,
      error: error?.message || 'Update check failed.',
      packaged: app.isPackaged,
    };
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
  if (!status.available) return { ...status, installing: false, message: 'RA Companion is already up to date.' };

  try {
    const updater = getUpdater();
    await updater.downloadUpdate();
    const result = { ...status, installing: true, message: `Installing RA Companion ${status.latestVersion}…` };
    setTimeout(() => updater.quitAndInstall(false, true), 250);
    return result;
  } catch (error) {
    return {
      ...status,
      ok: false,
      installing: false,
      error: error?.message || 'Could not download or install the update.',
    };
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
let overlayBoundsTimer = null;
let suppressOverlayBoundsEventsUntil = 0;
let overlayResizeSession = null;
let overlayMoveSession = null;
let raProgressCache = { gameId: null, username: '', fetchedAt: 0, result: null, pending: null };
const RA_PROGRESS_CACHE_MS = 60000;
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

function readConfig() {
  const raw = readRawConfig();
  return {
    username: String(raw.username || '').trim(),
    apiKey: decryptApiKey(raw).trim(),
    overlay: normalizeOverlay(raw.overlay || DEFAULT_OVERLAY),
  };
}

function persistConfig(config) {
  const raw = {
    username: String(config.username || '').trim(),
    overlay: normalizeOverlay(config.overlay || DEFAULT_OVERLAY),
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

function writeConfig(next) {
  const existing = readConfig();
  const suppliedKey = String(next?.apiKey || '').trim();
  const merged = {
    username: String(next?.username ?? existing.username).trim(),
    apiKey: suppliedKey || existing.apiKey,
    overlay: existing.overlay,
  };
  persistConfig(merged);
  raProgressCache = { gameId: null, username: '', fetchedAt: 0, result: null, pending: null };
  raRecentCache = { username: '', fetchedAt: 0, result: null, pending: null };
  raProfileCache = { username: '', fetchedAt: 0, result: null, pending: null };
  return publicConfig();
}

function publicConfig() {
  const config = readConfig();
  return {
    username: config.username || '',
    hasApiKey: Boolean(config.apiKey),
    apiKeyEncrypted: Boolean(readRawConfig().apiKeyEncrypted),
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
  overlayWindow.setPosition(
    Math.round(overlayMoveSession.startBounds.x + dx),
    Math.round(overlayMoveSession.startBounds.y + dy),
    false,
  );
  return true;
}

function endOverlayMove(sender) {
  if (!overlayMoveSession) return getOverlayState();
  if (!overlayWindow || overlayWindow.isDestroyed() || sender !== overlayWindow.webContents) {
    overlayMoveSession = null;
    return getOverlayState();
  }
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

async function getRaProgress(gameId = TWILIGHT_PRINCESS_GAME_ID) {
  const config = readConfig();
  if (!config.username || !config.apiKey) {
    return { ok: false, needsConfig: true, error: 'RetroAchievements username/API key missing.' };
  }

  const now = Date.now();
  const sameTarget = raProgressCache.gameId === gameId && raProgressCache.username === config.username;
  if (sameTarget && raProgressCache.result && now - raProgressCache.fetchedAt < RA_PROGRESS_CACHE_MS) {
    return raProgressCache.result;
  }
  if (sameTarget && raProgressCache.pending) {
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
      if (data?.Error) return { ok: false, error: data.Error };
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: error?.message || 'Could not reach RetroAchievements.' };
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
  return result;
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

async function getRaProfile() {
  const config = readConfig();
  if (!config.username || !config.apiKey) {
    return { ok: false, needsConfig: true, error: 'RetroAchievements username/API key missing.' };
  }

  const now = Date.now();
  const sameTarget = raProfileCache.username === config.username;
  if (sameTarget && raProfileCache.result && now - raProfileCache.fetchedAt < RA_PROFILE_CACHE_MS) {
    return raProfileCache.result;
  }
  if (sameTarget && raProfileCache.pending) return raProfileCache.pending;

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

async function getSnapshot() {
  const dolphin = await detectDolphin();
  ensureRamReader(dolphin);
  const ram = getRamSnapshot();

  const ramDetectsTwilightPrincess = Boolean(
    ram?.attached &&
    !ram?.stale &&
    ['GZ2E01', 'GZ2P01', 'GZ2J01'].includes(String(ram?.gameCode || '')),
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
  const ramPresenceMessage = ramDetectsTwilightPrincess && ram?.mapped && ramContextMarker
    ? `${ramContextMarker}${String(ram.stageName || ram.stageCode || '').trim()}${ram?.boss ? ` ☠️${String(ram.boss).trim()}` : ''}`
    : '';
  const hasLiveRamContext = Boolean(ramPresenceMessage);
  const [baseProgress, recent, profile] = await Promise.all([
    getRaProgress(gameId),
    getRaRecentAchievements(),
    hasLiveRamContext ? Promise.resolve(null) : getRaProfile(),
  ]);
  const progress = mergeRecentHardcoreUnlocks(baseProgress, recent, gameId);

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
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#0a0d12',
    title: 'RA Companion',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) mainWindow.loadURL(devUrl);
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

function createOverlayWindow() {
  const config = readConfig();
  const size = OVERLAY_SIZES[config.overlay.mode];
  const savedBounds = config.overlay.bounds;

  overlayWindow = new BrowserWindow({
    width: savedBounds?.width || size.width,
    height: savedBounds?.height || size.height,
    minWidth: MIN_OVERLAY_WIDTH,
    minHeight: MIN_OVERLAY_HEIGHT,
    frame: false,
    transparent: true,
    resizable: true,
    movable: true,
    thickFrame: true,
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

app.whenReady().then(() => {
  // Migrate the old plaintext config to Windows/macOS/Linux safeStorage when available.
  const startupConfig = readConfig();
  const rawStartup = readRawConfig();
  if (startupConfig.apiKey && rawStartup.apiKey && safeStorage.isEncryptionAvailable()) {
    persistConfig(startupConfig);
  }

  ipcMain.handle('config:get', () => publicConfig());
  ipcMain.handle('update:check', (_event, force) => checkForUpdates(Boolean(force)));
  ipcMain.handle('update:install', () => installAvailableUpdate());
  ipcMain.handle('config:save', (_event, config) => writeConfig(config));
  ipcMain.handle('snapshot:get', () => getSnapshot());
  ipcMain.handle('ram:get', () => getRamSnapshot());
  ipcMain.handle('overlay:toggle', (_event, force) => toggleOverlay(force));
  ipcMain.handle('overlay:state', () => getOverlayState());
  ipcMain.handle('overlay:update', (_event, patch) => updateOverlaySettings(patch));
  ipcMain.handle('overlay:reset-preset', () => resetOverlayToPreset());
  ipcMain.on('overlay:resize-start', (event, payload) => beginOverlayResize(payload?.direction, payload?.screenX, payload?.screenY, event.sender));
  ipcMain.on('overlay:resize-move', (event, payload) => moveOverlayResize(payload?.screenX, payload?.screenY, event.sender));
  ipcMain.on('overlay:resize-end', (event) => endOverlayResize(event.sender));
  ipcMain.on('overlay:move-start', (event, payload) => beginOverlayMove(payload?.screenX, payload?.screenY, event.sender));
  ipcMain.on('overlay:move-move', (event, payload) => moveOverlayMove(payload?.screenX, payload?.screenY, event.sender));
  ipcMain.on('overlay:move-end', (event) => endOverlayMove(event.sender));

  createMainWindow();
  createOverlayWindow();

  globalShortcut.register('CommandOrControl+Shift+O', () => toggleOverlay());
  globalShortcut.register('CommandOrControl+Shift+C', () => toggleClickThrough());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      createOverlayWindow();
    }
  });
});

app.on('will-quit', () => {
  stopRamReader('Application closed.');
  globalShortcut.unregisterAll();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
