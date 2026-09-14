const assert = require('node:assert/strict');
const path = require('node:path');
const { createObserverRuntimeService } = require(path.resolve(__dirname, '../app/electron/services/observer-runtime-service.cjs'));

function createFakeRuntimeHelper(options = {}) {
  const commands = [];
  const active = new Set();
  let memory = {
    ok: true,
    attached: true,
    gameCubeMagic: true,
    gameCode: options.gameCode || 'GZ2E01',
    mappingName: 'dolphin-emu.1234',
    readOnly: true,
  };

  return {
    commands,
    active,
    setGameCode(code) { memory = { ...memory, gameCode: code }; },
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
      if (command === 'reset') return { ok: true, command };
      if (command === 'memoryStatus') return { ...memory, command };
      if (command === 'attachDolphin') return { ...memory, command, pid: payload.pid };
      if (command === 'achievementStatus') {
        if (!active.has(payload.achievementId)) throw new Error('not active');
        return {
          ok: true,
          command,
          achievementId: payload.achievementId,
          state: 'active',
          measured: true,
          measuredValue: 7,
          measuredTarget: 10,
        };
      }
      if (command === 'evaluateFrame') {
        const first = [...active][0];
        return {
          ok: true,
          command,
          eventCount: first ? 1 : 0,
          events: first ? [{ achievementId: first, type: 'progress', value: 7 }] : [],
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
  const observer = createObserverRuntimeService({ runtimeHelper });

  const loaded = await observer.loadGame({
    gameId: 3934,
    gameCode: 'gz2e01',
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
  assert.equal(loaded.observerOnly, true);
  assert.equal(loaded.officialCompletionAuthority, 'retroachievements-server');
  assert.deepEqual([...runtimeHelper.active], [101, 102]);

  const frame = await observer.evaluateFrame();
  assert.equal(frame.ok, true);
  assert.equal(frame.gameId, 3934);
  assert.equal(frame.gameCode, 'GZ2E01');
  assert.equal(frame.statuses.length, 1);
  assert.equal(frame.statuses[0].achievementId, 101);

  const forbidden = runtimeHelper.commands.filter(({ command }) => /submit|unlock|award|session/i.test(command));
  assert.deepEqual(forbidden, []);
}

async function testRollbackOnDefinitionFailure() {
  const runtimeHelper = createFakeRuntimeHelper({ failAchievementId: 202 });
  const observer = createObserverRuntimeService({ runtimeHelper });

  await assert.rejects(
    observer.loadGame({
      gameId: 3934,
      gameCode: 'GZ2E01',
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
  assert.deepEqual([...runtimeHelper.active], []);
  assert(runtimeHelper.commands.some(({ command, payload }) => command === 'deactivateAchievement' && payload.achievementId === 201));
}

async function testWrongGameIsBlockedBeforeEvaluation() {
  const runtimeHelper = createFakeRuntimeHelper({ gameCode: 'GM8E01' });
  const observer = createObserverRuntimeService({ runtimeHelper });

  await observer.loadGame({
    gameId: 3934,
    gameCode: 'GZ2E01',
    achievements: [{ id: 301, definition: '0xH0001=1' }],
  });

  await assert.rejects(observer.evaluateFrame(), /Observer game mismatch/);
  assert.equal(runtimeHelper.commands.some(({ command }) => command === 'evaluateFrame'), false);
}

async function testInputValidationHappensBeforeActivation() {
  const runtimeHelper = createFakeRuntimeHelper();
  const observer = createObserverRuntimeService({ runtimeHelper });

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

(async () => {
  await testSuccessfulLoadAndEvaluation();
  await testRollbackOnDefinitionFailure();
  await testWrongGameIsBlockedBeforeEvaluation();
  await testInputValidationHappensBeforeActivation();
  console.log('observer-runtime-service: all tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
