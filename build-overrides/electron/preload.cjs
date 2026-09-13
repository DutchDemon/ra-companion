const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('raCompanion', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  checkForUpdates: (force = false) => ipcRenderer.invoke('update:check', force),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  getSnapshot: () => ipcRenderer.invoke('snapshot:get'),
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
