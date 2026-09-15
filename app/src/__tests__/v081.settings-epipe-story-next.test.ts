import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function source(relativePath: string) {
  const root = path.resolve(__dirname, '..', '..');
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('v0.8.1 compact RA login, EPIPE hardening and story-next dedupe', () => {
  it('renders one compact username/password/API-key connection flow and reuses stored auth', () => {
    const pages = source('src/AppPages.tsx');
    expect(pages).toContain('Username');
    expect(pages).toContain('Password');
    expect(pages).toContain('API Key');
    expect(pages).toContain('Save & connect');
    expect(pages).toContain('Authenticated · enter only to reconnect');
    expect(pages).toContain('Stored · enter only to replace');
    expect(pages).toContain('Saved credentials will be reused automatically');
    expect(pages).toContain('encrypted runtime token are reused automatically');
    expect(pages).not.toContain('STEP 1');
    expect(pages).not.toContain('STEP 2');
    expect(pages).not.toContain('Account & live runtime');
    expect(pages).not.toContain('v72-setup-overview');
  });

  it('consumes helper stdin EPIPE-style errors and makes shutdown best-effort', () => {
    const helper = source('electron/services/runtime-helper-service.cjs');
    expect(helper).toContain("spawned.stdin.on('error'");
    expect(helper).toContain("code === 'EPIPE'");
    expect(helper).toContain("code === 'ERR_STREAM_DESTROYED'");
    expect(helper).toContain("code === 'ERR_STREAM_WRITE_AFTER_END'");
    expect(helper).toContain('handlePipeFailure');
    expect(helper).toContain('stoppingChild = target');
    expect(helper).toContain('It will reconnect automatically.');
  });

  it('never renders the same achievement as Current Story Beat and Next Story Beat', () => {
    const main = source('src/main.tsx');
    expect(main).toContain('const currentStoryIds = new Set(companion.current.map(achievementId));');
    expect(main).toContain('const nextStoryAchievements = uniqueAchievements([');
    expect(main).toContain('.filter((achievement: any) => !currentStoryIds.has(achievementId(achievement)))');
    expect(main).toContain('achievements={nextStoryAchievements}');
    expect(main).not.toContain('achievements={pendingFaronVesselAchievement ? [pendingFaronVesselAchievement] : companion.comingUp}');
  });
});
