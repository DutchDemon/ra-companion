import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function source(relative: string) {
  return fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');
}

describe('v0.7 Electron service boundaries', () => {
  it('moves updater state and electron-updater ownership out of main.cjs', () => {
    const main = source('electron/main.cjs');
    const updates = source('electron/services/update-service.cjs');

    expect(main).toContain("require('./services/update-service.cjs')");
    expect(main).toContain('createUpdateService({');
    expect(main).not.toContain("require('electron-updater')");
    expect(main).not.toContain('let appUpdater = null;');

    expect(updates).toContain("require('electron-updater')");
    expect(updates).toContain('updater.quitAndInstall(true, true)');
    expect(updates).toContain("mainWindow.webContents.send('update:status-changed', status)");
  });

  it('moves config persistence, normalization and safeStorage handling out of main.cjs', () => {
    const main = source('electron/main.cjs');
    const config = source('electron/services/config-service.cjs');

    expect(main).toContain("require('./services/config-service.cjs')");
    expect(main).toContain('createConfigService({');
    expect(main).not.toContain('function configPath()');
    expect(main).not.toContain('function clampOpacity(value)');
    expect(main).not.toContain('function publicConfig()');

    expect(config).toContain("path.join(app.getPath('userData'), 'config.json')");
    expect(config).toContain('safeStorage.decryptString');
    expect(config).toContain('safeStorage.encryptString');
    expect(config).toContain('function normalizeOverlay(input = {})');
    expect(config).toContain('function publicConfig()');
  });

  it('moves the persistent account-scoped achievement library behind a service boundary', () => {
    const main = source('electron/main.cjs');
    const library = source('electron/services/achievement-library-service.cjs');

    expect(main).toContain("require('./services/achievement-library-service.cjs')");
    expect(main).toContain('createAchievementLibraryService({');
    expect(main).not.toContain('const ACHIEVEMENT_LIBRARY_VERSION = 1;');
    expect(main).not.toContain('function achievementLibraryPath()');

    expect(library).toContain("'achievement-library.json'");
    expect(library).toContain('function rememberAchievementGame(username, gameId, data)');
    expect(library).toContain('function getAchievementLibrary()');
    expect(library).toContain('await getRaProgress(Number(game.gameId), true)');
    expect(library).toContain("mainWindow.webContents.send('library:changed', library)");
  });

  it('centralizes IPC channel registration behind one bootstrap call', () => {
    const main = source('electron/main.cjs');
    const ipc = source('electron/ipc/register.cjs');

    expect(main).toContain("require('./ipc/register.cjs')");
    expect(main).toContain('registerIpcHandlers(ipcMain, {');
    expect(main).not.toContain("ipcMain.handle('app:version'");
    expect(main).not.toContain("ipcMain.on('overlay:resize-start'");

    expect(ipc).toContain("ipcMain.handle('snapshot:get'");
    expect(ipc).toContain("ipcMain.handle('library:get'");
    expect(ipc).toContain("ipcMain.on('overlay:move-end'");
  });

  it('keeps official RA progress authority and the v0.6.4 overlay behavior in main for this behavior-neutral phase', () => {
    const main = source('electron/main.cjs');
    expect(main).toContain('const progress = baseProgress;');
    expect(main).not.toContain('const progress = mergeRecentHardcoreUnlocks(baseProgress, recent, gameId);');
    expect(main).toContain('resizable: false');
    expect(main).toContain('thickFrame: false');
    expect(main).toContain('skipTaskbar: true');
  });
});
