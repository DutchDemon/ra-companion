from pathlib import Path


def read(path):
    with open(path, 'r', encoding='utf-8', newline='') as handle:
        return handle.read()


def write(path, text):
    with open(path, 'w', encoding='utf-8', newline='') as handle:
        handle.write(text)


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one anchor, got {count}')
    return text.replace(old, new, 1)


# Expose the already-sampled observer live state to the renderer snapshot.
p = 'app/electron/main.cjs'
text = read(p)
text = replace_once(
    text,
    "runtime: { auth: runtimeAuth, observer: getRuntimeObserverSyncStatus() },",
    "runtime: { auth: runtimeAuth, observer: getRuntimeObserverSyncStatus(), live: observerRuntimeService.getLiveState() },",
    f'{p} inactive runtime snapshot',
)
text = replace_once(
    text,
    "runtime: { auth: getRuntimeAuthStatus(), observer: getRuntimeObserverSyncStatus() },",
    "runtime: { auth: getRuntimeAuthStatus(), observer: getRuntimeObserverSyncStatus(), live: runtimeLive },",
    f'{p} active runtime snapshot',
)
write(p, text)


# Type the observer live/measured status surface.
p = 'app/src/global.d.ts'
text = read(p)
anchor = """  interface RuntimeObserverSyncStatus {
    phase: 'idle' | 'disconnected' | 'fetching' | 'loading' | 'ready' | 'error' | string;
    gameId: number | null;
    gameCode: string;
    title: string;
    loadedAchievementCount: number;
    excludedAchievementCount: number;
    dolphinPid: number | null;
    error: string;
    observerOnly: true;
    officialCompletionAuthority: 'retroachievements-server';
  }
"""
addition = anchor + """
  interface RuntimeAchievementStatus {
    ok?: boolean;
    achievementId: number;
    state: string;
    hasHits?: boolean;
    measured: boolean;
    measuredValue: number;
    measuredTarget: number;
    measuredText: string;
    observerOnly?: true;
    officialCompletionAuthority?: 'retroachievements-server';
  }

  interface RuntimeObserverLiveState {
    active: boolean;
    sampling: boolean;
    gameId: number | null;
    gameCode: string;
    helperPid: number | null;
    targetHz: number;
    effectiveHz: number;
    frameCount: number;
    startedAt: number;
    lastFrameAt: number;
    lastEventAt: number;
    lastFrameDurationMs: number;
    ageMs: number | null;
    stale: boolean;
    richPresence: string;
    richPresenceUpdatedAt: number;
    richPresenceAgeMs: number | null;
    richPresenceLoaded: boolean;
    statusCount: number;
    measuredAchievementCount: number;
    statuses: RuntimeAchievementStatus[];
    recentEvents: Array<{ achievementId: number; type: string; value: number; timestamp: number }>;
    lastError: string;
    observerOnly: true;
    officialCompletionAuthority: 'retroachievements-server';
  }
"""
text = replace_once(text, anchor, addition, f'{p} live types')
text = replace_once(
    text,
    """    runtime?: {
      auth: RuntimeAuthStatus;
      observer: RuntimeObserverSyncStatus;
    };""",
    """    runtime?: {
      auth: RuntimeAuthStatus;
      observer: RuntimeObserverSyncStatus;
      live: RuntimeObserverLiveState;
    };""",
    f'{p} snapshot runtime type',
)
write(p, text)


# Prefer live local rcheevos measured state, then Web API measured fields, then RAM heuristics.
p = 'app/src/profiles/registry.ts'
text = read(p)
text = replace_once(
    text,
    """export type AchievementCounter = {
  current: number;
  target: number;
  label: string;
  source: 'ram' | 'ra';
};""",
    """export type AchievementCounter = {
  current: number;
  target: number;
  label: string;
  source: 'rcheevos' | 'ram' | 'ra';
  text?: string;
};""",
    f'{p} counter source type',
)
measured_anchor = """function measuredAchievementCounter(achievement: any): AchievementCounter | null {
"""
runtime_counter = """function runtimeMeasuredAchievementCounter(achievement: any, runtimeLive?: RuntimeObserverLiveState): AchievementCounter | null {
  if (!runtimeLive?.active || runtimeLive.stale) return null;
  const achievementId = Number(achievement?.ID ?? achievement?.id ?? 0);
  if (!Number.isInteger(achievementId) || achievementId <= 0) return null;
  const status = runtimeLive.statuses?.find((item) => Number(item?.achievementId || 0) === achievementId);
  if (!status?.measured) return null;
  const current = Number(status.measuredValue);
  const target = Number(status.measuredTarget);
  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) return null;
  return {
    current: Math.max(0, Math.min(current, target)),
    target,
    label: 'RA measured',
    source: 'rcheevos',
    text: String(status.measuredText || '').trim(),
  };
}

""" + measured_anchor
text = replace_once(text, measured_anchor, runtime_counter, f'{p} runtime measured helper')
text = replace_once(
    text,
    """export function achievementCounterForProfile(profile: RendererGameProfile | null | undefined, achievement: any, ram?: Snapshot['ram']): AchievementCounter | null {
  return measuredAchievementCounter(achievement) || profile?.getRamCounter?.(achievement, ram) || null;
}""",
    """export function achievementCounterForProfile(profile: RendererGameProfile | null | undefined, achievement: any, ram?: Snapshot['ram'], runtimeLive?: RuntimeObserverLiveState): AchievementCounter | null {
  return runtimeMeasuredAchievementCounter(achievement, runtimeLive)
    || measuredAchievementCounter(achievement)
    || profile?.getRamCounter?.(achievement, ram)
    || null;
}""",
    f'{p} counter priority',
)
write(p, text)


# Renderer: thread runtime measured progress into rows, session cards and floating overlay.
p = 'app/src/main.tsx'
text = read(p)
text = replace_once(
    text,
    """function achievementCounter(achievement: any, ram?: Snapshot['ram'], profile: RendererGameProfile | null = getGameProfileForRam(ram)): AchievementCounter | null {
  return achievementCounterForProfile(profile, achievement, ram);
}
""",
    """function achievementCounter(achievement: any, ram?: Snapshot['ram'], profile: RendererGameProfile | null = getGameProfileForRam(ram), runtimeLive?: RuntimeObserverLiveState): AchievementCounter | null {
  return achievementCounterForProfile(profile, achievement, ram, runtimeLive);
}

type LiveAchievementCounterItem = { achievement: any; counter: AchievementCounter };

function normalizeCounterContext(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

function selectLiveAchievementCounters(
  achievements: any[],
  counterFor: (achievement: any) => AchievementCounter | null,
  relevantIds: Set<string>,
  contextLabel: string,
  limit = 4,
): LiveAchievementCounterItem[] {
  const context = normalizeCounterContext(contextLabel);
  return achievements
    .filter((achievement) => !earnedHardcore(achievement))
    .map((achievement) => {
      const counter = counterFor(achievement);
      if (!counter || counter.target <= 0) return null;
      const id = achievementId(achievement);
      const text = normalizeCounterContext(`${achievement?.Title ?? achievement?.title ?? ''} ${achievement?.Description ?? achievement?.description ?? ''}`);
      const relevant = relevantIds.has(id);
      const contextMatch = Boolean(context && context.length >= 4 && text.includes(context));
      if (counter.current <= 0 && !relevant && !contextMatch) return null;
      const ratio = Math.max(0, Math.min(1, counter.current / counter.target));
      const score = (counter.current >= counter.target ? 160 : counter.current > 0 ? 120 : 0)
        + (relevant ? 90 : 0)
        + (contextMatch ? 70 : 0)
        + (counter.source === 'rcheevos' ? 40 : counter.source === 'ra' ? 20 : 10)
        + ratio;
      return { achievement, counter, score };
    })
    .filter(Boolean)
    .sort((left: any, right: any) => right.score - left.score)
    .slice(0, Math.max(1, limit))
    .map(({ achievement, counter }: any) => ({ achievement, counter }));
}
""",
    f'{p} counter helpers',
)

text = replace_once(
    text,
    """function OverlayAchievement({ achievement, ram, state, profile }: { achievement: any; ram?: Snapshot['ram']; state?: GameAchievementState; profile?: RendererGameProfile | null }) {
  const counter = state?.progress || achievementCounter(achievement, ram, profile || null);""",
    """function OverlayAchievement({ achievement, ram, state, profile, runtimeLive }: { achievement: any; ram?: Snapshot['ram']; state?: GameAchievementState; profile?: RendererGameProfile | null; runtimeLive?: RuntimeObserverLiveState }) {
  const counter = achievementCounter(achievement, ram, profile || null, runtimeLive) || state?.progress;""",
    f'{p} overlay achievement counter',
)
text = replace_once(
    text,
    """function OverlaySection({ kind, title, achievements, ram, states, profile }: { kind: string; title: string; achievements: any[]; ram?: Snapshot['ram']; states?: Map<string, GameAchievementState>; profile?: RendererGameProfile | null }) {
  if (!achievements.length) return null;
  return (
    <section className={`context-section ${kind}`}>
      <div className="context-section-title"><span>{title}</span><small>{achievements.length}</small></div>
      {achievements.map((achievement) => <OverlayAchievement key={achievementId(achievement)} achievement={achievement} ram={ram} state={states?.get(achievementId(achievement))} profile={profile} />)}
    </section>
  );
}""",
    """function OverlaySection({ kind, title, achievements, ram, states, profile, runtimeLive }: { kind: string; title: string; achievements: any[]; ram?: Snapshot['ram']; states?: Map<string, GameAchievementState>; profile?: RendererGameProfile | null; runtimeLive?: RuntimeObserverLiveState }) {
  if (!achievements.length) return null;
  return (
    <section className={`context-section ${kind}`}>
      <div className="context-section-title"><span>{title}</span><small>{achievements.length}</small></div>
      {achievements.map((achievement) => <OverlayAchievement key={achievementId(achievement)} achievement={achievement} ram={ram} state={states?.get(achievementId(achievement))} profile={profile} runtimeLive={runtimeLive} />)}
    </section>
  );
}""",
    f'{p} overlay section runtime live',
)

# There are two source-priority blocks: floating overlay first, main app second.
presence_anchor = """  const presenceMessage = officialPresenceMessage || fastRamPresence || fallbackSnapshotPresence;
  const presenceSource = officialPresenceMessage ? 'rcheevos-runtime' : fastRamPresence ? 'ram' : fallbackSnapshotPresence ? (snapshot?.presence?.source || 'retro-achievements') : 'none';"""
if text.count(presence_anchor) != 2:
    raise SystemExit(f'{p}: expected two presence source blocks, got {text.count(presence_anchor)}')
text = text.replace(presence_anchor, presence_anchor + "\n  const runtimeLive = snapshot?.runtime?.live;", 2)

context_ids_anchor = """  const contextIds = useMemo(() => new Set(companion.relevantAll.map(achievementId)), [companion.relevantAll]);
"""
overlay_live_counters = context_ids_anchor + """  const liveAchievementCounters = useMemo(() => {
    const relevantIds = new Set([
      ...companion.missables,
      ...companion.current,
      ...companion.comingUp,
      ...companion.relevantAll,
    ].map(achievementId));
    return selectLiveAchievementCounters(
      achievements,
      (achievement) => achievementCounter(achievement, effectiveRam, activeProfile, runtimeLive),
      relevantIds,
      companion.context.label || effectiveRam?.stageName || '',
      3,
    );
  }, [achievements, companion, effectiveRam?.timestamp, runtimeLive?.lastFrameAt, runtimeLive?.stale]);
"""
text = replace_once(text, context_ids_anchor, overlay_live_counters, f'{p} overlay live counter selection')

rp_overlay_anchor = """        {gameActive && presenceMessage && (
          <div className="v7-overlay-rich-presence" aria-live="polite">
            <span>{snapshot?.presence?.source === 'rcheevos-runtime' ? 'RA RICH PRESENCE' : 'LIVE CONTEXT'}</span>
            <b>{presenceMessage}</b>
          </div>
        )}
"""
rp_overlay_addition = rp_overlay_anchor + """
        {gameActive && liveAchievementCounters.length > 0 && (
          <div className="v7-overlay-live-counters" aria-live="polite">
            <div className="v7-live-counter-heading"><span>LIVE ACHIEVEMENT PROGRESS</span><small>{runtimeLive?.measuredAchievementCount ? `${runtimeLive.measuredAchievementCount} measured` : 'live'}</small></div>
            {liveAchievementCounters.map(({ achievement, counter }) => {
              const pct = Math.max(0, Math.min(100, (counter.current / counter.target) * 100));
              return (
                <div className="v7-overlay-counter" key={achievementId(achievement)}>
                  <div><b>{achievement.Title || achievement.title}</b><strong>{counter.current} / {counter.target}</strong></div>
                  <div className="v7-live-counter-track"><i style={{ width: `${pct}%` }} /></div>
                  <small>{counter.source === 'rcheevos' ? 'RA measured · rcheevos' : counter.source === 'ram' ? 'RAM live fallback' : 'RA progress'}</small>
                </div>
              );
            })}
          </div>
        )}
"""
text = replace_once(text, rp_overlay_anchor, rp_overlay_addition, f'{p} overlay live counter markup')

for old in [
    '<OverlaySection profile={activeProfile} kind="danger"',
    '<OverlaySection profile={activeProfile} kind="current" title={companion.context.boss',
    '<OverlaySection profile={activeProfile} kind="coming" title="◉ Next Story Beat"',
    '<OverlaySection profile={activeProfile} kind="coming" title="◉ Story / RA context"',
    '<OverlaySection profile={activeProfile} kind="current" title="◈ Live RAM Opportunity"',
]:
    if old not in text:
        raise SystemExit(f'{p}: missing OverlaySection call anchor: {old}')
    text = text.replace(old, old.replace('<OverlaySection profile={activeProfile}', '<OverlaySection runtimeLive={runtimeLive} profile={activeProfile}'), 1)

# Main-app live counter selector and wrapper.
session_stats_anchor = """  const sessionStats = useMemo(() => liveSessionStats(effectiveRam, activeProfile), [effectiveRam?.timestamp, effectiveRam?.stageCode, effectiveRam?.currentHearts, effectiveRam?.maxHearts, effectiveRam?.poeSouls, effectiveRam?.goldenBugs, effectiveRam?.faronTears, effectiveRam?.storyFlags]);
"""
session_stats_addition = session_stats_anchor + """  const currentAchievementCounter = (achievement: any, ram: Snapshot['ram'] | undefined = effectiveRam, useRuntime = true) =>
    achievementCounter(achievement, ram, activeProfile, useRuntime ? runtimeLive : undefined);
"""
text = replace_once(text, session_stats_anchor, session_stats_addition, f'{p} current counter wrapper')

text = replace_once(
    text,
    """    const measured = achievementCounter(achievement, undefined);
""",
    """    const measured = currentAchievementCounter(achievement, isCurrent ? effectiveRam : undefined, isCurrent);
""",
    f'{p} list state measured source',
)

current_next_anchor = """  const currentNextAchievements = uniqueAchievements([
    ...deepLiveAchievements,
    ...companion.missables,
    ...companion.current,
    ...companion.comingUp,
  ]);
"""
current_next_addition = current_next_anchor + """
  const liveAchievementCounters = useMemo(() => {
    const relevantIds = new Set([
      ...currentNextAchievements,
      ...relevantAchievements,
    ].map(achievementId));
    return selectLiveAchievementCounters(
      achievements,
      (achievement) => currentAchievementCounter(achievement, effectiveRam, true),
      relevantIds,
      companion.context.label || effectiveRam?.stageName || '',
      4,
    );
  }, [achievements, currentNextAchievements, relevantAchievements, companion.context.label, effectiveRam?.timestamp, effectiveRam?.stageName, runtimeLive?.lastFrameAt, runtimeLive?.stale]);
"""
text = replace_once(text, current_next_anchor, current_next_addition, f'{p} main live counter selection')

text = replace_once(
    text,
    """    sessionStats,
    username,""",
    """    sessionStats,
    liveAchievementCounters,
    username,""",
    f'{p} app view live counters',
)
text = replace_once(
    text,
    """    missableState,
    achievementCounter,
    saveSettings,""",
    """    missableState,
    achievementCounter: currentAchievementCounter,
    saveSettings,""",
    f'{p} app view counter wrapper',
)
write(p, text)


# Main window dashboard/current-game reusable live progress cards.
p = 'app/src/AppPages.tsx'
text = read(p)
component_anchor = """export function MissableRow({ achievement }: { achievement: any }) {
"""
component = """function LiveAchievementCounterList({ items, compact = false }: { items: Array<{ achievement: any; counter: any }>; compact?: boolean }) {
  if (!items.length) return null;
  return (
    <div className={`v7-live-counter-list ${compact ? 'compact' : ''}`}>
      {items.map(({ achievement, counter }) => {
        const pct = Math.max(0, Math.min(100, (Number(counter.current) / Number(counter.target)) * 100));
        return (
          <div className="v7-live-counter-card" key={achievementId(achievement)}>
            <div className="v7-live-counter-row">
              <b>{achievement.Title || achievement.title}</b>
              <strong>{counter.current} / {counter.target}</strong>
            </div>
            <div className="v7-live-counter-track"><i style={{ width: `${pct}%` }} /></div>
            <small>{counter.source === 'rcheevos' ? 'RA measured · rcheevos' : counter.source === 'ram' ? 'RAM live fallback' : 'RA progress'}</small>
          </div>
        );
      })}
    </div>
  );
}

""" + component_anchor
text = replace_once(text, component_anchor, component, f'{p} live counter component')

text = replace_once(
    text,
    """  const counter = state.progress || achievementCounter(achievement, isCurrentGame ? effectiveRam : undefined);""",
    """  const counter = achievementCounter(achievement, isCurrentGame ? effectiveRam : undefined, isCurrentGame) || state.progress;""",
    f'{p} row live counter priority',
)

text = replace_once(
    text,
    """    sessionStats,
    presenceMessage,
    setPage,""",
    """    sessionStats,
    presenceMessage,
    liveAchievementCounters,
    setPage,""",
    f'{p} dashboard destructure',
)
hero_end_anchor = """          </div>
          <div className="v5-session-chips">
"""
hero_counter_addition = """          </div>
          {gameActive && liveAchievementCounters.length > 0 && (
            <div className="v7-session-counter-block">
              <div className="v7-live-counter-heading"><span>LIVE ACHIEVEMENT PROGRESS</span><small>Read-only measured state</small></div>
              <LiveAchievementCounterList items={liveAchievementCounters.slice(0, 3)} compact />
            </div>
          )}
          <div className="v5-session-chips">
"""
text = replace_once(text, hero_end_anchor, hero_counter_addition, f'{p} dashboard live counter block')

text = replace_once(
    text,
    """    serverPresenceMessage,
    currentNextAchievements,
  } = useAppView();""",
    """    serverPresenceMessage,
    currentNextAchievements,
    liveAchievementCounters,
  } = useAppView();""",
    f'{p} current game destructure',
)
current_panel_anchor = """          <article className="v5-panel">
            <div className="v5-section-label">CURRENT & NEXT</div>
"""
current_panel_addition = """          {gameActive && liveAchievementCounters.length > 0 && (
            <article className="v5-panel v7-live-progress-panel">
              <div className="v5-card-heading"><div><div className="v5-section-label">LIVE ACHIEVEMENT PROGRESS</div><h3>Measured directly from the local read-only rcheevos runtime when available.</h3></div><span className="v5-status-pill complete">LIVE</span></div>
              <LiveAchievementCounterList items={liveAchievementCounters} />
            </article>
          )}
          <article className="v5-panel">
            <div className="v5-section-label">CURRENT & NEXT</div>
"""
text = replace_once(text, current_panel_anchor, current_panel_addition, f'{p} current game live counter panel')
write(p, text)


# Styling for session/current-game/floating-overlay progress counters.
p = 'app/src/styles.css'
text = read(p)
css = """

/* v0.7.0 — live measured achievement counters */
.v7-session-counter-block { margin: 2px 18px 12px; padding: 10px 12px; border: 1px solid rgba(110,231,255,.14); border-radius: 11px; background: rgba(110,231,255,.035); }
.v7-live-counter-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 7px; }
.v7-live-counter-heading > span { color: #6ee7ff; font-size: 8px; font-weight: 900; letter-spacing: 1.05px; }
.v7-live-counter-heading > small { color: #8295a5; font-size: 9px; font-weight: 700; }
.v7-live-counter-list { display: grid; gap: 8px; }
.v7-live-counter-list.compact { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.v7-live-counter-card { min-width: 0; padding: 9px 10px; border: 1px solid rgba(255,255,255,.075); border-radius: 9px; background: rgba(18,18,18,.56); }
.v7-live-counter-row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.v7-live-counter-row b { min-width: 0; color: #f2f7fb; font-size: 11px; font-weight: 780; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v7-live-counter-row strong { color: #6ee7ff; font-size: 11px; white-space: nowrap; }
.v7-live-counter-card > small { display: block; margin-top: 5px; color: #778b9c; font-size: 9px; }
.v7-live-counter-track { height: 4px; margin-top: 7px; overflow: hidden; border-radius: 999px; background: rgba(255,255,255,.07); }
.v7-live-counter-track > i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #38bdf8, #6ee7ff); }
.v7-live-progress-panel .v5-card-heading { margin-bottom: 10px; }
.v7-live-progress-panel h3 { max-width: 680px; font-size: 13px; }
.v7-overlay-live-counters { margin: 0 0 9px; padding: 8px 9px; border: 1px solid rgba(110,231,255,.13); border-radius: 10px; background: rgba(110,231,255,.035); display: grid; gap: 6px; }
.v7-overlay-live-counters .v7-live-counter-heading { margin-bottom: 1px; }
.v7-overlay-counter { display: grid; gap: 4px; }
.v7-overlay-counter > div:first-child { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.v7-overlay-counter b { min-width: 0; color: #e8f1f7; font-size: 9px; font-weight: 760; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v7-overlay-counter strong { color: #6ee7ff; font-size: 9px; white-space: nowrap; }
.v7-overlay-counter > small { color: #708392; font-size: 8px; }
.overlay-shell.compact .v7-overlay-live-counters { padding: 6px 7px; gap: 5px; }
.overlay-shell.compact .v7-overlay-live-counters .v7-overlay-counter:nth-of-type(n+3) { display: none; }
@media (max-width: 1180px) { .v7-live-counter-list.compact { grid-template-columns: 1fr; } }
"""
if '/* v0.7.0 — live measured achievement counters */' in text:
    raise SystemExit(f'{p}: live counter CSS already present')
text += css
write(p, text)


# Remove the temporary patch machinery from the committed product diff.
Path('.github/workflows/apply-live-achievement-counters.yml').unlink(missing_ok=True)
Path('scripts/apply-live-achievement-counters.py').unlink(missing_ok=True)
