const assert = require('node:assert/strict');
const path = require('node:path');
const { createRuntimeHelperService } = require(path.resolve(__dirname, '../app/electron/services/runtime-helper-service.cjs'));
const { createObserverRuntimeService } = require(path.resolve(__dirname, '../app/electron/services/observer-runtime-service.cjs'));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  const appRoot = path.resolve(__dirname, '../app');
  const runtimeHelper = createRuntimeHelperService({ app: { getAppPath: () => appRoot } });
  const observer = createObserverRuntimeService({ runtimeHelper });

  try {
    runtimeHelper.start();
    const loaded = await observer.loadGame({
      gameId: 3934,
      gameCode: 'GZ2E01',
      richPresenceScript: 'Display:\nObserver Rich Presence',
      achievements: [
        { id: 710000001, definition: '0xH0000=1' },
        { id: 710000002, definition: 'M:0xH0001>=10' },
      ],
    });

    assert.equal(loaded.sealed, true);
    assert.equal(loaded.loadedAchievementCount, 2);
    assert.deepEqual(loaded.achievementIds, [710000001, 710000002]);
    assert.equal(loaded.richPresenceLoaded, true);
    assert.equal(loaded.observerOnly, true);
    assert.equal(loaded.officialCompletionAuthority, 'retroachievements-server');

    const first = await observer.getAchievementStatus(710000001);
    const second = await observer.getAchievementStatus(710000002);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(second.measured, true);
    assert.equal(second.measuredTarget, 10);

    const nativeStatus = await runtimeHelper.request('status', {}, 5000);
    assert.equal(nativeStatus.ok, true);
    assert.equal(nativeStatus.richPresenceActive, true);

    const cleared = await observer.clearGame();
    assert.equal(cleared.gameId, null);
    assert.equal(cleared.loadedAchievementCount, 0);
    assert.equal(cleared.richPresenceLoaded, false);
    assert.equal(cleared.sealed, false);

    const nativeAfterClear = await runtimeHelper.request('status', {}, 5000);
    assert.equal(nativeAfterClear.richPresenceActive, false);
    assert.equal(nativeAfterClear.achievementCount, 0);

    console.log('observer-runtime native integration: passed');
  } finally {
    runtimeHelper.stop();
    await sleep(250);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
