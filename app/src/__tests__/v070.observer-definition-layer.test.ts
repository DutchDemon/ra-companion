import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('v0.7 rcheevos observer definition layer', () => {
  const observer = source('electron/services/observer-runtime-service.cjs');
  const helper = source('../native/rcheevos-runtime-helper/main.c');

  it('loads raw definitions atomically through the native observer commands', () => {
    expect(observer).toContain('async function loadGame(input)');
    expect(observer).toContain("runtimeHelper.request('activateAchievement'");
    expect(observer).toContain("runtimeHelper.request('deactivateAchievement'");
    expect(observer).toContain('bestEffortDeactivate(activatedIds)');
    expect(observer).toContain('sealed: true');
    expect(observer).toContain('loadedAchievementCount: activatedIds.length');
  });

  it('verifies the attached GameCube image before live evaluation', () => {
    expect(observer).toContain('async function validateAttachedGame()');
    expect(observer).toContain('memory?.gameCubeMagic');
    expect(observer).toContain('Observer game mismatch: expected');
    expect(observer).toContain("runtimeHelper.request('evaluateFrame'");
  });

  it('keeps official RetroAchievements server progress authoritative', () => {
    expect(observer).toContain("officialCompletionAuthority: 'retroachievements-server'");
    expect(observer).toContain('observerOnly: true');
    expect(observer).not.toContain("request('award");
    expect(observer).not.toContain("request('unlock");
    expect(observer).not.toContain("request('submit");
    expect(observer).not.toContain("request('startSession");
  });

  it('uses rc_runtime only as a local evaluator', () => {
    expect(helper).toContain('rc_runtime_activate_achievement');
    expect(helper).toContain('rc_runtime_do_frame');
    expect(helper).toContain('dolphin_runtime_peek');
    expect(helper).toContain('observerOnly');
  });
});
