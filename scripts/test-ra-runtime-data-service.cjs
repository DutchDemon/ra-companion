const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRaRuntimeDataService, RAPI_URL } = require(path.resolve(__dirname, '../app/electron/services/ra-runtime-data-service.cjs'));

function responseJson(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(value); },
  };
}

function createHarness(options = {}) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ra-runtime-data-'));
  const calls = [];
  let config = {
    username: options.username || 'DutchDemon',
    verifiedUsername: options.verifiedUsername ?? (options.username || 'DutchDemon'),
    apiKey: 'public-web-api-key-must-never-be-runtime-token',
  };
  let helperPid = 4321;
  let observerState = {
    gameId: null,
    gameCode: '',
    sealed: false,
    loadedAchievementCount: 0,
    helperPid: null,
  };
  const observerCalls = [];

  const app = {
    getPath(name) {
      assert.equal(name, 'userData');
      return userData;
    },
    getVersion() { return '0.7.0-test'; },
  };

  const encryption = options.encryption !== false;
  const safeStorage = {
    isEncryptionAvailable() { return encryption; },
    encryptString(value) { return Buffer.from(`encrypted:${value}`, 'utf8'); },
    decryptString(buffer) {
      const value = buffer.toString('utf8');
      if (!value.startsWith('encrypted:')) throw new Error('bad ciphertext');
      return value.slice('encrypted:'.length);
    },
  };

  const observerRuntime = {
    async loadGame(input) {
      observerCalls.push({ command: 'loadGame', input: JSON.parse(JSON.stringify(input)) });
      observerState = {
        gameId: Number(input.gameId),
        gameCode: String(input.gameCode || ''),
        sealed: true,
        loadedAchievementCount: input.achievements.length,
        helperPid,
      };
      return { ...observerState };
    },
    async attachDolphin(pid) {
      observerCalls.push({ command: 'attachDolphin', pid });
      return { ok: true, attached: true, pid, gameCode: observerState.gameCode, gameCubeMagic: true };
    },
    async clearGame() {
      observerCalls.push({ command: 'clearGame' });
      observerState = { gameId: null, gameCode: '', sealed: false, loadedAchievementCount: 0, helperPid: null };
      return { ...observerState };
    },
    getStatus() { return { ...observerState }; },
  };

  const fetchImpl = async (url, request) => {
    assert.equal(url, RAPI_URL);
    assert.equal(request.method, 'POST');
    assert.equal(request.redirect, 'error');
    assert.match(String(request.headers['Content-Type']), /application\/x-www-form-urlencoded/);
    const body = new URLSearchParams(String(request.body || ''));
    const record = Object.fromEntries(body.entries());
    calls.push(record);

    if (record.r === 'login2' && record.p) {
      if (options.loginAsOtherUser) {
        return responseJson({ Success: true, User: 'AnotherUser', Token: 'wrong-account-token' });
      }
      return responseJson({ Success: true, User: 'DutchDemon', Token: 'runtime-token-1', Score: 1 });
    }

    if (record.r === 'login2' && record.t) {
      return responseJson({ Success: true, User: 'DutchDemon', Token: 'runtime-token-2', Score: 1 });
    }

    if (record.r === 'patch') {
      return responseJson({
        Success: true,
        PatchData: {
          ID: Number(record.g),
          Title: 'The Legend of Zelda: Twilight Princess',
          ConsoleID: 16,
          ImageIcon: '/Images/012345.png',
          ImageIconURL: 'https://media.retroachievements.org/Images/012345.png',
          RichPresencePatch: 'Display:\nPlaying Twilight Princess',
          Achievements: [
            {
              ID: 1001,
              Title: 'Measured Probe',
              Description: 'Synthetic fixture',
              Flags: 3,
              Points: 5,
              MemAddr: 'M:0xH0040AFC0>=255',
              Author: 'RA Dev',
              BadgeName: '00001',
              Created: 1,
              Modified: 2,
              Type: 'missable',
              Rarity: 50,
              RarityHardcore: 40,
            },
            {
              ID: 1002,
              Title: 'Core Two',
              Description: 'Second core achievement',
              Flags: 3,
              Points: 10,
              MemAddr: '0xH000001=1',
              Author: 'RA Dev',
              BadgeName: '00002',
              Created: 1,
              Modified: 2,
              Type: 'progression',
              Rarity: 50,
              RarityHardcore: 40,
            },
            {
              ID: 1003,
              Title: 'Unofficial Fixture',
              Description: 'Must not be auto-activated',
              Flags: 5,
              Points: 0,
              MemAddr: '0xH000002=1',
              Author: 'RA Dev',
              BadgeName: '00003',
              Created: 1,
              Modified: 2,
              Type: '',
              Rarity: 100,
              RarityHardcore: 100,
            },
          ],
          Leaderboards: [
            {
              ID: 2001,
              Title: 'Fixture Board',
              Description: 'Observer metadata only',
              Mem: 'STA:0xH000003=1::CAN:0xH000003=0::SUB:0xH000004',
              Format: 'VALUE',
              LowerIsBetter: false,
              Hidden: false,
            },
          ],
        },
      });
    }

    throw new Error(`Unexpected RAPI request: ${JSON.stringify(record)}`);
  };

  const service = createRaRuntimeDataService({
    app,
    safeStorage,
    readConfig: () => ({ ...config }),
    observerRuntime,
    getRuntimeHelperStatus: () => ({ running: true, ready: true, pid: helperPid }),
    fetchImpl,
  });

  return {
    service,
    calls,
    observerCalls,
    userData,
    setConfig(patch) { config = { ...config, ...patch }; },
    setHelperPid(pid) { helperPid = pid; },
    cleanup() { fs.rmSync(userData, { recursive: true, force: true }); },
  };
}

async function testEncryptedOneTimePasswordExchange() {
  const h = createHarness();
  try {
    const status = await h.service.loginWithPassword({ password: 'very-secret-password' });
    assert.equal(status.connected, true);
    assert.equal(status.username, 'DutchDemon');
    assert.equal(status.persistent, true);
    assert.equal(status.encrypted, true);

    const credentialFile = h.service.getCredentialPath();
    assert.equal(fs.existsSync(credentialFile), true);
    const raw = fs.readFileSync(credentialFile, 'utf8');
    assert.equal(raw.includes('very-secret-password'), false);
    assert.equal(raw.includes('runtime-token-1'), false);
    assert.match(raw, /tokenEncrypted/);

    assert.equal(h.calls[0].r, 'login2');
    assert.equal(h.calls[0].u, 'DutchDemon');
    assert.equal(h.calls[0].p, 'very-secret-password');
    assert.equal(Object.prototype.hasOwnProperty.call(h.calls[0], 't'), false);
  } finally { h.cleanup(); }
}

async function testTokenValidationAndOfficialPatchData() {
  const h = createHarness();
  try {
    await h.service.loginWithPassword({ password: 'secret' });
    const validated = await h.service.validateStoredToken();
    assert.equal(validated.connected, true);

    const game = await h.service.fetchGameData(3934);
    assert.equal(game.id, 3934);
    assert.equal(game.consoleId, 16);
    assert.equal(game.achievements.length, 3);
    assert.equal(game.achievements[0].definition, 'M:0xH0040AFC0>=255');
    assert.equal(game.achievements[0].type, 'missable');
    assert.equal(game.achievements[1].type, 'progression');
    assert.equal(game.leaderboards.length, 1);

    const validateCall = h.calls.find((call) => call.r === 'login2' && call.t);
    assert.equal(validateCall.t, 'runtime-token-1');
    const patchCall = h.calls.find((call) => call.r === 'patch');
    assert.equal(patchCall.t, 'runtime-token-2');
    assert.equal(patchCall.g, '3934');
    assert.equal(Object.prototype.hasOwnProperty.call(patchCall, 'y'), false);
    assert.equal(Object.values(patchCall).includes('public-web-api-key-must-never-be-runtime-token'), false);
  } finally { h.cleanup(); }
}

async function testCoreDefinitionsFeedObserverWithoutSubmissionEndpoints() {
  const h = createHarness();
  try {
    await h.service.loginWithPassword({ password: 'secret' });
    const result = await h.service.loadGameIntoObserver({ gameId: 3934, gameCode: 'GZ2E01' });
    assert.equal(result.ok, true);
    assert.equal(result.loadedAchievementCount, 2);
    assert.equal(result.excludedAchievementCount, 1);
    assert.equal(result.observerOnly, true);
    assert.equal(result.officialCompletionAuthority, 'retroachievements-server');

    const load = h.observerCalls.find((entry) => entry.command === 'loadGame');
    assert(load);
    assert.equal(load.input.gameId, 3934);
    assert.equal(load.input.gameCode, 'GZ2E01');
    assert.deepEqual(load.input.achievements.map((achievement) => achievement.achievementId), [1001, 1002]);
    assert.equal(load.input.achievements[0].definition, 'M:0xH0040AFC0>=255');

    const forbidden = h.calls.filter((call) => /^(startsession|ping|awardachievement|submitlbentry)$/i.test(String(call.r || '')));
    assert.deepEqual(forbidden, []);
  } finally { h.cleanup(); }
}

async function testAutomaticObserverSyncAttachesDolphin() {
  const h = createHarness();
  try {
    await h.service.loginWithPassword({ password: 'secret' });
    const sync = await h.service.ensureObserverGame({ gameId: 3934, gameCode: 'GZ2E01', dolphinPid: 9876 });
    assert.equal(sync.phase, 'ready');
    assert.equal(sync.gameId, 3934);
    assert.equal(sync.loadedAchievementCount, 2);
    assert(h.observerCalls.some((entry) => entry.command === 'attachDolphin' && entry.pid === 9876));

    const loadCount = h.observerCalls.filter((entry) => entry.command === 'loadGame').length;
    await h.service.ensureObserverGame({ gameId: 3934, gameCode: 'GZ2E01', dolphinPid: 9876 });
    assert.equal(h.observerCalls.filter((entry) => entry.command === 'loadGame').length, loadCount);
  } finally { h.cleanup(); }
}

async function testStrictAccountIsolation() {
  const h = createHarness();
  try {
    await h.service.loginWithPassword({ password: 'secret' });
    h.setConfig({ username: 'OtherAccount', verifiedUsername: 'OtherAccount' });
    const cleared = h.service.handleWebAccountChanged('OtherAccount');
    assert.equal(cleared, true);
    assert.equal(h.service.getAuthStatus().connected, false);
    assert.equal(fs.existsSync(h.service.getCredentialPath()), false);
    await new Promise((resolve) => setImmediate(resolve));
    assert(h.observerCalls.some((entry) => entry.command === 'clearGame'));
  } finally { h.cleanup(); }
}

async function testNoPlaintextDiskFallback() {
  const h = createHarness({ encryption: false });
  try {
    const status = await h.service.loginWithPassword({ password: 'secret' });
    assert.equal(status.connected, true);
    assert.equal(status.persistent, false);
    assert.equal(status.encrypted, false);
    assert.equal(fs.existsSync(h.service.getCredentialPath()), false);
  } finally { h.cleanup(); }
}

async function testWrongAccountLoginIsRejected() {
  const h = createHarness({ loginAsOtherUser: true });
  try {
    await assert.rejects(
      h.service.loginWithPassword({ password: 'secret' }),
      /different account/,
    );
    assert.equal(h.service.getAuthStatus().connected, false);
    assert.equal(fs.existsSync(h.service.getCredentialPath()), false);
  } finally { h.cleanup(); }
}

(async () => {
  await testEncryptedOneTimePasswordExchange();
  await testTokenValidationAndOfficialPatchData();
  await testCoreDefinitionsFeedObserverWithoutSubmissionEndpoints();
  await testAutomaticObserverSyncAttachesDolphin();
  await testStrictAccountIsolation();
  await testNoPlaintextDiskFallback();
  await testWrongAccountLoginIsRejected();
  console.log('ra-runtime-data-service: all tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
