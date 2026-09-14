const MAX_UINT32 = 0xFFFFFFFF;
const MAX_DEFINITION_BYTES = 24575;
const DEFAULT_LIVE_INTERVAL_MS = 16;
const DEFAULT_LIVE_RETRY_MS = 250;
const MAX_RECENT_EVENTS = 32;

function createObserverRuntimeService({
  runtimeHelper,
  liveIntervalMs = DEFAULT_LIVE_INTERVAL_MS,
  liveRetryMs = DEFAULT_LIVE_RETRY_MS,
  enableLiveTimer = true,
  now = () => Date.now(),
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
}) {
  if (!runtimeHelper || typeof runtimeHelper.request !== 'function') {
    throw new Error('observer runtime requires a runtimeHelper with request().');
  }

  const normalizedLiveIntervalMs = Math.max(8, Math.min(1000, Number(liveIntervalMs) || DEFAULT_LIVE_INTERVAL_MS));
  const normalizedLiveRetryMs = Math.max(normalizedLiveIntervalMs, Math.min(5000, Number(liveRetryMs) || DEFAULT_LIVE_RETRY_MS));

  let state = emptyState();
  let liveState = emptyLiveState();
  let liveStatuses = new Map();
  let liveTimer = null;
  let liveGeneration = 0;
  let liveInFlight = false;

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

  function emptyLiveState() {
    return {
      active: false,
      sampling: false,
      seeded: false,
      gameId: null,
      gameCode: '',
      helperPid: null,
      targetHz: Math.round(1000 / normalizedLiveIntervalMs),
      frameCount: 0,
      startedAt: 0,
      lastFrameAt: 0,
      lastEventAt: 0,
      lastFrameDurationMs: 0,
      recentEvents: [],
      lastError: '',
    };
  }

  function publicLiveState() {
    const timestamp = now();
    const ageMs = liveState.lastFrameAt ? Math.max(0, timestamp - liveState.lastFrameAt) : null;
    const elapsedMs = liveState.startedAt ? Math.max(0, timestamp - liveState.startedAt) : 0;
    const effectiveHz = elapsedMs > 0
      ? Math.round((liveState.frameCount * 1000 / elapsedMs) * 100) / 100
      : 0;
    const statuses = [...liveStatuses.values()]
      .map((status) => ({ ...status }))
      .sort((a, b) => Number(a.achievementId || 0) - Number(b.achievementId || 0));
    const measuredAchievementCount = statuses.filter((status) => Boolean(status.measured)).length;
    const { seeded, ...visible } = liveState;

    return {
      ...visible,
      effectiveHz,
      ageMs,
      stale: Boolean(liveState.active && ageMs !== null && ageMs > Math.max(1000, normalizedLiveRetryMs * 4)),
      statusCount: statuses.length,
      measuredAchievementCount,
      statuses,
      recentEvents: liveState.recentEvents.map((event) => ({ ...event })),
      observerOnly: true,
      officialCompletionAuthority: 'retroachievements-server',
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
      live: publicLiveState(),
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

  function cancelLiveTimer() {
    if (liveTimer === null) return;
    try { clearTimeoutImpl(liveTimer); } catch { /* best effort */ }
    liveTimer = null;
  }

  function stopLiveEvaluation(reason = '', { reset = false } = {}) {
    cancelLiveTimer();
    liveGeneration += 1;
    liveInFlight = false;

    if (reset) {
      liveStatuses = new Map();
      liveState = { ...emptyLiveState(), lastError: String(reason || '') };
    } else {
      liveState = {
        ...liveState,
        active: false,
        sampling: false,
        lastError: String(reason || liveState.lastError || ''),
      };
    }
    return publicLiveState();
  }

  function assertHelperGeneration() {
    if (!state.helperPid || typeof runtimeHelper.getStatus !== 'function') return;
    const helper = currentHelperStatus();
    const pid = Number(helper?.pid || 0) || null;
    if (!helper?.running || !helper?.ready || pid !== state.helperPid) {
      const message = 'Runtime helper restarted after definitions were loaded; observer definitions must be reloaded.';
      state = { ...state, sealed: false, lastError: message };
      stopLiveEvaluation(message);
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
    stopLiveEvaluation('', { reset: true });
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
      liveStatuses = new Map();
      liveState = {
        ...emptyLiveState(),
        gameId,
        gameCode,
        helperPid: state.helperPid,
      };
      return publicStatus();
    } catch (error) {
      await bestEffortDeactivate(activatedIds);
      try { await runtimeHelper.request('reset', {}, 5000); } catch { /* best effort */ }
      const message = error?.message || String(error || 'Observer game load failed.');
      state = { ...emptyState(), lastError: message };
      stopLiveEvaluation(message, { reset: true });
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
    if (state.sealed) await startLiveEvaluation();
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

  function mergeLiveStatuses(statuses) {
    for (const status of Array.isArray(statuses) ? statuses : []) {
      const achievementId = Number(status?.achievementId || 0);
      if (!state.achievementIds.includes(achievementId)) continue;
      liveStatuses.set(achievementId, {
        ...status,
        achievementId,
        observerOnly: true,
        officialCompletionAuthority: 'retroachievements-server',
      });
    }
  }

  async function sampleLiveFrame(expectedGeneration = null) {
    if (!state.sealed) throw new Error('No sealed observer game is loaded.');
    if (expectedGeneration !== null && expectedGeneration !== liveGeneration) return publicLiveState();
    assertHelperGeneration();

    const sampleStartedAt = now();
    const sampledGameId = state.gameId;
    const frame = await evaluateFrame();

    let statuses = Array.isArray(frame.statuses) ? frame.statuses : [];
    if (!liveState.seeded) statuses = await getAchievementStatuses();

    if (
      (expectedGeneration !== null && expectedGeneration !== liveGeneration) ||
      !state.sealed ||
      state.gameId !== sampledGameId
    ) {
      return publicLiveState();
    }

    mergeLiveStatuses(statuses);

    const sampledAt = now();
    const events = (Array.isArray(frame?.events) ? frame.events : [])
      .filter((event) => state.achievementIds.includes(Number(event?.achievementId || 0)))
      .map((event) => ({
        achievementId: Number(event.achievementId),
        type: String(event.type || 'unknown'),
        value: Number(event.value || 0),
        timestamp: sampledAt,
      }));
    const recentEvents = events.length
      ? [...liveState.recentEvents, ...events].slice(-MAX_RECENT_EVENTS)
      : liveState.recentEvents;

    liveState = {
      ...liveState,
      sampling: Boolean(liveState.active),
      seeded: true,
      gameId: state.gameId,
      gameCode: state.gameCode || String(frame?.gameCode || ''),
      helperPid: state.helperPid,
      frameCount: Number(liveState.frameCount || 0) + 1,
      lastFrameAt: sampledAt,
      lastEventAt: events.length ? sampledAt : liveState.lastEventAt,
      lastFrameDurationMs: Math.max(0, sampledAt - sampleStartedAt),
      recentEvents,
      lastError: '',
    };

    return publicLiveState();
  }

  function scheduleLiveTick(generation, delayMs) {
    if (!enableLiveTimer || generation !== liveGeneration || !liveState.active || liveTimer !== null) return;
    liveTimer = setTimeoutImpl(() => {
      liveTimer = null;
      return runLiveTick(generation);
    }, Math.max(0, Number(delayMs) || 0));
    if (liveTimer && typeof liveTimer.unref === 'function') liveTimer.unref();
  }

  async function runLiveTick(generation) {
    if (generation !== liveGeneration || !liveState.active) return;
    if (liveInFlight) {
      scheduleLiveTick(generation, normalizedLiveIntervalMs);
      return;
    }

    liveInFlight = true;
    const startedAt = now();
    let nextDelay = normalizedLiveIntervalMs;
    try {
      await sampleLiveFrame(generation);
      if (generation !== liveGeneration) return;
      nextDelay = Math.max(0, normalizedLiveIntervalMs - Math.max(0, now() - startedAt));
    } catch (error) {
      if (generation !== liveGeneration) return;
      const message = error?.message || String(error || 'Live observer sampling failed.');
      liveState = { ...liveState, sampling: false, lastError: message };
      if (!state.sealed) {
        liveState = { ...liveState, active: false };
        return;
      }
      nextDelay = normalizedLiveRetryMs;
    } finally {
      if (generation === liveGeneration) {
        liveInFlight = false;
        if (liveState.active) scheduleLiveTick(generation, nextDelay);
      }
    }
  }

  async function startLiveEvaluation() {
    if (!state.sealed || !state.gameId) throw new Error('No sealed observer game is loaded.');
    assertHelperGeneration();
    await validateAttachedGame();

    if (
      liveState.active &&
      liveState.gameId === state.gameId &&
      Number(liveState.helperPid || 0) === Number(state.helperPid || 0)
    ) {
      return publicLiveState();
    }

    cancelLiveTimer();
    liveGeneration += 1;
    liveInFlight = false;
    liveStatuses = new Map();
    liveState = {
      ...emptyLiveState(),
      active: true,
      gameId: state.gameId,
      gameCode: state.gameCode,
      helperPid: state.helperPid,
      startedAt: now(),
    };
    scheduleLiveTick(liveGeneration, 0);
    return publicLiveState();
  }

  return {
    loadGame,
    clearGame,
    attachDolphin,
    evaluateFrame,
    sampleLiveFrame,
    startLiveEvaluation,
    stopLiveEvaluation,
    getLiveState: publicLiveState,
    getAchievementStatus,
    getAchievementStatuses,
    validateAttachedGame,
    getStatus: publicStatus,
  };
}

module.exports = {
  createObserverRuntimeService,
  DEFAULT_LIVE_INTERVAL_MS,
  DEFAULT_LIVE_RETRY_MS,
};
