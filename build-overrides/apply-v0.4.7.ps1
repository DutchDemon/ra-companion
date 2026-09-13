$ErrorActionPreference = 'Stop'

function Replace-Exact {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [Parameter(Mandatory = $true)][string]$Old,
    [Parameter(Mandatory = $true)][string]$New,
    [Parameter(Mandatory = $true)][string]$Label
  )

  if (-not $Text.Contains($Old)) {
    throw "Could not apply v0.4.7 patch: expected block '$Label' was not found."
  }
  return $Text.Replace($Old, $New)
}

$electronMainPath = 'app/electron/main.cjs'
$rendererMainPath = 'app/src/main.tsx'
$packagePath = 'app/package.json'
$lockPath = 'app/package-lock.json'

$electronMain = Get-Content $electronMainPath -Raw

$electronMain = Replace-Exact $electronMain `
  "function createMainWindow() {`n  mainWindow = new BrowserWindow({" `
  "function createMainWindow() {`n  const windowTitle = ``RA Companion v`${app.getVersion()}``;`n  mainWindow = new BrowserWindow({" `
  'dynamic main window title value'

$electronMain = Replace-Exact $electronMain `
  "    title: 'RA Companion'," `
  '    title: windowTitle,' `
  'dynamic BrowserWindow title'

$loadBlock = @'
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) mainWindow.loadURL(devUrl);
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
'@

$titleGuardBlock = @'
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
    if (!mainWindow.isDestroyed()) mainWindow.setTitle(windowTitle);
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) mainWindow.loadURL(devUrl);
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
'@

$electronMain = Replace-Exact $electronMain $loadBlock $titleGuardBlock 'page title guard'
Set-Content -Path $electronMainPath -Value $electronMain -Encoding utf8 -NoNewline

$rendererMain = Get-Content $rendererMainPath -Raw
$rendererMain = $rendererMain.Replace('0.4.6', '0.4.7')
Set-Content -Path $rendererMainPath -Value $rendererMain -Encoding utf8 -NoNewline

$package = Get-Content $packagePath -Raw | ConvertFrom-Json
$package.version = '0.4.7'
$package | ConvertTo-Json -Depth 100 | Set-Content -Path $packagePath -Encoding utf8

if (Test-Path $lockPath) {
  $lock = Get-Content $lockPath -Raw | ConvertFrom-Json
  $lock.version = '0.4.7'
  if ($lock.packages -and $lock.packages.PSObject.Properties.Name -contains '') {
    $lock.packages.''.version = '0.4.7'
  }
  $lock | ConvertTo-Json -Depth 100 | Set-Content -Path $lockPath -Encoding utf8
}

$patchedPackage = Get-Content $packagePath -Raw | ConvertFrom-Json
if ($patchedPackage.version -ne '0.4.7') {
  throw "Expected patched version 0.4.7, got $($patchedPackage.version)"
}

$patchedElectron = Get-Content $electronMainPath -Raw
if (-not $patchedElectron.Contains('const windowTitle = `RA Companion v${app.getVersion()}`;')) {
  throw 'Dynamic app-version window title was not applied.'
}
if (-not $patchedElectron.Contains("mainWindow.on('page-title-updated'")) {
  throw 'Window title page-title guard was not applied.'
}
if (-not $patchedElectron.Contains('quitAndInstall(true, true)')) {
  throw 'Silent updater install call regressed.'
}
if ($patchedElectron.Contains('quitAndInstall(false, true)')) {
  throw 'Interactive quitAndInstall call is still present.'
}

Write-Host 'Applied RA Companion v0.4.7 dynamic window title fix.'
