import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildProfileContext, getGameProfileByRaGameId } from '../profiles/registry';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('v0.7 game-start regression guards', () => {
  it('uses the generic profile guide lookup when a populated game set arrives', () => {
    const main = source('src/main.tsx');
    expect(main).not.toContain('getTwilightMissableGuide(achievement)');
    expect(main).toContain('getAchievementGuide(achievement, activeGameId)');

    const profile = getGameProfileByRaGameId(3934);
    const achievements = [
      {
        ID: 1,
        Title: 'What Happened Here',
        Description: 'Complete the one-time Twilight Hyrule Castle event.',
        Type: 'missable',
      },
    ];

    expect(profile?.key).toBe('twilight-princess-gc-us');
    expect(() => buildProfileContext(profile, achievements, '', { live: false })).not.toThrow();
  });

  it('packages the diagnostics launcher and exposes a non-Dolphin self-test', () => {
    const pkg = source('package.json');
    const launcher = source('RAM_DIAGNOSTICS.bat');
    const diagnostics = source('tools/ram-diagnostics.ps1');

    expect(pkg).toContain('"RAM_DIAGNOSTICS.bat"');
    expect(pkg).toContain('"typecheck": "tsc --noEmit"');
    expect(launcher).toContain('-File "%~dp0tools\\ram-diagnostics.ps1" %*');
    expect(launcher).toContain('"-SelfTest"');
    expect(diagnostics).toContain('[switch]$SelfTest');
    expect(diagnostics).toContain('Packaged RAM diagnostics self-test passed.');
  });
});
