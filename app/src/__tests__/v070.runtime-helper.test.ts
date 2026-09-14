import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('v0.7 native rcheevos runtime helper', () => {
  const helper = source('../native/rcheevos-runtime-helper/main.c');
  const cmake = source('../native/rcheevos-runtime-helper/CMakeLists.txt');
  const observerScript = source('../native/rcheevos-runtime-helper/RCHEEVOS_OBSERVER_ONESHOT.ps1');
  const service = source('electron/services/runtime-helper-service.cjs');
  const main = source('electron/main.cjs');
  const ipc = source('electron/ipc/register.cjs');
  const preload = source('electron/preload.cjs');
  const types = source('src/global.d.ts');

  it('pins the official rcheevos v12.5.0 commit and owns a real rc_runtime_t', () => {
    expect(cmake).toContain('1433173220a7eaede6a9ed7a18e94117be1821e0');
    expect(cmake).toContain('src/rcheevos/runtime.c');
    expect(cmake).toContain('src/rhash/md5.c');
    expect(helper).toContain('rc_runtime_t runtime;');
    expect(helper).toContain('rc_runtime_init(&runtime);');
    expect(helper).toContain('rc_runtime_activate_achievement(&runtime, 1, "0xH0000=1"');
    expect(helper).toContain('rc_runtime_destroy(&runtime);');
  });

  it('uses a versioned JSON-line protocol instead of coupling Electron to C structs', () => {
    expect(helper).toContain('#define RA_RUNTIME_PROTOCOL_VERSION 1');
    expect(helper).toContain('static void write_ready(void)');
    expect(helper).toContain('runtimeInitialized');
    expect(helper).toContain('strcmp(command, "ping")');
    expect(helper).toContain('strcmp(command, "status")');
    expect(helper).toContain('strcmp(command, "reset")');
    expect(helper).toContain('strcmp(command, "shutdown")');
    expect(service).toContain('JSON.stringify({ id, command, ...payload })');
    expect(service).toContain("message.type === 'ready'");
    expect(service).toContain("message.type === 'response'");
  });

  it('evaluates raw definitions only as an observer against the read-only Dolphin bridge', () => {
    expect(helper).toContain('strcmp(command, "activateAchievement")');
    expect(helper).toContain('strcmp(command, "evaluateFrame")');
    expect(helper).toContain('strcmp(command, "achievementStatus")');
    expect(helper).toContain('rc_runtime_do_frame(&runtime, capture_runtime_event, dolphin_runtime_peek');
    expect(helper).toContain('rc_runtime_get_achievement_measured');
    expect(helper).toContain('observerOnly');
    expect(helper).not.toContain('awardachievement');
    expect(helper).not.toContain('submitlbentry');
    expect(helper).not.toContain('ping.php');
  });

  it('has a real-Dolphin measured probe that compares rcheevos with the native memory read', () => {
    expect(observerScript).toContain("$probeDefinition = 'M:0xH0040AFC0>=255'");
    expect(observerScript).toContain('$frame1Json = \'{"id":4,"command":"evaluateFrame"}\'');
    expect(observerScript).toContain('$statusJson = \'{"id":6,"command":"achievementStatus","achievementId":700000001}\'');
    expect(observerScript).toContain('$status.measuredValue -eq $expectedByte');
    expect(observerScript).toContain('No official achievement state was changed.');
  });

  it('starts and stops the helper at the Electron lifecycle boundary', () => {
    expect(main).toContain("require('./services/runtime-helper-service.cjs')");
    expect(main).toContain('startRuntimeHelper();');
    expect(main).toContain('stopRuntimeHelper();');
    expect(main).toContain('getRuntimeStatus: getRuntimeHelperStatus');
  });

  it('exposes diagnostics without replacing authoritative RA progress', () => {
    expect(ipc).toContain("ipcMain.handle('runtime:status'");
    expect(preload).toContain("getRuntimeStatus: () => ipcRenderer.invoke('runtime:status')");
    expect(types).toContain('interface RuntimeHelperStatus');
    expect(types).toContain('getRuntimeStatus: () => Promise<RuntimeHelperStatus>;');
    expect(main).toContain('const progress = baseProgress;');
    expect(main).not.toContain('runtimeProgress =');
  });
});
