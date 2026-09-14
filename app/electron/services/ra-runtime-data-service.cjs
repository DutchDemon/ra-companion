const fs = require('fs');
const path = require('path');

const RUNTIME_AUTH_VERSION = 1;
const RAPI_URL = 'https://retroachievements.org/dorequest.php';
const CORE_ACHIEVEMENT_CATEGORY = 3;
const GAME_DATA_CACHE_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15000;

function createRaRuntimeDataService({
  app,
  safeStorage,
  readConfig,
  observerRuntime,
  getRuntimeHelperStatus = null,
  fetchImpl = globalThis.fetch,
}) {
  if (!app || typeof app.getPath !== 'function') throw new Error('RA runtime data service requires app.getPath().');
  if (!safeStorage) throw new Error('RA runtime data service requires safeStorage.');
  if (typeof readConfig !== 'function') throw new Error('RA runtime data service requires readConfig().');
  if (!observerRuntime || typeof observerRuntime.loadGame !== 'function') {
    throw new Error('RA runtime data service requires observerRuntime.loadGame().');
  }
  if (typeof fetchImpl !== 'function') throw new Error('RA runtime data service requires fetch().');

  let memoryCredential = null;
  let gameDataCache = new Map();
  let syncPending = null;
  let syncPendingKey = '';
  let syncState = emptySyncState();

  function credentialPath() {
    return path.join(app.getPath('userData'), 'runtime-auth.json');
  }

  function emptySyncState() {
    return {
      phase: 'idle',
      gameId: null,
      gameCode: '',
      title: '',
      loadedAchievementCount: 0,
      excludedAchievementCount: 0,
      dolphinPid: null,
      error: '',
      observerOnly: true,
      officialCompletionAuthority: 'retroachievements-server',
    };
  }

  function normalizeUsername(value) {
    return String(value || '').trim();
  }

  function sameUsername(a, b) {
    const left = normalizeUsername(a);
    const right = normalizeUsername(b);
    return Boolean(left && right && left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0) ||
      (left && right && left.toLowerCase() === right.toLowerCase());
  }

  function encryptionAvailable() {
    try { return Boolean(safeStorage.isEncryptionAvailable()); } catch { return false; }
  }

  function removeCredentialFile() {
    try { fs.unlinkSync(credentialPath()); } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  function readCredentialFile() {
    try {
      const raw = JSON.parse(fs.readFileSync(credentialPath(), 'utf8'));
      if (Number(raw?.version || 0) !== RUNTIME_AUTH_VERSION) return null;
      const username = normalizeUsername(raw?.username);
      if (!username || !raw?.tokenEncrypted || !encryptionAvailable()) return null;
      const token = safeStorage.decryptString(Buffer.from(String(raw.tokenEncrypted), 'base64'));
      if (!token) return null;
      return {
        username,
        token,
        persistent: true,
        encrypted: true,
        lastValidatedAt: Number(raw?.lastValidatedAt || 0) || 0,
      };
    } catch {
      return null;
    }
  }

  function readCredential() {
    if (memoryCredential?.token) return { ...memoryCredential };
    const stored = readCredentialFile();
    if (stored) memoryCredential = stored;
    return stored ? { ...stored } : null;
  }

  function persistCredential({ username, token, lastValidatedAt = Date.now() }) {
    const normalizedUsername = normalizeUsername(username);
    const normalizedToken = String(token || '').trim();
    if (!normalizedUsername || !normalizedToken) throw new Error('Runtime username/token are required.');

    if (encryptionAvailable()) {
      const raw = {
        version: RUNTIME_AUTH_VERSION,
        username: normalizedUsername,
        tokenEncrypted: safeStorage.encryptString(normalizedToken).toString('base64'),
        lastValidatedAt: Number(lastValidatedAt || Date.now()),
      };
      fs.mkdirSync(path.dirname(credentialPath()), { recursive: true });
      fs.writeFileSync(credentialPath(), JSON.stringify(raw, null, 2), 'utf8');
      memoryCredential = {
        username: normalizedUsername,
        token: normalizedToken,
        persistent: true,
        encrypted: true,
        lastValidatedAt: raw.lastValidatedAt,
      };
    } else {
      // A runtime token is stronger than the public Web API key. If OS-backed
      // encryption is unavailable, keep it in memory for this process only.
      removeCredentialFile();
      memoryCredential = {
        username: normalizedUsername,
        token: normalizedToken,
        persistent: false,
        encrypted: false,
        lastValidatedAt: Number(lastValidatedAt || Date.now()),
      };
    }

    return getAuthStatus();
  }

  function clearCredential() {
    memoryCredential = null;
    removeCredentialFile();
    gameDataCache = new Map();
    syncPending = null;
    syncPendingKey = '';
    syncState = emptySyncState();
  }

  function getConfiguredAccount() {
    const config = readConfig() || {};
    const username = normalizeUsername(config.username);
    const verifiedUsername = normalizeUsername(config.verifiedUsername);
    return {
      username,
      verifiedUsername,
      verified: Boolean(username && verifiedUsername && sameUsername(username, verifiedUsername)),
    };
  }

  function getAuthStatus() {
    const configured = getConfiguredAccount();
    const credential = readCredential();
    const accountMatches = Boolean(credential && configured.username && sameUsername(credential.username, configured.username));
    const connected = Boolean(credential?.token && configured.verified && accountMatches);
    return {
      connected,
      username: connected ? credential.username : '',
      configuredUsername: configured.username,
      webAccountVerified: configured.verified,
      accountMatches,
      persistent: Boolean(connected && credential.persistent),
      encrypted: Boolean(connected && credential.encrypted),
      lastValidatedAt: connected ? Number(credential.lastValidatedAt || 0) : 0,
      needsWebAccount: !configured.verified,
      observerOnly: true,
      officialCompletionAuthority: 'retroachievements-server',
    };
  }

  function requireCredential() {
    const status = getAuthStatus();
    const credential = readCredential();
    if (!status.connected || !credential?.token) {
      if (credential && !status.accountMatches) clearCredential();
      throw new Error(status.needsWebAccount
        ? 'Connect and verify the Web API account first.'
        : 'RetroAchievements runtime data is not connected.');
    }
    return credential;
  }

  function responseSucceeded(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.Success === true || data.Success === 1 || data.Success === '1') return true;
    return !Object.prototype.hasOwnProperty.call(data, 'Success') && !data.Error;
  }

  async function requestRapi(params) {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) {
      if (value === undefined || value === null) continue;
      body.set(key, String(value));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(RAPI_URL, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': `RA-Companion/${typeof app.getVersion === 'function' ? app.getVersion() : '0'} (rcheevos observer)`,
        },
        body: body.toString(),
        signal: controller.signal,
      });
      if (!response?.ok) throw new Error(`RetroAchievements runtime API returned HTTP ${response?.status || 0}.`);
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error('RetroAchievements runtime API returned invalid JSON.'); }
      if (!responseSucceeded(data)) {
        throw new Error(String(data?.Error || data?.Code || 'RetroAchievements runtime API rejected the request.'));
      }
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('RetroAchievements runtime API request timed out.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function loginWithPassword(input) {
    const password = String(typeof input === 'string' ? input : input?.password || '');
    if (!password) throw new Error('RetroAchievements password is required for the one-time runtime token exchange.');

    const configured = getConfiguredAccount();
    if (!configured.verified) throw new Error('Connect and verify the Web API account before connecting runtime data.');

    const data = await requestRapi({ r: 'login2', u: configured.username, p: password });
    const returnedUsername = normalizeUsername(data?.User);
    const token = String(data?.Token || '').trim();
    if (!returnedUsername || !token) throw new Error('RetroAchievements login did not return a runtime token.');
    if (!sameUsername(returnedUsername, configured.username)) {
      clearCredential();
      throw new Error(`Runtime login returned a different account (${returnedUsername}).`);
    }

    persistCredential({ username: returnedUsername, token, lastValidatedAt: Date.now() });
    return getAuthStatus();
  }

  async function validateStoredToken() {
    const credential = requireCredential();
    try {
      const data = await requestRapi({ r: 'login2', u: credential.username, t: credential.token });
      const returnedUsername = normalizeUsername(data?.User);
      const token = String(data?.Token || '').trim();
      if (!returnedUsername || !token || !sameUsername(returnedUsername, credential.username)) {
        throw new Error('RetroAchievements runtime token validation returned an unexpected account.');
      }
      persistCredential({ username: returnedUsername, token, lastValidatedAt: Date.now() });
      return getAuthStatus();
    } catch (error) {
      clearCredential();
      try { await observerRuntime.clearGame(); } catch { /* best effort */ }
      throw error;
    }
  }

  function normalizeAchievementType(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'missable') return 'missable';
    if (raw === 'progression') return 'progression';
    if (raw === 'win_condition' || raw === 'win') return 'win';
    return 'standard';
  }

  function requirePositiveInteger(value, label) {
    const number = Number(value || 0);
    if (!Number.isInteger(number) || number <= 0 || number > 0xFFFFFFFF) throw new Error(`${label} is invalid.`);
    return number;
  }

  function imageNameFromPath(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    const filename = text.split('/').filter(Boolean).slice(-1)[0] || '';
    return filename.replace(/\.[^.]+$/, '');
  }

  function normalizeAchievement(raw, index) {
    const id = requirePositiveInteger(raw?.ID, `Achievement at index ${index} ID`);
    const category = Number(raw?.Flags);
    if (!Number.isInteger(category)) throw new Error(`Achievement ${id} category is invalid.`);
    const definition = String(raw?.MemAddr || '');
    if (!definition.trim()) throw new Error(`Achievement ${id} has no rcheevos definition.`);

    return {
      id,
      title: String(raw?.Title || ''),
      description: String(raw?.Description || ''),
      points: Math.max(0, Number(raw?.Points || 0) || 0),
      category,
      type: normalizeAchievementType(raw?.Type),
      rawType: String(raw?.Type || ''),
      definition,
      author: String(raw?.Author || ''),
      badgeName: String(raw?.BadgeName || ''),
      badgeUrl: String(raw?.BadgeURL || ''),
      badgeLockedUrl: String(raw?.BadgeLockedURL || ''),
      created: raw?.Created ?? null,
      modified: raw?.Modified ?? null,
      rarity: Number(raw?.Rarity ?? 100),
      rarityHardcore: Number(raw?.RarityHardcore ?? 100),
    };
  }

  function normalizeLeaderboard(raw, index) {
    const id = requirePositiveInteger(raw?.ID, `Leaderboard at index ${index} ID`);
    const definition = String(raw?.Mem || '');
    if (!definition.trim()) throw new Error(`Leaderboard ${id} has no rcheevos definition.`);
    return {
      id,
      title: String(raw?.Title || ''),
      description: String(raw?.Description || ''),
      definition,
      format: String(raw?.Format || ''),
      lowerIsBetter: Boolean(raw?.LowerIsBetter),
      hidden: Boolean(raw?.Hidden),
    };
  }

  function normalizePatchData(data, requestedGameId) {
    const patch = data?.PatchData;
    if (!patch || typeof patch !== 'object') throw new Error('RetroAchievements runtime API response has no PatchData.');
    const id = requirePositiveInteger(patch.ID, 'PatchData game ID');
    if (id !== requestedGameId) throw new Error(`RetroAchievements returned game ${id}, expected ${requestedGameId}.`);
    const consoleId = requirePositiveInteger(patch.ConsoleID, 'PatchData console ID');
    if (!Array.isArray(patch.Achievements)) throw new Error('RetroAchievements PatchData has no achievements array.');
    if (!Array.isArray(patch.Leaderboards)) throw new Error('RetroAchievements PatchData has no leaderboards array.');

    const imageName = imageNameFromPath(patch.ImageIcon);
    return {
      id,
      consoleId,
      title: String(patch.Title || ''),
      imageName,
      imageUrl: String(patch.ImageIconURL || ''),
      richPresenceScript: String(patch.RichPresencePatch || ''),
      achievements: patch.Achievements.map(normalizeAchievement),
      leaderboards: patch.Leaderboards.map(normalizeLeaderboard),
      source: 'retroachievements-runtime-api',
      observerOnly: true,
    };
  }

  async function fetchGameData(gameId, options = {}) {
    const requestedGameId = requirePositiveInteger(gameId, 'RetroAchievements game ID');
    const credential = requireCredential();
    const key = `${credential.username.toLowerCase()}:${requestedGameId}`;
    const now = Date.now();
    const cached = gameDataCache.get(key);
    if (!options.force && cached && now - cached.fetchedAt < GAME_DATA_CACHE_MS) return cached.result;

    const data = await requestRapi({ r: 'patch', u: credential.username, t: credential.token, g: requestedGameId });
    const result = normalizePatchData(data, requestedGameId);
    gameDataCache.set(key, { fetchedAt: Date.now(), result });
    return result;
  }

  async function loadGameIntoObserver({ gameId, gameCode = '', force = false } = {}) {
    const data = await fetchGameData(gameId, { force });
    const coreAchievements = data.achievements.filter((achievement) => achievement.category === CORE_ACHIEVEMENT_CATEGORY);
    if (!coreAchievements.length) throw new Error(`RetroAchievements returned no core achievements for game ${data.id}.`);

    const observer = await observerRuntime.loadGame({
      gameId: data.id,
      gameCode,
      richPresenceScript: data.richPresenceScript,
      achievements: coreAchievements.map((achievement) => ({
        achievementId: achievement.id,
        definition: achievement.definition,
      })),
    });

    return {
      ok: true,
      game: {
        id: data.id,
        consoleId: data.consoleId,
        title: data.title,
        imageName: data.imageName,
        imageUrl: data.imageUrl,
        richPresenceScript: data.richPresenceScript,
      },
      loadedAchievementCount: coreAchievements.length,
      excludedAchievementCount: data.achievements.length - coreAchievements.length,
      observer,
      observerOnly: true,
      officialCompletionAuthority: 'retroachievements-server',
    };
  }

  function helperMatchesObserver(observerStatus) {
    if (!observerStatus?.sealed) return false;
    if (typeof getRuntimeHelperStatus !== 'function' || !observerStatus.helperPid) return true;
    const helper = getRuntimeHelperStatus();
    return Boolean(helper?.running && helper?.ready && Number(helper.pid || 0) === Number(observerStatus.helperPid || 0));
  }

  async function ensureObserverGame({ gameId, gameCode = '', dolphinPid = null, force = false } = {}) {
    const requestedGameId = requirePositiveInteger(gameId, 'RetroAchievements game ID');
    const normalizedGameCode = String(gameCode || '').trim().toUpperCase();
    const normalizedPid = Number(dolphinPid || 0) || null;
    const auth = getAuthStatus();
    if (!auth.connected) {
      syncState = { ...emptySyncState(), phase: 'disconnected', gameId: requestedGameId, gameCode: normalizedGameCode, error: auth.needsWebAccount ? 'Web API account is not verified.' : 'Runtime data is not connected.' };
      return getSyncStatus();
    }

    const key = `${auth.username.toLowerCase()}:${requestedGameId}:${normalizedGameCode}:${normalizedPid || 0}`;
    if (syncPending && syncPendingKey === key) return syncPending;

    const existing = observerRuntime.getStatus();
    if (!force && existing.gameId === requestedGameId && existing.sealed && helperMatchesObserver(existing)) {
      try {
        if (normalizedPid) await observerRuntime.attachDolphin(normalizedPid);
        syncState = {
          ...syncState,
          phase: 'ready',
          gameId: requestedGameId,
          gameCode: normalizedGameCode || existing.gameCode || '',
          loadedAchievementCount: Number(existing.loadedAchievementCount || 0),
          dolphinPid: normalizedPid,
          error: '',
        };
        return getSyncStatus();
      } catch (error) {
        // A helper restart or changed Dolphin mapping requires a clean reload below.
        syncState = { ...syncState, phase: 'loading', error: error?.message || String(error) };
      }
    }

    syncState = { ...emptySyncState(), phase: 'fetching', gameId: requestedGameId, gameCode: normalizedGameCode, dolphinPid: normalizedPid };
    const pending = (async () => {
      try {
        const loaded = await loadGameIntoObserver({ gameId: requestedGameId, gameCode: normalizedGameCode, force });
        syncState = {
          ...syncState,
          phase: 'loading',
          title: loaded.game.title,
          loadedAchievementCount: loaded.loadedAchievementCount,
          excludedAchievementCount: loaded.excludedAchievementCount,
        };
        if (normalizedPid) await observerRuntime.attachDolphin(normalizedPid);
        syncState = { ...syncState, phase: 'ready', error: '' };
        return getSyncStatus();
      } catch (error) {
        syncState = {
          ...syncState,
          phase: 'error',
          error: error?.message || String(error || 'Runtime observer sync failed.'),
        };
        throw error;
      } finally {
        if (syncPending === pending) {
          syncPending = null;
          syncPendingKey = '';
        }
      }
    })();

    syncPending = pending;
    syncPendingKey = key;
    return pending;
  }

  function getSyncStatus() {
    return { ...syncState };
  }

  async function disconnectRuntimeAccount() {
    clearCredential();
    try { await observerRuntime.clearGame(); } catch { /* best effort */ }
    return getAuthStatus();
  }

  function handleWebAccountChanged(nextUsername) {
    const credential = readCredential();
    if (!credential) return false;
    if (nextUsername && sameUsername(credential.username, nextUsername)) return false;
    clearCredential();
    Promise.resolve(observerRuntime.clearGame()).catch(() => {});
    return true;
  }

  return {
    getAuthStatus,
    loginWithPassword,
    validateStoredToken,
    disconnectRuntimeAccount,
    fetchGameData,
    loadGameIntoObserver,
    ensureObserverGame,
    getSyncStatus,
    handleWebAccountChanged,
    getCredentialPath: credentialPath,
  };
}

module.exports = {
  createRaRuntimeDataService,
  RAPI_URL,
  CORE_ACHIEVEMENT_CATEGORY,
};
