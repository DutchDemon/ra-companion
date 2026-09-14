import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('v0.6.3 RetroAchievements branding', () => {
  it('uses the official RA logo in the sidebar instead of the old text tile', () => {
    const source = fs.readFileSync(path.resolve('src/main.tsx'), 'utf8');
    expect(source).toContain("import raCompanionLogo from './assets/ra-icon.png';");
    expect(source).toContain('src={raCompanionLogo}');
    expect(source).not.toContain('<div className="v5-brand-mark">RA</div>');
  });

  it('keeps achievement copy white/neutral while orange remains the accent', () => {
    const css = fs.readFileSync(path.resolve('src/styles.css'), 'utf8');
    expect(css).toContain('--ra-orange: #f28c28;');
    expect(css).toContain('.v5-achievement-copy b');
    expect(css).toContain('color: #fff;');
  });
});
