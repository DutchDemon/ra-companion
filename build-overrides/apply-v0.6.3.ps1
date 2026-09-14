$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$appRoot = Join-Path $repoRoot 'app'
$packagePath = Join-Path $appRoot 'package.json'
$pngPath = Join-Path $appRoot 'build\ra-icon.png'
$icoPath = Join-Path $appRoot 'electron\ra-icon.ico'
$uiAssetDir = Join-Path $appRoot 'src\assets'
$uiIconPath = Join-Path $uiAssetDir 'ra-icon.png'

if (-not (Test-Path $packagePath)) { throw "Missing reconstructed package.json at $packagePath" }
if (-not (Test-Path $pngPath)) { throw 'v0.6.2 RetroAchievements PNG icon is missing.' }

New-Item -ItemType Directory -Path (Split-Path -Parent $icoPath) -Force | Out-Null
New-Item -ItemType Directory -Path $uiAssetDir -Force | Out-Null

# Build a proper multi-resolution Windows icon from the same official RAWeb asset
# introduced in v0.6.2. Keep the PNG too so the renderer can use identical artwork.
& python -c "import PIL" 2>$null
if ($LASTEXITCODE -ne 0) {
    & python -m pip install --disable-pip-version-check --quiet Pillow
    if ($LASTEXITCODE -ne 0) { throw 'Could not install Pillow for icon conversion.' }
}

$pngEscaped = $pngPath.Replace("'", "''")
$icoEscaped = $icoPath.Replace("'", "''")
$iconPython = "from PIL import Image; img=Image.open(r'$pngEscaped').convert('RGBA'); img.save(r'$icoEscaped', format='ICO', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])"
& python -c $iconPython
if ($LASTEXITCODE -ne 0) { throw 'Could not create multi-resolution Windows icon.' }
if (-not (Test-Path $icoPath)) { throw 'Runtime Windows icon was not generated.' }
Copy-Item $pngPath $uiIconPath -Force

$transformPath = Join-Path $env:RUNNER_TEMP 'ra-companion-v063-transform.py'
@'
from pathlib import Path
import json

root = Path('app')

# package.json
package_path = root / 'package.json'
pkg = json.loads(package_path.read_text(encoding='utf-8-sig'))
pkg['version'] = '0.6.3'
pkg.setdefault('build', {}).setdefault('win', {})['icon'] = 'electron/ra-icon.ico'
package_path.write_text(json.dumps(pkg, indent=2) + '\n', encoding='utf-8')

# Runtime Windows identity + BrowserWindow icon.
main_path = root / 'electron' / 'main.cjs'
main = main_path.read_text(encoding='utf-8')
user_data_anchor = "app.setPath('userData', path.join(app.getPath('appData'), 'ra-companion'));"
if user_data_anchor not in main:
    raise SystemExit('Could not find Electron userData anchor.')
if "app.setAppUserModelId('com.dutchdemon.racompanion')" not in main:
    main = main.replace(
        user_data_anchor,
        user_data_anchor + "\nif (process.platform === 'win32') {\n  app.setAppUserModelId('com.dutchdemon.racompanion');\n}",
        1,
    )
window_anchor = "function createMainWindow() {\n  const windowTitle = `RA Companion v${app.getVersion()}`;"
if window_anchor not in main:
    raise SystemExit('Could not find createMainWindow anchor.')
if "const appIconPath = path.join(__dirname, 'ra-icon.ico');" not in main:
    main = main.replace(
        window_anchor,
        window_anchor + "\n  const appIconPath = path.join(__dirname, 'ra-icon.ico');",
        1,
    )
browser_anchor = "  mainWindow = new BrowserWindow({\n"
if browser_anchor not in main:
    raise SystemExit('Could not find main BrowserWindow anchor.')
if '    icon: appIconPath,\n' not in main:
    main = main.replace(browser_anchor, browser_anchor + '    icon: appIconPath,\n', 1)
main_path.write_text(main, encoding='utf-8')

# Use the same official RetroAchievements logo inside the sidebar brand.
main_tsx_path = root / 'src' / 'main.tsx'
main_tsx = main_tsx_path.read_text(encoding='utf-8')
style_import = "import './styles.css';"
logo_import = "import raCompanionLogo from './assets/ra-icon.png';"
if style_import not in main_tsx:
    raise SystemExit('Could not find renderer stylesheet import.')
if logo_import not in main_tsx:
    main_tsx = main_tsx.replace(style_import, style_import + '\n' + logo_import, 1)
old_brand = '<div className="v5-brand"><div className="v5-brand-mark">RA</div><div><b>RA Companion</b><span>Live companion for RetroAchievements players</span></div></div>'
new_brand = '<div className="v5-brand"><img className="v5-brand-mark" src={raCompanionLogo} alt="" aria-hidden="true" /><div><b>RA Companion</b><span>Live companion for RetroAchievements players</span></div></div>'
if old_brand not in main_tsx and new_brand not in main_tsx:
    raise SystemExit('Could not find sidebar brand markup.')
main_tsx = main_tsx.replace(old_brand, new_brand, 1)
main_tsx_path.write_text(main_tsx, encoding='utf-8')

# v0.5.6 expectations were superseded intentionally by the v0.6.0 Faron copy.
test_path = root / 'src' / '__tests__' / 'v056.regression.test.tsx'
test_text = test_path.read_text(encoding='utf-8')
old_a = "expect(state?.label).toContain('Vessel not received');"
new_a = "expect(state?.label).toBe('Coming soon · Obtain the Vessel of Light');"
old_b = "expect(state?.label).toBe('In progress · 7/16 Tears');"
new_b = "expect(state?.label).toBe('7 / 16 Tears of Light');"
if old_a not in test_text and new_a not in test_text:
    raise SystemExit('Could not find the first v0.5.6 Faron regression expectation.')
if old_b not in test_text and new_b not in test_text:
    raise SystemExit('Could not find the second v0.5.6 Faron regression expectation.')
test_text = test_text.replace(old_a, new_a, 1).replace(old_b, new_b, 1)
test_path.write_text(test_text, encoding='utf-8')

# Central RA-inspired theme layer. Keep green/red as semantic success/error colors,
# while navigation, progress and active states use the RA orange accent.
styles_path = root / 'src' / 'styles.css'
styles = styles_path.read_text(encoding='utf-8')
marker = '/* v0.6.3 RetroAchievements charcoal/orange theme */'
if marker not in styles:
    styles += r'''

/* v0.6.3 RetroAchievements charcoal/orange theme */
:root {
  --ra-bg: #171717;
  --ra-bg-deep: #101010;
  --ra-sidebar: #131313;
  --ra-surface: #222222;
  --ra-surface-2: #282828;
  --ra-surface-hover: #303030;
  --ra-line: rgba(255, 255, 255, .09);
  --ra-line-strong: rgba(242, 140, 40, .38);
  --ra-orange: #f28c28;
  --ra-orange-bright: #ff9d2e;
  --ra-orange-soft: rgba(242, 140, 40, .12);
  --ra-text: #ffffff;
  --ra-text-secondary: #c8c8c8;
  --ra-text-muted: #909090;

  --v5-bg: var(--ra-bg);
  --v5-bg-2: var(--ra-bg-deep);
  --v5-panel: rgba(34, 34, 34, .96);
  --v5-panel-2: rgba(40, 40, 40, .94);
  --v5-line: var(--ra-line);
  --v5-line-strong: var(--ra-line-strong);
  --v5-text: var(--ra-text);
  --v5-muted: var(--ra-text-muted);
  --v5-cyan: var(--ra-orange);
  --v5-blue: var(--ra-orange-bright);
  --v5-amber: #ffb347;
}

html, body, #root { background: var(--ra-bg-deep); }
body {
  color: var(--ra-text);
  background:
    radial-gradient(circle at 74% -12%, rgba(242, 140, 40, .08), transparent 34%),
    linear-gradient(180deg, #1a1a1a 0%, #101010 100%);
}

.v5-sidebar {
  border-right-color: rgba(255, 255, 255, .07);
  background: linear-gradient(180deg, #171717, #111111);
  box-shadow: 12px 0 40px rgba(0, 0, 0, .24);
}
.v5-brand-mark {
  width: 48px;
  height: 48px;
  display: block;
  object-fit: contain;
  border-radius: 10px;
  background: transparent;
  box-shadow: none;
  filter: drop-shadow(0 8px 18px rgba(0, 0, 0, .28));
}
.v5-brand b { color: #fff; }
.v5-brand span { color: #a9a9a9; }

.v5-sidebar nav button { color: #c6c6c6; }
.v5-sidebar nav button:hover { color: #fff; background: rgba(242, 140, 40, .08); }
.v5-sidebar nav button.active {
  color: #fff;
  border-color: rgba(242, 140, 40, .34);
  background: linear-gradient(90deg, rgba(242, 140, 40, .20), rgba(242, 140, 40, .055));
  box-shadow: inset 3px 0 0 var(--ra-orange), 0 8px 24px rgba(0, 0, 0, .16);
}
.v5-sidebar nav button > span { color: var(--ra-orange); }
.v5-sidebar-footer { border-top-color: rgba(255,255,255,.08); color: #808080; }
.v5-sidebar-footer span { color: #bdbdbd; }
.v5-sidebar-footer b { color: var(--ra-orange); }

.v5-page-header p,
.v5-muted,
.v5-hero-copy > p,
.v5-kv span,
.v5-context-grid span { color: var(--ra-text-muted); }
.v5-page-icon {
  color: var(--ra-orange);
  background: var(--ra-orange-soft);
}
.v5-section-label { color: var(--ra-orange); }

.v5-panel {
  border-color: var(--ra-line);
  background: linear-gradient(180deg, rgba(38,38,38,.97), rgba(29,29,29,.97));
  box-shadow: inset 0 1px rgba(255,255,255,.02), 0 18px 44px rgba(0,0,0,.2);
}
.v5-card-heading h3 { color: #efefef; }
.v5-game-hero { border-color: rgba(242, 140, 40, .25); }
.v5-game-hero::after { background: radial-gradient(circle at 85% 50%, rgba(242, 140, 40, .12), transparent 36%); }
.v5-game-icon { border-color: rgba(242, 140, 40, .30); background: #191919; }
.v5-game-icon.placeholder {
  color: var(--ra-orange);
  background: linear-gradient(145deg, rgba(242, 140, 40, .14), rgba(25,25,25,.94));
}

.v5-missable-row,
.v5-achievement-row,
.v5-context-detail-grid > div,
.v5-session-chips span {
  border-color: rgba(255,255,255,.08);
  background: rgba(24,24,24,.62);
}
.v5-missable-row:hover,
.v5-achievement-row:hover { border-color: rgba(242, 140, 40, .28); background: #292929; }
.v5-missable-icon { color: #1a1005; background: var(--ra-orange); }
.v5-chevron { color: var(--ra-orange); }

/* Achievement text stays neutral/white: orange is UI emphasis, not body copy. */
.v5-achievement-copy b,
.compact-achievement b,
.context-achievement-copy b { color: #fff; }
.v5-achievement-copy > span,
.compact-achievement span,
.context-achievement-copy > span { color: #c8c8c8; }
.v5-points,
.compact-achievement em,
.context-achievement > em { color: var(--ra-orange); }
.v5-inline-state.active,
.v5-inline-state.upcoming,
.v5-status-pill.active,
.v5-status-pill.upcoming { color: var(--ra-orange-bright); }
.v5-status-pill.active,
.v5-status-pill.upcoming {
  border-color: rgba(242, 140, 40, .30);
  background: rgba(242, 140, 40, .08);
}

.v5-filter-row button.selected,
.segmented button.selected,
.corner-grid button.selected {
  color: #fff;
  border-color: rgba(242, 140, 40, .40);
  background: rgba(242, 140, 40, .16);
}
.v5-settings-form input:focus,
.settings-card input:focus { border-color: var(--ra-orange); box-shadow: 0 0 0 2px rgba(242,140,40,.11); }
.opacity-row input[type="range"] { accent-color: var(--ra-orange); }

.overlay-card {
  border-color: rgba(242, 140, 40, .24);
  background: rgba(20,20,20,.94);
}
.pill.blue,
.big-progress strong,
.compact-achievement em,
.v5-guide-sections section > span { color: var(--ra-orange); }
.pill.blue { border-color: rgba(242, 140, 40, .28); background: rgba(242, 140, 40, .08); }
.progress-track { background: #353535; }
.progress-fill { background: linear-gradient(90deg, #d87518, var(--ra-orange-bright)); }

.achievement-counter-track { background: #343434; }
.achievement-counter-track > i { background: var(--ra-orange); }
'''
    styles_path.write_text(styles, encoding='utf-8')

# Add a small regression test for the user-visible brand source. Runtime Electron
# identity/icon checks live in the workflow because they inspect main.cjs directly.
branding_test = root / 'src' / '__tests__' / 'v063.branding.test.ts'
branding_test.write_text("""import { describe, expect, it } from 'vitest';\nimport fs from 'node:fs';\nimport path from 'node:path';\n\ndescribe('v0.6.3 RetroAchievements branding', () => {\n  it('uses the official RA logo in the sidebar instead of the old text tile', () => {\n    const source = fs.readFileSync(path.resolve('src/main.tsx'), 'utf8');\n    expect(source).toContain(\"import raCompanionLogo from './assets/ra-icon.png';\");\n    expect(source).toContain('src={raCompanionLogo}');\n    expect(source).not.toContain('<div className=\"v5-brand-mark\">RA</div>');\n  });\n\n  it('keeps achievement copy white/neutral while orange remains the accent', () => {\n    const css = fs.readFileSync(path.resolve('src/styles.css'), 'utf8');\n    expect(css).toContain('--ra-orange: #f28c28;');\n    expect(css).toContain('.v5-achievement-copy b');\n    expect(css).toContain('color: #fff;');\n  });\n});\n""", encoding='utf-8')

print('Applied RA Companion v0.6.3 runtime icon, RA theme, sidebar branding and test fixes.')
'@ | Set-Content $transformPath -Encoding UTF8

Push-Location $repoRoot
try {
    & python $transformPath
    if ($LASTEXITCODE -ne 0) { throw "v0.6.3 source transform failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

$verifyPkg = Get-Content $packagePath -Raw | ConvertFrom-Json
if ($verifyPkg.version -ne '0.6.3') { throw 'Failed to set v0.6.3 package version.' }
if ($verifyPkg.build.win.icon -ne 'electron/ra-icon.ico') { throw 'Failed to configure multi-resolution Windows icon.' }
if (-not (Test-Path $icoPath)) { throw 'Runtime Windows icon is missing after transform.' }
if (-not (Test-Path $uiIconPath)) { throw 'Renderer RA logo is missing after transform.' }

Write-Host 'v0.6.3 branding/runtime icon/theme hotfix applied.'
