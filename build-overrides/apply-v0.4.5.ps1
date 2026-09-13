$ErrorActionPreference = 'Stop'

function Replace-Exact {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [Parameter(Mandatory = $true)][string]$Old,
    [Parameter(Mandatory = $true)][string]$New,
    [Parameter(Mandatory = $true)][string]$Label
  )

  if (-not $Text.Contains($Old)) {
    throw "Could not apply v0.4.5 patch: expected block '$Label' was not found."
  }
  return $Text.Replace($Old, $New)
}

$mainPath = 'app/src/main.tsx'
$stylePath = 'app/src/styles.css'
$packagePath = 'app/package.json'
$lockPath = 'app/package-lock.json'

$main = Get-Content $mainPath -Raw

$main = Replace-Exact $main `
  "import { buildTwilightContext, earnedHardcore } from './profiles/twilightPrincess';" `
  @"
import { buildTwilightContext, earnedHardcore } from './profiles/twilightPrincess';
import { getTwilightMissableGuide } from './profiles/twilightPrincessGuide';
"@ `
  'guide import'

$main = Replace-Exact $main `
  '  const counterPct = counter ? Math.max(0, Math.min(100, (counter.current / counter.target) * 100)) : 0;' `
  @"
  const counterPct = counter ? Math.max(0, Math.min(100, (counter.current / counter.target) * 100)) : 0;
  const guide = getTwilightMissableGuide(achievement);
"@ `
  'guide lookup'

$descriptionBlock = @'
        <span>{achievement.Description || achievement.description}</span>
'@
$guideBlock = @'
        <span>{achievement.Description || achievement.description}</span>
        {guide && (
          <div className={`missable-guide ${guide.specific ? 'specific' : 'fallback'}`}>
            {guide.tip && (
              <div className="missable-guide-row">
                <strong>GUIDE</strong>
                <span>{guide.tip}</span>
              </div>
            )}
            <div className="missable-guide-row cutoff">
              <strong>POINT OF NO RETURN</strong>
              <span>{guide.cutoff}</span>
            </div>
            {guide.retry && <small className="missable-retry">↻ {guide.retry}</small>}
          </div>
        )}
'@
$main = Replace-Exact $main $descriptionBlock $guideBlock 'missable guide UI'

$main = Replace-Exact $main `
  'Live read-only Dolphin context with RetroAchievements Hardcore progress and strict story-beat filtering.' `
  'Live read-only Dolphin context with Hardcore progress, strict story-beat filtering and guide-backed missable cutoffs.' `
  'main subtitle'

$profileRow = '<div className="profile-row"><span>Context filtering</span><b className="good">RAM → RP fallback</b></div>'
$profileRows = @'
<div className="profile-row"><span>Context filtering</span><b className="good">RAM → RP fallback</b></div>
            <div className="profile-row"><span>Missable guidance</span><b className="good">RA guide + live set</b></div>
'@
$main = Replace-Exact $main $profileRow $profileRows.TrimEnd("`r", "`n") 'profile guide status'

$main = $main.Replace('0.4.4', '0.4.5')
Set-Content -Path $mainPath -Value $main -Encoding utf8 -NoNewline

$styles = Get-Content $stylePath -Raw
$styleMarker = '/* v0.4.5 guide-backed missable details */'
if (-not $styles.Contains($styleMarker)) {
  $styles += @'

/* v0.4.5 guide-backed missable details */
.missable-guide {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.09);
  display: grid;
  gap: 7px;
}

.missable-guide-row {
  display: grid;
  grid-template-columns: minmax(96px, auto) 1fr;
  gap: 8px;
  align-items: start;
}

.missable-guide-row strong {
  font-size: 9px;
  line-height: 1.35;
  letter-spacing: 0.09em;
  opacity: 0.72;
}

.missable-guide-row span {
  font-size: 11px;
  line-height: 1.38;
  opacity: 0.9;
}

.missable-guide-row.cutoff strong {
  opacity: 0.95;
}

.missable-guide-row.cutoff span {
  font-weight: 650;
}

.missable-retry {
  display: block;
  font-size: 10px;
  line-height: 1.35;
  opacity: 0.72;
}

.missable-guide.fallback .missable-guide-row.cutoff span {
  font-weight: 500;
  opacity: 0.78;
}

@media (max-width: 560px) {
  .missable-guide-row {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}
'@
  Set-Content -Path $stylePath -Value $styles -Encoding utf8 -NoNewline
}

$package = Get-Content $packagePath -Raw | ConvertFrom-Json
$package.version = '0.4.5'
$package | ConvertTo-Json -Depth 100 | Set-Content -Path $packagePath -Encoding utf8

if (Test-Path $lockPath) {
  $lock = Get-Content $lockPath -Raw | ConvertFrom-Json
  $lock.version = '0.4.5'
  if ($lock.packages -and $lock.packages.PSObject.Properties.Name -contains '') {
    $lock.packages.''.version = '0.4.5'
  }
  $lock | ConvertTo-Json -Depth 100 | Set-Content -Path $lockPath -Encoding utf8
}

$patchedPackage = Get-Content $packagePath -Raw | ConvertFrom-Json
if ($patchedPackage.version -ne '0.4.5') {
  throw "Expected patched version 0.4.5, got $($patchedPackage.version)"
}

Write-Host 'Applied RA Companion v0.4.5 guide-backed missables patch.'
