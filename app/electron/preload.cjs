const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('raCompanion', {
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  checkForUpdates: (force = false) => ipcRenderer.invoke('update:check', force),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatusChanged: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('update:status-changed', handler);
    return () => ipcRenderer.removeListener('update:status-changed', handler);
  },
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  verifyAccount: () => ipcRenderer.invoke('account:verify'),
  disconnectAccount: () => ipcRenderer.invoke('account:disconnect'),
  getAchievementLibrary: () => ipcRenderer.invoke('library:get'),
  refreshAchievementLibrary: () => ipcRenderer.invoke('library:refresh'),
  onAchievementLibraryChanged: (callback) => {
    const handler = (_event, library) => callback(library);
    ipcRenderer.on('library:changed', handler);
    return () => ipcRenderer.removeListener('library:changed', handler);
  },
  getSnapshot: (forceRa = false) => ipcRenderer.invoke('snapshot:get', forceRa),
  getRamState: () => ipcRenderer.invoke('ram:get'),
  onRamStateChanged: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('ram:state-changed', handler);
    return () => ipcRenderer.removeListener('ram:state-changed', handler);
  },
  toggleOverlay: (force) => ipcRenderer.invoke('overlay:toggle', force),
  getOverlayState: () => ipcRenderer.invoke('overlay:state'),
  updateOverlay: (patch) => ipcRenderer.invoke('overlay:update', patch),
  resetOverlayPreset: () => ipcRenderer.invoke('overlay:reset-preset'),
  getShortcutState: () => ipcRenderer.invoke('shortcuts:state'),
  reregisterShortcuts: () => ipcRenderer.invoke('shortcuts:reregister'),
  updateShortcuts: (patch) => ipcRenderer.invoke('shortcuts:update', patch),
  onShortcutStateChanged: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('shortcuts:state-changed', handler);
    return () => ipcRenderer.removeListener('shortcuts:state-changed', handler);
  },
  startOverlayResize: (direction, screenX, screenY) => ipcRenderer.send('overlay:resize-start', { direction, screenX, screenY }),
  moveOverlayResize: (screenX, screenY) => ipcRenderer.send('overlay:resize-move', { screenX, screenY }),
  endOverlayResize: () => ipcRenderer.send('overlay:resize-end'),
  startOverlayMove: (screenX, screenY) => ipcRenderer.send('overlay:move-start', { screenX, screenY }),
  moveOverlayMove: (screenX, screenY) => ipcRenderer.send('overlay:move-move', { screenX, screenY }),
  endOverlayMove: () => ipcRenderer.send('overlay:move-end'),
  onOverlayStateChanged: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('overlay:state-changed', handler);
    return () => ipcRenderer.removeListener('overlay:state-changed', handler);
  },
});
