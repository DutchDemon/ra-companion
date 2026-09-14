import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('v0.7 GameCube read-only memory bridge', () => {
  const bridge = source('../native/rcheevos-runtime-helper/dolphin_memory.c');
  const bridgeHeader = source('../native/rcheevos-runtime-helper/dolphin_memory.h');
  const helper = source('../native/rcheevos-runtime-helper/main.c');
  const service = source('electron/services/runtime-helper-service.cjs');
  const main = source('electron/main.cjs');

  it('matches the official rcheevos GameCube 24 MiB RA address model', () => {
    expect(bridgeHeader).toContain('#define RA_GAMECUBE_MEMORY_SIZE 0x01800000u');
    expect(bridgeHeader).toContain('#define RA_GAMECUBE_GUEST_BASE 0x80000000u');
    expect(bridgeHeader).toContain('#define RA_GAMECUBE_GUEST_LAST 0x817FFFFFu');
    expect(bridge).toContain('*ra_address = guest_address - RA_GAMECUBE_GUEST_BASE;');
    expect(helper).toContain('addressModel\\\":\\\"ra-logical-equals-shared-offset');
  });

  it('opens Dolphin shared memory strictly read-only', () => {
    expect(bridge).toContain('OpenFileMappingW(FILE_MAP_READ');
    expect(bridge).toContain('MapViewOfFile(mapping, FILE_MAP_READ');
    expect(bridge).not.toContain('FILE_MAP_WRITE');
    expect(bridge).not.toContain('WriteProcessMemory');
    expect(bridge).not.toContain('OpenProcess(');
    expect(helper).toContain('\\\"readOnly\\\":true');
  });

  it('supports both modern Dolphin mapping names and validates the GameCube header', () => {
    expect(bridge).toContain('L"dolphin-emu.%lu"');
    expect(bridge).toContain('L"Local\\\\dolphin-emu.%lu"');
    expect(bridge).toContain("header[0x1C] == 0xC2");
    expect(bridge).toContain("header[0x1D] == 0x33");
    expect(bridge).toContain("header[0x1E] == 0x9F");
    expect(bridge).toContain("header[0x1F] == 0x3D");
  });

  it('adds only diagnostic bridge commands and leaves official RA progress authoritative', () => {
    expect(helper).toContain('strcmp(command, "attachDolphin")');
    expect(helper).toContain('strcmp(command, "detachDolphin")');
    expect(helper).toContain('strcmp(command, "memoryStatus")');
    expect(helper).toContain('strcmp(command, "readMemory")');
    expect(helper).not.toContain('awardachievement');
    expect(helper).not.toContain('startsession');
    expect(helper).not.toContain('submitlbentry');
    expect(service).toContain("request('attachDolphin', { pid: normalizedPid })");
    expect(service).toContain("request('readMemory', { address: Number(address), numBytes: Number(numBytes) })");
    expect(main).toContain('const progress = baseProgress;');
    expect(main).not.toContain('runtimeProgress =');
  });
});
