$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$appRoot = Join-Path $repoRoot 'app'
$packagePath = Join-Path $appRoot 'package.json'
$pngPath = Join-Path $appRoot 'build\ra-icon.png'
$icoPath = Join-Path $appRoot 'electron\ra-icon.ico'

if (-not (Test-Path $packagePath)) { throw "Missing reconstructed package.json at $packagePath" }
if (-not (Test-Path $pngPath)) { throw 'Official RetroAchievements PNG icon is missing before v0.6.4.' }
if (-not (Test-Path (Join-Path $appRoot 'electron\main.cjs'))) { throw 'Electron main process is missing before v0.6.4.' }

# Rebuild the ICO with the Windows DPI sizes recommended by Electron, including
# 20px and 40px variants that were absent from v0.6.3.
& python -c "import PIL" 2>$null
if ($LASTEXITCODE -ne 0) {
    & python -m pip install --disable-pip-version-check --quiet Pillow
    if ($LASTEXITCODE -ne 0) { throw 'Could not install Pillow for v0.6.4 icon conversion.' }
}

$pngEscaped = $pngPath.Replace("'", "''")
$icoEscaped = $icoPath.Replace("'", "''")
$iconPython = "from PIL import Image; img=Image.open(r'$pngEscaped').convert('RGBA'); img.save(r'$icoEscaped', format='ICO', sizes=[(16,16),(20,20),(24,24),(32,32),(40,40),(48,48),(64,64),(128,128),(256,256)])"
& python -c $iconPython
if ($LASTEXITCODE -ne 0) { throw 'Could not rebuild the v0.6.4 Windows icon.' }
if (-not (Test-Path $icoPath)) { throw 'v0.6.4 Windows icon was not generated.' }

$transformPath = Join-Path $env:RUNNER_TEMP 'ra-companion-v064-transform.py'
@'
from pathlib import Path
import json

root = Path('app')

# Version/build metadata.
package_path = root / 'package.json'
pkg = json.loads(package_path.read_text(encoding='utf-8-sig'))
if pkg.get('version') != '0.6.3':
    raise SystemExit(f"Expected package version 0.6.3 before v0.6.4, got {pkg.get('version')}")
pkg['version'] = '0.6.4'
pkg.setdefault('build', {}).setdefault('win', {})['icon'] = 'electron/ra-icon.ico'
nsis = pkg.setdefault('build', {}).setdefault('nsis', {})
nsis['installerIcon'] = 'electron/ra-icon.ico'
nsis['uninstallerIcon'] = 'electron/ra-icon.ico'
nsis['installerHeaderIcon'] = 'electron/ra-icon.ico'
package_path.write_text(json.dumps(pkg, indent=2) + '\n', encoding='utf-8')

lock_path = root / 'package-lock.json'
if lock_path.exists():
    lock = json.loads(lock_path.read_text(encoding='utf-8-sig'))
    if lock.get('version') == '0.6.3':
        lock['version'] = '0.6.4'
    packages = lock.get('packages') or {}
    if isinstance(packages.get(''), dict) and packages[''].get('version') == '0.6.3':
        packages['']['version'] = '0.6.4'
    lock_path.write_text(json.dumps(lock, indent=2) + '\n', encoding='utf-8')

# Electron window stability + explicit Windows taskbar identity/icon.
main_path = root / 'electron' / 'main.cjs'
main = main_path.read_text(encoding='utf-8')

old_schedule = """function scheduleOverlayBoundsSave() {
  if (Date.now() < suppressOverlayBoundsEventsUntil) return;
  if (overlayBoundsTimer) clearTimeout(overlayBoundsTimer);
"""
new_schedule = """function scheduleOverlayBoundsSave() {
  if (overlayMoveSession || overlayResizeSession) return;
  if (Date.now() < suppressOverlayBoundsEventsUntil) return;
  if (overlayBoundsTimer) clearTimeout(overlayBoundsTimer);
"""
if old_schedule not in main and new_schedule not in main:
    raise SystemExit('Could not find overlay bounds-save guard.')
main = main.replace(old_schedule, new_schedule, 1)

old_move = """  suppressOverlayBoundsEventsUntil = Date.now() + 120;
  overlayWindow.setPosition(
    Math.round(overlayMoveSession.startBounds.x + dx),
    Math.round(overlayMoveSession.startBounds.y + dy),
    false,
  );
  return true;
}"""
new_move = """  suppressOverlayBoundsEventsUntil = Date.now() + 120;
  overlayWindow.setBounds({
    x: Math.round(overlayMoveSession.startBounds.x + dx),
    y: Math.round(overlayMoveSession.startBounds.y + dy),
    width: overlayMoveSession.startBounds.width,
    height: overlayMoveSession.startBounds.height,
  }, false);
  return true;
}"""
if old_move not in main and new_move not in main:
    raise SystemExit('Could not find overlay move implementation.')
main = main.replace(old_move, new_move, 1)

old_end_move = """  overlayMoveSession = null;
  suppressOverlayBoundsEventsUntil = 0;
  return persistCurrentOverlayBounds(true);
}"""
new_end_move = """  const currentBounds = overlayWindow.getBounds();
  const lockedBounds = {
    x: currentBounds.x,
    y: currentBounds.y,
    width: overlayMoveSession.startBounds.width,
    height: overlayMoveSession.startBounds.height,
  };
  markProgrammaticBoundsChange();
  overlayWindow.setBounds(lockedBounds, false);
  overlayMoveSession = null;
  suppressOverlayBoundsEventsUntil = 0;
  return persistCurrentOverlayBounds(true);
}"""
if old_end_move not in main and new_end_move not in main:
    raise SystemExit('Could not find overlay move finalizer.')
main = main.replace(old_end_move, new_end_move, 1)

# Disable the native transparent-window resize frame. RA Companion already has
# explicit resize handles; running both systems at once lets a normal hold/move
# gesture accidentally become a Windows native resize.
old_overlay_window = """  overlayWindow = new BrowserWindow({
    width: savedBounds?.width || size.width,
    height: savedBounds?.height || size.height,
    minWidth: MIN_OVERLAY_WIDTH,
    minHeight: MIN_OVERLAY_HEIGHT,
    frame: false,
    transparent: true,
    resizable: true,
    movable: true,
    thickFrame: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
"""
new_overlay_window = """  const appIconPath = path.join(__dirname, 'ra-icon.ico');
  overlayWindow = new BrowserWindow({
    icon: appIconPath,
    width: savedBounds?.width || size.width,
    height: savedBounds?.height || size.height,
    minWidth: MIN_OVERLAY_WIDTH,
    minHeight: MIN_OVERLAY_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    thickFrame: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
"""
if old_overlay_window not in main and new_overlay_window not in main:
    raise SystemExit('Could not find overlay BrowserWindow options.')
main = main.replace(old_overlay_window, new_overlay_window, 1)

# BrowserWindow.icon alone did not reliably override the live Windows taskbar
# identity on the user's existing install. Explicitly set both the window icon
# and Windows taskbar/relaunch metadata after construction.
main_window_anchor = """  mainWindow = new BrowserWindow({
    icon: appIconPath,
    width: 1360,
    height: 860,
    minWidth: 1020,
    minHeight: 680,
    backgroundColor: '#0a0d12',
    autoHideMenuBar: true,
    title: windowTitle,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

"""
main_window_with_details = main_window_anchor + """  if (process.platform === 'win32') {
    mainWindow.setIcon(appIconPath);
    mainWindow.setAppDetails({
      appId: 'com.dutchdemon.racompanion',
      appIconPath,
      appIconIndex: 0,
      relaunchCommand: process.execPath,
      relaunchDisplayName: 'RA Companion',
    });
  }

"""
if main_window_anchor not in main and "mainWindow.setAppDetails({" not in main:
    raise SystemExit('Could not find main BrowserWindow construction block.')
if "mainWindow.setAppDetails({" not in main:
    main = main.replace(main_window_anchor, main_window_with_details, 1)

main_path.write_text(main, encoding='utf-8')

# Full overlay theme pass: charcoal surfaces + RA orange interaction/progress,
# while achievement titles/body copy remain white/neutral.
styles_path = root / 'src' / 'styles.css'
styles = styles_path.read_text(encoding='utf-8')
marker = '/* v0.6.4 overlay charcoal/orange completion */'
if marker not in styles:
    styles += r'''

/* v0.6.4 overlay charcoal/orange completion */
.overlay-card,
.context-overlay {
  border-color: rgba(242, 140, 40, .30);
  background: rgba(20, 20, 20, .965);
  box-shadow: 0 20px 70px rgba(0,0,0,.58), inset 0 1px 0 rgba(255,255,255,.025);
}
.overlay-shell.editable .overlay-card {
  border-color: rgba(242, 140, 40, .54);
  box-shadow: 0 20px 70px rgba(0,0,0,.58), inset 0 0 0 1px rgba(242,140,40,.07);
}
.overlay-shell.editable .overlay-card::after { color: rgba(255,157,46,.76); }
.overlay-shell.editable .overlay-resize-handle::after { background: rgba(242,140,40,.22); }
.overlay-shell.editable .overlay-resize-handle:hover::after { background: rgba(255,157,46,.72); }
.resize-ne::after,
.resize-nw::after,
.resize-se::after,
.resize-sw::after { border-color: rgba(255,157,46,.70); }
.placement-tip {
  border-color: rgba(242,140,40,.20);
  background: rgba(242,140,40,.055);
  color: #aaa29a;
}
.context-header,
.context-section,
.context-achievement + .context-achievement,
.presence-strip { border-color: rgba(255,255,255,.085); }
.context-title-copy h1 { color: #fff; }
.context-progress-row { color: #aaa; }
.context-progress-row b { color: #f2f2f2; }
.context-section-title small {
  color: #a9a9a9;
  background: rgba(255,255,255,.06);
}
.context-section.current .context-section-title { color: var(--ra-orange-bright); }
.context-section.coming .context-section-title { color: #c8c8c8; }
.context-achievement img,
.context-achievement .overlay-badge-placeholder { background: #2a2a2a; }
.context-achievement-copy b { color: #fff; }
.context-achievement-copy span { color: #c8c8c8; }
.context-achievement em { color: var(--ra-orange); }
.overlay-empty {
  border-color: rgba(242,140,40,.24);
  background: rgba(242,140,40,.065);
}
.overlay-empty b { color: #fff; }
.overlay-empty span { color: #b7b7b7; }
.overlay-footer,
.presence-strip { color: #858585; }
.v6-overlay-live-stats {
  border: 1px solid rgba(242,140,40,.12);
  background: rgba(255,255,255,.045);
  color: #d8d8d8;
}
.overlay-shell.editable .context-overlay::before {
  color: rgba(255,157,46,.82);
  background: rgba(20,20,20,.90);
  border: 1px solid rgba(242,140,40,.14);
}
.unlock-toast {
  border-color: rgba(242,140,40,.48);
  background: rgba(24,20,16,.98);
}
.unlock-toast span { color: var(--ra-orange-bright); }
.unlock-toast b { color: #fff; }
.unlock-toast small { color: #b0aaa4; }
'''
    styles_path.write_text(styles, encoding='utf-8')

# Regression coverage for the three v0.6.4 user-reported issues.
test_path = root / 'src' / '__tests__' / 'v064.overlay-stability.test.ts'
test_path.write_text("""import { describe, expect, it } from 'vitest';
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
    expect(electron).not.toContain('overlayWindow.setPosition(\n    Math.round(overlayMoveSession.startBounds.x + dx)');
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
""", encoding='utf-8')

print('Applied RA Companion v0.6.4 overlay stability, complete overlay theme and Windows taskbar identity fix.')
'@ | Set-Content $transformPath -Encoding UTF8

Push-Location $repoRoot
try {
    & python $transformPath
    if ($LASTEXITCODE -ne 0) { throw "v0.6.4 transform failed with exit code $LASTEXITCODE." }
} finally {
    Pop-Location
}

$finalPkg = Get-Content $packagePath -Raw | ConvertFrom-Json
if ($finalPkg.version -ne '0.6.4') { throw "Expected v0.6.4 after transform, got $($finalPkg.version)." }
if ($finalPkg.build.win.icon -ne 'electron/ra-icon.ico') { throw 'v0.6.4 Windows app icon config is missing.' }
if (-not (Test-Path (Join-Path $appRoot 'src\__tests__\v064.overlay-stability.test.ts'))) { throw 'v0.6.4 regression test is missing.' }

$main = Get-Content (Join-Path $appRoot 'electron\main.cjs') -Raw
if (-not $main.Contains('resizable: false')) { throw 'Overlay native resizing was not disabled.' }
if (-not $main.Contains('thickFrame: false')) { throw 'Overlay native thick frame was not disabled.' }
if (-not $main.Contains('mainWindow.setAppDetails({')) { throw 'Explicit Windows taskbar app details are missing.' }
if (-not $main.Contains('skipTaskbar: true')) { throw 'Overlay is no longer excluded from the taskbar.' }

Write-Host 'v0.6.4 overlay stability/taskbar/theme hotfix applied.'
