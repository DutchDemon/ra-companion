const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function write(relative, content) {
  fs.writeFileSync(path.join(root, relative), content, 'utf8');
}

function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  const index = content.indexOf(before);
  if (index < 0) throw new Error(`Could not find migration anchor: ${label}`);
  if (content.indexOf(before, index + before.length) >= 0) throw new Error(`Migration anchor is not unique: ${label}`);
  return content.slice(0, index) + after + content.slice(index + before.length);
}

function updateMain() {
  let content = read('app/electron/main.cjs');

  content = replaceOnce(
    content,
    "const { createRuntimeHelperService } = require('./services/runtime-helper-service.cjs');\nconst { registerIpcHandlers } = require('./ipc/register.cjs');",
    "const { createRuntimeHelperService } = require('./services/runtime-helper-service.cjs');\nconst { createObserverRuntimeService } = require('./services/observer-runtime-service.cjs');\nconst { createRaRuntimeDataService } = require('./services/ra-runtime-data-service.cjs');\nconst { registerIpcHandlers } = require('./ipc/register.cjs');",
    'main service imports',
  );

  content = replaceOnce(
    content,
    `const {\n  start: startRuntimeHelper,\n  stop: stopRuntimeHelper,\n  getStatus: getRuntimeHelperStatus,\n} = createRuntimeHelperService({ app });`,
    `const runtimeHelperService = createRuntimeHelperService({ app });\nconst {\n  start: startRuntimeHelper,\n  stop: stopRuntimeHelper,\n  getStatus: getRuntimeHelperStatus,\n} = runtimeHelperService;\n\nconst observerRuntimeService = createObserverRuntimeService({ runtimeHelper: runtimeHelperService });\nconst {\n  getAuthStatus: getRuntimeAuthStatus,\n  loginWithPassword: loginRuntimeAccount,\n  validateStoredToken: validateRuntimeAccount,\n  disconnectRuntimeAccount,\n  ensureObserverGame,\n  getSyncStatus: getRuntimeObserverSyncStatus,\n  handleWebAccountChanged: handleRuntimeWebAccountChanged,\n} = createRaRuntimeDataService({\n  app,\n  safeStorage,\n  readConfig,\n  observerRuntime: observerRuntimeService,\n  getRuntimeHelperStatus,\n});`,
    'main runtime services initialization',
  );

  content = replaceOnce(
    content,
    `  persistConfig(merged);\n  resetRaCaches();`,
    `  persistConfig(merged);\n  handleRuntimeWebAccountChanged(requestedUsername);\n  resetRaCaches();`,
    'runtime account isolation on config save',
  );

  content = replaceOnce(
    content,
    `  persistConfig({\n    ...existing,\n    username: '',\n    apiKey: '',\n    verifiedUsername: '',\n    lastVerifiedAt: 0,\n  });\n  resetRaCaches();`,
    `  persistConfig({\n    ...existing,\n    username: '',\n    apiKey: '',\n    verifiedUsername: '',\n    lastVerifiedAt: 0,\n  });\n  handleRuntimeWebAccountChanged('');\n  resetRaCaches();`,
    'runtime account isolation on disconnect',
  );

  content = replaceOnce(
    content,
    `  const gameId = activeProfile?.raGameId ?? null;\n  const gameActive = Boolean(dolphin.running && activeProfile);\n\n  // Never keep presenting cached context after the emulator/game closes.`,
    `  const gameId = activeProfile?.raGameId ?? null;\n  const gameActive = Boolean(dolphin.running && activeProfile);\n  const runtimeAuth = getRuntimeAuthStatus();\n\n  if (gameActive && runtimeAuth.connected && dolphin?.pid) {\n    const ramGameCode = String(ram?.gameCode || '').trim().toUpperCase();\n    const profileGameCodes = Array.isArray(activeProfile?.gameCodes) ? activeProfile.gameCodes.map((value) => String(value || '').trim().toUpperCase()).filter(Boolean) : [];\n    const runtimeGameCode = profileGameCodes.includes(ramGameCode)\n      ? ramGameCode\n      : profileGameCodes.length === 1 ? profileGameCodes[0] : '';\n    ensureObserverGame({ gameId, gameCode: runtimeGameCode, dolphinPid: dolphin.pid }).catch(() => {\n      // The service records a public error state; snapshot refresh must stay responsive.\n    });\n  }\n\n  // Never keep presenting cached context after the emulator/game closes.`,
    'automatic observer game sync',
  );

  content = replaceOnce(
    content,
    `      progress: { ok: false, inactive: true, error: 'No supported game is currently active.' },\n      recent: { ok: false, count: 0 },`,
    `      progress: { ok: false, inactive: true, error: 'No supported game is currently active.' },\n      runtime: { auth: runtimeAuth, observer: getRuntimeObserverSyncStatus() },\n      recent: { ok: false, count: 0 },`,
    'inactive snapshot runtime state',
  );

  content = replaceOnce(
    content,
    `    progress,\n    recent: { ok: Boolean(recent?.ok), count: Array.isArray(recent?.data) ? recent.data.length : 0 },`,
    `    progress,\n    runtime: { auth: getRuntimeAuthStatus(), observer: getRuntimeObserverSyncStatus() },\n    recent: { ok: Boolean(recent?.ok), count: Array.isArray(recent?.data) ? recent.data.length : 0 },`,
    'active snapshot runtime state',
  );

  content = replaceOnce(
    content,
    `    getRuntimeStatus: getRuntimeHelperStatus,\n    toggleOverlay,`,
    `    getRuntimeStatus: getRuntimeHelperStatus,\n    getRuntimeAuthStatus,\n    loginRuntimeAccount,\n    validateRuntimeAccount,\n    disconnectRuntimeAccount,\n    getRuntimeObserverStatus: getRuntimeObserverSyncStatus,\n    toggleOverlay,`,
    'runtime IPC handlers',
  );

  write('app/electron/main.cjs', content);
}

function updateIpc() {
  let content = read('app/electron/ipc/register.cjs');
  content = replaceOnce(
    content,
    `  ipcMain.handle('runtime:status', () => handlers.getRuntimeStatus());\n  ipcMain.handle('overlay:toggle', (_event, force) => handlers.toggleOverlay(force));`,
    `  ipcMain.handle('runtime:status', () => handlers.getRuntimeStatus());\n  ipcMain.handle('runtime:auth-status', () => handlers.getRuntimeAuthStatus());\n  ipcMain.handle('runtime:auth-login', (_event, payload) => handlers.loginRuntimeAccount(payload));\n  ipcMain.handle('runtime:auth-validate', () => handlers.validateRuntimeAccount());\n  ipcMain.handle('runtime:auth-disconnect', () => handlers.disconnectRuntimeAccount());\n  ipcMain.handle('runtime:observer-status', () => handlers.getRuntimeObserverStatus());\n  ipcMain.handle('overlay:toggle', (_event, force) => handlers.toggleOverlay(force));`,
    'runtime auth IPC registration',
  );
  write('app/electron/ipc/register.cjs', content);
}

function updatePreload() {
  let content = read('app/electron/preload.cjs');
  content = replaceOnce(
    content,
    `  getRuntimeStatus: () => ipcRenderer.invoke('runtime:status'),\n  onRamStateChanged: (callback) => {`,
    `  getRuntimeStatus: () => ipcRenderer.invoke('runtime:status'),\n  getRuntimeAuthStatus: () => ipcRenderer.invoke('runtime:auth-status'),\n  loginRuntimeAccount: (password) => ipcRenderer.invoke('runtime:auth-login', { password }),\n  validateRuntimeAccount: () => ipcRenderer.invoke('runtime:auth-validate'),\n  disconnectRuntimeAccount: () => ipcRenderer.invoke('runtime:auth-disconnect'),\n  getRuntimeObserverStatus: () => ipcRenderer.invoke('runtime:observer-status'),\n  onRamStateChanged: (callback) => {`,
    'runtime auth preload API',
  );
  write('app/electron/preload.cjs', content);
}

function updateTypes() {
  let content = read('app/src/global.d.ts');
  content = replaceOnce(
    content,
    `  interface Window {`,
    `  interface RuntimeAuthStatus {\n    connected: boolean;\n    username: string;\n    configuredUsername: string;\n    webAccountVerified: boolean;\n    accountMatches: boolean;\n    persistent: boolean;\n    encrypted: boolean;\n    lastValidatedAt: number;\n    needsWebAccount: boolean;\n    observerOnly: true;\n    officialCompletionAuthority: 'retroachievements-server';\n  }\n\n  interface RuntimeObserverSyncStatus {\n    phase: 'idle' | 'disconnected' | 'fetching' | 'loading' | 'ready' | 'error' | string;\n    gameId: number | null;\n    gameCode: string;\n    title: string;\n    loadedAchievementCount: number;\n    excludedAchievementCount: number;\n    dolphinPid: number | null;\n    error: string;\n    observerOnly: true;\n    officialCompletionAuthority: 'retroachievements-server';\n  }\n\n  interface Window {`,
    'runtime auth types',
  );

  content = replaceOnce(
    content,
    `      getRuntimeStatus: () => Promise<RuntimeHelperStatus>;\n      onRamStateChanged:`,
    `      getRuntimeStatus: () => Promise<RuntimeHelperStatus>;\n      getRuntimeAuthStatus: () => Promise<RuntimeAuthStatus>;\n      loginRuntimeAccount: (password: string) => Promise<RuntimeAuthStatus>;\n      validateRuntimeAccount: () => Promise<RuntimeAuthStatus>;\n      disconnectRuntimeAccount: () => Promise<RuntimeAuthStatus>;\n      getRuntimeObserverStatus: () => Promise<RuntimeObserverSyncStatus>;\n      onRamStateChanged:`,
    'runtime auth Window API types',
  );

  content = replaceOnce(
    content,
    `    ram?: {`,
    `    runtime?: {\n      auth: RuntimeAuthStatus;\n      observer: RuntimeObserverSyncStatus;\n    };\n    ram?: {`,
    'snapshot runtime state type',
  );

  write('app/src/global.d.ts', content);
}

function updateSettingsPage() {
  let content = read('app/src/AppPages.tsx');
  content = replaceOnce(
    content,
    `    error,\n  } = useAppView();\n  return (`,
    `    error,\n  } = useAppView();\n  const [runtimeAuth, setRuntimeAuth] = React.useState<RuntimeAuthStatus | null>(null);\n  const [runtimePassword, setRuntimePassword] = React.useState('');\n  const [runtimeBusy, setRuntimeBusy] = React.useState(false);\n  const [runtimeError, setRuntimeError] = React.useState('');\n  const [runtimeMessage, setRuntimeMessage] = React.useState('');\n\n  React.useEffect(() => {\n    let cancelled = false;\n    window.raCompanion.getRuntimeAuthStatus()\n      .then((status) => { if (!cancelled) setRuntimeAuth(status); })\n      .catch((runtimeStatusError) => { if (!cancelled) setRuntimeError(runtimeStatusError?.message || String(runtimeStatusError)); });\n    return () => { cancelled = true; };\n  }, [connectedUser, lastVerifiedAt]);\n\n  async function connectRuntimeData(event: React.FormEvent) {\n    event.preventDefault();\n    if (runtimeBusy) return;\n    setRuntimeBusy(true);\n    setRuntimeError('');\n    setRuntimeMessage('');\n    try {\n      const status = await window.raCompanion.loginRuntimeAccount(runtimePassword);\n      setRuntimeAuth(status);\n      setRuntimeMessage(status.persistent ? 'Runtime token connected and encrypted with OS-backed storage.' : 'Runtime token connected for this app session only; OS encryption is unavailable.');\n    } catch (runtimeLoginError: any) {\n      setRuntimeError(runtimeLoginError?.message || String(runtimeLoginError));\n    } finally {\n      setRuntimePassword('');\n      setRuntimeBusy(false);\n    }\n  }\n\n  async function validateRuntimeData() {\n    if (runtimeBusy) return;\n    setRuntimeBusy(true);\n    setRuntimeError('');\n    setRuntimeMessage('');\n    try {\n      const status = await window.raCompanion.validateRuntimeAccount();\n      setRuntimeAuth(status);\n      setRuntimeMessage('Runtime token validated with RetroAchievements.');\n    } catch (runtimeValidationError: any) {\n      setRuntimeAuth(await window.raCompanion.getRuntimeAuthStatus());\n      setRuntimeError(runtimeValidationError?.message || String(runtimeValidationError));\n    } finally {\n      setRuntimeBusy(false);\n    }\n  }\n\n  async function disconnectRuntimeData() {\n    if (runtimeBusy) return;\n    setRuntimeBusy(true);\n    setRuntimeError('');\n    setRuntimeMessage('');\n    try {\n      setRuntimeAuth(await window.raCompanion.disconnectRuntimeAccount());\n      setRuntimeMessage('Runtime data connection removed.');\n    } catch (runtimeDisconnectError: any) {\n      setRuntimeError(runtimeDisconnectError?.message || String(runtimeDisconnectError));\n    } finally {\n      setRuntimeBusy(false);\n    }\n  }\n\n  return (`,
    'Settings runtime state',
  );

  content = replaceOnce(
    content,
    `      </form>\n      {error && <article className="v5-panel error-card">{error}</article>}`,
    `      </form>\n      <form className="v5-panel v5-settings-form" onSubmit={connectRuntimeData}>\n        <div className="v5-section-label">RCHEEVOS OBSERVER DATA</div>\n        <div className="v5-account-connection v6-account-connection">\n          <div className="v5-card-heading"><div><h3>Runtime data connection</h3><small className="v5-muted">Separate from your Web API key. This connection only fetches official game definitions for the local read-only observer.</small></div><span className={\`v5-status-pill \${runtimeAuth?.connected ? 'complete' : runtimeError ? 'danger' : 'neutral'}\`}>{runtimeAuth?.connected ? 'CONNECTED' : runtimeError ? 'ERROR' : 'DISCONNECTED'}</span></div>\n          <label htmlFor="ra-runtime-password">RA password<input id="ra-runtime-password" name="runtimePassword" autoComplete="current-password" type="password" value={runtimePassword} onChange={(e) => setRuntimePassword(e.target.value)} placeholder={runtimeAuth?.connected ? 'Token already stored · enter password only to reconnect' : 'Used once to request a runtime token'} disabled={!connectedUser || runtimeBusy} /></label>\n          <button type="submit" disabled={!connectedUser || !runtimePassword || runtimeBusy}>{runtimeBusy ? 'Working…' : runtimeAuth?.connected ? 'Reconnect runtime data' : 'Connect runtime data'}</button>\n          <div className="v6-account-facts">\n            <div><span>Runtime account</span><b>{runtimeAuth?.connected ? runtimeAuth.username : 'Not connected'}</b></div>\n            <div><span>Token storage</span><b>{runtimeAuth?.connected ? (runtimeAuth.persistent ? 'OS-encrypted' : 'Memory only') : '—'}</b></div>\n            <div><span>Last validated</span><b>{runtimeAuth?.lastValidatedAt ? new Date(runtimeAuth.lastValidatedAt).toLocaleString() : '—'}</b></div>\n            <div><span>Authority</span><b>RA server</b></div>\n          </div>\n          <div className="v6-account-actions"><button type="button" className="secondary" disabled={!runtimeAuth?.connected || runtimeBusy} onClick={validateRuntimeData}>Validate token</button><button type="button" className="secondary danger-button" disabled={!runtimeAuth?.connected || runtimeBusy} onClick={disconnectRuntimeData}>Disconnect runtime data</button></div>\n          <small className="v5-muted">RA Companion never stores your password. It is sent only for the one-time <code>login2</code> token exchange. The observer does not call start-session, ping, unlock or leaderboard-submit endpoints.</small>\n          {!connectedUser && <div className="error-card v6-inline-error">Connect and verify the Web API account above first.</div>}\n          {runtimeMessage && <div className="saved">{runtimeMessage}</div>}\n          {runtimeError && <div className="error-card v6-inline-error">{runtimeError}</div>}\n        </div>\n      </form>\n      {error && <article className="v5-panel error-card">{error}</article>}`,
    'Settings runtime panel',
  );

  write('app/src/AppPages.tsx', content);
}

updateMain();
updateIpc();
updatePreload();
updateTypes();
updateSettingsPage();
console.log('v0.7 runtime auth/data integration migration applied.');
