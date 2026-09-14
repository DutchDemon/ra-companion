const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const mainPath = path.join(root, 'app', 'electron', 'main.cjs');
const ipcPath = path.join(root, 'app', 'electron', 'ipc', 'register.cjs');
const preloadPath = path.join(root, 'app', 'electron', 'preload.cjs');
const typesPath = path.join(root, 'app', 'src', 'global.d.ts');

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function write(file, value) {
  fs.writeFileSync(file, value, 'utf8');
}

function must(condition, message) {
  if (!condition) throw new Error(message);
}

function replaceOnce(source, search, replacement, message) {
  if (source.includes(replacement)) return source;
  must(source.includes(search), message);
  return source.replace(search, replacement);
}

let main = read(mainPath);
main = replaceOnce(
  main,
  "const { createAchievementLibraryService } = require('./services/achievement-library-service.cjs');\n",
  "const { createAchievementLibraryService } = require('./services/achievement-library-service.cjs');\nconst { createRuntimeHelperService } = require('./services/runtime-helper-service.cjs');\n",
  'Could not add runtime-helper service import.',
);

const achievementServiceTail = `  getMainWindow: () => mainWindow,
  getRaProgress: (...args) => getRaProgress(...args),
});
`;
const runtimeServiceBlock = `  getMainWindow: () => mainWindow,
  getRaProgress: (...args) => getRaProgress(...args),
});

const {
  start: startRuntimeHelper,
  stop: stopRuntimeHelper,
  getStatus: getRuntimeHelperStatus,
} = createRuntimeHelperService({ app });
`;
if (!main.includes('createRuntimeHelperService({ app })')) {
  must(main.includes(achievementServiceTail), 'Could not find achievement service initialization boundary.');
  main = main.replace(achievementServiceTail, runtimeServiceBlock);
}

main = replaceOnce(
  main,
  `    getSnapshot,\n    getRamSnapshot,\n    toggleOverlay,`,
  `    getSnapshot,\n    getRamSnapshot,\n    getRuntimeStatus: getRuntimeHelperStatus,\n    toggleOverlay,`,
  'Could not expose runtime helper status through IPC handlers.',
);

main = replaceOnce(
  main,
  `  createMainWindow();\n  createOverlayWindow();\n\n  registerGlobalShortcuts();`,
  `  createMainWindow();\n  createOverlayWindow();\n  startRuntimeHelper();\n\n  registerGlobalShortcuts();`,
  'Could not start runtime helper during app startup.',
);

main = replaceOnce(
  main,
  `app.on('will-quit', () => {\n  stopRamReader('Application closed.');`,
  `app.on('will-quit', () => {\n  stopRuntimeHelper();\n  stopRamReader('Application closed.');`,
  'Could not stop runtime helper during app shutdown.',
);

must(main.includes("require('./services/runtime-helper-service.cjs')"), 'Runtime helper service import missing after migration.');
must(main.includes('getRuntimeStatus: getRuntimeHelperStatus'), 'Runtime status handler missing after migration.');
must(main.includes('startRuntimeHelper();'), 'Runtime helper startup hook missing after migration.');
must(main.includes('stopRuntimeHelper();'), 'Runtime helper shutdown hook missing after migration.');
write(mainPath, main);

let ipc = read(ipcPath);
ipc = replaceOnce(
  ipc,
  `  ipcMain.handle('ram:get', () => handlers.getRamSnapshot());\n`,
  `  ipcMain.handle('ram:get', () => handlers.getRamSnapshot());\n  ipcMain.handle('runtime:status', () => handlers.getRuntimeStatus());\n`,
  'Could not register runtime status IPC handler.',
);
must(ipc.includes("ipcMain.handle('runtime:status'"), 'Runtime status IPC handler missing after migration.');
write(ipcPath, ipc);

let preload = read(preloadPath);
preload = replaceOnce(
  preload,
  `  getRamState: () => ipcRenderer.invoke('ram:get'),\n`,
  `  getRamState: () => ipcRenderer.invoke('ram:get'),\n  getRuntimeStatus: () => ipcRenderer.invoke('runtime:status'),\n`,
  'Could not expose runtime status in preload.',
);
must(preload.includes("getRuntimeStatus: () => ipcRenderer.invoke('runtime:status')"), 'Runtime status preload bridge missing after migration.');
write(preloadPath, preload);

let types = read(typesPath);
const runtimeType = `  interface RuntimeHelperStatus {
    supportedPlatform: boolean;
    available: boolean;
    running: boolean;
    ready: boolean;
    protocolVersion: number | null;
    rcheevosVersion: string;
    rcheevosTag: string;
    pid: number | null;
    lastError: string;
  }

`;
if (!types.includes('interface RuntimeHelperStatus')) {
  must(types.includes('  interface Window {\n'), 'Could not find Window interface insertion point.');
  types = types.replace('  interface Window {\n', runtimeType + '  interface Window {\n');
}

types = replaceOnce(
  types,
  `      getRamState: () => Promise<Snapshot['ram']>;\n`,
  `      getRamState: () => Promise<Snapshot['ram']>;\n      getRuntimeStatus: () => Promise<RuntimeHelperStatus>;\n`,
  'Could not add runtime status type to preload API.',
);
must(types.includes('getRuntimeStatus: () => Promise<RuntimeHelperStatus>;'), 'Runtime status TypeScript bridge missing after migration.');
write(typesPath, types);

console.log('Applied v0.7 native rcheevos runtime-helper integration.');
