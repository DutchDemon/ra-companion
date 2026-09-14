const { autoUpdater } = require('electron-updater');

function createUpdateService({ app, getMainWindow }) {
  let appUpdater = null;
  let updateStatusCache = null;

  function broadcastUpdateStatus(status) {
    updateStatusCache = status;
    const mainWindow = getMainWindow?.();
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
    if (!status.available) {
      return { ...status, installing: false, phase: 'current', message: 'RA Companion is already up to date.' };
    }

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

  return {
    checkForUpdates,
    installAvailableUpdate,
  };
}

module.exports = { createUpdateService };
