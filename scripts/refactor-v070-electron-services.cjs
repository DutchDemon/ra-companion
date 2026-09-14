const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const mainPath = path.join(root, 'app', 'electron', 'main.cjs');
const v059Path = path.join(root, 'app', 'src', '__tests__', 'v059.ra-authoritative-progress.test.ts');

function requireMatch(condition, message) {
  if (!condition) throw new Error(message);
}

let main = fs.readFileSync(mainPath, 'utf8');

if (!main.includes("require('./services/update-service.cjs')")) {
  const updaterImport = /const \{ autoUpdater \} = require\('electron-updater'\);\r?\n/;
  requireMatch(updaterImport.test(main), 'Could not find legacy electron-updater import.');
  main = main.replace(
    updaterImport,
    "const { createUpdateService } = require('./services/update-service.cjs');\nconst { registerIpcHandlers } = require('./ipc/register.cjs');\n",
  );
}

if (main.includes('let appUpdater = null;')) {
  const updaterBlock = /let appUpdater = null;\r?\n[\s\S]*?\r?\nconst TWILIGHT_PRINCESS_GAME_ID = 3934;/;
  requireMatch(updaterBlock.test(main), 'Could not isolate legacy updater implementation.');
  main = main.replace(updaterBlock, 'const TWILIGHT_PRINCESS_GAME_ID = 3934;');
}

if (!main.includes('createUpdateService({')) {
  const shortcutTimer = 'let shortcutHealthTimer = null;';
  requireMatch(main.includes(shortcutTimer), 'Could not find shortcut-health anchor.');
  main = main.replace(
    shortcutTimer,
    `${shortcutTimer}\n\nconst { checkForUpdates, installAvailableUpdate } = createUpdateService({\n  app,\n  getMainWindow: () => mainWindow,\n});`,
  );
}

if (main.includes("ipcMain.handle('app:version'")) {
  const ipcBlock = /  ipcMain\.handle\('app:version'[\s\S]*?  ipcMain\.on\('overlay:move-end', \(event\) => endOverlayMove\(event\.sender\)\);\r?\n/;
  requireMatch(ipcBlock.test(main), 'Could not isolate legacy IPC registration block.');
  const replacement = `  registerIpcHandlers(ipcMain, {\n    getVersion: () => app.getVersion(),\n    getConfig: publicConfig,\n    checkForUpdates,\n    installAvailableUpdate,\n    saveConfig: writeConfig,\n    verifyAccount: verifyRaAccount,\n    disconnectAccount: disconnectRaAccount,\n    getLibrary: getAchievementLibrary,\n    refreshLibrary: refreshAchievementLibrary,\n    getSnapshot,\n    getRamSnapshot,\n    toggleOverlay,\n    getOverlayState,\n    updateOverlaySettings,\n    resetOverlayToPreset,\n    getShortcutState: publicShortcutState,\n    registerGlobalShortcuts,\n    updateShortcutSettings,\n    beginOverlayResize,\n    moveOverlayResize,\n    endOverlayResize,\n    beginOverlayMove,\n    moveOverlayMove,\n    endOverlayMove,\n  });\n`;
  main = main.replace(ipcBlock, replacement);
}

requireMatch(main.includes("const { createUpdateService } = require('./services/update-service.cjs');"), 'Update service import missing after transform.');
requireMatch(main.includes("const { registerIpcHandlers } = require('./ipc/register.cjs');"), 'IPC boundary import missing after transform.');
requireMatch(main.includes('createUpdateService({'), 'Update service initialization missing after transform.');
requireMatch(main.includes('registerIpcHandlers(ipcMain, {'), 'IPC registration boundary missing after transform.');
requireMatch(!main.includes("const { autoUpdater } = require('electron-updater');"), 'Legacy updater import remains in main.');
requireMatch(!main.includes('let appUpdater = null;'), 'Legacy updater state remains in main.');
requireMatch(!main.includes("ipcMain.handle('app:version'"), 'Direct IPC registration remains in main.');

fs.writeFileSync(mainPath, main, 'utf8');

let v059 = fs.readFileSync(v059Path, 'utf8');
if (!v059.includes("const ipc = readFileSync(resolve(process.cwd(), 'electron/ipc/register.cjs'), 'utf8');")) {
  v059 = v059.replace(
    /  const electron = readFileSync\(resolve\(process\.cwd\(\), 'electron\/main\.cjs'\), 'utf8'\);\r?\n/,
    "  const electron = readFileSync(resolve(process.cwd(), 'electron/main.cjs'), 'utf8');\n  const ipc = readFileSync(resolve(process.cwd(), 'electron/ipc/register.cjs'), 'utf8');\n",
  );
}
v059 = v059.replace(
  /expect\(electron\)\.toContain\("ipcMain\.handle\('snapshot:get', \(_event, forceRa\) => getSnapshot\(Boolean\(forceRa\)\)\)"\);/,
  "expect(ipc).toContain(\"ipcMain.handle('snapshot:get', (_event, forceRa) => handlers.getSnapshot(Boolean(forceRa)))\");",
);
requireMatch(v059.includes("const ipc = readFileSync(resolve(process.cwd(), 'electron/ipc/register.cjs'), 'utf8');"), 'v0.5.9 test did not learn about IPC boundary.');
requireMatch(v059.includes("expect(ipc).toContain(\"ipcMain.handle('snapshot:get'"), 'v0.5.9 forced-refresh IPC assertion was not migrated.');
fs.writeFileSync(v059Path, v059, 'utf8');

console.log('Applied v0.7 Electron update-service and IPC boundary refactor.');
