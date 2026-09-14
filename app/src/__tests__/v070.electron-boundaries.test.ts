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
