const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
}

const main = source('app/electron/main.cjs');
const registry = source('app/src/profiles/registry.ts');
const renderer = source('app/src/main.tsx');
const pages = source('app/src/AppPages.tsx');
const types = source('app/src/global.d.ts');
const tpState = source('app/src/profiles/twilightPrincessState.ts');
const runtimeData = source('app/electron/services/ra-runtime-data-service.cjs');

assert(main.includes('const progress = baseProgress;'), 'RA server completion authority invariant is missing.');
assert(!main.includes('runtimeProgress ='), 'Local runtime must not replace official RA completion progress.');
assert(main.includes('live: observerRuntimeService.getLiveState()'), 'Inactive snapshot does not expose observer live state.');
assert(main.includes('live: runtimeLive'), 'Active snapshot does not expose observer live state.');

assert(registry.includes('function runtimeMeasuredAchievementCounter'), 'Local rcheevos measured counter adapter is missing.');
assert(registry.includes("source: 'rcheevos'"), 'rcheevos is not represented as a counter-only source.');
assert(registry.includes('runtimeMeasuredAchievementCounter(achievement, runtimeLive)\n    || measuredAchievementCounter(achievement)\n    || profile?.getRamCounter?.(achievement, ram)'), 'Counter source priority must remain rcheevos -> RA measured -> RAM fallback.');

assert(types.includes('interface RuntimeObserverLiveState'), 'Observer live state type is missing.');
assert(types.includes('statuses: RuntimeAchievementStatus[];'), 'Measured achievement statuses are not typed on the snapshot.');
assert(types.includes('measuredAchievementCount: number;'), 'Measured achievement count is not typed.');
assert(tpState.includes("source: 'rcheevos' | 'ram' | 'ra';"), 'Achievement progress type does not accept rcheevos counter data.');

assert(renderer.includes('snapshot?.runtime?.live'), 'Renderer does not consume live observer status data.');
assert(renderer.includes('selectLiveAchievementCounters'), 'Live counter selection is missing.');
assert(renderer.includes("counter.source === 'rcheevos' ? 'RA measured · rcheevos'"), 'Visible rcheevos counter provenance is missing.');
assert(renderer.includes('achievementCounter(achievement, ram, profile || null, runtimeLive) || state?.progress'), 'Overlay must prefer live rcheevos counters over older mapped progress.');
assert(pages.includes('LIVE ACHIEVEMENT PROGRESS'), 'Dashboard/Current Game live counter presentation is missing.');
assert(pages.includes('achievementCounter(achievement, isCurrentGame ? effectiveRam : undefined, isCurrentGame) || state.progress'), 'Achievement rows do not prefer live current-game counters.');

for (const forbidden of ["r: 'startsession'", "r: 'ping'", "r: 'awardachievement'", "r: 'submitlbentry'"]) {
  assert(!runtimeData.includes(forbidden), `Forbidden RA runtime endpoint found: ${forbidden}`);
}

console.log('Live achievement counter contract: OK');
