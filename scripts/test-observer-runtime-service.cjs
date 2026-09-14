const assert = require('node:assert/strict');
const path = require('node:path');
const { createObserverRuntimeService } = require(path.resolve(__dirname, '../app/electron/services/observer-runtime-service.cjs'));

function createFakeRuntimeHelper(options = {}) {
  const commands = [];
  const active = new Set();
  let helperPid = Number(options.helperPid || 9001);
  let helperRunning = true;
  let richPresenceScript = '';
  let memory = {
    ok: true,
    attached: true,
    gameCubeMagic: true,
    gameCode: options.gameCode || 'GZ2E01',
    mappingName: 'dolphin-emu.1234',
    readOnly: true,
  };

  function richPresenceText() {
    if (!richPresenceScript) return '';
    if (richPresenceScript.includes('Forest Temple')) return 'Exploring Forest Temple';
    return 'Playing Twilight Princess';
  }

  return {
    commands,
    active,
    setGameCode(code) { memory = { ...memory, gameCode: code }; },
    restartHelper() {
      helperPid += 1;
      active.clear();
      richPresenceScript = '';
      helperRunning = true;
    },
    stopHelper() { helperRunning = false; },
    getStatus() {
      return {
        running: helperRunning,
        ready: helperRunning,
        pid: helperRunning ? helperPid : null,
      };
    },
    async request(command, payload = {}) {
      commands.push({ command, payload: { ...payload } });
      if (command === 'activateAchievement') {
        if (options.failAchievementId === payload.achievementId) throw new Error('synthetic parse failure');
        active.add(payload.achievementId);
        return { ok: true, command, achievementId: payload.achievementId, observerOnly: true };
      }
      if (command === 'deactivateAchievement') {
        active.delete(payload.achievementId);
        return { ok: true, command, achievementId: payload.achievementId };
      }
      if (command === 'activateRichPresence') {
        if (options.failRichPresence) throw new Error('synthetic rich presence parse failure');
        richPresenceScript = String(payload.script || '');
        return { ok: true, command, active: true, observerOnly: true };
      }
      if (command === 'richPresence') {
        return { ok: true, command, active: Boolean(richPresenceScript), text: richPresenceText(), observerOnly: true };
      }
      if (command === 'clearRuntime') {
        active.clear();
        richPresenceScript = '';
        return { ok: true, command, achievementCount: 0, leaderboardCount: 0, richPresenceActive: false };
      }
      if (command === 'reset') return { ok: true, command };
      if (command === 'memoryStatus') return { ...memory, command };
      if (command === 'attachDolphin') return { ...memory, command, pid: payload.pid };
      if (command === 'achievementStatus') {
        if (!active.has(payload.achievementId)) throw new Error('not active');
        const measuredValue = payload.achievementId % 10;
        return {
          ok: true,
          command,
          achievementId: payload.achievementId,
          state: 'active',
          measured: true,
          measuredValue,
          measuredTarget: 10,
          measuredText: `${measuredValue}/10`,
        };
      }
      if (command === 'evaluateFrame') {
        const first = [...active][0];
        return {
          ok: true,
          command,
          eventCount: first ? 1 : 0,
          events: first ? [{ achievementId: first, type: 'progress', value: first % 10 }] : [],
          richPresenceActive: Boolean(richPresenceScript),
          richPresence: richPresenceText(),
        };
      }
      throw new Error(`unexpected command ${command}`);
    },
    async getMemoryStatus() {
      commands.push({ command: 'memoryStatus', payload: {} });
      return { ...memory, command: 'memoryStatus' };
    },
    async attachDolphin(pid) {
      commands.push({ command: 'attachDolphin', payload: { pid } });
      return { ...memory, command: 'attachDolphin', pid };
    },
  };
}

async function testSuccessfulLoadAndEvaluation() {
  const runtimeHelper = createFakeRuntimeHelper();
  const observer = createObserverRuntimeService({ runtimeHelper, enableLiveTimer: false });

  const loaded = await observer.loadGame({
    gameId: 3934,
    gameCode: 'gz2e01',
    richPresenceScript: 'Display:\nPlaying Twilight Princess',
    achievements: [
      { id: 101, definition: '0xH0001=1' },
      { achievementId: 102, definition: 'M:0xH0002>=10' },
    ],
  });

  assert.equal(loaded.gameId, 3934);
  assert.equal(loaded.gameCode, 'GZ2E01');
  assert.equal(loaded.sealed, true);
  assert.equal(loaded.loading, false);
  assert.equal(loaded.loadedAchievementCount, 2);
  assert.deepEqual(loaded.achievementIds, [101, 102]);
  assert.equal(loaded.richPresenceLoaded, true);
  assert.equal(loaded.observerOnly, true);
  assert.equal(loaded.officialCompletionAuthority, 'retroachievements-server');
  assert.equal(loaded.helperPid, 9001);
  assert.equal(loaded.live.active, false);
  assert.deepEqual([...runtimeHelper.active], [101, 102]);
  assert(runtimeHelper.commands.some(({ command, payload }) => command === 'activateRichPresence' && payload.script.includes('Playing Twilight Princess')));

  const frame = await observer.evaluateFrame();
  assert.equal(frame.ok, true);
  assert.equal(frame.gameId, 3934);
  assert.equal(frame.gameCode, 'GZ2E01');
  assert.equal(frame.richPresenceActive, true);
  assert.equal(frame.richPresence, 'Playing Twilight Princess');
  assert.equal(frame.statuses.length, 1);
  assert.equal(frame.statuses[0].achievementId, 101);

  const presence = await observer.getRichPresence();
  assert.equal(presence.ok, true);
  assert.equal(presence.active, true);
  assert.equal(presence.text, 'Playing Twilight Princess');

  const forbidden = runtimeHelper.commands.filter(({ command }) => /submit|unlock|award|session/i.test(command));
  assert.deepEqual(forbidden, []);
}

async function testLiveSamplingSeedsAllStatusesAndCachesEventsAndPresence() {
  const runtimeHelper = createFakeRuntimeHelper();
  let timestamp = 1000;
  const observer = createObserverRuntimeService({
    runtimeHelper,
    enableLiveTimer: false,
    now: () => timestamp,
  });

  await observer.loadGame({
    gameId: 3934,
    gameCode: 'GZ2E01',
    richPresenceScript: 'Display:\nForest Temple',
    achievements: [
      { id: 601, definition: 'M:0xH0001>=10' },
      { id: 602, definition: 'M:0xH0002>=10' },
    ],
  });

  const attached = await observer.attachDolphin(1234);
  assert.equal(attached.attached, true);
  assert.equal(observer.getLiveState().active, true);
  assert.equal(observer.getLiveState().frameCount, 0);

  timestamp = 1016;
  const live = await observer.sampleLiveFrame();
  assert.equal(live.active, true);
  assert.equal(live.sampling, true);
  assert.equal(live.gameId, 3934);
  assert.equal(live.gameCode, 'GZ2E01');
  assert.equal(live.frameCount, 1);
  assert.equal(live.statusCount, 2);
  assert.equal(live.measuredAchievementCount, 2);
  assert.deepEqual(live.statuses.map((status) => status.achievementId), [601, 602]);
  assert.equal(live.statuses[0].measuredText, '1/10');
  assert.equal(live.richPresenceLoaded, true);
  assert.equal(live.richPresence, 'Exploring Forest Temple');
  assert.equal(live.richPresenceUpdatedAt, 1016);
  assert.equal(live.richPresenceAgeMs, 0);
  assert.equal(live.recentEvents.length, 1);
  assert.equal(live.recentEvents[0].achievementId, 601);
  assert.equal(live.recentEvents[0].type, 'progress');
  assert.equal(live.observerOnly, true);
  assert.equal(live.officialCompletionAuthority, 'retroachievements-server');

  const stopped = observer.stopLiveEvaluation('manual stop');
  assert.equal(stopped.active, false);
  assert.equal(stopped.sampling, false);
  assert.equal(stopped.lastError, 'manual stop');
}

async function testContinuousClockSchedulesWithoutOverlap() {
  const runtimeHelper = createFakeRuntimeHelper();
  let timestamp = 2000;
  const scheduled = [];
  const observer = createObserverRuntimeService({
    runtimeHelper,
    liveIntervalMs: 16,
    now: () => timestamp,
    setTimeoutImpl(callback, delay) {
      const handle = { callback, delay, unref() {} };
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutImpl(handle) {
      const index = scheduled.indexOf(handle);
      if (index >= 0) scheduled.splice(index, 1);
    },
  });

  await observer.loadGame({
    gameId: 3934,
    gameCode: 'GZ2E01',
    richPresenceScript: 'Display:\nPlaying Twilight Princess',
    achievements: [{ id: 611, definition: 'M:0xH0001>=10' }],
  });
  await observer.attachDolphin(1234);

  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 0);
  const firstTick = scheduled.shift();
  timestamp = 2016;
  await firstTick.callback();

  const live = observer.getLiveState();
  assert.equal(live.frameCount, 1);
  assert.equal(live.statusCount, 1);
  assert.equal(live.richPresence, 'Playing Twilight Princess');
  assert.equal(scheduled.length, 1);
  assert(scheduled[0].delay >= 0 && scheduled[0].delay <= 16);

  observer.stopLiveEvaluation();
  assert.equal(scheduled.length, 0);
}

async function testRollbackOnDefinitionFailure() {
  const runtimeHelper = createFakeRuntimeHelper({ failAchievementId: 202 });
  const observer = createObserverRuntimeService({ runtimeHelper, enableLiveTimer: false });

  await assert.rejects(
    observer.loadGame({
      gameId: 3934,
      gameCode: 'GZ2E01',
      richPresenceScript: 'Display:\nShould never remain active',
      achievements: [
        { id: 201, definition: '0xH0001=1' },
        { id: 202, definition: 'broken-definition' },
      ],
    }),
    /Could not load RA observer definitions/,
  );

  const state = observer.getStatus();
  assert.equal(state.sealed, false);
  assert.equal(state.gameId, null);
  assert.equal(state.loadedAchievementCount, 0);
  assert.equal(state.richPresenceLoaded, false);
  assert.equal(state.live.active, false);
  assert.deepEqual([...runtimeHelper.active], []);
  assert(runtimeHelper.commands.some(({ command, payload }) => command === 'deactivateAchievement' && payload.achievementId === 201));
  assert(runtimeHelper.commands.some(({ command }) => command === 'clearRuntime'));
}

async function testRollbackOnRichPresenceFailure() {
  const runtimeHelper = createFakeRuntimeHelper({ failRichPresence: true });
  const observer = createObserverRuntimeService({ runtimeHelper, enableLiveTimer: false });

  await assert.rejects(
    observer.loadGame({
      gameId: 3934,
      gameCode: 'GZ2E01',
      richPresenceScript: 'Display:\nBroken Rich Presence',
      achievements: [{ id: 211, definition: '0xH0001=1' }],
    }),
    /synthetic rich presence parse failure/,
  );

  assert.equal(observer.getStatus().gameId, null);
  assert.equal(observer.getStatus().richPresenceLoaded, false);
  assert.deepEqual([...runtimeHelper.active], []);
  assert(runtimeHelper.commands.some(({ command }) => command === 'clearRuntime'));
}

async function testWrongGameIsBlockedBeforeEvaluation() {
  const runtimeHelper = createFakeRuntimeHelper({ gameCode: 'GM8E01' });
  const observer = createObserverRuntimeService({ runtimeHelper, enableLiveTimer: false });

  await observer.loadGame({
    gameId: 3934,
    gameCode: 'GZ2E01',
    richPresenceScript: 'Display:\nPlaying Twilight Princess',
    achievements: [{ id: 301, definition: '0xH0001=1' }],
  });

  await assert.rejects(observer.evaluateFrame(), /Observer game mismatch/);
  assert.equal(runtimeHelper.commands.some(({ command }) => command === 'evaluateFrame'), false);
}

async function testInputValidationHappensBeforeActivation() {
  const runtimeHelper = createFakeRuntimeHelper();
  const observer = createObserverRuntimeService({ runtimeHelper, enableLiveTimer: false });

  await assert.rejects(
    observer.loadGame({
      gameId: 3934,
      achievements: [
        { id: 401, definition: '0xH0001=1' },
        { id: 401, definition: '0xH0002=1' },
      ],
    }),
    /Duplicate achievement id 401/,
  );
  assert.equal(runtimeHelper.commands.length, 0);
}

async function testHelperRestartInvalidatesLoadedDefinitionsAndLiveClock() {
  const runtimeHelper = createFakeRuntimeHelper({ helperPid: 9100 });
  const observer = createObserverRuntimeService({ runtimeHelper, enableLiveTimer: false });

  const loaded = await observer.loadGame({
    gameId: 3934,
    gameCode: 'GZ2E01',
    richPresenceScript: 'Display:\nPlaying Twilight Princess',
    achievements: [{ id: 501, definition: 'M:0xH0001>=10' }],
  });
  assert.equal(loaded.sealed, true);
  assert.equal(loaded.helperPid, 9100);
  assert.equal(loaded.richPresenceLoaded, true);
  await observer.attachDolphin(1234);
  assert.equal(observer.getLiveState().active, true);

  runtimeHelper.restartHelper();
  const commandCountBefore = runtimeHelper.commands.length;
  await assert.rejects(
    observer.evaluateFrame(),
    /Runtime helper restarted after definitions were loaded/,
  );
  assert.equal(runtimeHelper.commands.length, commandCountBefore);
  assert.equal(observer.getStatus().sealed, false);
  assert.equal(observer.getLiveState().active, false);
  assert.match(observer.getStatus().lastError, /definitions must be reloaded/);
}

async function testClearStopsLiveAndDropsCachedStatusesAndPresence() {
  const runtimeHelper = createFakeRuntimeHelper();
  const observer = createObserverRuntimeService({ runtimeHelper, enableLiveTimer: false });

  await observer.loadGame({
    gameId: 3934,
    gameCode: 'GZ2E01',
    richPresenceScript: 'Display:\nPlaying Twilight Princess',
    achievements: [{ id: 701, definition: 'M:0xH0001>=10' }],
  });
  await observer.attachDolphin(1234);
  await observer.sampleLiveFrame();
  assert.equal(observer.getLiveState().statusCount, 1);
  assert.equal(observer.getLiveState().richPresence, 'Playing Twilight Princess');

  await observer.clearGame();
  const live = observer.getLiveState();
  assert.equal(live.active, false);
  assert.equal(live.statusCount, 0);
  assert.equal(live.frameCount, 0);
  assert.equal(live.richPresence, '');
  assert.equal(live.richPresenceLoaded, false);
  assert.equal(observer.getStatus().gameId, null);
  assert(runtimeHelper.commands.some(({ command }) => command === 'clearRuntime'));
}

(async () => {
  await testSuccessfulLoadAndEvaluation();
  await testLiveSamplingSeedsAllStatusesAndCachesEventsAndPresence();
  await testContinuousClockSchedulesWithoutOverlap();
  await testRollbackOnDefinitionFailure();
  await testRollbackOnRichPresenceFailure();
  await testWrongGameIsBlockedBeforeEvaluation();
  await testInputValidationHappensBeforeActivation();
  await testHelperRestartInvalidatesLoadedDefinitionsAndLiveClock();
  await testClearStopsLiveAndDropsCachedStatusesAndPresence();
  console.log('observer-runtime-service: all tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
