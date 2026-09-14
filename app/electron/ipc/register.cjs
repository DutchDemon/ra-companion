function registerIpcHandlers(ipcMain, handlers) {
  ipcMain.handle('app:version', () => handlers.getVersion());
  ipcMain.handle('config:get', () => handlers.getConfig());
  ipcMain.handle('update:check', (_event, force) => handlers.checkForUpdates(Boolean(force)));
  ipcMain.handle('update:install', () => handlers.installAvailableUpdate());
  ipcMain.handle('config:save', (_event, config) => handlers.saveConfig(config));
  ipcMain.handle('account:verify', () => handlers.verifyAccount());
  ipcMain.handle('account:disconnect', () => handlers.disconnectAccount());
  ipcMain.handle('library:get', () => handlers.getLibrary());
  ipcMain.handle('library:refresh', () => handlers.refreshLibrary());
  ipcMain.handle('snapshot:get', (_event, forceRa) => handlers.getSnapshot(Boolean(forceRa)));
  ipcMain.handle('ram:get', () => handlers.getRamSnapshot());
  ipcMain.handle('runtime:status', () => handlers.getRuntimeStatus());
  ipcMain.handle('overlay:toggle', (_event, force) => handlers.toggleOverlay(force));
  ipcMain.handle('overlay:state', () => handlers.getOverlayState());
  ipcMain.handle('overlay:update', (_event, patch) => handlers.updateOverlaySettings(patch));
  ipcMain.handle('overlay:reset-preset', () => handlers.resetOverlayToPreset());
  ipcMain.handle('shortcuts:state', () => handlers.getShortcutState());
  ipcMain.handle('shortcuts:reregister', () => handlers.registerGlobalShortcuts());
  ipcMain.handle('shortcuts:update', (_event, patch) => handlers.updateShortcutSettings(patch));

  ipcMain.on('overlay:resize-start', (event, payload) => {
    handlers.beginOverlayResize(payload?.direction, payload?.screenX, payload?.screenY, event.sender);
  });
  ipcMain.on('overlay:resize-move', (event, payload) => {
    handlers.moveOverlayResize(payload?.screenX, payload?.screenY, event.sender);
  });
  ipcMain.on('overlay:resize-end', (event) => handlers.endOverlayResize(event.sender));
  ipcMain.on('overlay:move-start', (event, payload) => {
    handlers.beginOverlayMove(payload?.screenX, payload?.screenY, event.sender);
  });
  ipcMain.on('overlay:move-move', (event, payload) => {
    handlers.moveOverlayMove(payload?.screenX, payload?.screenY, event.sender);
  });
  ipcMain.on('overlay:move-end', (event) => handlers.endOverlayMove(event.sender));
}

module.exports = { registerIpcHandlers };
