import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import { buildTwilightContext, earnedHardcore } from './profiles/twilightPrincess';

function achievementArray(data: any) {
  const raw = data?.Achievements;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : Object.values(raw);
}

function achievementId(achievement: any) {
  return String(achievement?.ID ?? achievement?.id ?? achievement?.Title ?? achievement?.title ?? '');
}

function earned(achievement: any) {
  return earnedHardcore(achievement);
}

function progressNumbers(data: any) {
  const achievements = achievementArray(data);
  const total = achievements.length || Number(data?.NumAchievements || data?.numAchievements || 0);
  const unlockedFromList = achievements.filter(earned).length;
  const unlocked = Number(data?.NumAwardedToUserHardcore ?? data?.numAwardedToUserHardcore ?? unlockedFromList ?? 0);
  const pct = total ? Math.round((unlocked / total) * 1000) / 10 : 0;
  return { total, unlocked, pct };
}

function badgeUrl(achievement: any) {
  const badgeName = achievement?.BadgeName ?? achievement?.badgeName;
  return badgeName ? `https://media.retroachievements.org/Badge/${badgeName}.png` : '';
}

function useSnapshot(intervalMs = 5000) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');

  async function refresh() {
    try {
      setSnapshot(await window.raCompanion.getSnapshot());
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Could not refresh companion state.');
    }
  }

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return { snapshot, refresh, error };
}

function useLiveRam() {
  const [ram, setRam] = useState<Snapshot['ram'] | undefined>(undefined);

  useEffect(() => {
    let active = true;
    window.raCompanion.getRamState().then((state) => { if (active) setRam(state); }).catch(() => {});
    const unsubscribe = window.raCompanion.onRamStateChanged((state) => { if (active) setRam(state); });
    return () => { active = false; unsubscribe(); };
  }, []);

  return ram;
}

function ramPresenceMessage(ram: Snapshot['ram'] | undefined) {
  if (!ram?.attached || ram?.stale || !ram?.mapped) return '';
  const marker = ram.kind === 'dungeon' ? '🏰' : ram.kind === 'area' ? '🗺️' : ram.kind === 'building' ? '🏠' : ram.kind === 'cave' ? '🕳️' : '';
  if (!marker) return '';
  const label = String(ram.stageName || ram.stageCode || '').trim();
  const formMarker = ram.linkForm === 'wolf' ? ' 🐺' : ram.linkForm === 'human' ? ' 🧝' : '';
  return label ? `${marker}${label}${ram.boss ? ` ☠️${String(ram.boss).trim()}` : ''}${formMarker}` : '';
}

function useOverlayState() {
  const [state, setState] = useState<OverlayState>({
    visible: false,
    mode: 'full',
    clickThrough: false,
    corner: 'top-right',
    opacity: 0.94,
    manualPlacement: false,
    bounds: null,
  });

  useEffect(() => {
    window.raCompanion.getOverlayState().then(setState);
    return window.raCompanion.onOverlayStateChanged(setState);
  }, []);

  async function update(patch: Partial<Omit<OverlayState, 'visible'>>) {
    setState(await window.raCompanion.updateOverlay(patch));
  }

  return { state, setState, update };
}

function ResizeHandle({ direction, disabled }: { direction: OverlayResizeDirection; disabled: boolean }) {
  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    window.raCompanion.startOverlayResize(direction, event.screenX, event.screenY);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();
    window.raCompanion.moveOverlayResize(event.screenX, event.screenY);
  }

  function finish(event: React.PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
    window.raCompanion.endOverlayResize();
  }

  return (
    <div
      className={`overlay-resize-handle resize-${direction}`}
      data-direction={direction}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      title={disabled ? '' : `Resize ${direction.toUpperCase()}`}
    />
  );
}

type AchievementCounter = {
  current: number;
  target: number;
  label: string;
  source: 'ram' | 'ra';
};

function firstFiniteNumber(...values: any[]) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function explicitTargetFromText(text: string, nounPattern: RegExp) {
  const match = text.match(new RegExp(`(?:collect|find|obtain|have|get|all)\\s+(?:all\\s+)?(\\d+)\\s+${nounPattern.source}`, 'i'))
    || text.match(new RegExp(`(\\d+)\\s+${nounPattern.source}`, 'i'));
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function achievementCounter(achievement: any, ram?: Snapshot['ram']): AchievementCounter | null {
  const title = String(achievement?.Title ?? achievement?.title ?? '');
  const description = String(achievement?.Description ?? achievement?.description ?? '');
  const text = `${title} ${description}`;

  // Some RA/emulator payloads expose measured progress directly. Use it when present.
  const measuredCurrent = firstFiniteNumber(
    achievement?.MeasuredProgress,
    achievement?.measuredProgress,
    achievement?.MeasuredValue,
    achievement?.measuredValue,
  );
  const measuredTarget = firstFiniteNumber(
    achievement?.MeasuredTarget,
    achievement?.measuredTarget,
    achievement?.Target,
    achievement?.target,
  );
  if (measuredCurrent !== null && measuredTarget !== null && measuredTarget > 0) {
    return { current: Math.max(0, measuredCurrent), target: measuredTarget, label: 'Progress', source: 'ra' };
  }

  if (!ram?.attached || ram?.stale) return null;

  if (/poe\s*souls?|poes?\b/i.test(text)) {
    const target = explicitTargetFromText(text, /poe\s*souls?|poes?/i);
    if (target && typeof ram.poeSouls === 'number') {
      return { current: Math.min(Math.max(0, ram.poeSouls), target), target, label: 'Poe Souls', source: 'ram' };
    }
  }

  if (/golden\s+bugs?|bugs?\b/i.test(text)) {
    const target = explicitTargetFromText(text, /(?:golden\s+)?bugs?/i);
    if (target && typeof ram.goldenBugs === 'number') {
      return { current: Math.min(Math.max(0, ram.goldenBugs), target), target, label: 'Golden Bugs', source: 'ram' };
    }
  }

  if (/fused\s+shadows?/i.test(text)) {
    const target = explicitTargetFromText(text, /fused\s+shadows?/i);
    if (target && typeof ram.fusedShadows === 'number') {
      return { current: Math.min(Math.max(0, ram.fusedShadows), target), target, label: 'Fused Shadows', source: 'ram' };
    }
  }

  if (/mirror(?:\s+of\s+twilight)?\s+(?:shards?|fragments?|pieces?)/i.test(text)) {
    const target = explicitTargetFromText(text, /mirror(?:\s+of\s+twilight)?\s+(?:shards?|fragments?|pieces?)/i);
    if (target && typeof ram.mirrorShards === 'number') {
      return { current: Math.min(Math.max(0, ram.mirrorShards), target), target, label: 'Mirror Shards', source: 'ram' };
    }
  }

  if (/tears?\s+of\s+light/i.test(text)) {
    const target = explicitTargetFromText(text, /tears?\s+of\s+light/i);
    const regionValue = /faron/i.test(text) ? ram.faronTears : /eldin/i.test(text) ? ram.eldinTears : /lanayru/i.test(text) ? ram.lanayruTears : null;
    if (target && typeof regionValue === 'number') {
      return { current: Math.min(Math.max(0, regionValue), target), target, label: 'Tears of Light', source: 'ram' };
    }
  }

  if (/game\s+overs?/i.test(text)) {
    const target = explicitTargetFromText(text, /game\s+overs?/i);
    if (target && typeof ram.gameOvers === 'number') {
      return { current: Math.min(Math.max(0, ram.gameOvers), target), target, label: 'Game Overs', source: 'ram' };
    }
  }

  return null;
}

function OverlayAchievement({ achievement, ram }: { achievement: any; ram?: Snapshot['ram'] }) {
  const counter = achievementCounter(achievement, ram);
  const counterPct = counter ? Math.max(0, Math.min(100, (counter.current / counter.target) * 100)) : 0;
  return (
    <div className="context-achievement">
      {badgeUrl(achievement) ? <img src={badgeUrl(achievement)} alt="" /> : <div className="overlay-badge-placeholder" />}
      <div className="context-achievement-copy">
        <b>{achievement.Title || achievement.title}</b>
        <span>{achievement.Description || achievement.description}</span>
        {counter && (
          <div className="achievement-counter">
            <div className="achievement-counter-row">
              <small>{counter.label}</small>
              <strong>{counter.current} / {counter.target}</strong>
            </div>
            <div className="achievement-counter-track"><i style={{ width: `${counterPct}%` }} /></div>
          </div>
        )}
      </div>
      <em>{achievement.Points ?? achievement.points ?? 0}p</em>
    </div>
  );
}

function OverlaySection({ kind, title, achievements, ram }: { kind: string; title: string; achievements: any[]; ram?: Snapshot['ram'] }) {
  if (!achievements.length) return null;
  return (
    <section className={`context-section ${kind}`}>
      <div className="context-section-title"><span>{title}</span><small>{achievements.length}</small></div>
      {achievements.map((achievement) => <OverlayAchievement key={achievementId(achievement)} achievement={achievement} ram={ram} />)}
    </section>
  );
}

function Overlay() {
  const { snapshot } = useSnapshot(600);
  const { state } = useOverlayState();
  const [toast, setToast] = useState<any | null>(null);
  const knownEarned = useRef<Set<string> | null>(null);
  const toastTimer = useRef<number | null>(null);
  const movePointer = useRef<number | null>(null);
  const liveRam = useLiveRam();
  const liveRamDetectsGame = Boolean(
    liveRam?.attached &&
    !liveRam?.stale &&
    ['GZ2E01', 'GZ2P01', 'GZ2J01'].includes(String(liveRam?.gameCode || '')),
  );
  const gameActive = Boolean(snapshot?.game?.active || liveRamDetectsGame);
  const data = snapshot?.progress?.data;
  const achievements = useMemo(() => achievementArray(data), [data]);
  const serverPresenceMessage = snapshot?.presence?.ok && snapshot?.presence?.currentGameMatches ? snapshot.presence.message : '';
  const effectiveRam = liveRamDetectsGame ? liveRam : snapshot?.ram;
  const fastRamPresence = ramPresenceMessage(effectiveRam);
  const presenceMessage = fastRamPresence || serverPresenceMessage;
  const ramLive = Boolean(effectiveRam?.attached && !effectiveRam?.stale);
  const ramStage = effectiveRam?.stageName || effectiveRam?.stageCode || '';
  const ramRoom = typeof effectiveRam?.room === 'number' ? effectiveRam.room : null;
  const companion = useMemo(() => buildTwilightContext(achievements, presenceMessage, {
    live: ramLive,
    stageCode: effectiveRam?.stageCode,
    stageName: effectiveRam?.stageName,
    room: ramRoom,
    linkForm: effectiveRam?.linkForm,
    playerControl: effectiveRam?.playerControl,
    inCutscene: effectiveRam?.inCutscene,
    minigameId: effectiveRam?.minigameId,
    areaEntranceId: effectiveRam?.areaEntranceId,
    roomBuildingId: effectiveRam?.roomBuildingId,
    grottoId: effectiveRam?.grottoId,
    storyFlags: effectiveRam?.storyFlags,
  }), [
    achievements,
    presenceMessage,
    ramLive,
    effectiveRam?.stageCode,
    effectiveRam?.stageName,
    ramRoom,
    effectiveRam?.linkForm,
    effectiveRam?.playerControl,
    effectiveRam?.inCutscene,
    effectiveRam?.minigameId,
    effectiveRam?.areaEntranceId,
    effectiveRam?.roomBuildingId,
    effectiveRam?.grottoId,
    effectiveRam?.storyFlags,
  ]);
  const contextUnlocked = companion.relevantAll.filter(earnedHardcore).length;
  const contextTotal = companion.relevantAll.length;
  const contextPct = contextTotal ? Math.round((contextUnlocked / contextTotal) * 100) : 0;

  useEffect(() => {
    document.body.classList.add('overlay-body');
    return () => document.body.classList.remove('overlay-body');
  }, []);

  useEffect(() => {
    if (!gameActive) {
      knownEarned.current = null;
      setToast(null);
      if (toastTimer.current) {
        window.clearTimeout(toastTimer.current);
        toastTimer.current = null;
      }
      return;
    }
    if (!achievements.length) return;
    const current = new Set(achievements.filter(earnedHardcore).map(achievementId));
    if (knownEarned.current === null) {
      knownEarned.current = current;
      return;
    }
    const newlyEarned = achievements.filter((a: any) => earnedHardcore(a) && !knownEarned.current?.has(achievementId(a)));
    knownEarned.current = current;
    if (newlyEarned.length) {
      setToast(newlyEarned[newlyEarned.length - 1]);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), 5200);
    }
  }, [achievements, gameActive]);

  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }, []);

  function startMove(event: React.PointerEvent<HTMLElement>) {
    if (state.clickThrough || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('.overlay-resize-handle')) return;
    event.preventDefault();
    movePointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    window.raCompanion.startOverlayMove(event.screenX, event.screenY);
  }

  function moveWindow(event: React.PointerEvent<HTMLElement>) {
    if (movePointer.current !== event.pointerId || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();
    window.raCompanion.moveOverlayMove(event.screenX, event.screenY);
  }

  function endMove(event: React.PointerEvent<HTMLElement>) {
    if (movePointer.current !== event.pointerId) return;
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    movePointer.current = null;
    window.raCompanion.endOverlayMove();
  }

  const contextLabel = gameActive ? (companion.context.label || 'Story Route') : 'No game active';
  const kindLabel = !gameActive ? 'RA COMPANION' : companion.context.kind === 'dungeon' ? 'DUNGEON' : companion.context.kind === 'area' ? 'AREA' : companion.context.kind === 'building' ? 'LOCATION' : companion.context.kind === 'cave' ? 'CAVE' : 'STORY ROUTE';
  const noContextReason = !snapshot?.presence?.ok
    ? snapshot?.presence?.error || 'RetroAchievements Rich Presence is unavailable.'
    : !snapshot?.presence?.currentGameMatches
      ? 'Waiting for RetroAchievements to report Twilight Princess as your active game.'
      : 'Waiting for a recognizable area or dungeon in RetroAchievements Rich Presence.';

  return (
    <main className={`overlay-shell full ${state.clickThrough ? 'click-through' : 'editable'}`}>
      <section
        className="overlay-card context-overlay"
        onPointerDown={startMove}
        onPointerMove={moveWindow}
        onPointerUp={endMove}
        onPointerCancel={endMove}
        title={state.clickThrough ? '' : 'Hold the left mouse button anywhere to move'}
      >
        {(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as OverlayResizeDirection[]).map((direction) => (
          <ResizeHandle key={direction} direction={direction} disabled={state.clickThrough} />
        ))}

        {toast && (
          <div className="unlock-toast">
            {badgeUrl(toast) && <img src={badgeUrl(toast)} alt="" />}
            <div>
              <span>HARDCORE UNLOCKED</span>
              <b>{toast.Title || toast.title}</b>
              <small>{toast.Points ?? toast.points ?? 0} points</small>
            </div>
          </div>
        )}

        <header className="context-header">
          <div className="context-title-copy">
            <div className="eyebrow">{kindLabel} · HARDCORE</div>
            <h1>{contextLabel}</h1>
            {companion.context.boss && <div className="boss-chip">☠ {companion.context.boss}</div>}
          </div>
          <div className="overlay-badges">
            {ramLive && <span className="pill ram-pill">RAM LIVE</span>}
            <span className="pill blue">{state.clickThrough ? 'PASS' : 'DRAG'}</span>
          </div>
        </header>

        {!gameActive ? (
          <div className="overlay-empty no-game-active">
            <b>No game active</b>
            <span>{snapshot?.dolphin.running ? 'Dolphin is open, but no supported game is currently detected.' : 'Start Twilight Princess in Dolphin and the companion will resume automatically.'}</span>
          </div>
        ) : companion.relevantAll.length ? (
          <>
            <div className="context-progress-row">
              <span>{companion.context.label ? 'Context progress' : 'Route progress'}</span>
              <b>{contextUnlocked} / {contextTotal}</b>
            </div>
            <div className="progress-track context-progress-track">
              <div className="progress-fill" style={{ width: `${contextPct}%` }} />
            </div>

            {contextTotal > 0 ? (
              <div className="context-sections">
                <OverlaySection kind="danger" title={ramLive ? '⚠ Missable now' : '⚠ Missable now / soon'} achievements={companion.missables} ram={effectiveRam} />
                <OverlaySection kind="current" title={companion.context.boss ? `🎯 Boss Now · ${companion.context.boss}` : '🎯 Current Story Beat'} achievements={companion.current} ram={effectiveRam} />
                <OverlaySection kind="coming" title="◉ Next Story Beat" achievements={companion.comingUp} ram={effectiveRam} />
                {!companion.missables.length && !companion.current.length && !companion.comingUp.length && (
                  <div className="context-clear"><b>All relevant Hardcore achievements cleared</b><span>Nothing open for this context.</span></div>
                )}
              </div>
            ) : (
              <div className="context-clear"><b>No mapped achievements here</b><span>RA knows your current location, but this profile has no matching achievements yet.</span></div>
            )}
          </>
        ) : ramLive && companion.context.label ? (
          <div className="context-clear context-waiting">
            <b>No achievement tied to this exact story beat</b>
            <span>Strict RAM filtering is active. The companion will update when the stage/room changes.</span>
          </div>
        ) : (
          <div className="overlay-empty context-waiting">
            <b>Waiting for RetroAchievements context</b>
            <span>{noContextReason}</span>
          </div>
        )}

        <div className="presence-strip">
          <span className={`dot ${gameActive ? 'online' : ''}`} />
          <span className="presence-text">{gameActive ? (ramLive ? `${ramStage || 'Twilight Princess'}${ramRoom !== null ? ` · room ${ramRoom}` : ''}${effectiveRam?.linkForm && effectiveRam.linkForm !== 'unknown' ? ` · ${effectiveRam.linkForm === 'wolf' ? 'Wolf Link' : 'Human Link'}` : ''} · RAM` : (presenceMessage || `${companion.routeLabel} · route inference active`)) : (snapshot?.dolphin.running ? 'Dolphin open · no game active' : 'No game active')}</span>
        </div>

        <div className="overlay-footer">
          <span>Ctrl+Shift+O · show/hide</span>
          <span>{state.bounds ? `${state.bounds.width}×${state.bounds.height}` : 'free resize'}</span>
          <span>Ctrl+Shift+C · click-through</span>
        </div>
      </section>
    </main>
  );
}

function App() {
  const { snapshot, refresh, error } = useSnapshot(1200);
  const { state: overlay, setState: setOverlay, update: updateOverlay } = useOverlayState();
  const [username, setUsername] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyEncrypted, setApiKeyEncrypted] = useState(false);
  const [saved, setSaved] = useState('');
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);

  useEffect(() => {
    window.raCompanion.getConfig().then((config) => {
      setUsername(config.username || '');
      setHasApiKey(config.hasApiKey);
      setApiKeyEncrypted(config.apiKeyEncrypted);
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.raCompanion.checkForUpdates(false).then(setUpdateStatus).catch(() => {});
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  const data = snapshot?.progress?.data;
  const progress = progressNumbers(data);
  const achievements = useMemo(() => achievementArray(data), [data]);
  const locked = achievements.filter((a: any) => !earned(a));
  const unlocked = achievements.filter(earned);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    const result = await window.raCompanion.saveConfig({ username, apiKey });
    setHasApiKey(result.hasApiKey);
    setApiKeyEncrypted(result.apiKeyEncrypted);
    setApiKey('');
    setSaved('Saved');
    setTimeout(() => setSaved(''), 1600);
    refresh();
  }

  async function toggleOverlay() {
    const visible = await window.raCompanion.toggleOverlay();
    setOverlay({ ...overlay, visible });
  }

  async function checkUpdates() {
    setUpdateBusy(true);
    try {
      setUpdateStatus(await window.raCompanion.checkForUpdates(true));
    } finally {
      setUpdateBusy(false);
    }
  }

  async function installUpdate() {
    setUpdateBusy(true);
    try {
      const result = await window.raCompanion.installUpdate();
      setUpdateStatus(result);
      if (!result.installing) setUpdateBusy(false);
    } catch (e: any) {
      setUpdateStatus({ ok: false, currentVersion: '0.4.4', available: false, error: e?.message || 'Update failed.' });
      setUpdateBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">RA COMPANION · v0.4.4</div>
          <h1>RA Companion</h1>
          <p>Live read-only Dolphin context with RetroAchievements Hardcore progress and strict story-beat filtering.</p>
        </div>
        <div className="top-actions">
          <button className="secondary" onClick={refresh}>Refresh</button>
          <button onClick={toggleOverlay}>{overlay.visible ? 'Hide overlay' : 'Show overlay'}</button>
        </div>
      </header>

      <section className="status-grid">
        <article className="card status-card">
          <span className="label">DOLPHIN</span>
          <div className="status-line"><span className={`dot ${snapshot?.dolphin.running ? 'online' : ''}`} /><b>{snapshot?.dolphin.running ? 'Running' : 'Not detected'}</b></div>
          <small>{snapshot?.dolphin.title || 'Start Dolphin with a game to test automatic detection.'}</small>
        </article>
        <article className="card status-card ram-status-card">
          <span className="label">LIVE GAME STATE</span>
          <div className="status-line"><span className={`dot ${snapshot?.ram?.attached && !snapshot?.ram?.stale ? 'online' : ''}`} /><b>{snapshot?.ram?.attached && !snapshot?.ram?.stale ? 'Live' : 'Not attached'}</b></div>
          <small>{snapshot?.ram?.attached ? `${snapshot.ram.gameCode || '?'} ${snapshot.ram.region || ''} · ${snapshot.ram.stageCode || 'stage ?'} · room ${snapshot.ram.room ?? '?'}${snapshot.ram.linkForm && snapshot.ram.linkForm !== 'unknown' ? ` · ${snapshot.ram.linkForm === 'wolf' ? 'Wolf Link' : 'Human Link'}` : ''}` : (snapshot?.ram?.error || 'Waiting for Dolphin memory.')}</small>
          {snapshot?.ram?.attached && <small className="ram-scan-detail">Control: {snapshot.ram.playerControl === true ? 'yes' : snapshot.ram.playerControl === false ? 'no' : '?'} · Cutscene: {snapshot.ram.inCutscene === true ? 'yes' : snapshot.ram.inCutscene === false ? 'no' : '?'}{typeof snapshot.ram.minigameId === 'number' && snapshot.ram.minigameId > 0 ? ` · Minigame ${snapshot.ram.minigameId}` : ''}</small>}
          {!snapshot?.ram?.attached && snapshot?.ram?.sharedMemoryName && (
            <small className="ram-scan-detail">Shared mapping: {snapshot.ram.sharedMemoryName} · {snapshot.ram.mappingOpen ? 'opened' : 'waiting'}</small>
          )}
          {snapshot?.ram?.attached && snapshot?.ram?.hookSource && <small className="ram-scan-detail">Hook: {snapshot.ram.hookSource} · {snapshot.ram.sharedMemoryName || 'shared MEM1'}</small>}
        </article>
        <article className="card status-card">
          <span className="label">GAME PROFILE</span>
          <b>{snapshot?.game.active ? snapshot.game.profile : 'No game active'}</b>
          <small>{snapshot?.game.active ? `RA ID ${snapshot.game.id} · auto-detected` : 'Waiting for a supported game in Dolphin'}</small>
        </article>
        <article className="card status-card">
          <span className="label">RA ACCOUNT</span>
          <b>{username || 'Not configured'}</b>
          <small>{hasApiKey ? `Web API key configured${apiKeyEncrypted ? ' · encrypted' : ''}` : 'API key required'}</small>
        </article>
      </section>

      <article className="card ram-warning">
        <b>Live Dolphin context</b>
        <span>RA Companion reads Dolphin's shared GameCube memory mapping read-only for fast area, room and story-beat context. Achievement unlocks still come from RetroAchievements.</span>
      </article>

      <section className="main-grid">
        <div className="left-column">
          <article className="card hero-card">
            <div>
              <span className="label">CURRENT GAME</span>
              <h2>{snapshot?.game.active ? (data?.Title || snapshot.game.profile) : 'No game active'}</h2>
              <p>{snapshot?.game.active ? (snapshot?.progress.ok ? 'Hardcore RetroAchievements progress' : snapshot?.progress.error || 'Configure your RA account below.') : 'Start Twilight Princess in Dolphin to activate the companion.'}</p>
            </div>
            <div className="completion-ring"><strong>{snapshot?.game.active ? `${progress.pct}%` : '—'}</strong><span>{snapshot?.game.active ? `${progress.unlocked}/${progress.total || 149}` : 'idle'}</span></div>
          </article>

          <article className="card overlay-settings-card">
            <div className="card-heading">
              <div><span className="label">IN-GAME OVERLAY</span><h3>Overlay controls</h3></div>
              <span className={`state-chip ${overlay.visible ? 'active' : ''}`}>{overlay.visible ? 'VISIBLE' : 'HIDDEN'}</span>
            </div>

            <div className="setting-row resize-row">
              <div><b>Window size</b><small>{overlay.bounds ? `${overlay.bounds.width} × ${overlay.bounds.height}px` : 'Default size'} · drag an edge or corner to resize.</small></div>
              <button className="secondary compact-button" onClick={async () => setOverlay(await window.raCompanion.resetOverlayPreset())}>Reset size</button>
            </div>

            <div className="setting-row">
              <div><b>Click-through</b><small>Turn this off while moving/resizing. Turn it on while playing so mouse input goes to Dolphin.</small></div>
              <button className={`toggle-button ${overlay.clickThrough ? 'enabled' : ''}`} onClick={() => updateOverlay({ clickThrough: !overlay.clickThrough })}>{overlay.clickThrough ? 'On' : 'Off'}</button>
            </div>

            <div className="setting-row position-row">
              <div><b>Position</b><small>{overlay.manualPlacement ? 'Free placement active. Hold anywhere on the overlay to move it.' : 'Snapped to a corner. Hold anywhere to move it freely.'}</small></div>
              <div className="corner-grid">
                {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as OverlayCorner[]).map((corner) => (
                  <button key={corner} className={!overlay.manualPlacement && overlay.corner === corner ? 'selected' : ''} onClick={() => updateOverlay({ corner })} title={corner}>
                    {corner === 'top-left' ? '↖' : corner === 'top-right' ? '↗' : corner === 'bottom-left' ? '↙' : '↘'}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-row opacity-row">
              <div><b>Opacity</b><small>{Math.round(overlay.opacity * 100)}% window opacity</small></div>
              <input
                aria-label="Overlay opacity"
                type="range"
                min="65"
                max="100"
                step="1"
                value={Math.round(overlay.opacity * 100)}
                onChange={(e) => updateOverlay({ opacity: Number(e.target.value) / 100 })}
              />
            </div>

            <div className="placement-tip">Move: hold the left mouse button anywhere on the overlay · Resize: drag an edge/corner · Exact position and size are saved automatically.</div>

            <div className="hotkey-strip">
              <span><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd> Show/Hide</span>
              <span><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd> Click-through</span>
            </div>
          </article>

          <article className="card">
            <div className="card-heading"><div><span className="label">ACHIEVEMENTS</span><h3>Locked set preview</h3></div><span className="count">{locked.length} remaining</span></div>
            <div className="achievement-list">
              {locked.slice(0, 8).map((a: any) => (
                <div className="achievement" key={achievementId(a)}>
                  {badgeUrl(a) ? <img src={badgeUrl(a)} alt="" /> : <div className="badge-placeholder" />}
                  <div className="achievement-copy"><b>{a.Title || a.title}</b><span>{a.Description || a.description}</span></div>
                  <div className="points">{a.Points ?? a.points ?? 0}p</div>
                </div>
              ))}
              {!snapshot?.progress.ok && <div className="empty-state">Connect your RA account to load your achievement set and unlock state.</div>}
            </div>
          </article>
        </div>

        <div className="right-column">
          <article className="card companion-card">
            <span className="label">COMPANION PROFILE</span>
            <h3>Twilight Princess</h3>
            <div className="profile-row"><span>Game detection</span><b className="good">Working</b></div>
            <div className="profile-row"><span>Live context</span><b className="good">Dolphin RAM</b></div>
            <div className="profile-row"><span>Unlock pop-ups</span><b className="good">Enabled</b></div>
            <div className="profile-row"><span>Context filtering</span><b className="good">RAM → RP fallback</b></div>
            <div className="profile-row"><span>RAM polling</span><b className="warning-text">~100 ms</b></div>
            <div className="notice ram-notice">RA Companion reads Dolphin's emulated GameCube RAM read-only. Known dungeon/boss stages drive the overlay locally; unknown stages still show their raw stage/room and can fall back to RA Rich Presence for mapped context.</div>
          </article>

          <article className="card update-card">
            <div className="card-heading">
              <div><span className="label">APP UPDATES</span><h3>RA Companion v0.4.4</h3></div>
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

          <form className="card settings-card" onSubmit={saveSettings}>
            <span className="label">RETROACHIEVEMENTS</span>
            <h3>Account settings</h3>
            <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Your RA username" /></label>
            <label>Web API key<input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={hasApiKey ? 'Key already stored · enter only to replace' : 'Paste Web API key'} /></label>
            <button type="submit">Save & connect</button>
            <small className="muted">Leaving the API key field blank keeps your existing key. On supported systems it is stored with Electron safeStorage.</small>
            {saved && <div className="saved">{saved}</div>}
          </form>

          {error && <article className="card error-card">{error}</article>}
          {unlocked.length > 0 && <article className="card mini-card"><span className="label">RA STATUS</span><h3>{unlocked.length} unlocked loaded</h3><small>Recent Hardcore unlocks are polled separately for faster overlay updates; full progress remains cached to reduce API load.</small></article>}
        </div>
      </section>
    </main>
  );
}

const isOverlay = window.location.hash === '#overlay';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isOverlay ? <Overlay /> : <App />}</React.StrictMode>
);
