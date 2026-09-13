$ErrorActionPreference = 'Stop'

function Replace-Exact {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [Parameter(Mandatory = $true)][string]$Old,
    [Parameter(Mandatory = $true)][string]$New,
    [Parameter(Mandatory = $true)][string]$Label
  )

  if (-not $Text.Contains($Old)) {
    throw "Could not apply v0.4.8 patch: expected block '$Label' was not found."
  }
  return $Text.Replace($Old, $New)
}

function To-Lf([string]$Text) {
  return $Text.Replace("`r`n", "`n")
}

$electronMainPath = 'app/electron/main.cjs'
$preloadPath = 'app/electron/preload.cjs'
$rendererMainPath = 'app/src/main.tsx'
$globalTypesPath = 'app/src/global.d.ts'
$stylesPath = 'app/src/styles.css'
$packagePath = 'app/package.json'
$lockPath = 'app/package-lock.json'

$electronMain = To-Lf (Get-Content $electronMainPath -Raw)

$electronMain = Replace-Exact $electronMain @'
let appUpdater = null;
let updateStatusCache = null;
'@.TrimEnd("`n") @'
let appUpdater = null;
let updateStatusCache = null;

function broadcastUpdateStatus(status) {
  updateStatusCache = status;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:status-changed', status);
  }
  return status;
}
'@.TrimEnd("`n") 'update status broadcaster'

$oldUpdaterEvents = @'
  updater.on('error', (error) => {
    updateStatusCache = {
      ok: false,
      currentVersion: app.getVersion(),
      available: false,
      error: error?.message || 'Update check failed.',
      packaged: app.isPackaged,
    };
  });
'@.TrimEnd("`n")

$newUpdaterEvents = @'
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

$electronMain = Replace-Exact $electronMain $oldUpdaterEvents $newUpdaterEvents 'updater progress events'

$oldInstallFunction = @'
async function installAvailableUpdate() {
  const status = await checkForUpdates(true);
  if (!status.ok) return status;
  if (!status.available) return { ...status, installing: false, message: 'RA Companion is already up to date.' };

  try {
    const updater = getUpdater();
    await updater.downloadUpdate();
    const result = { ...status, installing: true, message: `Installing RA Companion ${status.latestVersion} silently and restarting…` };
    setTimeout(() => updater.quitAndInstall(true, true), 250);
    return result;
  } catch (error) {
    return {
      ...status,
      ok: false,
      installing: false,
      error: error?.message || 'Could not download or install the update.',
    };
  }
}
'@.TrimEnd("`n")

$newInstallFunction = @'
async function installAvailableUpdate() {
  const status = await checkForUpdates(true);
  if (!status.ok) return status;
  if (!status.available) return { ...status, installing: false, phase: 'current', message: 'RA Companion is already up to date.' };

  try {
    const updater = getUpdater();
    broadcastUpdateStatus({
      ...status,
      installing: false,
      phase: 'downloading',
      progress: 0,
      message: 'Starting update download…',
    });

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
'@.TrimEnd("`n")

$electronMain = Replace-Exact $electronMain $oldInstallFunction $newInstallFunction 'streaming install update flow'

# The v0.4.7 title patch must attach exactly once and only to the main window.
$titleHandlerCount = ([regex]::Matches($electronMain, [regex]::Escape("mainWindow.on('page-title-updated'"))).Count
if ($titleHandlerCount -ne 1) {
  throw "v0.4.8 requires exactly one main-window title handler, found $titleHandlerCount."
}
if (-not $electronMain.Contains('const windowTitle = `RA Companion v${app.getVersion()}`;')) {
  throw 'Dynamic main-window title is missing.'
}

Set-Content -Path $electronMainPath -Value $electronMain -Encoding utf8 -NoNewline

$preload = To-Lf (Get-Content $preloadPath -Raw)
$preload = Replace-Exact $preload @'
  installUpdate: () => ipcRenderer.invoke('update:install'),
'@.TrimEnd("`n") @'
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatusChanged: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('update:status-changed', handler);
    return () => ipcRenderer.removeListener('update:status-changed', handler);
  },
'@.TrimEnd("`n") 'preload update status subscription'
Set-Content -Path $preloadPath -Value $preload -Encoding utf8 -NoNewline

$globalTypes = To-Lf (Get-Content $globalTypesPath -Raw)
$globalTypes = Replace-Exact $globalTypes @'
    installing?: boolean;
    message?: string;
    error?: string;
'@.TrimEnd("`n") @'
    installing?: boolean;
    phase?: 'current' | 'available' | 'checking' | 'downloading' | 'downloaded' | 'installing' | 'error';
    progress?: number;
    transferred?: number;
    total?: number;
    bytesPerSecond?: number;
    message?: string;
    error?: string;
'@.TrimEnd("`n") 'update status progress types'
$globalTypes = Replace-Exact $globalTypes @'
      installUpdate: () => Promise<UpdateStatus>;
'@.TrimEnd("`n") @'
      installUpdate: () => Promise<UpdateStatus>;
      onUpdateStatusChanged: (callback: (status: UpdateStatus) => void) => () => void;
'@.TrimEnd("`n") 'renderer update status API type'
Set-Content -Path $globalTypesPath -Value $globalTypes -Encoding utf8 -NoNewline

$rendererMain = To-Lf (Get-Content $rendererMainPath -Raw)
$rendererMain = $rendererMain.Replace('0.4.7', '0.4.8')

$updateCheckEffect = @'
  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.raCompanion.checkForUpdates(false).then(setUpdateStatus).catch(() => {});
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);
'@.TrimEnd("`n")

$updateCheckWithSubscription = @'
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

$rendererMain = Replace-Exact $rendererMain $updateCheckEffect $updateCheckWithSubscription 'renderer update progress subscription'

$oldInstallRenderer = @'
  async function installUpdate() {
    setUpdateBusy(true);
    try {
      const result = await window.raCompanion.installUpdate();
      setUpdateStatus(result);
      if (!result.installing) setUpdateBusy(false);
    } catch (e: any) {
      setUpdateStatus({ ok: false, currentVersion: '0.4.8', available: false, error: e?.message || 'Update failed.' });
      setUpdateBusy(false);
    }
  }

  return (
'@.TrimEnd("`n")

$newInstallRenderer = @'
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
'@.TrimEnd("`n")

$rendererMain = Replace-Exact $rendererMain $oldInstallRenderer $newInstallRenderer 'renderer update phase helpers'

$oldUpdateCard = @'
          <article className="card update-card">
            <div className="card-heading">
              <div><span className="label">APP UPDATES</span><h3>RA Companion v0.4.8</h3></div>
              <span className={`state-chip ${updateStatus?.available ? 'update-available' : updateStatus?.ok ? 'active' : ''}`}>{updateStatus?.available ? 'UPDATE' : updateStatus?.ok ? 'CURRENT' : 'CHECK'}</span>
            </div>
            <p className="update-copy">{updateStatus?.available ? `Version ${updateStatus.latestVersion} is available.` : updateStatus?.ok ? 'You are on the latest version.' : updateStatus?.error || 'Checks GitHub for a newer RA Companion build.'}</p>
            {updateStatus?.notes && <div className="notice update-notes">{updateStatus.notes}</div>}
            <div className="update-actions">
              <button type="button" className="secondary" disabled={updateBusy} onClick={checkUpdates}>{updateBusy ? 'Checking…' : 'Check for updates'}</button>
              {updateStatus?.available && <button type="button" disabled={updateBusy} onClick={installUpdate}>{updateBusy ? 'Preparing…' : 'Update & restart'}</button>}
            </div>
            <small className="muted">Updates are downloaded from the official DutchDemon/ra-companion feed and verified with SHA-256 before installation.</small>
          </article>
'@.TrimEnd("`n")

$newUpdateCard = @'
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

$rendererMain = Replace-Exact $rendererMain $oldUpdateCard $newUpdateCard 'updater progress card'
Set-Content -Path $rendererMainPath -Value $rendererMain -Encoding utf8 -NoNewline

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
Set-Content -Path $stylesPath -Value $styles -Encoding utf8 -NoNewline

$package = Get-Content $packagePath -Raw | ConvertFrom-Json
$package.version = '0.4.8'
$package | ConvertTo-Json -Depth 100 | Set-Content -Path $packagePath -Encoding utf8

if (Test-Path $lockPath) {
  $lock = Get-Content $lockPath -Raw | ConvertFrom-Json
  $lock.version = '0.4.8'
  if ($lock.packages -and $lock.packages.PSObject.Properties.Name -contains '') {
    $lock.packages.''.version = '0.4.8'
  }
  $lock | ConvertTo-Json -Depth 100 | Set-Content -Path $lockPath -Encoding utf8
}

$patchedPackage = Get-Content $packagePath -Raw | ConvertFrom-Json
if ($patchedPackage.version -ne '0.4.8') { throw "Expected patched version 0.4.8, got $($patchedPackage.version)" }

$patchedElectron = To-Lf (Get-Content $electronMainPath -Raw)
$patchedPreload = To-Lf (Get-Content $preloadPath -Raw)
$patchedRenderer = To-Lf (Get-Content $rendererMainPath -Raw)
$patchedTypes = To-Lf (Get-Content $globalTypesPath -Raw)
$patchedStyles = To-Lf (Get-Content $stylesPath -Raw)

if (-not $patchedElectron.Contains("updater.on('download-progress'")) { throw 'electron-updater download progress listener is missing.' }
if (-not $patchedElectron.Contains("webContents.send('update:status-changed'")) { throw 'Update status IPC broadcaster is missing.' }
if (-not $patchedElectron.Contains('quitAndInstall(true, true)')) { throw 'Silent updater install call regressed.' }
if ($patchedElectron.Contains('quitAndInstall(false, true)')) { throw 'Interactive updater install call is still present.' }
if (([regex]::Matches($patchedElectron, [regex]::Escape("mainWindow.on('page-title-updated'"))).Count -ne 1) { throw 'Main-window title handler must occur exactly once.' }
if (-not $patchedPreload.Contains('onUpdateStatusChanged')) { throw 'Preload update status subscription is missing.' }
if (-not $patchedTypes.Contains('progress?: number;')) { throw 'Update progress types are missing.' }
if (-not $patchedRenderer.Contains('className="update-progress"')) { throw 'Updater progress UI is missing.' }
if (-not $patchedStyles.Contains('/* v0.4.8 updater progress */')) { throw 'Updater progress styles are missing.' }

Write-Host 'Applied RA Companion v0.4.8 updater progress and v0.4.7 crash hotfix.'
