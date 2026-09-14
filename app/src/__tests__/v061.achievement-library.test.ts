import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function source(relative: string) {
  return fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');
}

describe('v0.6.1 persistent multi-game achievement library', () => {
  it('keeps the official RA game-progress endpoint authoritative while persisting it per account/game', () => {
    const main = source('electron/main.cjs');
    expect(main).toContain('const progress = baseProgress;');
    expect(main).not.toContain('const progress = mergeRecentHardcoreUnlocks(baseProgress, recent, gameId);');
    expect(main).toContain("path.join(app.getPath('userData'), 'achievement-library.json')");
    expect(main).toContain('rememberAchievementGame(config.username, gameId, result.data)');
    expect(main).toContain('achievementLibraryAccountKey(username)');
  });

  it('does not expose a previous account library before the currently configured account is verified', () => {
    const main = source('electron/main.cjs');
    expect(main).toContain('current.username.toLowerCase() === current.verifiedUsername.toLowerCase()');
    expect(main).toContain("return { version: ACHIEVEMENT_LIBRARY_VERSION, username: '', games: [] }");
    expect(main).toContain('broadcastAchievementLibraryChanged();');
  });

  it('merges Missables into Achievements and groups remembered games behind collapsible headers', () => {
    const renderer = source('src/main.tsx');
    const pages = source('src/AppPages.tsx');
    expect(renderer).not.toContain("['missables', '!', 'Missables']");
    expect(renderer).not.toContain("page === 'missables'");
    expect(pages).not.toContain('export function MissablesPage()');
    expect(pages).toContain("ra-companion-achievement-groups-v1");
    expect(pages).toContain('v61-game-header');
    expect(pages).toContain("['missables', `Missables (${missableCount})`]");
  });

  it('keeps remembered game achievements available without requiring an active game session', () => {
    const pages = source('src/AppPages.tsx');
    expect(pages).toContain('Your permanent RetroAchievements library');
    expect(pages).toContain('Saved achievement data remains available offline.');
    expect(pages).toContain('achievementLibrary?.games');
    expect(pages).toContain('Number(game.gameId) === Number(activeGameId)');
  });
});
