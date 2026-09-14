import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import { buildTwilightContext, earnedHardcore, isFaronTearAchievement, isFaronTearObjectiveActive, isMissableAchievement } from './profiles/twilightPrincess';
import { getTwilightMissableGuide } from './profiles/twilightPrincessGuide';
import { buildTwilightAchievementStates, type TwilightAchievementState } from './profiles/twilightPrincessState';
import { AppViewContext, Dashboard, CurrentGamePage, AchievementsPage, MissablesPage, OverlayPage, SettingsPage, UpdateBanner, UpdateCard } from './AppPages';

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

function liveSessionStats(ram: Snapshot['ram'] | undefined) {
  const live = Boolean(ram?.attached && !ram?.stale && ram?.mapped && ram?.gameCode === 'GZ2E01');
  const location = live ? String(ram?.stageName || ram?.stageCode || '').trim() : '';
  const form = ram?.linkForm === 'wolf' ? 'Wolf Link' : ram?.linkForm === 'human' ? 'Human Link' : 'Unknown';
  const hearts = typeof ram?.currentHearts === 'number' && typeof ram?.maxHearts === 'number' ? `${ram.currentHearts}/${ram.maxHearts}` : '—';
  const poeSouls = typeof ram?.poeSouls === 'number' ? `${ram.poeSouls}/60` : '—';
  const goldenBugs = typeof ram?.goldenBugs === 'number' ? `${ram.goldenBugs}/24` : '—';
  const stageCode = String(ram?.stageCode || '').trim();
  const faronTearsActive = ['F_SP108', 'R_SP108', 'D_SB10'].includes(stageCode)
    && ram?.storyFlags?.faronVesselObtained === true
    && typeof ram?.faronTears === 'number';
  const contextStat = faronTearsActive
    ? `Tears of Light ${Math.max(0, Math.min(16, Number(ram?.faronTears || 0)))}/16`
    : typeof ram?.fusedShadows === 'number' && ram.fusedShadows > 0 && ram.fusedShadows < 4
      ? `Fused Shadows ${ram.fusedShadows}/4`
      : typeof ram?.mirrorShards === 'number' && ram.mirrorShards > 0 && ram.mirrorShards < 4
        ? `Mirror Shards ${ram.mirrorShards}/4`
        : '';
  return { live, location, form, hearts, poeSouls, goldenBugs, contextStat };
}

function ramPresenceMessage(ram: Snapshot['ram'] | undefined) {
  const stats = liveSessionStats(ram);
  if (!stats.live) return '';
  const marker = ram?.kind === 'dungeon' ? '🏰' : ram?.kind === 'area' ? '🗺️' : ram?.kind === 'building' ? '🏠' : ram?.kind === 'cave' ? '🕳️' : '';
  if (!marker || !stats.location) return '';
  const formMarker = ram?.linkForm === 'wolf' ? '🐺Link' : ram?.linkForm === 'human' ? '🧝Link' : 'Link';
  return [
    formMarker,
    `${marker}${stats.location}${ram?.boss ? ` ☠️${String(ram.boss).trim()}` : ''}`,
    stats.hearts !== '—' ? `❤️${stats.hearts}` : '',
    stats.poeSouls !== '—' ? `👻${stats.poeSouls}` : '',
    stats.goldenBugs !== '—' ? `🐜${stats.goldenBugs}` : '',
    stats.contextStat ? `· ${stats.contextStat}` : '',
  ].filter(Boolean).join(' ');
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
    if (isFaronTearAchievement(achievement) && !isFaronTearObjectiveActive(achievement, {
      live: true,
      stageCode: ram.stageCode,
      storyFlags: ram.storyFlags,
    })) return null;

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

function OverlayAchievement({ achievement, ram, state }: { achievement: any; ram?: Snapshot['ram']; state?: TwilightAchievementState }) {
  const counter = state?.progress || achievementCounter(achievement, ram);
  const counterPct = counter ? Math.max(0, Math.min(100, (counter.current / counter.target) * 100)) : 0;
  const guide = getTwilightMissableGuide(achievement);
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

function OverlaySection({ kind, title, achievements, ram, states }: { kind: string; title: string; achievements: any[]; ram?: Snapshot['ram']; states?: Map<string, TwilightAchievementState> }) {
  if (!achievements.length) return null;
  return (
    <section className={`context-section ${kind}`}>
      <div className="context-section-title"><span>{title}</span><small>{achievements.length}</small></div>
      {achievements.map((achievement) => <OverlayAchievement key={achievementId(achievement)} achievement={achievement} ram={ram} state={states?.get(achievementId(achievement))} />)}
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
  const liveRamDetectsGame = Boolean(
    liveRam?.attached &&
    !liveRam?.stale &&
    String(liveRam?.gameCode || '') === 'GZ2E01',
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
    stateFlags: effectiveRam?.stateFlags,
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
  const achievementStates = useMemo(
    () => buildTwilightAchievementStates(achievements, effectiveRam, companion),
    [achievements, companion, effectiveRam?.timestamp, effectiveRam?.eventBitsHex, effectiveRam?.stateFlags, effectiveRam?.storyFlags, effectiveRam?.actors],
  );
  const broaderCompanion = useMemo(
    () => buildTwilightContext(achievements, presenceMessage, { live: false }),
    [achievements, presenceMessage],
  );
  const contextIds = useMemo(() => new Set(companion.relevantAll.map(achievementId)), [companion.relevantAll]);
  const fallbackAchievements = useMemo(() => {
    if (!ramLive || !companion.context.label) return [];
    const seen = new Set<string>();
    return [...broaderCompanion.current, ...broaderCompanion.comingUp, ...broaderCompanion.relevantAll]
      .filter((achievement: any) => !earnedHardcore(achievement) && !isMissableAchievement(achievement))
      .filter((achievement: any) => {
        const id = achievementId(achievement);
        if (!id || contextIds.has(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .slice(0, 2);
  }, [broaderCompanion, companion.context.label, contextIds, ramLive]);
  const overlayStats = useMemo(() => liveSessionStats(effectiveRam), [effectiveRam?.timestamp, effectiveRam?.stageCode, effectiveRam?.currentHearts, effectiveRam?.maxHearts, effectiveRam?.poeSouls, effectiveRam?.goldenBugs, effectiveRam?.faronTears, effectiveRam?.storyFlags]);
  const deepLiveAchievements = useMemo(() => achievements.filter((achievement: any) => {
    const mapped = achievementStates.get(achievementId(achievement));
    return Boolean(mapped?.coverage === 'deep' && ['available', 'in_progress', 'pending'].includes(mapped.kind) && !contextIds.has(achievementId(achievement)));
  }).slice(0, 3), [achievements, achievementStates, contextIds]);
  const contextUnlocked = companion.relevantAll.filter(earnedHardcore).length;
  const contextTotal = companion.relevantAll.length + fallbackAchievements.length;
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
                <OverlaySection kind="danger" title={ramLive ? '⚠ Missable now' : '⚠ Missable now / soon'} achievements={companion.missables} ram={effectiveRam} states={achievementStates} />
                <OverlaySection kind="current" title={companion.context.boss ? `🎯 Boss Now · ${companion.context.boss}` : '🎯 Current Story Beat'} achievements={companion.current} ram={effectiveRam} states={achievementStates} />
                <OverlaySection kind="coming" title="◉ Next Story Beat" achievements={companion.comingUp} ram={effectiveRam} states={achievementStates} />
                <OverlaySection kind="coming" title="◉ Story / RA context" achievements={fallbackAchievements} ram={effectiveRam} states={achievementStates} />
                <OverlaySection kind="current" title="◈ Live RAM Opportunity" achievements={deepLiveAchievements} ram={effectiveRam} states={achievementStates} />
                {!companion.missables.length && !companion.current.length && !companion.comingUp.length && !fallbackAchievements.length && !deepLiveAchievements.length && (
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

        {gameActive && ramLive && (
          <div className="v6-overlay-live-stats">
            <span>♥ {overlayStats.hearts}</span>
            <span>👻 {overlayStats.poeSouls}</span>
            <span>🐜 {overlayStats.goldenBugs}</span>
            <span>{overlayStats.form}</span>
            {overlayStats.contextStat && <span>{overlayStats.contextStat}</span>}
          </div>
        )}
        <div className="presence-strip">
          <span className={`dot ${gameActive ? 'online' : ''}`} />
          <span className="presence-text">{gameActive ? (ramLive ? `${overlayStats.location || ramStage || 'Twilight Princess'} · RAM live` : (presenceMessage || `${companion.routeLabel} · route inference active`)) : (snapshot?.dolphin.running ? 'Dolphin open · no game active' : 'No game active')}</span>
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
  const [page, setPage] = useState<'dashboard' | 'game' | 'achievements' | 'missables' | 'overlay' | 'updates' | 'settings'>('dashboard');
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

  const liveRamDetectsGame = Boolean(
    liveRam?.attached &&
    !liveRam?.stale &&
    String(liveRam?.gameCode || '') === 'GZ2E01',
  );
  const gameActive = Boolean(snapshot?.game?.active || liveRamDetectsGame);
  const effectiveRam = liveRamDetectsGame ? liveRam : snapshot?.ram;
  const ramLive = Boolean(effectiveRam?.attached && !effectiveRam?.stale);
  const serverPresenceMessage = snapshot?.presence?.ok && snapshot?.presence?.currentGameMatches ? snapshot.presence.message : '';
  const fastRamPresence = ramPresenceMessage(effectiveRam);
  const presenceMessage = fastRamPresence || serverPresenceMessage;
  const ramRoom = typeof effectiveRam?.room === 'number' ? effectiveRam.room : null;
  const sessionStats = useMemo(() => liveSessionStats(effectiveRam), [effectiveRam?.timestamp, effectiveRam?.stageCode, effectiveRam?.currentHearts, effectiveRam?.maxHearts, effectiveRam?.poeSouls, effectiveRam?.goldenBugs, effectiveRam?.faronTears, effectiveRam?.storyFlags]);

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
    stateFlags: effectiveRam?.stateFlags,
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

  const achievementStates = useMemo(
    () => buildTwilightAchievementStates(achievements, effectiveRam, companion),
    [achievements, companion, effectiveRam?.timestamp, effectiveRam?.eventBitsHex, effectiveRam?.stateFlags, effectiveRam?.storyFlags, effectiveRam?.actors],
  );
  const broaderCompanion = useMemo(
    () => buildTwilightContext(achievements, presenceMessage, { live: false }),
    [achievements, presenceMessage],
  );

  const liveMissableIds = useMemo(() => new Set(companion.missables.map((a: any) => achievementId(a))), [companion.missables]);
  const comingIds = useMemo(() => new Set(companion.comingUp.map((a: any) => achievementId(a))), [companion.comingUp]);
  const currentIds = useMemo(() => new Set(companion.current.map((a: any) => achievementId(a))), [companion.current]);
  const allMissables = useMemo(() => achievements.filter((a: any) => Boolean(getTwilightMissableGuide(a))), [achievements]);

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
  ]).filter((achievement: any) => !earnedHardcore(achievement) && !isMissableAchievement(achievement));

  const relevantAchievements = uniqueAchievements([
    ...deepLiveAchievements,
    ...companion.missables,
    ...companion.current,
    ...companion.comingUp,
    ...(companion.relevantAll.length ? [] : controlledFallbackAchievements),
  ]).slice(0, 5);

  const deepLiveMissables = deepLiveAchievements.filter((achievement: any) => Boolean(getTwilightMissableGuide(achievement)));
  const whatMattersAchievements = uniqueAchievements([
    ...deepLiveMissables,
    ...companion.missables,
  ]);
  const deepUpcomingMissables = achievements.filter((achievement: any) => {
    const mapped = achievementStates.get(achievementId(achievement));
    return Boolean(getTwilightMissableGuide(achievement) && mapped?.coverage === 'deep' && mapped.kind === 'upcoming' && !earnedHardcore(achievement));
  });
  const upcomingMissables = uniqueAchievements([
    ...companion.comingUp.filter((achievement: any) => Boolean(getTwilightMissableGuide(achievement))),
    ...deepUpcomingMissables,
  ]).filter((achievement: any) => !whatMattersAchievements.some((active: any) => achievementId(active) === achievementId(achievement)));
  const activeMissableCount = whatMattersAchievements.length;
  const currentNextAchievements = uniqueAchievements([
    ...deepLiveAchievements,
    ...companion.missables,
    ...companion.current,
    ...companion.comingUp,
  ]);

  function missableState(achievement: any): TwilightAchievementState {
    const id = achievementId(achievement);
    const mapped = achievementStates.get(id);
    if (mapped) return mapped;
    if (earned(achievement)) return { kind: 'completed', label: 'Completed', tone: 'complete', source: 'ra', coverage: 'tracked' };
    return { kind: gameActive ? 'tracked' : 'waiting', label: gameActive ? 'RAM tracked' : 'Waiting for game state', tone: 'neutral', source: 'context', coverage: 'tracked' };
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

    try {
      const result = await window.raCompanion.saveConfig({ username: requestedUsername, apiKey });
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
      await refresh(true);
      setAccountPhase('connected');
    } catch (err: any) {
      setAccountPhase('error');
      setAccountError(err?.message || 'Could not refresh RetroAchievements progress.');
      clearSnapshot();
    }
  }

  async function disconnectAccount() {
    setAccountError('');
    await window.raCompanion.disconnectAccount();
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
    ['missables', '!', 'Missables'],
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
    effectiveRam,
    gameActive,
    ramLive,
    ramRoom,
    serverPresenceMessage,
    presenceMessage,
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
    achievementCounter,
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
        <div className="v5-brand"><div className="v5-brand-mark">RA</div><div><b>RA Companion</b><span>Live companion for RetroAchievements players</span></div></div>
        <nav>{navItems.map(([id, icon, label]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><span>{icon}</span>{label}{id === 'missables' && activeMissableCount > 0 && <em>{activeMissableCount}</em>}</button>)}</nav>
        <div className="v5-sidebar-footer"><span>Play smarter.</span><small>Live context · guide-backed missables</small><b>{appVersion ? `v${appVersion}` : 'v…'}</b></div>
      </aside>

      <section className="v5-content">
        <UpdateBanner />
        {page === 'dashboard' && <Dashboard />}
        {page === 'game' && <CurrentGamePage />}
        {page === 'achievements' && <AchievementsPage />}
        {page === 'missables' && <MissablesPage />}
        {page === 'overlay' && <OverlayPage />}
        {page === 'updates' && <><header className="v5-page-header"><div><span className="v5-page-icon">↓</span><div><h1>Updates</h1><p>Clear update status, progress and concise release highlights.</p></div></div></header><UpdateCard full /></>}
        {page === 'settings' && <SettingsPage />}
      </section>

      {selectedMissable && (() => {
        const guide = getTwilightMissableGuide(selectedMissable);
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
