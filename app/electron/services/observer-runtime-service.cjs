const MAX_UINT32 = 0xFFFFFFFF;
const MAX_DEFINITION_BYTES = 24575;

function createObserverRuntimeService({ runtimeHelper }) {
  if (!runtimeHelper || typeof runtimeHelper.request !== 'function') {
    throw new Error('observer runtime requires a runtimeHelper with request().');
  }

  let state = emptyState();

  function emptyState() {
    return {
      gameId: null,
      gameCode: '',
      expectedAchievementCount: 0,
      loadedAchievementCount: 0,
      loading: false,
      sealed: false,
      achievementIds: [],
      helperPid: null,
      lastError: '',
    };
  }

  function publicStatus() {
    return {
      gameId: state.gameId,
      gameCode: state.gameCode,
      expectedAchievementCount: state.expectedAchievementCount,
      loadedAchievementCount: state.loadedAchievementCount,
      loading: state.loading,
      sealed: state.sealed,
      achievementIds: [...state.achievementIds],
      helperPid: state.helperPid,
      lastError: state.lastError,
      observerOnly: true,
      officialCompletionAuthority: 'retroachievements-server',
    };
  }

  function normalizeGameId(value) {
    const gameId = Number(value || 0);
    if (!Number.isInteger(gameId) || gameId <= 0 || gameId > MAX_UINT32) {
      throw new Error('A valid RetroAchievements gameId is required.');
    }
    return gameId;
  }

  function normalizeGameCode(value) {
    const gameCode = String(value || '').trim().toUpperCase();
    if (!gameCode) return '';
    if (!/^[A-Z0-9]{6}$/.test(gameCode)) {
      throw new Error('GameCube gameCode must be exactly six ASCII letters/numbers.');
    }
    return gameCode;
  }

  function normalizeAchievements(value) {
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error('At least one raw achievement definition is required.');
    }

    const seen = new Set();
    return value.map((entry, index) => {
      const achievementId = Number(entry?.achievementId ?? entry?.id ?? 0);
      if (!Number.isInteger(achievementId) || achievementId <= 0 || achievementId > MAX_UINT32) {
        throw new Error(`Achievement at index ${index} has an invalid id.`);
      }
      if (seen.has(achievementId)) {
        throw new Error(`Duplicate achievement id ${achievementId}.`);
      }
      seen.add(achievementId);

      const definition = String(entry?.definition || '');
      if (!definition.trim()) {
        throw new Error(`Achievement ${achievementId} has no raw rcheevos definition.`);
      }
      if (Buffer.byteLength(definition, 'utf8') > MAX_DEFINITION_BYTES) {
        throw new Error(`Achievement ${achievementId} definition exceeds the current helper protocol limit.`);
      }

      return { achievementId, definition };
    });
  }

  function currentHelperStatus() {
    return typeof runtimeHelper.getStatus === 'function' ? runtimeHelper.getStatus() : null;
  }

  function currentHelperPid() {
    const status = currentHelperStatus();
    return Number(status?.pid || 0) || null;
  }

  function assertHelperGeneration() {
    if (!state.helperPid || typeof runtimeHelper.getStatus !== 'function') return;
    const helper = currentHelperStatus();
    const pid = Number(helper?.pid || 0) || null;
    if (!helper?.running || !helper?.ready || pid !== state.helperPid) {
      const message = 'Runtime helper restarted after definitions were loaded; observer definitions must be reloaded.';
      state = { ...state, sealed: false, lastError: message };
      throw new Error(message);
    }
  }

  async function bestEffortDeactivate(ids) {
    for (const achievementId of ids) {
      try {
        await runtimeHelper.request('deactivateAchievement', { achievementId }, 5000);
      } catch {
        // The helper may have restarted. A later load will rebuild the known set.
      }
    }
  }

  async function clearGame() {
    const ids = [...state.achievementIds];
    state = { ...state, loading: true, sealed: false, lastError: '' };
    await bestEffortDeactivate(ids);
    try {
      await runtimeHelper.request('reset', {}, 5000);
    } catch {
      // Reset is best effort after deactivation. No definition is considered loaded below.
    }
    state = emptyState();
    return publicStatus();
  }

  async function loadGame(input) {
    if (state.loading) throw new Error('An observer game load is already in progress.');

    const gameId = normalizeGameId(input?.gameId);
    const gameCode = normalizeGameCode(input?.gameCode);
    const achievements = normalizeAchievements(input?.achievements);

    await clearGame();
    state = {
      gameId,
      gameCode,
      expectedAchievementCount: achievements.length,
      loadedAchievementCount: 0,
      loading: true,
      sealed: false,
      achievementIds: [],
      helperPid: null,
      lastError: '',
    };

    const activatedIds = [];
    try {
      for (const achievement of achievements) {
        await runtimeHelper.request('activateAchievement', achievement, 5000);
        activatedIds.push(achievement.achievementId);
        state = {
          ...state,
          loadedAchievementCount: activatedIds.length,
          achievementIds: [...activatedIds],
        };
      }

      if (activatedIds.length !== achievements.length) {
        throw new Error(`Observer game load was incomplete (${activatedIds.length}/${achievements.length}).`);
      }

      state = {
        ...state,
        loading: false,
        sealed: true,
        loadedAchievementCount: activatedIds.length,
        achievementIds: [...activatedIds],
        helperPid: currentHelperPid(),
        lastError: '',
      };
      return publicStatus();
    } catch (error) {
      await bestEffortDeactivate(activatedIds);
      try { await runtimeHelper.request('reset', {}, 5000); } catch { /* best effort */ }
      const message = error?.message || String(error || 'Observer game load failed.');
      state = { ...emptyState(), lastError: message };
      throw new Error(`Could not load RA observer definitions for game ${gameId}: ${message}`);
    }
  }

  async function memoryStatus() {
    if (typeof runtimeHelper.getMemoryStatus === 'function') {
      return runtimeHelper.getMemoryStatus();
    }
    return runtimeHelper.request('memoryStatus', {}, 5000);
  }

  async function validateAttachedGame() {
    if (!state.sealed || !state.gameId) {
      throw new Error('No sealed observer game is loaded.');
    }

    assertHelperGeneration();
    const memory = await memoryStatus();
    if (!memory?.attached) throw new Error('Dolphin memory is not attached.');
    if (!memory?.gameCubeMagic) throw new Error('Attached Dolphin memory does not contain a valid GameCube image.');

    const actualGameCode = String(memory.gameCode || '').trim().toUpperCase();
    if (state.gameCode && actualGameCode !== state.gameCode) {
      throw new Error(`Observer game mismatch: expected ${state.gameCode}, Dolphin is ${actualGameCode || 'unknown'}.`);
    }

    return memory;
  }

  async function attachDolphin(pid) {
    const normalizedPid = Number(pid || 0);
    if (!Number.isInteger(normalizedPid) || normalizedPid <= 0) {
      throw new Error('A valid Dolphin process ID is required.');
    }

    const result = typeof runtimeHelper.attachDolphin === 'function'
      ? await runtimeHelper.attachDolphin(normalizedPid)
      : await runtimeHelper.request('attachDolphin', { pid: normalizedPid }, 5000);

    if (state.sealed && state.gameCode) await validateAttachedGame();
    return result;
  }

  function ensureLoadedAchievementId(value) {
    const achievementId = Number(value || 0);
    if (!Number.isInteger(achievementId) || !state.achievementIds.includes(achievementId)) {
      throw new Error(`Achievement ${value} is not part of the loaded observer game.`);
    }
    return achievementId;
  }

  async function getAchievementStatus(achievementId) {
    assertHelperGeneration();
    const id = ensureLoadedAchievementId(achievementId);
    return runtimeHelper.request('achievementStatus', { achievementId: id }, 5000);
  }

  async function getAchievementStatuses(achievementIds = state.achievementIds) {
    assertHelperGeneration();
    const ids = achievementIds.map(ensureLoadedAchievementId);
    return Promise.all(ids.map((achievementId) => getAchievementStatus(achievementId)));
  }

  async function evaluateFrame() {
    const memory = await validateAttachedGame();
    const frame = await runtimeHelper.request('evaluateFrame', {}, 5000);
    const changedIds = [...new Set(
      (Array.isArray(frame?.events) ? frame.events : [])
        .map((event) => Number(event?.achievementId || 0))
        .filter((achievementId) => state.achievementIds.includes(achievementId)),
    )];
    const statuses = changedIds.length ? await getAchievementStatuses(changedIds) : [];

    return {
      ...frame,
      gameId: state.gameId,
      gameCode: state.gameCode || String(memory?.gameCode || ''),
      observerOnly: true,
      officialCompletionAuthority: 'retroachievements-server',
      statuses,
    };
  }

  return {
    loadGame,
    clearGame,
    attachDolphin,
    evaluateFrame,
    getAchievementStatus,
    getAchievementStatuses,
    validateAttachedGame,
    getStatus: publicStatus,
  };
}

module.exports = { createObserverRuntimeService };
