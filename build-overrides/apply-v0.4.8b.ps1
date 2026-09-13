$ErrorActionPreference = 'Stop'

function To-Lf([string]$Text) { return $Text.Replace("`r`n", "`n") }
function Replace-One([string]$Text, [string]$Pattern, [string]$Replacement, [string]$Label) {
  $regex = [regex]::new($Pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
  $matches = $regex.Matches($Text)
  if ($matches.Count -ne 1) { throw ("v0.4.8 " + $Label + ": expected 1 match, found " + $matches.Count + ".") }
  return $regex.Replace($Text, $Replacement, 1)
}

$electronMainPath = 'app/electron/main.cjs'
$preloadPath = 'app/electron/preload.cjs'
$rendererMainPath = 'app/src/main.tsx'
$globalTypesPath = 'app/src/global.d.ts'
$stylesPath = 'app/src/styles.css'
$packagePath = 'app/package.json'
$lockPath = 'app/package-lock.json'

$electronMain = To-Lf (Get-Content $electronMainPath -Raw)
if (-not $electronMain.Contains('let updateStatusCache = null;')) { throw 'v0.4.8 update status cache anchor missing.' }
$electronMain = $electronMain.Replace('let updateStatusCache = null;', @'
let updateStatusCache = null;

function broadcastUpdateStatus(status) {
  updateStatusCache = status;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:status-changed', status);
  }
  return status;
}
'@.TrimEnd("`n"))

$updaterEvents = @'
  updater.on('download-progress', (info) => {
    const percent = Math.max(0, Math.min(100, Number(info?.percent) || 0));
    broadcastUpdateStatus({
      ...(updateStatusCache || {}),
      ok: true,
      currentVersion: app.getVersion(),
      available: true,
      packaged: app.isPackaged,
      installing: false,
      phase: 'downloading',
      progress: percent,
      transferred: Number(info?.transferred) || 0,
      total: Number(info?.total) || 0,
      bytesPerSecond: Number(info?.bytesPerSecond) || 0,
      message: `Downloading update… ${Math.round(percent)}%`,
    });
  });

  updater.on('update-downloaded', () => {
    broadcastUpdateStatus({
      ...(updateStatusCache || {}),
      ok: true,
      currentVersion: app.getVersion(),
      available: true,
      packaged: app.isPackaged,
      installing: false,
      phase: 'downloaded',
      progress: 100,
      message: 'Update downloaded. Preparing installation…',
    });
  });

  updater.on('error', (error) => {
    broadcastUpdateStatus({
      ...(updateStatusCache || {}),
      ok: false,
      currentVersion: app.getVersion(),
      available: Boolean(updateStatusCache?.available),
      installing: false,
      phase: 'error',
      error: error?.message || 'Update check failed.',
      message: 'Update failed. You can try again.',
      packaged: app.isPackaged,
    });
  });
'@.TrimEnd("`n")
$electronMain = Replace-One $electronMain "  updater\.on\('error', \(error\) => \{.*?\n  \}\);" $updaterEvents 'updater event block'

$installFunction = @'
async function installAvailableUpdate() {
  const status = await checkForUpdates(true);
  if (!status.ok) return status;
  if (!status.available) return { ...status, installing: false, phase: 'current', message: 'RA Companion is already up to date.' };

  try {
    const updater = getUpdater();
    broadcastUpdateStatus({ ...status, installing: false, phase: 'downloading', progress: 0, message: 'Starting update download…' });
    await updater.downloadUpdate();
    await new Promise((resolve) => setTimeout(resolve, 900));

    const result = broadcastUpdateStatus({
      ...status,
      ok: true,
      available: true,
      installing: true,
      phase: 'installing',
      progress: 100,
      message: `RA Companion ${status.latestVersion} is ready. Installing silently and restarting…`,
    });
    setTimeout(() => updater.quitAndInstall(true, true), 1400);
    return result;
  } catch (error) {
    return broadcastUpdateStatus({
      ...status,
      ok: false,
      installing: false,
      phase: 'error',
      error: error?.message || 'Could not download or install the update.',
      message: 'Update failed. You can try again.',
    });
  }
}

function versionParts
'@
$electronMain = Replace-One $electronMain 'async function installAvailableUpdate\(\) \{.*?\n\}\n\nfunction versionParts' $installFunction 'install function'

$titleHandlerCount = ([regex]::Matches($electronMain, [regex]::Escape("mainWindow.on('page-title-updated'"))).Count
if ($titleHandlerCount -ne 1) { throw "v0.4.8 requires exactly one main-window title handler, found $titleHandlerCount." }
Set-Content $electronMainPath $electronMain -Encoding utf8 -NoNewline

$preload = To-Lf (Get-Content $preloadPath -Raw)
if (-not $preload.Contains("  installUpdate: () => ipcRenderer.invoke('update:install'),")) { throw 'v0.4.8 preload update anchor missing.' }
$preload = $preload.Replace("  installUpdate: () => ipcRenderer.invoke('update:install'),", @'
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatusChanged: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('update:status-changed', handler);
    return () => ipcRenderer.removeListener('update:status-changed', handler);
  },
'@.TrimEnd("`n"))
Set-Content $preloadPath $preload -Encoding utf8 -NoNewline

$types = To-Lf (Get-Content $globalTypesPath -Raw)
$types = $types.Replace("    installing?: boolean;`n    message?: string;", "    installing?: boolean;`n    phase?: 'current' | 'available' | 'checking' | 'downloading' | 'downloaded' | 'installing' | 'error';`n    progress?: number;`n    transferred?: number;`n    total?: number;`n    bytesPerSecond?: number;`n    message?: string;")
$types = $types.Replace("      installUpdate: () => Promise<UpdateStatus>;", "      installUpdate: () => Promise<UpdateStatus>;`n      onUpdateStatusChanged: (callback: (status: UpdateStatus) => void) => () => void;")
if (-not $types.Contains('onUpdateStatusChanged')) { throw 'v0.4.8 update status type injection failed.' }
Set-Content $globalTypesPath $types -Encoding utf8 -NoNewline

$renderer = To-Lf (Get-Content $rendererMainPath -Raw)
$renderer = $renderer.Replace('0.4.7', '0.4.8')

$checkEffectPattern = "  useEffect\(\(\) => \{\n    const timer = window\.setTimeout\(\(\) => \{\n      window\.raCompanion\.checkForUpdates\(false\)\.then\(setUpdateStatus\)\.catch\(\(\) => \{\}\);\n    \}, 1200\);\n    return \(\) => window\.clearTimeout\(timer\);\n  \}, \[\]\);"
$checkEffectReplacement = @'
  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.raCompanion.checkForUpdates(false).then(setUpdateStatus).catch(() => {});
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    return window.raCompanion.onUpdateStatusChanged((status) => {
      setUpdateStatus(status);
      if (status.phase === 'error' || status.phase === 'current') setUpdateBusy(false);
    });
  }, []);
'@.TrimEnd("`n")
$renderer = Replace-One $renderer $checkEffectPattern $checkEffectReplacement 'renderer progress subscription'

$installRendererReplacement = @'
  async function installUpdate() {
    setUpdateBusy(true);
    try {
      const result = await window.raCompanion.installUpdate();
      setUpdateStatus(result);
      if (!result.installing) setUpdateBusy(false);
    } catch (e: any) {
      setUpdateStatus({ ok: false, currentVersion: '0.4.8', available: false, phase: 'error', error: e?.message || 'Update failed.', message: 'Update failed. You can try again.' });
      setUpdateBusy(false);
    }
  }

  const updatePhase = updateStatus?.phase || (updateStatus?.available ? 'available' : updateStatus?.ok ? 'current' : 'checking');
  const updatePercent = Math.max(0, Math.min(100, Number(updateStatus?.progress) || 0));
  const updateInProgress = updatePhase === 'downloading' || updatePhase === 'downloaded' || updatePhase === 'installing';
  const updateChip = updatePhase === 'downloading' ? 'DOWNLOADING' : updatePhase === 'downloaded' ? 'READY' : updatePhase === 'installing' ? 'INSTALLING' : updatePhase === 'error' ? 'ERROR' : updateStatus?.available ? 'UPDATE' : updateStatus?.ok ? 'CURRENT' : 'CHECK';
  const updateMessage = updateStatus?.message || (updateStatus?.available ? `Version ${updateStatus.latestVersion} is available.` : updateStatus?.ok ? 'You are on the latest version.' : updateStatus?.error || 'Checks GitHub for a newer RA Companion build.');

  return (
'@
$renderer = Replace-One $renderer '  async function installUpdate\(\) \{.*?\n  \}\n\n  return \(' $installRendererReplacement 'renderer install function'

$updateCard = @'
          <article className="card update-card">
            <div className="card-heading">
              <div><span className="label">APP UPDATES</span><h3>RA Companion v0.4.8</h3></div>
              <span className={`state-chip ${updateStatus?.available ? 'update-available' : updateStatus?.ok ? 'active' : ''} ${updatePhase === 'error' ? 'update-error' : ''}`}>{updateChip}</span>
            </div>
            <p className="update-copy">{updateMessage}</p>
            {updateInProgress && (
              <div className="update-progress" aria-live="polite">
                <div className="update-progress-row">
                  <span>{updatePhase === 'downloading' ? 'Downloading update' : updatePhase === 'downloaded' ? 'Download complete' : 'Installing update'}</span>
                  <strong>{Math.round(updatePercent)}%</strong>
                </div>
                <div className="update-progress-track"><i style={{ width: `${updatePercent}%` }} /></div>
                <small>{updatePhase === 'installing' ? 'RA Companion will close and restart automatically.' : updatePhase === 'downloaded' ? 'Preparing the silent installer…' : 'You can keep RA Companion open while this downloads.'}</small>
              </div>
            )}
            {updateStatus?.notes && !updateInProgress && <div className="notice update-notes">{updateStatus.notes}</div>}
            <div className="update-actions">
              <button type="button" className="secondary" disabled={updateBusy || updateInProgress} onClick={checkUpdates}>{updateBusy && !updateInProgress ? 'Checking…' : 'Check for updates'}</button>
              {updateStatus?.available && <button type="button" disabled={updateBusy || updateInProgress} onClick={installUpdate}>{updatePhase === 'error' ? 'Try update again' : updateInProgress ? 'Updating…' : 'Update & restart'}</button>}
            </div>
            <small className="muted">Updates are downloaded from the official DutchDemon/ra-companion feed and verified with SHA-256 before installation.</small>
          </article>
'@.TrimEnd("`n")
$renderer = Replace-One $renderer '          <article className="card update-card">.*?          </article>' $updateCard 'update card'
Set-Content $rendererMainPath $renderer -Encoding utf8 -NoNewline

$styles = To-Lf (Get-Content $stylesPath -Raw)
if (-not $styles.Contains('/* v0.4.8 updater progress */')) {
  $styles += @'


/* v0.4.8 updater progress */
.update-progress { padding: 10px 11px; border: 1px solid rgba(97,223,245,.16); border-radius: 8px; background: rgba(97,223,245,.045); }
.update-progress-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; color: #a9b8c8; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
.update-progress-row strong { color: #75e6b1; font-size: 11px; font-variant-numeric: tabular-nums; }
.update-progress-track { height: 5px; margin: 7px 0 6px; overflow: hidden; border-radius: 999px; background: rgba(116,145,171,.2); }
.update-progress-track i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #61dff5, #67e6a7); transition: width .18s linear; }
.update-progress small { color: #7f98ad; font-size: 9px; line-height: 1.4; }
.state-chip.update-error { color: #ff9a9a; border-color: rgba(255,112,112,.32); background: rgba(255,112,112,.09); }
'@
}
Set-Content $stylesPath $styles -Encoding utf8 -NoNewline

$package = Get-Content $packagePath -Raw | ConvertFrom-Json
$package.version = '0.4.8'
$package | ConvertTo-Json -Depth 100 | Set-Content $packagePath -Encoding utf8
if (Test-Path $lockPath) {
  $lock = Get-Content $lockPath -Raw | ConvertFrom-Json
  $lock.version = '0.4.8'
  if ($lock.packages -and $lock.packages.PSObject.Properties.Name -contains '') { $lock.packages.''.version = '0.4.8' }
  $lock | ConvertTo-Json -Depth 100 | Set-Content $lockPath -Encoding utf8
}

$electronCheck = To-Lf (Get-Content $electronMainPath -Raw)
if (-not $electronCheck.Contains("updater.on('download-progress'")) { throw 'v0.4.8 download progress listener missing.' }
if (-not $electronCheck.Contains("webContents.send('update:status-changed'")) { throw 'v0.4.8 update status broadcaster missing.' }
if (-not $electronCheck.Contains('quitAndInstall(true, true)')) { throw 'v0.4.8 silent updater regressed.' }
if (([regex]::Matches($electronCheck, [regex]::Escape("mainWindow.on('page-title-updated'"))).Count -ne 1) { throw 'v0.4.8 title handler count invalid.' }
if (-not (To-Lf (Get-Content $rendererMainPath -Raw)).Contains('className="update-progress"')) { throw 'v0.4.8 progress UI missing.' }
if ((Get-Content $packagePath -Raw | ConvertFrom-Json).version -ne '0.4.8') { throw 'v0.4.8 package version missing.' }

Write-Host 'Applied RA Companion v0.4.8 updater progress and startup hotfix.'
