import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('v0.5.9 authoritative RetroAchievements progress', () => {
  const electron = readFileSync(resolve(process.cwd(), 'electron/main.cjs'), 'utf8');
  const preload = readFileSync(resolve(process.cwd(), 'electron/preload.cjs'), 'utf8');
  const ui = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8');
  const types = readFileSync(resolve(process.cwd(), 'src/global.d.ts'), 'utf8');

  it('never promotes recent-history entries back into completed progress', () => {
    expect(electron).toContain('const progress = baseProgress;');
    expect(electron).not.toContain('const progress = mergeRecentHardcoreUnlocks(baseProgress, recent, gameId);');
  });

  it('keys cached progress by user and keeps cache lifetime short', () => {
    expect(electron).toContain("raProgressCache.username === config.username");
    expect(electron).toContain('const RA_PROGRESS_CACHE_MS = 15000;');
  });

  it('supports a forced authoritative RA refresh end-to-end', () => {
    expect(electron).toContain('async function getRaProgress(gameId = TWILIGHT_PRINCESS_GAME_ID, force = false)');
    expect(electron).toContain('getRaProgress(gameId, forceRa)');
    expect(electron).toContain("ipcMain.handle('snapshot:get', (_event, forceRa) => getSnapshot(Boolean(forceRa)))");
    expect(preload).toContain("getSnapshot: (forceRa = false) => ipcRenderer.invoke('snapshot:get', forceRa)");
    expect(types).toContain('getSnapshot: (forceRa?: boolean) => Promise<Snapshot>;');
    expect(ui).toContain('async function refresh(forceRa = false)');
    expect(ui).toContain('window.raCompanion.getSnapshot(forceRa)');
    expect(ui).toContain('refresh(true);');
  });

  it('still clears all RA caches when account settings are saved', () => {
    expect(electron).toContain("raProgressCache = { gameId: null, username: '', fetchedAt: 0, result: null, pending: null };");
    expect(electron).toContain("raRecentCache = { username: '', fetchedAt: 0, result: null, pending: null };");
    expect(electron).toContain("raProfileCache = { username: '', fetchedAt: 0, result: null, pending: null };");
  });
});
