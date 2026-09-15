import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('v0.7 secure runtime auth and official game-data layer', () => {
  const service = source('electron/services/ra-runtime-data-service.cjs');
  const main = source('electron/main.cjs');
  const ipc = source('electron/ipc/register.cjs');
  const preload = source('electron/preload.cjs');
  const settings = source('src/AppPages.tsx');
  const types = source('src/global.d.ts');

  it('keeps the runtime token separate from the Web API key and never stores the password', () => {
    expect(service).toContain("r: 'login2'");
    expect(service).toContain("r: 'patch'");
    expect(service).toContain('safeStorage.encryptString(normalizedToken)');
    expect(service).toContain('memoryCredential');
    expect(service).toContain('removeCredentialFile();');
    expect(service).not.toContain('passwordEncrypted');
    expect(service).not.toContain('raw.password');
    expect(service).not.toContain('apiKey: credential.token');
    expect(settings).toContain('never stored');
    expect(settings).toContain('API Key');
    expect(settings).toContain('Password');
    expect(settings).toContain('Save & connect');
  });

  it('has no gameplay-session or submission request surface', () => {
    expect(service).not.toMatch(/requestRapi\(\{\s*r:\s*['"]startsession['"]/i);
    expect(service).not.toMatch(/requestRapi\(\{\s*r:\s*['"]ping['"]/i);
    expect(service).not.toMatch(/requestRapi\(\{\s*r:\s*['"]awardachievement['"]/i);
    expect(service).not.toMatch(/requestRapi\(\{\s*r:\s*['"]submitlbentry['"]/i);
    expect(service).toContain("officialCompletionAuthority: 'retroachievements-server'");
    expect(main).toContain('const progress = baseProgress;');
  });

  it('wires official patch definitions into the observer service without making them official unlocks', () => {
    expect(main).toContain("require('./services/observer-runtime-service.cjs')");
    expect(main).toContain("require('./services/ra-runtime-data-service.cjs')");
    expect(main).toContain('observerRuntime: observerRuntimeService');
    expect(main).toContain('ensureObserverGame({ gameId, gameCode: runtimeGameCode, dolphinPid: dolphin.pid })');
    expect(service).toContain("const definition = String(raw?.MemAddr || '')");
    expect(service).toContain('achievement.category === CORE_ACHIEVEMENT_CATEGORY');
    expect(service).toContain('definition: achievement.definition');
  });

  it('exposes a separate runtime connection through the Electron bridge', () => {
    expect(ipc).toContain("ipcMain.handle('runtime:auth-status'");
    expect(ipc).toContain("ipcMain.handle('runtime:auth-login'");
    expect(ipc).toContain("ipcMain.handle('runtime:auth-validate'");
    expect(ipc).toContain("ipcMain.handle('runtime:auth-disconnect'");
    expect(ipc).toContain("ipcMain.handle('runtime:observer-status'");
    expect(preload).toContain("getRuntimeAuthStatus: () => ipcRenderer.invoke('runtime:auth-status')");
    expect(preload).toContain("loginRuntimeAccount: (password) => ipcRenderer.invoke('runtime:auth-login', { password })");
    expect(types).toContain('interface RuntimeAuthStatus');
    expect(types).toContain('interface RuntimeObserverSyncStatus');
  });

  it('invalidates runtime credentials when the verified Web account changes', () => {
    expect(main).toContain('handleRuntimeWebAccountChanged(requestedUsername);');
    expect(main).toContain("handleRuntimeWebAccountChanged('');");
    expect(service).toContain('handleWebAccountChanged');
    expect(service).toContain('clearCredential();');
    expect(service).toContain('observerRuntime.clearGame()');
  });
});
