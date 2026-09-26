'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const memoryProfile = fs.readFileSync(path.join(root, 'app/tools/memory-profiles/wind-waker-gzlp01.ps1'), 'utf8');
const ramReader = fs.readFileSync(path.join(root, 'app/tools/ram-reader.ps1'), 'utf8');
const electronProfile = fs.readFileSync(path.join(root, 'app/electron/game-profiles/wind-waker.cjs'), 'utf8');
const main = fs.readFileSync(path.join(root, 'app/electron/main.cjs'), 'utf8');

for (const expected of ['803CC530', '803D1664', '803FE278']) {
  assert(memoryProfile.includes(expected), `Missing verified GZLP01 address ${expected}.`);
}
assert(memoryProfile.includes("44 = 'Outset Island'"), 'Sea room 44 must map to Outset Island.');
assert(memoryProfile.includes("$maxLife = Read-BigEndianUInt16"), 'Max life must be decoded as big-endian u16.');
assert(memoryProfile.includes("$life = Read-BigEndianUInt16"), 'Current life must be decoded as big-endian u16.');
assert(memoryProfile.includes("$rupees = Read-BigEndianUInt16"), 'Rupees must be decoded as big-endian u16.');
assert(memoryProfile.includes('Convert-WindWakerLifeUnitsToHearts $maxLife'), 'Max-life conversion must use the shared quarter-heart helper.');
assert(memoryProfile.includes('Convert-WindWakerLifeUnitsToHearts $life'), 'Current-life conversion must use the shared quarter-heart helper.');
assert(memoryProfile.includes('$lifeUnits / 4.0'), 'Wind Waker heart conversion must preserve quarter-heart precision with 4 raw units per heart.');

assert(ramReader.includes("$gameMemoryProfiles = @{"), 'Generic GameMemoryProfile registry missing.');
assert(ramReader.includes("'GZLP01' = (Get-WindWakerMemoryProfile)"), 'GZLP01 must be registered with the generic reader.');
assert(ramReader.includes("Read-WindWakerGzlp01State $shared $profile"), 'Wind Waker decoder dispatch missing.');
assert(ramReader.includes("Supported = $gameMemoryProfiles.ContainsKey($gameCode)"), 'MEM1 header support must use the game profile registry.');

for (const forbidden of ['WriteProcessMemory', 'FILE_MAP_WRITE', 'PROCESS_VM_WRITE']) {
  assert(!memoryProfile.includes(forbidden), `Memory profile must not contain ${forbidden}.`);
  assert(!ramReader.includes(forbidden), `RAM provider must not contain ${forbidden}.`);
}
assert(ramReader.includes('FILE_MAP_READ = 0x0004'), 'Dolphin shared memory must stay FILE_MAP_READ-only.');
assert(electronProfile.includes('enhanced: true'), 'Wind Waker Electron profile must be RAM-enabled for Test 3.');
assert(!/0x[0-9A-Fa-f]{6,8}/.test(electronProfile), 'Electron game profile must remain free of game memory addresses.');

assert(main.includes('const progress = baseProgress;'), 'Official RA completion authority invariant is missing.');
assert(!main.includes('runtimeProgress ='), 'Local runtime must never replace official RA completion.');

console.log('Wind Waker Test 3 memory profile regression: PASS');
