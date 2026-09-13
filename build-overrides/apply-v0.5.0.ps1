$ErrorActionPreference = 'Stop'

function To-Lf([string]$Text) { return $Text.Replace("`r`n", "`n") }

$mainPath = 'app/src/main.tsx'
$stylePath = 'app/src/styles.css'
$electronMainPath = 'app/electron/main.cjs'
$packagePath = 'app/package.json'
$lockPath = 'app/package-lock.json'
$appTemplatePath = 'build-overrides/v0.5.0-app.txt'
$styleTemplatePath = 'build-overrides/v0.5.0.css'

if (-not (Test-Path $appTemplatePath)) { throw 'v0.5.0 app template is missing.' }
if (-not (Test-Path $styleTemplatePath)) { throw 'v0.5.0 stylesheet is missing.' }

$main = To-Lf (Get-Content $mainPath -Raw)
$appTemplate = To-Lf (Get-Content $appTemplatePath -Raw).TrimEnd("`n")

if (-not $main.Contains("import { getTwilightMissableGuide } from './profiles/twilightPrincessGuide';")) {
  throw 'v0.5.0 requires the v0.4.5 guide import.'
}
if (-not $main.Contains('function App() {')) { throw 'Main App function anchor missing.' }
if (-not $main.Contains('const isOverlay =')) { throw 'Overlay render anchor missing.' }

$appPattern = '(?s)function App\(\) \{.*?\n\}\n\nconst isOverlay ='
$appMatches = [regex]::Matches($main, $appPattern)
if ($appMatches.Count -ne 1) { throw "Expected exactly one App block, found $($appMatches.Count)." }
$main = [regex]::Replace($main, $appPattern, ($appTemplate + "`n`nconst isOverlay ="), 1)
Set-Content -Path $mainPath -Value $main -Encoding utf8 -NoNewline

$styles = To-Lf (Get-Content $stylePath -Raw)
$v5Styles = To-Lf (Get-Content $styleTemplatePath -Raw)
if (-not $styles.Contains('/* v0.5.0 complete UI/UX rework */')) {
  $styles = $styles.TrimEnd("`n") + "`n`n" + $v5Styles.TrimStart("`n")
  Set-Content -Path $stylePath -Value $styles -Encoding utf8 -NoNewline
}

$electronMain = To-Lf (Get-Content $electronMainPath -Raw)
if ($electronMain.Contains('    width: 1180,')) { $electronMain = $electronMain.Replace('    width: 1180,', '    width: 1360,') }
if ($electronMain.Contains('    height: 800,')) { $electronMain = $electronMain.Replace('    height: 800,', '    height: 860,') }
if ($electronMain.Contains('    minWidth: 980,')) { $electronMain = $electronMain.Replace('    minWidth: 980,', '    minWidth: 1020,') }
if (-not $electronMain.Contains('    autoHideMenuBar: true,')) {
  $anchor = "    backgroundColor: '#0a0d12',"
  if (-not $electronMain.Contains($anchor)) { throw 'Main BrowserWindow background anchor missing.' }
  $electronMain = $electronMain.Replace($anchor, "$anchor`n    autoHideMenuBar: true,")
}
Set-Content -Path $electronMainPath -Value $electronMain -Encoding utf8 -NoNewline

$package = Get-Content $packagePath -Raw | ConvertFrom-Json
$package.version = '0.5.0'
$package | ConvertTo-Json -Depth 100 | Set-Content -Path $packagePath -Encoding utf8

if (Test-Path $lockPath) {
  $lock = Get-Content $lockPath -Raw | ConvertFrom-Json
  $lock.version = '0.5.0'
  if ($lock.packages -and $lock.packages.PSObject.Properties.Name -contains '') {
    $lock.packages.''.version = '0.5.0'
  }
  $lock | ConvertTo-Json -Depth 100 | Set-Content -Path $lockPath -Encoding utf8
}

$patchedMain = Get-Content $mainPath -Raw
$patchedElectron = Get-Content $electronMainPath -Raw
$patchedStyles = Get-Content $stylePath -Raw
$patchedPackage = Get-Content $packagePath -Raw | ConvertFrom-Json

if ($patchedPackage.version -ne '0.5.0') { throw "Expected app version 0.5.0, got $($patchedPackage.version)" }
if (-not $patchedMain.Contains('className="v5-app-shell"')) { throw 'v0.5.0 app shell was not applied.' }
if (-not $patchedMain.Contains("const liveRam = useLiveRam();")) { throw 'Main UI live RAM subscription is missing.' }
if (-not $patchedMain.Contains('getTwilightMissableGuide(selectedMissable)')) { throw 'Clickable guide-backed missable detail panel is missing.' }
if (-not $patchedMain.Contains('onUpdateStatusChanged')) { throw 'Updater progress subscription regressed.' }
if ($patchedMain.Contains('<div className="notice update-notes">{updateStatus?.notes}</div>')) { throw 'Raw updater release notes UI is still present.' }
if (-not $patchedStyles.Contains('/* v0.5.0 complete UI/UX rework */')) { throw 'v0.5.0 styles were not applied.' }
if (-not $patchedElectron.Contains('autoHideMenuBar: true')) { throw 'Main window menu bar cleanup was not applied.' }
if (-not $patchedElectron.Contains('quitAndInstall(true, true)')) { throw 'Silent updater regressed.' }

Write-Host 'Applied RA Companion v0.5.0 complete live UI/UX rework.'
