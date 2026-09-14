import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('v0.6.4 overlay stability, theme and Windows identity', () => {
  const electron = fs.readFileSync(path.resolve('electron/main.cjs'), 'utf8');
  const css = fs.readFileSync(path.resolve('src/styles.css'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));

  it('moves the overlay without allowing native resizing or changing its stored size', () => {
    expect(electron).toContain('resizable: false');
    expect(electron).toContain('thickFrame: false');
    expect(electron).toContain('if (overlayMoveSession || overlayResizeSession) return;');
    expect(electron).toContain('width: overlayMoveSession.startBounds.width');
    expect(electron).toContain('height: overlayMoveSession.startBounds.height');
    expect(electron).toContain('overlayWindow.setBounds({');
  });

  it('keeps the overlay out of the taskbar and applies explicit Windows app details to the main window', () => {
    expect(electron).toContain('skipTaskbar: true');
    expect(electron).toContain("mainWindow.setIcon(appIconPath)");
    expect(electron).toContain('mainWindow.setAppDetails({');
    expect(electron).toContain("appId: 'com.dutchdemon.racompanion'");
    expect(electron).toContain('appIconPath,');
    expect(pkg.build.win.icon).toBe('electron/ra-icon.ico');
  });

  it('finishes the overlay charcoal/orange theme while keeping achievement copy neutral', () => {
    expect(css).toContain('/* v0.6.4 overlay charcoal/orange completion */');
    expect(css).toContain('.context-section.current .context-section-title { color: var(--ra-orange-bright); }');
    expect(css).toContain('.context-achievement-copy b { color: #fff; }');
    expect(css).toContain('.context-achievement-copy span { color: #c8c8c8; }');
    expect(css).toContain('.context-achievement em { color: var(--ra-orange); }');
  });
});
