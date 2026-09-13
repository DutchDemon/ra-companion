import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('v0.5.8 Faron Tear Hunt subarea coverage', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/profiles/twilightPrincess.ts'), 'utf8');

  it('keeps the Tear objective active in Faron Woods, Faron Woods House and the Faron Woods Tunnel', () => {
    expect(source).toMatch(/\['F_SP108', 'R_SP108', 'D_SB10'\]\.includes\(String\((?:[A-Za-z_$][A-Za-z0-9_$]*\.)?stageCode \|\| ''\)\.trim\(\)\)/);
  });

  it('removes the single-stage-only v0.5.7 gate', () => {
    expect(source).not.toMatch(/String\([^\n]*stageCode \|\| ''\)\.trim\(\) === 'F_SP108'/);
  });

  it('does not broaden the Tear Hunt gate to Forest Temple', () => {
    const gate = source.match(/\['F_SP108', 'R_SP108', 'D_SB10'\]\.includes\([^\n]+\)/)?.[0] || '';
    expect(gate).not.toContain('D_MN05');
  });
});
