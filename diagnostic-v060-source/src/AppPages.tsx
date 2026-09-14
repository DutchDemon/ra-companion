import React from 'react';
import { getTwilightMissableGuide } from './profiles/twilightPrincessGuide';

function achievementId(achievement: any) {
  return String(achievement?.ID ?? achievement?.id ?? achievement?.Title ?? achievement?.title ?? '');
}

function badgeUrl(achievement: any) {
  const badgeName = achievement?.BadgeName ?? achievement?.badgeName;
  return badgeName ? `https://media.retroachievements.org/Badge/${badgeName}.png` : '';
}

export const AppViewContext = React.createContext<any>(null);

function useAppView() {
  const view = React.useContext(AppViewContext);
  if (!view) throw new Error('AppViewContext is missing.');
  return view;
}

export function AchievementRow({ achievement, compact = false }: { achievement: any; compact?: boolean }) {
  const { missableState, effectiveRam, achievementCounter } = useAppView();
  const state = missableState(achievement);
  const counter = state.progress || achievementCounter(achievement, effectiveRam);
  return (
    <div className={`v5-achievement-row ${compact ? 'compact' : ''}`}>
      {badgeUrl(achievement) ? <img src={badgeUrl(achievement)} alt="" /> : <div className="v5-badge-placeholder" />}
      <div className="v5-achievement-copy">
        <b>{achievement.Title || achievement.title}</b>
        {!compact && <span>{achievement.Description || achievement.description}</span>}
        <small className={`v5-inline-state ${state.tone}`}>{state.label}{counter ? ` · ${counter.current}/${counter.target}` : ''}</small>
      </div>
      <strong className="v5-points">{achievement.Points ?? achievement.points ?? 0}p</strong>
    </div>
  );
}

export function MissableRow({ achievement }: { achievement: any }) {
  const { missableState, setSelectedMissable } = useAppView();
  const guide = getTwilightMissableGuide(achievement);
  const state = missableState(achievement);
  return (
    <button type="button" className={`v5-missable-row ${state.tone}`} onClick={() => setSelectedMissable(achievement)}>
      <span className="v5-missable-icon">{state.tone === 'danger' ? '×' : state.tone === 'warning' ? '!' : state.tone === 'complete' ? '✓' : state.tone === 'upcoming' ? '◷' : 'i'}</span>
      <span className="v5-missable-copy">
        <b>{achievement.Title || achievement.title}</b>
        <span>{guide?.tip || achievement.Description || achievement.description}</span>
      </span>
      <span className={`v5-status-pill ${state.tone}`}>{state.label}</span>
      <span className="v5-chevron">›</span>
    </button>
  );
}

export function LiveContextCard() {
  const { snapshot, ramLive, gameActive } = useAppView();
  return (
    <article className="v5-panel v5-live-context">
      <div className="v5-section-label">LIVE CONTEXT</div>
      <div className="v5-kv"><span>Emulator</span><b>{snapshot?.dolphin.running ? 'Dolphin' : 'Offline'}</b></div>
      <div className="v5-kv"><span>Process</span><b className={ramLive ? 'good' : ''}>{ramLive ? 'Attached' : 'Waiting'}</b></div>
      <div className="v5-kv"><span>Session</span><b className={gameActive && ramLive ? 'good' : ''}>{gameActive && ramLive ? 'Healthy' : gameActive ? 'Fallback context' : 'Idle'}</b></div>
    </article>
  );
}

export function UpdateBanner() {
  const { showUpdateBanner, updateStatus, updateBusy, updateInProgress, updatePercent, installUpdate, dismissUpdateBanner } = useAppView();
  if (!showUpdateBanner) return null;
  const version = updateStatus?.latestVersion ? `v${updateStatus.latestVersion}` : 'a newer version';
  const progress = Math.max(0, Math.min(100, Number(updatePercent) || 0));
  return (
    <div className="v5-update-banner" role="status" aria-live="polite">
      <div className="v5-update-banner-copy">
        <span className="v5-update-banner-icon">!</span>
        <div><b>RA Companion {version} is available</b><small>{updateInProgress ? `Updating… ${Math.round(progress)}%` : 'A newer build is ready. Update now or continue this session.'}</small></div>
      </div>
      <div className="v5-update-banner-actions">
        <button type="button" className="secondary" disabled={updateBusy || updateInProgress} onClick={dismissUpdateBanner}>Later</button>
        <button type="button" disabled={updateBusy || updateInProgress} onClick={installUpdate}>{updateInProgress ? `Updating ${Math.round(progress)}%` : 'Update now'}</button>
      </div>
    </div>
  );
}

export function UpdateCard({ full = false }: { full?: boolean }) {
  const {
    updateStatus,
    updatePhase,
    updateChip,
    updateInProgress,
    updatePercent,
    updateHighlights,
    updateBusy,
    checkUpdates,
    installUpdate,
    appVersion,
  } = useAppView();
  const message = updateStatus?.message || (updateStatus?.available ? `Version ${updateStatus.latestVersion} is available.` : updateStatus?.ok ? 'You are on the latest version.' : updateStatus?.error || 'Check for a newer RA Companion build.');
  const version = appVersion || updateStatus?.currentVersion || '…';
  return (
    <article className={`v5-panel v5-update-card ${full ? 'full' : ''}`}>
      <div className="v5-card-heading">
        <div><div className="v5-section-label">APP UPDATES</div><h3>RA Companion v{version}</h3></div>
        <span className={`v5-status-pill ${updatePhase === 'error' ? 'danger' : updateStatus?.available ? 'warning' : updateStatus?.ok ? 'complete' : 'neutral'}`}>{updateChip}</span>
      </div>
      <p className="v5-muted">{message}</p>
      {updateInProgress && (
        <div className="v5-update-progress" aria-live="polite">
          <div><span>{updatePhase === 'downloading' ? 'Downloading update' : updatePhase === 'downloaded' ? 'Download complete' : 'Installing update'}</span><strong>{Math.round(updatePercent)}%</strong></div>
          <div className="v5-progress-track"><i style={{ width: `${updatePercent}%` }} /></div>
          <small>{updatePhase === 'installing' ? 'RA Companion will close and restart automatically.' : updatePhase === 'downloaded' ? 'Preparing the silent installer…' : 'You can keep using RA Companion while this downloads.'}</small>
        </div>
      )}
      {!updateInProgress && updateHighlights.length > 0 && (
        <ul className="v5-release-highlights">{updateHighlights.map((item: string) => <li key={item}>{item}</li>)}</ul>
      )}
      <div className="v5-update-actions">
        <button type="button" className="secondary" disabled={updateBusy || updateInProgress} onClick={checkUpdates}>{updateBusy && !updateInProgress ? 'Checking…' : 'Check for updates'}</button>
        {updateStatus?.available && <button type="button" disabled={updateBusy || updateInProgress} onClick={installUpdate}>{updatePhase === 'error' ? 'Try update again' : updateInProgress ? 'Updating…' : 'Update & restart'}</button>}
      </div>
    </article>
  );
}

export function Dashboard() {
  const {
    gameActive,
    data,
    snapshot,
    effectiveRam,
    companion,
    gameImageUrl,
    ramLive,
    whatMattersAchievements,
    upcomingMissables,
    relevantAchievements,
    activeMissableCount,
    sessionStats,
    setPage,
    refresh,
  } = useAppView();
  const heroTitle = gameActive ? (data?.Title || snapshot?.game?.profile || 'The Legend of Zelda: Twilight Princess') : 'No supported game detected';
  const formLabel = effectiveRam?.linkForm === 'wolf' ? 'Wolf Link' : effectiveRam?.linkForm === 'human' ? 'Human Link' : 'Unknown';
  const contextLabel = companion.context.label || effectiveRam?.stageName || effectiveRam?.stageCode || 'Waiting for live context';
  const riskLabel = activeMissableCount ? `${activeMissableCount} missable${activeMissableCount === 1 ? '' : 's'} active` : 'No urgent missables';
  return (
    <>
      <header className="v5-page-header">
        <div><span className="v5-page-icon">⌂</span><div><h1>Dashboard</h1><p>Live game context, missables and achievements — all in one place.</p></div></div>
        <button className="secondary" onClick={refresh}>Refresh</button>
      </header>

      <section className="v5-dashboard-top">
        <article className={`v5-panel v5-game-hero ${gameActive ? 'active' : 'idle'}`}>
          <div className="v5-hero-topline"><div className="v5-section-label">CURRENT GAME SESSION</div><span className={`v5-risk-badge ${activeMissableCount ? 'warning' : 'clear'}`}>{activeMissableCount ? '!' : '✓'} {riskLabel}</span></div>
          <div className="v5-hero-body">
            {gameImageUrl ? <img className="v5-game-icon" src={gameImageUrl} alt="" /> : <div className="v5-game-icon placeholder">RA</div>}
            <div className="v5-hero-copy">
              <h2>{heroTitle}</h2>
              <p>{gameActive ? 'GameCube · Hardcore achievement tracking' : 'Start Dolphin with Twilight Princess and RA Companion will attach automatically.'}</p>
              <div className="v5-context-grid v6-session-grid">
                <span>Current form <b>{gameActive ? formLabel : '—'}</b></span>
                <span>Area / context <b>{gameActive ? contextLabel : '—'}</b></span>
                <span>Hearts <b>{gameActive ? sessionStats.hearts : '—'}</b></span>
                <span>Poe Souls <b>{gameActive ? sessionStats.poeSouls : '—'}</b></span>
                <span>Golden Bugs <b>{gameActive ? sessionStats.goldenBugs : '—'}</b></span>
                <span>Risk level <b className={activeMissableCount ? 'warning-text' : 'good'}>{gameActive ? (activeMissableCount ? 'Attention' : 'Clear') : 'Idle'}</b></span>
                {gameActive && sessionStats.contextStat && <span className="v6-context-stat">Context <b>{sessionStats.contextStat}</b></span>}
              </div>
            </div>
          </div>
          <div className="v5-session-chips">
            <span className={snapshot?.dolphin.running ? 'good' : ''}>● {snapshot?.dolphin.running ? 'Dolphin connected' : 'Dolphin offline'}</span>
            <span className={ramLive ? 'good' : ''}>● {ramLive ? 'Live tracking active' : 'RAM waiting'}</span>
            <span className={gameActive ? 'good' : ''}>● {gameActive ? 'Profile loaded' : 'No profile'}</span>
          </div>
        </article>
        <LiveContextCard />
      </section>

      <section className="v5-dashboard-middle">
        <article className="v5-panel v5-matters-panel">
          <div className="v5-card-heading">
            <div><div className="v5-section-label">WHAT MATTERS NOW</div><h3>Missables and important events in your current context.</h3></div>
            <button className="secondary compact-button" onClick={() => setPage('missables')}>View all missables →</button>
          </div>
          <div className="v5-missable-list">
            {whatMattersAchievements.slice(0, 3).map((achievement: any) => <MissableRow key={achievementId(achievement)} achievement={achievement} />)}
            {!whatMattersAchievements.length && upcomingMissables.slice(0, 3).map((achievement: any) => <MissableRow key={achievementId(achievement)} achievement={achievement} />)}
            {!gameActive && <div className="v5-empty-state"><b>Waiting for a game session</b><span>Launch Twilight Princess in Dolphin. This panel will update automatically when live context becomes available.</span></div>}
            {gameActive && !whatMattersAchievements.length && !upcomingMissables.length && <div className="v5-clear-state"><b>Nothing urgent right now</b><span>RA Companion is watching the current story beat and will surface missables here when they become relevant.</span></div>}
          </div>
        </article>

        <article className="v5-panel v5-relevant-panel">
          <div className="v5-section-label">RELEVANT ACHIEVEMENTS</div>
          <p className="v5-muted">Achievements related to your live context.</p>
          <div className="v5-achievement-list">
            {relevantAchievements.map((achievement: any) => <AchievementRow key={achievementId(achievement)} achievement={achievement} compact />)}
            {!relevantAchievements.length && <div className="v5-empty-state compact"><span>Relevant achievements appear automatically as your location and story state change.</span></div>}
          </div>
        </article>
      </section>

      <section className="v5-dashboard-bottom">
        <article className="v5-panel v5-health-panel">
          <div className="v5-card-heading"><div><div className="v5-section-label">SYSTEM HEALTH</div><h3>{gameActive && ramLive ? 'Everything looks good. Keep playing.' : 'Ready when you are.'}</h3></div><button className="secondary compact-button" onClick={() => setPage('game')}>Details →</button></div>
          <div className="v5-health-grid">
            <div><span>▣</span><b>{snapshot?.dolphin.running ? 'Dolphin is connected' : 'Dolphin is waiting'}</b><small>{snapshot?.dolphin.running ? 'Emulator ready' : 'Start Dolphin to begin'}</small></div>
            <div><span>▥</span><b>{ramLive ? 'Live tracking active' : 'Live tracking idle'}</b><small>{ramLive ? 'Reading game context' : 'Starts with a supported game'}</small></div>
            <div><span>▤</span><b>{gameActive ? 'Game profile loaded' : 'No game profile'}</b><small>{gameActive ? 'Twilight Princess (GC · USA)' : 'Waiting for supported game'}</small></div>
          </div>
        </article>
        <UpdateCard />
      </section>
    </>
  );
}

export function CurrentGamePage() {
  const {
    gameActive,
    data,
    snapshot,
    progress,
    companion,
    effectiveRam,
    presenceMessage,
    ramRoom,
    ramLive,
    serverPresenceMessage,
    currentNextAchievements,
  } = useAppView();
  return (
    <>
      <header className="v5-page-header"><div><span className="v5-page-icon">◈</span><div><h1>Current Game</h1><p>Live context from the same read-only data source used by the overlay.</p></div></div></header>
      <section className="v5-two-column-page">
        <div className="v5-page-stack">
          <article className="v5-panel">
            <div className="v5-section-label">SESSION</div>
            <h2>{gameActive ? (data?.Title || snapshot?.game?.profile || 'Twilight Princess') : 'No game active'}</h2>
            <div className="v5-big-progress"><div><b>{gameActive ? `${progress.pct}%` : '—'}</b><span>Hardcore completion</span></div><div className="v5-progress-track"><i style={{ width: `${gameActive ? progress.pct : 0}%` }} /></div><small>{gameActive ? `${progress.unlocked} / ${progress.total || 149} achievements unlocked` : 'Start a supported session to begin tracking.'}</small></div>
          </article>
          <article className="v5-panel">
            <div className="v5-section-label">CURRENT STORY CONTEXT</div>
            <h3>{companion.context.label || effectiveRam?.stageName || 'Waiting for context'}</h3>
            <p className="v5-muted">{presenceMessage || 'RA Companion will update this automatically as stage, room, form and story flags change.'}</p>
            <div className="v5-context-detail-grid">
              <div><span>Stage</span><b>{effectiveRam?.stageName || effectiveRam?.stageCode || '—'}</b></div>
              <div><span>Room</span><b>{ramRoom !== null ? ramRoom : '—'}</b></div>
              <div><span>Form</span><b>{effectiveRam?.linkForm === 'wolf' ? 'Wolf Link' : effectiveRam?.linkForm === 'human' ? 'Human Link' : '—'}</b></div>
              <div><span>Bottles</span><b>{typeof effectiveRam?.bottleCount === 'number' ? effectiveRam.bottleCount : '—'}</b></div>
              <div><span>Player control</span><b>{effectiveRam?.playerControl === true ? 'Yes' : effectiveRam?.playerControl === false ? 'No' : '—'}</b></div>
              <div><span>Cutscene</span><b>{effectiveRam?.inCutscene === true ? 'Yes' : effectiveRam?.inCutscene === false ? 'No' : '—'}</b></div>
              <div><span>Context source</span><b>{ramLive ? 'Dolphin RAM' : serverPresenceMessage ? 'RA Rich Presence' : 'Waiting'}</b></div>
            </div>
          </article>
          <article className="v5-panel">
            <div className="v5-section-label">CURRENT & NEXT</div>
            <div className="v5-achievement-list">{currentNextAchievements.slice(0, 10).map((a: any) => <AchievementRow key={achievementId(a)} achievement={a} />)}</div>
          </article>
        </div>
        <LiveContextCard />
      </section>
    </>
  );
}

export function AchievementsPage() {
  const { progress, achievements, locked, unlocked } = useAppView();
  return (
    <>
      <header className="v5-page-header"><div><span className="v5-page-icon">♛</span><div><h1>Achievements</h1><p>All loaded base-set achievements evaluated against the GZ2E01 game-state engine, with live counters where reliable progress is available.</p></div></div><span className="v5-large-count">{progress.unlocked}/{progress.total || achievements.length}</span></header>
      <article className="v5-panel">
        <div className="v5-section-label">LOCKED ACHIEVEMENTS</div>
        <div className="v5-achievements-grid">{locked.map((a: any) => <AchievementRow key={achievementId(a)} achievement={a} />)}</div>
        {!achievements.length && <div className="v5-empty-state"><b>No achievement data loaded</b><span>Configure your RetroAchievements account in Settings.</span></div>}
      </article>
      {unlocked.length > 0 && <article className="v5-panel v5-completed-panel"><div className="v5-section-label">COMPLETED</div><div className="v5-achievements-grid">{unlocked.slice(0, 24).map((a: any) => <AchievementRow key={achievementId(a)} achievement={a} />)}</div></article>}
    </>
  );
}

export function MissablesPage() {
  const { activeMissableCount, missableFilter, setMissableFilter, allMissables, filteredMissables } = useAppView();
  return (
    <>
      <header className="v5-page-header"><div><span className="v5-page-icon">!</span><div><h1>Missables</h1><p>Guide-backed missables with live context and clear points of no return.</p></div></div><span className={`v5-risk-badge ${activeMissableCount ? 'warning' : 'clear'}`}>{activeMissableCount ? `${activeMissableCount} active now` : 'No urgent missables'}</span></header>
      <div className="v5-filter-row">
        {(['all', 'available', 'missed', 'completed'] as const).map((filter) => <button key={filter} className={missableFilter === filter ? 'selected' : 'secondary'} onClick={() => setMissableFilter(filter)}>{filter === 'all' ? `All (${allMissables.length})` : filter === 'available' ? 'Available now' : filter === 'missed' ? 'Missed / ineligible' : 'Completed'}</button>)}
      </div>
      <article className="v5-panel v5-missables-page-panel">
        <div className="v5-missable-list">{filteredMissables.map((achievement: any) => <MissableRow key={achievementId(achievement)} achievement={achievement} />)}</div>
        {!filteredMissables.length && <div className="v5-empty-state"><b>No missables in this filter</b><span>Change the filter or continue playing; live state updates automatically.</span></div>}
      </article>
    </>
  );
}

export function OverlayPage() {
  const { overlay, toggleOverlay, setOverlay, updateOverlay, shortcutState } = useAppView();
  const [overlayShortcut, setOverlayShortcut] = React.useState('');
  const [clickShortcut, setClickShortcut] = React.useState('');
  const [shortcutMessage, setShortcutMessage] = React.useState('');

  React.useEffect(() => {
    if (shortcutState?.overlayToggle?.primary) setOverlayShortcut(shortcutState.overlayToggle.primary);
    if (shortcutState?.clickThrough?.primary) setClickShortcut(shortcutState.clickThrough.primary);
  }, [shortcutState?.overlayToggle?.primary, shortcutState?.clickThrough?.primary]);

  async function saveShortcuts() {
    const next = await window.raCompanion.updateShortcuts({ overlayToggle: overlayShortcut, clickThrough: clickShortcut });
    setShortcutMessage(Object.values(next).every((binding) => binding.registered) ? 'Shortcuts registered.' : 'One or more shortcuts could not be registered; fallback may be active.');
  }

  async function reregisterShortcuts() {
    const next = await window.raCompanion.reregisterShortcuts();
    setShortcutMessage(Object.values(next).every((binding) => binding.registered) ? 'Shortcuts re-registered.' : 'Registration still failed for one or more shortcuts.');
  }

  function receivedLabel(binding?: ShortcutBindingState) {
    if (!binding?.lastReceivedAt) return 'Callback: not received yet';
    return `Callback: ${binding.lastResult || 'received'} · ${new Date(binding.lastReceivedAt).toLocaleTimeString()}`;
  }

  return (
    <>
      <header className="v5-page-header"><div><span className="v5-page-icon">▣</span><div><h1>Overlay</h1><p>Control the in-game companion without changing its live tracking logic.</p></div></div><button onClick={toggleOverlay}>{overlay.visible ? 'Hide overlay' : 'Show overlay'}</button></header>
      <article className="v5-panel v5-overlay-control-panel">
        <div className="v5-card-heading"><div><div className="v5-section-label">IN-GAME OVERLAY</div><h3>Overlay controls</h3></div><span className={`v5-status-pill ${overlay.visible ? 'complete' : 'neutral'}`}>{overlay.visible ? 'VISIBLE' : 'HIDDEN'}</span></div>
        <div className="v5-setting-row"><div><b>Window size</b><small>{overlay.bounds ? `${overlay.bounds.width} × ${overlay.bounds.height}px` : 'Default size'} · drag any edge or corner to resize.</small></div><button className="secondary" onClick={async () => setOverlay(await window.raCompanion.resetOverlayPreset())}>Reset size</button></div>
        <div className="v5-setting-row"><div><b>Click-through</b><small>Keep this on while playing so mouse input reaches Dolphin.</small></div><button className={`toggle-button ${overlay.clickThrough ? 'enabled' : ''}`} onClick={() => updateOverlay({ clickThrough: !overlay.clickThrough })}>{overlay.clickThrough ? 'On' : 'Off'}</button></div>
        <div className="v5-setting-row"><div><b>Position</b><small>{overlay.manualPlacement ? 'Free placement active.' : 'Snapped to a corner.'}</small></div><div className="corner-grid">{(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as OverlayCorner[]).map((corner) => <button key={corner} className={!overlay.manualPlacement && overlay.corner === corner ? 'selected' : ''} onClick={() => updateOverlay({ corner })}>{corner === 'top-left' ? '↖' : corner === 'top-right' ? '↗' : corner === 'bottom-left' ? '↙' : '↘'}</button>)}</div></div>
        <div className="v5-setting-row"><div><b>Opacity</b><small>{Math.round(overlay.opacity * 100)}% window opacity</small></div><input aria-label="Overlay opacity" type="range" min="65" max="100" step="1" value={Math.round(overlay.opacity * 100)} onChange={(e) => updateOverlay({ opacity: Number(e.target.value) / 100 })} /></div>
        <div className="v5-hotkeys v6-hotkey-diagnostics">
          <span className={shortcutState?.overlayToggle.registered ? 'hotkey-ok' : 'hotkey-error'}><kbd>{shortcutState?.overlayToggle.accelerator.replace('CommandOrControl+', '').replaceAll('+', ' + ') || 'Ctrl + Shift + O'}</kbd> Show / Hide · Registration: {shortcutState?.overlayToggle.registered ? 'OK' : 'FAILED'} · {receivedLabel(shortcutState?.overlayToggle)}</span>
          <span className={shortcutState?.clickThrough.registered ? 'hotkey-ok' : 'hotkey-error'}><kbd>{shortcutState?.clickThrough.accelerator.replace('CommandOrControl+', '').replaceAll('+', ' + ') || 'Ctrl + Shift + C'}</kbd> Click-through · Registration: {shortcutState?.clickThrough.registered ? 'OK' : 'FAILED'} · {receivedLabel(shortcutState?.clickThrough)}</span>
          <small>Last hotkey received: {[shortcutState?.overlayToggle, shortcutState?.clickThrough].filter((binding) => binding?.lastReceivedAt).sort((a, b) => Number(b?.lastReceivedAt || 0) - Number(a?.lastReceivedAt || 0))[0]?.lastReceivedAt ? new Date(Number([shortcutState?.overlayToggle, shortcutState?.clickThrough].filter((binding) => binding?.lastReceivedAt).sort((a, b) => Number(b?.lastReceivedAt || 0) - Number(a?.lastReceivedAt || 0))[0]?.lastReceivedAt)).toLocaleString() : 'Never'}</small>
        </div>
        <div className="v6-shortcut-editor">
          <label>Show / Hide shortcut<input value={overlayShortcut} onChange={(e) => setOverlayShortcut(e.target.value)} placeholder="CommandOrControl+Shift+O" /></label>
          <label>Click-through shortcut<input value={clickShortcut} onChange={(e) => setClickShortcut(e.target.value)} placeholder="CommandOrControl+Shift+C" /></label>
          <div className="v6-shortcut-actions"><button type="button" className="secondary" onClick={reregisterShortcuts}>Re-register</button><button type="button" onClick={saveShortcuts}>Save shortcuts</button></div>
          <small className="v5-muted">If Windows rejects a custom shortcut, RA Companion automatically tries its Ctrl+Alt fallback.</small>
          {shortcutMessage && <small>{shortcutMessage}</small>}
        </div>
      </article>
    </>
  );
}

export function SettingsPage() {
  const {
    saveSettings,
    username,
    setUsername,
    apiKey,
    setApiKey,
    hasApiKey,
    apiKeyEncrypted,
    saved,
    accountPhase,
    connectedUser,
    progressOwner,
    lastVerifiedAt,
    accountError,
    forceRefreshAccount,
    disconnectAccount,
    error,
  } = useAppView();
  return (
    <>
      <header className="v5-page-header"><div><span className="v5-page-icon">⚙</span><div><h1>Settings</h1><p>RetroAchievements account and companion preferences.</p></div></div></header>
      <form className="v5-panel v5-settings-form" onSubmit={saveSettings}>
        <div className="v5-section-label">RETROACHIEVEMENTS</div>
        <div className="v5-account-connection v6-account-connection">
          <div className="v5-card-heading"><div><h3>Account connection</h3><small className="v5-muted">Official RA game progress remains authoritative for Locked / Completed.</small></div><span className={`v5-status-pill ${accountPhase === 'connected' ? 'complete' : accountPhase === 'error' ? 'danger' : ['saving', 'verifying', 'refreshing'].includes(accountPhase) ? 'warning' : 'neutral'}`}>{accountPhase === 'saving' ? 'SAVING' : accountPhase === 'verifying' ? 'VERIFYING' : accountPhase === 'refreshing' ? 'REFRESHING' : accountPhase === 'connected' ? 'CONNECTED' : accountPhase === 'error' ? 'ERROR' : 'DISCONNECTED'}</span></div>
          <label htmlFor="ra-username">Username<input id="ra-username" name="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Your RA username" /></label>
          <label htmlFor="ra-api-key">Web API key<input id="ra-api-key" name="apiKey" autoComplete="off" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={hasApiKey ? 'Key already stored · enter only to replace' : 'Paste Web API key'} /></label>
          <button type="submit" disabled={['saving', 'verifying', 'refreshing'].includes(accountPhase)}>{accountPhase === 'saving' ? 'Saving…' : accountPhase === 'verifying' ? 'Verifying…' : accountPhase === 'refreshing' ? 'Refreshing…' : 'Save & connect'}</button>
          <div className="v6-account-facts">
            <div><span>Connection</span><b>{connectedUser ? `Connected as ${connectedUser}` : 'Not connected'}</b></div>
            <div><span>Progress owner</span><b>{progressOwner || '—'}</b></div>
            <div><span>Last verified</span><b>{lastVerifiedAt ? new Date(lastVerifiedAt).toLocaleString() : '—'}</b></div>
            <div><span>API key</span><b>{hasApiKey ? (apiKeyEncrypted ? 'Stored · encrypted' : 'Stored') : 'Missing'}</b></div>
          </div>
          <div className="v6-account-actions"><button type="button" className="secondary" disabled={!hasApiKey || ['saving', 'verifying', 'refreshing'].includes(accountPhase)} onClick={forceRefreshAccount}>Force refresh from RA</button><button type="button" className="secondary danger-button" disabled={!hasApiKey && !username} onClick={disconnectAccount}>Disconnect</button></div>
          <small className="v5-muted">Leaving the API key blank keeps the currently stored key. Switching accounts clears the old progress immediately; a failed new connection never restores the previous user's progress.</small>
          {saved && <div className="saved">{saved}</div>}
          {accountError && <div className="error-card v6-inline-error">{accountError}</div>}
        </div>
      </form>
      {error && <article className="v5-panel error-card">{error}</article>}
    </>
  );
}
