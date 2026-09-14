const fs = require('fs');
const path = require('path');

const ACHIEVEMENT_LIBRARY_VERSION = 1;

function createAchievementLibraryService({ app, readConfig, getMainWindow, getRaProgress }) {
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
    const mainWindow = getMainWindow?.();
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

  return {
    rememberAchievementGame,
    getAchievementLibrary,
    broadcastAchievementLibraryChanged,
    refreshAchievementLibrary,
  };
}

module.exports = { createAchievementLibraryService, ACHIEVEMENT_LIBRARY_VERSION };
