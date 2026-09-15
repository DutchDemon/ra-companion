import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import raCompanionLogo from './assets/ra-icon.png';
import {
  GAME_PROFILES,
  achievementCounterForProfile,
  buildProfileAchievementStates,
  buildProfileContext,
  earnedHardcore,
  getGameProfileByRaGameId,
  getGameProfileForRam,
  getProfileMissableGuide,
  getProfileRamPresence,
  getProfileSessionStats,
  isMissableForProfile,
  type AchievementCounter,
  type GameAchievementState,
  type RendererGameProfile,
} from './profiles/registry';
import { findPendingFaronVesselObjective, pendingFaronVesselState } from './profiles/faronNextStep';
import { AppViewContext, Dashboard, CurrentGamePage, AchievementsPage, OverlayPage, SettingsPage, UpdateBanner, UpdateCard } from './AppPages';

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
  const generation = useRef(0);

  async function refresh(forceRa = false) {
    const requestGeneration = generation.current;
    try {
      const next = await window.raCompanion.getSnapshot(forceRa);
      if (requestGeneration === generation.current) {
        setSnapshot(next);
        setError('');
      }
      return next;
    } catch (e: any) {
      if (requestGeneration === generation.current) setError(e?.message || 'Could not refresh companion state.');
      return null;
    }
  }

  function clear() {
    // Invalidates every in-flight request. This is critical when switching RA
    // accounts: a late response from the previous account may never repaint UI.
    generation.current += 1;
    setSnapshot(null);
    setError('');
  }

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return { snapshot, refresh, clear, error };
}


function useAchievementLibrary() {
  const [library, setLibrary] = useState<AchievementLibrary>({ version: 1, username: '', games: [] });
  const [refreshing, setRefreshing] = useState(false);

  async function refresh(force = false) {
    if (force) setRefreshing(true);
    try {
      const next = force
        ? await window.raCompanion.refreshAchievementLibrary()
        : await window.raCompanion.getAchievementLibrary();
      setLibrary(next || { version: 1, username: '', games: [] });
      return next;
    } finally {
      if (force) setRefreshing(false);
    }
  }

  function clear() {
    setLibrary({ version: 1, username: '', games: [] });
  }

  useEffect(() => {
    let active = true;
    window.raCompanion.getAchievementLibrary().then((next) => {
      if (active) setLibrary(next || { version: 1, username: '', games: [] });
    }).catch(() => {});
    const unsubscribe = window.raCompanion.onAchievementLibraryChanged((next) => {
      if (active) setLibrary(next || { version: 1, username: '', games: [] });
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  return { library, refresh, clear, refreshing };
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

function liveSessionStats(ram: Snapshot['ram'] | undefined, profile: RendererGameProfile | null = getGameProfileForRam(ram)) {
  return getProfileSessionStats(profile, ram);
}

function ramPresenceMessage(ram: Snapshot['ram'] | undefined, profile: RendererGameProfile | null = getGameProfileForRam(ram)) {
  return getProfileRamPresence(profile, ram);
}

function useShortcutState() {
  const [state, setState] = useState<ShortcutState | null>(null);

  useEffect(() => {
    window.raCompanion.getShortcutState().then(setState).catch(() => {});
    return window.raCompanion.onShortcutStateChanged(setState);
  }, []);

  return state;
}

function useAppVersion() {
  const [version, setVersion] = useState('');

  useEffect(() => {
    let active = true;
    window.raCompanion.getAppVersion().then((value) => {
      if (active) setVersion(String(value || ''));
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  return version;
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

function achievementCounter(achievement: any, ram?: Snapshot['ram'], profile: RendererGameProfile | null = getGameProfileForRam(ram), runtimeLive?: RuntimeObserverLiveState): AchievementCounter | null {
  return achievementCounterForProfile(profile, achievement, ram, runtimeLive);
}

function OverlayAchievement({ achievement, ram, state, profile, runtimeLive }: { achievement: any; ram?: Snapshot['ram']; state?: GameAchievementState; profile?: RendererGameProfile | null; runtimeLive?: RuntimeObserverLiveState }) {
  const counter = achievementCounter(achievement, ram, profile || null, runtimeLive) || state?.progress;
  const counterPct = counter ? Math.max(0, Math.min(100, (counter.current / counter.target) * 100)) : 0;
  const guide = getProfileMissableGuide(profile, achievement);
  return (
    <div className="context-achievement">
      {badgeUrl(achievement) ? <img src={badgeUrl(achievement)} alt="" /> : <div className="overlay-badge-placeholder" />}
      <div className="context-achievement-copy">
        <b>{achievement.Title || achievement.title}</b>
        <span>{achievement.Description || achievement.description}</span>
        {state && <small className={`v5-inline-state ${state.tone}`}>{state.label}</small>}
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

function OverlaySection({ kind, title, achievements, ram, states, profile, runtimeLive }: { kind: string; title: string; achievements: any[]; ram?: Snapshot['ram']; states?: Map<string, GameAchievementState>; profile?: RendererGameProfile | null; runtimeLive?: RuntimeObserverLiveState }) {
  if (!achievements.length) return null;
  return (
    <section className={`context-section ${kind}`}>
      <div className="context-section-title"><span>{title}</span><small>{achievements.length}</small></div>
      {achievements.map((achievement) => <OverlayAchievement key={achievementId(achievement)} achievement={achievement} ram={ram} state={states?.get(achievementId(achievement))} profile={profile} runtimeLive={runtimeLive} />)}
    </section>
  );
}

function Overlay() {
  const { snapshot } = useSnapshot(600);
  const { state } = useOverlayState();
  const shortcutState = useShortcutState();
  const [toast, setToast] = useState<any | null>(null);
  const knownEarned = useRef<Set<string> | null>(null);
  const toastTimer = useRef<number | null>(null);
  const movePointer = useRef<number | null>(null);
  const liveRam = useLiveRam();
  const liveRamProfile = getGameProfileForRam(liveRam);
  const snapshotProfile = getGameProfileByRaGameId(snapshot?.game?.id);
  const activeProfile = snapshotProfile || liveRamProfile;
  const liveRamDetectsGame = Boolean(liveRamProfile);
  const gameActive = Boolean(snapshot?.game?.active || liveRamDetectsGame);
  const data = snapshot?.progress?.data;
  const achievements = useMemo(() => achievementArray(data), [data]);
  const serverPresenceMessage = snapshot?.presence?.ok && snapshot?.presence?.currentGameMatches ? snapshot.presence.message : '';
  const officialPresenceMessage = snapshot?.presence?.source === 'rcheevos-runtime' ? serverPresenceMessage : '';
  const effectiveRam = liveRamProfile && (!snapshotProfile || liveRamProfile.key === activeProfile?.key) ? liveRam : snapshot?.ram;
  const fastRamPresence = ramPresenceMessage(effectiveRam, activeProfile);
  const fallbackSnapshotPresence = snapshot?.presence?.source === 'rcheevos-runtime' ? '' : serverPresenceMessage;
  const presenceMessage = officialPresenceMessage || fastRamPresence || fallbackSnapshotPresence;
  const presenceSource = officialPresenceMessage ? 'rcheevos-runtime' : fastRamPresence ? 'ram' : fallbackSnapshotPresence ? (snapshot?.presence?.source || 'retro-achievements') : 'none';
  const runtimeLive = snapshot?.runtime?.live;
  const ramLive = Boolean(effectiveRam?.attached && !effectiveRam?.stale);
  const ramStage = effectiveRam?.stageName || effectiveRam?.stageCode || '';
  const ramRoom = typeof effectiveRam?.room === 'number' ? effectiveRam.room : null;
  const companion = useMemo(() => buildProfileContext(activeProfile, achievements, presenceMessage, {
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
    stateFlags: effectiveRam?.stateFlags,
    faronTears: effectiveRam?.faronTears,
    eldinTears: effectiveRam?.eldinTears,
    lanayruTears: effectiveRam?.lanayruTears,
    fusedShadows: effectiveRam?.fusedShadows,
    mirrorShards: effectiveRam?.mirrorShards,
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
    effectiveRam?.stateFlags,
  ]);
  const pendingFaronVesselAchievement = useMemo(
    () => findPendingFaronVesselObjective(achievements, effectiveRam),
    [achievements, effectiveRam?.attached, effectiveRam?.stale, effectiveRam?.storyFlags?.faronTwilightStarted, effectiveRam?.storyFlags?.faronVesselObtained],
  );
  const achievementStates = useMemo(() => {
    const states = buildProfileAchievementStates(activeProfile, achievements, effectiveRam, companion);
    if (pendingFaronVesselAchievement) states.set(achievementId(pendingFaronVesselAchievement), pendingFaronVesselState());
    return states;
  }, [achievements, companion, pendingFaronVesselAchievement, effectiveRam?.timestamp, effectiveRam?.eventBitsHex, effectiveRam?.stateFlags, effectiveRam?.storyFlags, effectiveRam?.actors]);
  const broaderCompanion = useMemo(
    () => buildProfileContext(activeProfile, achievements, presenceMessage, { live: false }),
    [achievements, presenceMessage],
  );
  const contextIds = useMemo(() => new Set([
    ...companion.relevantAll,
    ...(pendingFaronVesselAchievement ? [pendingFaronVesselAchievement] : []),
  ].map(achievementId)), [companion.relevantAll, pendingFaronVesselAchievement]);
  const fallbackAchievements = useMemo(() => {
    if (!ramLive || !companion.context.label) return [];
    const seen = new Set<string>();
    return [...broaderCompanion.current, ...broaderCompanion.comingUp, ...broaderCompanion.relevantAll]
      .filter((achievement: any) => !earnedHardcore(achievement) && !isMissableForProfile(activeProfile, achievement))
      .filter((achievement: any) => {
        const id = achievementId(achievement);
        if (!id || contextIds.has(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .slice(0, 2);
  }, [broaderCompanion, companion.context.label, contextIds, ramLive]);
  const overlayStats = useMemo(() => liveSessionStats(effectiveRam, activeProfile), [effectiveRam?.timestamp, effectiveRam?.stageCode, effectiveRam?.currentHearts, effectiveRam?.maxHearts, effectiveRam?.poeSouls, effectiveRam?.goldenBugs, effectiveRam?.faronTears, effectiveRam?.storyFlags]);
  const deepLiveAchievements = useMemo(() => achievements.filter((achievement: any) => {
    const mapped = achievementStates.get(achievementId(achievement));
    return Boolean(mapped?.coverage === 'deep' && ['available', 'in_progress', 'pending'].includes(mapped.kind) && !contextIds.has(achievementId(achievement)));
  }).slice(0, 3), [achievements, achievementStates, contextIds]);
  const contextUnlocked = companion.relevantAll.filter(earnedHardcore).length;
  const contextTotal = new Set([
    ...companion.relevantAll,
    ...fallbackAchievements,
    ...(pendingFaronVesselAchievement ? [pendingFaronVesselAchievement] : []),
  ].map(achievementId)).size;
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
      ? `Waiting for RetroAchievements to report ${activeProfile?.title || 'the current game'} as your active game.`
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
            {snapshot?.presence?.source === 'rcheevos-runtime' && <span className="pill rp-pill">RA RP</span>}
            {ramLive && <span className="pill ram-pill">RAM LIVE</span>}
            <span className="pill blue">{state.clickThrough ? 'PASS' : 'DRAG'}</span>
          </div>
        </header>

        {gameActive && presenceMessage && (
          <div className="v7-overlay-rich-presence" aria-live="polite">
            <span>{snapshot?.presence?.source === 'rcheevos-runtime' ? 'RA RICH PRESENCE' : 'LIVE CONTEXT'}</span>
            <b>{presenceMessage}</b>
          </div>
        )}


        {!gameActive ? (
          <div className="overlay-empty no-game-active">
            <b>No game active</b>
            <span>{snapshot?.dolphin.running ? 'Dolphin is open, but no supported game is currently detected.' : 'Start a supported game in Dolphin and the companion will resume automatically.'}</span>
          </div>
        ) : companion.relevantAll.length || pendingFaronVesselAchievement ? (
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
                <OverlaySection runtimeLive={runtimeLive} profile={activeProfile} kind="danger" title={ramLive ? '⚠ Missable now' : '⚠ Missable now / soon'} achievements={companion.missables} ram={effectiveRam} states={achievementStates} />
                <OverlaySection runtimeLive={runtimeLive} profile={activeProfile} kind="current" title={companion.context.boss ? `🎯 Boss Now · ${companion.context.boss}` : '🎯 Current Story Beat'} achievements={companion.current} ram={effectiveRam} states={achievementStates} />
                <OverlaySection runtimeLive={runtimeLive} profile={activeProfile} kind="opportunity" title="◇ Area Opportunity" achievements={companion.areaOpportunities || []} ram={effectiveRam} states={achievementStates} />
                <OverlaySection runtimeLive={runtimeLive} profile={activeProfile} kind="coming" title="◉ Next Story Beat" achievements={pendingFaronVesselAchievement ? [pendingFaronVesselAchievement] : companion.comingUp} ram={effectiveRam} states={achievementStates} />
                <OverlaySection runtimeLive={runtimeLive} profile={activeProfile} kind="coming" title="◉ Story / RA context" achievements={fallbackAchievements} ram={effectiveRam} states={achievementStates} />
                <OverlaySection runtimeLive={runtimeLive} profile={activeProfile} kind="current" title="◈ Live RAM Opportunity" achievements={deepLiveAchievements} ram={effectiveRam} states={achievementStates} />
                {!companion.missables.length && !companion.current.length && !companion.comingUp.length && !pendingFaronVesselAchievement && !fallbackAchievements.length && !deepLiveAchievements.length && (
                  <div className="context-clear"><b>All relevant Hardcore achievements cleared</b><span>Nothing open for this context.</span></div>
                )}
              </div>
            ) : (
              <div className="context-clear"><b>No mapped achievements here</b><span>RA knows your current location, but this profile has no matching achievements yet.</span></div>
            )}
          </>
        ) : ramLive && companion.context.label ? (
          <div className="context-clear context-waiting">
            <b>Context recognized</b>
            <span>No immediate exact-match achievement is open. RA Companion is still watching the broader story route while keeping missable warnings strict.</span>
          </div>
        ) : (
          <div className="overlay-empty context-waiting">
            <b>Waiting for RetroAchievements context</b>
            <span>{noContextReason}</span>
          </div>
        )}

        <div className="presence-strip">
          <span className={`dot ${gameActive ? 'online' : ''}`} />
          <span className="presence-text">{gameActive ? (ramLive ? `${overlayStats.location || ramStage || activeProfile?.title || snapshot?.game?.profile || 'Current game'} · RAM live` : (presenceMessage || `${companion.routeLabel} · route inference active`)) : (snapshot?.dolphin.running ? 'Dolphin open · no game active' : 'No game active')}</span>
        </div>

        <div className="overlay-footer">
          <span>{shortcutState?.overlayToggle.registered ? `${shortcutState.overlayToggle.accelerator.replace('CommandOrControl', 'Ctrl')} · show/hide` : 'Overlay hotkey unavailable'}</span>
          <span>{state.bounds ? `${state.bounds.width}×${state.bounds.height}` : 'free resize'}</span>
          <span>{shortcutState?.clickThrough.registered ? `${shortcutState.clickThrough.accelerator.replace('CommandOrControl', 'Ctrl')} · click-through` : 'Click-through hotkey unavailable'}</span>
        </div>
      </section>
    </main>
  );
}

function App() {
  const { snapshot, refresh, clear: clearSnapshot, error } = useSnapshot(700);
  const liveRam = useLiveRam();
  const { state: overlay, setState: setOverlay, update: updateOverlay } = useOverlayState();
  const shortcutState = useShortcutState();
  const appVersion = useAppVersion();
  const { library: achievementLibrary, refresh: reloadAchievementLibrary, clear: clearAchievementLibrary, refreshing: libraryRefreshing } = useAchievementLibrary();
  const [page, setPage] = useState<'dashboard' | 'game' | 'achievements' | 'overlay' | 'updates' | 'settings'>('dashboard');
  const [username, setUsername] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyEncrypted, setApiKeyEncrypted] = useState(false);
  const [saved, setSaved] = useState('');
  const [accountPhase, setAccountPhase] = useState<'idle' | 'saving' | 'verifying' | 'refreshing' | 'connected' | 'error'>('idle');
  const [connectedUser, setConnectedUser] = useState('');
  const [progressOwner, setProgressOwner] = useState('');
  const [lastVerifiedAt, setLastVerifiedAt] = useState<number>(0);
  const [accountError, setAccountError] = useState('');
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState('');
  const [selectedMissable, setSelectedMissable] = useState<any | null>(null);
  const [missableFilter, setMissableFilter] = useState<'all' | 'available' | 'missed' | 'completed'>('all');

  useEffect(() => {
    window.raCompanion.getConfig().then((config) => {
      setUsername(config.username || '');
      setHasApiKey(config.hasApiKey);
      setApiKeyEncrypted(config.apiKeyEncrypted);
      if (config.verifiedUsername && config.username && config.verifiedUsername.toLowerCase() === config.username.toLowerCase()) {
        setConnectedUser(config.verifiedUsername);
        setProgressOwner(config.verifiedUsername);
        setLastVerifiedAt(Number(config.lastVerifiedAt || 0));
        setAccountPhase('connected');
      }
    });
  }, []);

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

  const data = snapshot?.progress?.data;
  const progress = progressNumbers(data);
  const achievements = useMemo(() => achievementArray(data), [data]);
  const locked = achievements.filter((a: any) => !earned(a));
  const unlocked = achievements.filter(earned);

  const liveRamProfile = getGameProfileForRam(liveRam);
  const snapshotProfile = getGameProfileByRaGameId(snapshot?.game?.id);
  const activeProfile = snapshotProfile || liveRamProfile;
  const liveRamDetectsGame = Boolean(liveRamProfile);
  const gameActive = Boolean(snapshot?.game?.active || liveRamDetectsGame);
  const activeGameId = gameActive
    ? (Number(snapshot?.game?.id || activeProfile?.raGameId || 0) || null)
    : null;
  const effectiveRam = liveRamProfile && (!snapshotProfile || liveRamProfile.key === activeProfile?.key) ? liveRam : snapshot?.ram;
  const ramLive = Boolean(effectiveRam?.attached && !effectiveRam?.stale);
  const serverPresenceMessage = snapshot?.presence?.ok && snapshot?.presence?.currentGameMatches ? snapshot.presence.message : '';
  const officialPresenceMessage = snapshot?.presence?.source === 'rcheevos-runtime' ? serverPresenceMessage : '';
  const fastRamPresence = ramPresenceMessage(effectiveRam, activeProfile);
  const fallbackSnapshotPresence = snapshot?.presence?.source === 'rcheevos-runtime' ? '' : serverPresenceMessage;
  const presenceMessage = officialPresenceMessage || fastRamPresence || fallbackSnapshotPresence;
  const presenceSource = officialPresenceMessage ? 'rcheevos-runtime' : fastRamPresence ? 'ram' : fallbackSnapshotPresence ? (snapshot?.presence?.source || 'retro-achievements') : 'none';
  const runtimeLive = snapshot?.runtime?.live;
  const ramRoom = typeof effectiveRam?.room === 'number' ? effectiveRam.room : null;
  const sessionStats = useMemo(() => liveSessionStats(effectiveRam, activeProfile), [effectiveRam?.timestamp, effectiveRam?.stageCode, effectiveRam?.currentHearts, effectiveRam?.maxHearts, effectiveRam?.poeSouls, effectiveRam?.goldenBugs, effectiveRam?.faronTears, effectiveRam?.storyFlags]);
  const currentAchievementCounter = (achievement: any, ram: Snapshot['ram'] | undefined = effectiveRam, useRuntime = true) =>
    achievementCounter(achievement, ram, activeProfile, useRuntime ? runtimeLive : undefined);

  const companion = useMemo(() => buildProfileContext(activeProfile, achievements, presenceMessage, {
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
    stateFlags: effectiveRam?.stateFlags,
    faronTears: effectiveRam?.faronTears,
    eldinTears: effectiveRam?.eldinTears,
    lanayruTears: effectiveRam?.lanayruTears,
    fusedShadows: effectiveRam?.fusedShadows,
    mirrorShards: effectiveRam?.mirrorShards,
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
    effectiveRam?.stateFlags,
  ]);

  const pendingFaronVesselAchievement = useMemo(
    () => findPendingFaronVesselObjective(achievements, effectiveRam),
    [achievements, effectiveRam?.attached, effectiveRam?.stale, effectiveRam?.storyFlags?.faronTwilightStarted, effectiveRam?.storyFlags?.faronVesselObtained],
  );
  const achievementStates = useMemo(() => {
    const states = buildProfileAchievementStates(activeProfile, achievements, effectiveRam, companion);
    if (pendingFaronVesselAchievement) states.set(achievementId(pendingFaronVesselAchievement), pendingFaronVesselState());
    return states;
  }, [achievements, companion, pendingFaronVesselAchievement, effectiveRam?.timestamp, effectiveRam?.eventBitsHex, effectiveRam?.stateFlags, effectiveRam?.storyFlags, effectiveRam?.actors]);
  const broaderCompanion = useMemo(
    () => buildProfileContext(activeProfile, achievements, presenceMessage, { live: false }),
    [achievements, presenceMessage],
  );

  const liveMissableIds = useMemo(() => new Set(companion.missables.map((a: any) => achievementId(a))), [companion.missables]);
  const comingIds = useMemo(() => new Set(companion.comingUp.map((a: any) => achievementId(a))), [companion.comingUp]);
  const currentIds = useMemo(() => new Set(companion.current.map((a: any) => achievementId(a))), [companion.current]);
  const allMissables = useMemo(() => achievements.filter((a: any) => Boolean(getAchievementGuide(a, activeGameId))), [achievements]);

  function uniqueAchievements(items: any[]) {
    const seen = new Set<string>();
    return items.filter((item) => {
      const id = achievementId(item);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  const deepLiveAchievements = achievements.filter((achievement: any) => {
    const mapped = achievementStates.get(achievementId(achievement));
    return Boolean(mapped?.coverage === 'deep' && ['available', 'in_progress', 'pending'].includes(mapped.kind) && !earnedHardcore(achievement));
  });

  const controlledFallbackAchievements = uniqueAchievements([
    ...broaderCompanion.current,
    ...broaderCompanion.comingUp,
    ...broaderCompanion.relevantAll,
  ]).filter((achievement: any) => !earnedHardcore(achievement) && !isMissableForProfile(activeProfile, achievement));

  const relevantAchievements = uniqueAchievements([
    ...(pendingFaronVesselAchievement ? [pendingFaronVesselAchievement] : []),
    ...deepLiveAchievements,
    ...companion.missables,
    ...companion.current,
    ...companion.comingUp,
    ...(companion.relevantAll.length ? [] : controlledFallbackAchievements),
  ]).slice(0, 5);

  const deepLiveMissables = deepLiveAchievements.filter((achievement: any) => Boolean(getAchievementGuide(achievement, activeGameId)));
  const whatMattersAchievements = uniqueAchievements([
    ...deepLiveMissables,
    ...companion.missables,
  ]);
  const deepUpcomingMissables = achievements.filter((achievement: any) => {
    const mapped = achievementStates.get(achievementId(achievement));
    return Boolean(getAchievementGuide(achievement, activeGameId) && mapped?.coverage === 'deep' && mapped.kind === 'upcoming' && !earnedHardcore(achievement));
  });
  const upcomingMissables = uniqueAchievements([
    ...companion.comingUp.filter((achievement: any) => Boolean(getAchievementGuide(achievement, activeGameId))),
    ...deepUpcomingMissables,
  ]).filter((achievement: any) => !whatMattersAchievements.some((active: any) => achievementId(active) === achievementId(achievement)));
  const activeMissableCount = whatMattersAchievements.length;
  const currentNextAchievements = uniqueAchievements([
    ...(pendingFaronVesselAchievement ? [pendingFaronVesselAchievement] : []),
    ...deepLiveAchievements,
    ...companion.missables,
    ...companion.current,
    ...companion.comingUp,
  ]);


  function missableState(achievement: any): GameAchievementState {
    const id = achievementId(achievement);
    const mapped = achievementStates.get(id);
    if (mapped) return mapped;
    if (earned(achievement)) return { kind: 'completed', label: 'Completed', tone: 'complete', source: 'ra', coverage: 'tracked' };
    return { kind: gameActive ? 'tracked' : 'waiting', label: gameActive ? 'RAM tracked' : 'Waiting for game state', tone: 'neutral', source: 'context', coverage: 'tracked' };
  }


  function getAchievementGuide(achievement: any, gameId?: number | null) {
    const directProfile = getGameProfileByRaGameId(Number(gameId ?? activeGameId ?? 0));
    if (directProfile) return getProfileMissableGuide(directProfile, achievement);
    for (const profile of GAME_PROFILES) {
      const guide = getProfileMissableGuide(profile, achievement);
      if (guide) return guide;
    }
    return null;
  }

  function isAchievementMissable(achievement: any, gameId?: number | null) {
    const numericGameId = Number(gameId ?? activeGameId ?? 0);
    const profile = getGameProfileByRaGameId(numericGameId);
    return isMissableForProfile(profile, achievement);
  }

  function achievementListState(achievement: any, gameId?: number | null): GameAchievementState {
    const numericGameId = Number(gameId ?? activeGameId ?? 0);
    const profile = getGameProfileByRaGameId(numericGameId);
    const isCurrent = Boolean(gameActive && activeGameId && numericGameId === Number(activeGameId));
    if (isCurrent && profile?.enhanced) return missableState(achievement);
    if (earned(achievement)) return { kind: 'completed', label: 'Completed', tone: 'complete', source: 'ra', coverage: 'tracked' };

    const measured = currentAchievementCounter(achievement, isCurrent ? effectiveRam : undefined, isCurrent);
    if (measured && measured.target > 0 && measured.current > 0 && measured.current < measured.target) {
      return { kind: 'in_progress', label: 'In progress', tone: 'active', source: 'ra', coverage: 'counter', progress: measured };
    }
    if (isAchievementMissable(achievement, numericGameId)) {
      return { kind: 'tracked', label: 'Missable · Locked', tone: 'warning', source: 'ra', coverage: 'tracked' };
    }
    return { kind: 'tracked', label: 'Locked', tone: 'neutral', source: 'ra', coverage: 'tracked' };
  }

  const filteredMissables = allMissables.filter((achievement: any) => {
    const state = missableState(achievement);
    if (missableFilter === 'available') return ['available', 'in_progress', 'pending'].includes(state.kind);
    if (missableFilter === 'missed') return state.kind === 'missed' || state.kind === 'ineligible';
    if (missableFilter === 'completed') return state.kind === 'completed';
    return true;
  });

  function releaseHighlights(value?: string) {
    const source = String(value || '');
    const listMatches = [...source.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((match) => match[1]);
    const rawItems = listMatches.length ? listMatches : source.split(/\r?\n/);
    const cleaned = rawItems
      .map((line) => line
        .replace(/<[^>]+>/g, ' ')
        .replace(/^[#>*\-\s]+/, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/`/g, '')
        .replace(/\s+/g, ' ')
        .trim())
      .filter((line) => line && !/^ra companion v/i.test(line) && !/^important:/i.test(line) && !/^the windows installer/i.test(line));
    return [...new Set(cleaned)].slice(0, 3);
  }

  const updateHighlights = releaseHighlights(updateStatus?.notes);
  const updatePhase = updateStatus?.phase || (updateStatus?.available ? 'available' : updateStatus?.ok ? 'current' : 'checking');
  const updatePercent = Math.max(0, Math.min(100, Number(updateStatus?.progress) || 0));
  const updateInProgress = updatePhase === 'downloading' || updatePhase === 'downloaded' || updatePhase === 'installing';
  const updateChip = updatePhase === 'downloading' ? 'DOWNLOADING' : updatePhase === 'downloaded' ? 'READY' : updatePhase === 'installing' ? 'INSTALLING' : updatePhase === 'error' ? 'ERROR' : updateStatus?.available ? 'UPDATE' : updateStatus?.ok ? 'CURRENT' : 'CHECK';

  const gameImageRaw = String(data?.ImageIcon || data?.imageIcon || '');
  const gameImageUrl = gameImageRaw
    ? (/^https?:\/\//i.test(gameImageRaw) ? gameImageRaw : `https://media.retroachievements.org${gameImageRaw.startsWith('/') ? '' : '/'}${gameImageRaw}`)
    : '';

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    const requestedUsername = username.trim();
    setSaved('');
    setAccountError('');
    setAccountPhase('saving');
    setConnectedUser('');
    setProgressOwner('');
    setLastVerifiedAt(0);
    clearSnapshot();
    clearAchievementLibrary();

    try {
      const result = await window.raCompanion.saveConfig({ username: requestedUsername, apiKey });
      await reloadAchievementLibrary(false);
      setUsername(result.username || requestedUsername);
      setHasApiKey(result.hasApiKey);
      setApiKeyEncrypted(result.apiKeyEncrypted);
      setApiKey('');

      setAccountPhase('verifying');
      const verification = await window.raCompanion.verifyAccount();
      if (!verification.ok) throw new Error(verification.error || 'RetroAchievements verification failed.');

      setConnectedUser(verification.username);
      setProgressOwner(verification.progressOwner || verification.username);
      setLastVerifiedAt(Number(verification.lastVerifiedAt || Date.now()));
      setAccountPhase('refreshing');
      await refresh(true);
      await reloadAchievementLibrary(false);
      setAccountPhase('connected');
      setSaved('Connected');
      window.setTimeout(() => setSaved(''), 1600);
    } catch (err: any) {
      setAccountPhase('error');
      setAccountError(err?.message || 'Could not connect this RetroAchievements account.');
      // Intentionally do not restore any previous snapshot/account identity.
      // A failed account switch must never fall back to the prior user's progress.
      clearSnapshot();
    }
  }

  async function forceRefreshAccount() {
    setAccountError('');
    setAccountPhase('refreshing');
    try {
      const verification = await window.raCompanion.verifyAccount();
      if (!verification.ok) throw new Error(verification.error || 'RetroAchievements verification failed.');
      setConnectedUser(verification.username);
      setProgressOwner(verification.progressOwner || verification.username);
      setLastVerifiedAt(Number(verification.lastVerifiedAt || Date.now()));
      await reloadAchievementLibrary(true);
      await refresh(false);
      await reloadAchievementLibrary(false);
      setAccountPhase('connected');
    } catch (err: any) {
      setAccountPhase('error');
      setAccountError(err?.message || 'Could not refresh RetroAchievements progress.');
      clearSnapshot();
    }
  }

  async function disconnectAccount() {
    setAccountError('');
    clearAchievementLibrary();
    await window.raCompanion.disconnectAccount();
    await reloadAchievementLibrary(false);
    clearSnapshot();
    setUsername('');
    setApiKey('');
    setHasApiKey(false);
    setApiKeyEncrypted(false);
    setConnectedUser('');
    setProgressOwner('');
    setLastVerifiedAt(0);
    setAccountPhase('idle');
    setSaved('');
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
      setUpdateStatus({ ok: false, currentVersion: appVersion || updateStatus?.currentVersion || '', available: false, phase: 'error', error: e?.message || 'Update failed.', message: 'Update failed. You can try again.' });
      setUpdateBusy(false);
    }
  }

  const showUpdateBanner = Boolean(
    updateStatus?.available &&
    updateStatus.latestVersion &&
    dismissedUpdateVersion !== updateStatus.latestVersion &&
    updatePhase !== 'error'
  );

  function dismissUpdateBanner() {
    if (updateStatus?.latestVersion) setDismissedUpdateVersion(updateStatus.latestVersion);
  }

  const navItems = [
    ['dashboard', '⌂', 'Dashboard'],
    ['game', '◈', 'Current Game'],
    ['achievements', '♛', 'Achievements'],
    ['overlay', '▣', 'Overlay'],
    ['updates', '↓', 'Updates'],
    ['settings', '⚙', 'Settings'],
  ] as const;

  const appView = {
    snapshot,
    refresh,
    error,
    appVersion,
    data,
    progress,
    achievements,
    locked,
    unlocked,
    achievementLibrary,
    libraryRefreshing,
    reloadAchievementLibrary,
    activeGameId,
    activeProfile,
    getAchievementGuide,
    isAchievementMissable,
    achievementListState,
    effectiveRam,
    gameActive,
    ramLive,
    ramRoom,
    serverPresenceMessage,
    presenceMessage,
    presenceSource,
    companion,
    achievementStates,
    allMissables,
    filteredMissables,
    relevantAchievements,
    whatMattersAchievements,
    upcomingMissables,
    activeMissableCount,
    currentNextAchievements,
    gameImageUrl,
    overlay,
    setOverlay,
    updateOverlay,
    shortcutState,
    sessionStats,
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
    updateStatus,
    updateBusy,
    updatePhase,
    updateChip,
    updateInProgress,
    updatePercent,
    updateHighlights,
    showUpdateBanner,
    dismissUpdateBanner,
    missableFilter,
    setMissableFilter,
    setSelectedMissable,
    missableState,
    achievementCounter: currentAchievementCounter,
    saveSettings,
    toggleOverlay,
    checkUpdates,
    installUpdate,
    setPage,
  };

  return (
    <AppViewContext.Provider value={appView}>
    <main className="v5-app-shell">
      <aside className="v5-sidebar">
        <div className="v5-brand"><img className="v5-brand-mark" src={raCompanionLogo} alt="" aria-hidden="true" /><div><b>RA Companion</b><span>Live companion for RetroAchievements players</span></div></div>
        <nav>{navItems.map(([id, icon, label]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><span>{icon}</span>{label}{id === 'achievements' && activeMissableCount > 0 && <em>{activeMissableCount}</em>}</button>)}</nav>
        <div className="v5-sidebar-footer"><span>Play smarter.</span><small>Live context · guide-backed missables</small><b>{appVersion ? `v${appVersion}` : 'v…'}</b></div>
      </aside>

      <section className="v5-content">
        <UpdateBanner />
        {page === 'dashboard' && <Dashboard />}
        {page === 'game' && <CurrentGamePage />}
        {page === 'achievements' && <AchievementsPage />}
        {page === 'overlay' && <OverlayPage />}
        {page === 'updates' && <><header className="v5-page-header"><div><span className="v5-page-icon">↓</span><div><h1>Updates</h1><p>Clear update status, progress and concise release highlights.</p></div></div></header><UpdateCard full /></>}
        {page === 'settings' && <SettingsPage />}
      </section>

      {selectedMissable && (() => {
        const guide = getAchievementGuide(selectedMissable);
        const state = missableState(selectedMissable);
        return (
          <div className="v5-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedMissable(null); }}>
            <article className="v5-missable-modal">
              <button className="v5-modal-close" onClick={() => setSelectedMissable(null)} aria-label="Close">×</button>
              <div className="v5-modal-header">
                {badgeUrl(selectedMissable) ? <img src={badgeUrl(selectedMissable)} alt="" /> : <div className="v5-badge-placeholder" />}
                <div><div className="v5-section-label">MISSABLE GUIDE</div><h2>{selectedMissable.Title || selectedMissable.title}</h2><span className={`v5-status-pill ${state.tone}`}>{state.label}</span></div>
              </div>
              <p className="v5-modal-description">{selectedMissable.Description || selectedMissable.description}</p>
              <div className="v5-guide-sections">
                <section><span>WHAT TO DO</span><p>{guide?.tip || 'Follow the achievement description during the related one-time story event.'}</p></section>
                <section className="cutoff"><span>POINT OF NO RETURN</span><p>{guide?.cutoff || 'Complete this before leaving the related one-time event or story sequence.'}</p></section>
                <section><span>RETRY / SAVE ADVICE</span><p>{guide?.retry || 'Keep a save before the relevant event when possible so a failed condition can be retried safely.'}</p></section>
                <section><span>LIVE CONTEXT</span><p>{gameActive ? `${companion.context.label || effectiveRam?.stageName || 'Twilight Princess'} · ${effectiveRam?.linkForm === 'wolf' ? 'Wolf Link' : effectiveRam?.linkForm === 'human' ? 'Human Link' : 'form unknown'} · ${state.label}${state.detail ? ` · ${state.detail}` : ''}` : 'No active game session. RA Companion will update this status automatically when you play.'}</p></section>
              </div>
              <div className="v5-guide-source"><b>Source</b><span>RetroAchievements Twilight Princess (GameCube) missables guide · guidance is paraphrased and combined with the live RA set.</span></div>
            </article>
          </div>
        );
      })()}
    </main>
    </AppViewContext.Provider>
  );
}

const isOverlay = window.location.hash === '#overlay';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isOverlay ? <Overlay /> : <App />}</React.StrictMode>
);
