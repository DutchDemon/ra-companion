from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read_preserved(path: Path):
    raw = path.read_bytes()
    newline = '\r\n' if b'\r\n' in raw else '\n'
    text = raw.decode('utf-8').replace('\r\n', '\n')
    return text, newline


def write_preserved(path: Path, text: str, newline: str):
    if newline == '\r\n':
        text = text.replace('\n', '\r\n')
    path.write_bytes(text.encode('utf-8'))


# ---------------------------------------------------------------------------
# Unified RetroAchievements setup + runtime diagnostics UI
# ---------------------------------------------------------------------------
app_pages = ROOT / 'app/src/AppPages.tsx'
text, nl = read_preserved(app_pages)
marker = 'export function SettingsPage() {'
if marker not in text:
    raise SystemExit('SettingsPage marker not found')
prefix = text.split(marker, 1)[0]
settings = r'''export function SettingsPage() {
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
    snapshot,
  } = useAppView();
  const [runtimeAuth, setRuntimeAuth] = React.useState<RuntimeAuthStatus | null>(null);
  const [runtimeHelper, setRuntimeHelper] = React.useState<RuntimeHelperStatus | null>(null);
  const [runtimeObserver, setRuntimeObserver] = React.useState<RuntimeObserverSyncStatus | null>(null);
  const [runtimePassword, setRuntimePassword] = React.useState('');
  const [runtimeBusy, setRuntimeBusy] = React.useState(false);
  const [runtimeError, setRuntimeError] = React.useState('');
  const [runtimeMessage, setRuntimeMessage] = React.useState('');

  const webConnected = accountPhase === 'connected' && Boolean(connectedUser);
  const runtimeConnected = Boolean(runtimeAuth?.connected);
  const setupReady = webConnected && runtimeConnected;
  const setupHasError = Boolean(accountError || runtimeError || runtimeHelper?.lastError || runtimeObserver?.error);
  const setupLabel = setupReady ? 'READY' : setupHasError ? 'ATTENTION' : webConnected ? 'SETUP INCOMPLETE' : 'SETUP REQUIRED';
  const setupTone = setupReady ? 'complete' : setupHasError ? 'danger' : webConnected ? 'warning' : 'neutral';
  const richPresenceActive = Boolean(
    snapshot?.runtime?.live?.active &&
    snapshot?.runtime?.live?.richPresenceLoaded &&
    !snapshot?.runtime?.live?.stale &&
    snapshot?.runtime?.live?.richPresence,
  );
  const gameActive = Boolean(snapshot?.game?.active);
  const patchLoaded = runtimeObserver?.phase === 'ready' && Number(runtimeObserver.loadedAchievementCount || 0) > 0;
  const diagnosticError = runtimeError || runtimeObserver?.error || snapshot?.runtime?.live?.lastError || runtimeHelper?.lastError || '';

  async function refreshRuntimeDiagnostics() {
    try {
      const [auth, helper, observer] = await Promise.all([
        window.raCompanion.getRuntimeAuthStatus(),
        window.raCompanion.getRuntimeStatus(),
        window.raCompanion.getRuntimeObserverStatus(),
      ]);
      setRuntimeAuth(auth);
      setRuntimeHelper(helper);
      setRuntimeObserver(observer);
    } catch (runtimeStatusError: any) {
      setRuntimeError(runtimeStatusError?.message || String(runtimeStatusError));
    }
  }

  React.useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const [auth, helper, observer] = await Promise.all([
          window.raCompanion.getRuntimeAuthStatus(),
          window.raCompanion.getRuntimeStatus(),
          window.raCompanion.getRuntimeObserverStatus(),
        ]);
        if (cancelled) return;
        setRuntimeAuth(auth);
        setRuntimeHelper(helper);
        setRuntimeObserver(observer);
      } catch (runtimeStatusError: any) {
        if (!cancelled) setRuntimeError(runtimeStatusError?.message || String(runtimeStatusError));
      }
    }
    refresh();
    const timer = window.setInterval(refresh, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [connectedUser, lastVerifiedAt]);

  async function connectRuntimeData(event: React.FormEvent) {
    event.preventDefault();
    if (runtimeBusy || !webConnected) return;
    setRuntimeBusy(true);
    setRuntimeError('');
    setRuntimeMessage('');
    try {
      const status = await window.raCompanion.loginRuntimeAccount(runtimePassword);
      setRuntimeAuth(status);
      setRuntimeMessage(status.persistent
        ? 'Live runtime enabled. The token is protected with OS-backed encryption.'
        : 'Live runtime enabled for this app session; OS encryption is unavailable.');
      await refreshRuntimeDiagnostics();
    } catch (runtimeLoginError: any) {
      setRuntimeError(runtimeLoginError?.message || String(runtimeLoginError));
    } finally {
      setRuntimePassword('');
      setRuntimeBusy(false);
    }
  }

  async function validateRuntimeData() {
    if (runtimeBusy) return;
    setRuntimeBusy(true);
    setRuntimeError('');
    setRuntimeMessage('');
    try {
      const status = await window.raCompanion.validateRuntimeAccount();
      setRuntimeAuth(status);
      setRuntimeMessage('Runtime token validated with RetroAchievements.');
      await refreshRuntimeDiagnostics();
    } catch (runtimeValidationError: any) {
      setRuntimeAuth(await window.raCompanion.getRuntimeAuthStatus());
      setRuntimeError(runtimeValidationError?.message || String(runtimeValidationError));
    } finally {
      setRuntimeBusy(false);
    }
  }

  async function disconnectRuntimeData() {
    if (runtimeBusy) return;
    setRuntimeBusy(true);
    setRuntimeError('');
    setRuntimeMessage('');
    try {
      setRuntimeAuth(await window.raCompanion.disconnectRuntimeAccount());
      setRuntimeMessage('Live runtime connection removed. Web API progress remains connected.');
      await refreshRuntimeDiagnostics();
    } catch (runtimeDisconnectError: any) {
      setRuntimeError(runtimeDisconnectError?.message || String(runtimeDisconnectError));
    } finally {
      setRuntimeBusy(false);
    }
  }

  function diagnosticValue(ok: boolean | undefined, readyText: string, waitingText: string) {
    if (ok === undefined) return 'Checking…';
    return ok ? readyText : waitingText;
  }

  return (
    <>
      <header className="v5-page-header"><div><span className="v5-page-icon">⚙</span><div><h1>Settings</h1><p>RetroAchievements account, live runtime and companion preferences.</p></div></div></header>

      <article className="v5-panel v5-settings-form v72-ra-setup-card">
        <div className="v5-card-heading v72-setup-heading">
          <div>
            <div className="v5-section-label">RETROACHIEVEMENTS CONNECTION</div>
            <h3>Account & live runtime</h3>
            <small className="v5-muted">One setup flow for official progress, local rcheevos observer data and RA Rich Presence.</small>
          </div>
          <span className={`v5-status-pill ${setupTone}`}>{setupLabel}</span>
        </div>

        <div className="v72-setup-overview" aria-label="RetroAchievements setup status">
          <div className={webConnected ? 'complete' : 'required'}><span>1</span><div><b>RA account</b><small>Official progress & completion authority</small></div><strong>{webConnected ? 'Connected' : 'Required'}</strong></div>
          <div className={runtimeConnected ? 'complete' : webConnected ? 'required' : 'locked'}><span>2</span><div><b>Live runtime</b><small>Official definitions & measured state</small></div><strong>{runtimeConnected ? 'Connected' : webConnected ? 'Required' : 'Locked'}</strong></div>
          <div className={runtimeConnected ? 'complete' : 'locked'}><span>✓</span><div><b>RA Rich Presence</b><small>Evaluated locally through rcheevos</small></div><strong>{richPresenceActive ? 'Active now' : runtimeConnected ? 'Enabled' : 'Unavailable'}</strong></div>
        </div>

        {webConnected && !runtimeConnected && (
          <div className="v72-prereq-callout warning">
            <b>One more step for live Rich Presence</b>
            <span>Enter your RetroAchievements password once below. RA Companion exchanges it for a runtime token and never stores the password.</span>
          </div>
        )}
        {setupReady && (
          <div className="v72-prereq-callout complete">
            <b>RetroAchievements setup complete</b>
            <span>Official progress stays server-authoritative while Rich Presence and live achievement definitions run through the local read-only observer.</span>
          </div>
        )}

        <form className="v72-setup-step" onSubmit={saveSettings}>
          <div className="v72-step-heading"><span>STEP 1</span><div><b>RA account</b><small>Required for official achievement progress and account ownership.</small></div><em className={webConnected ? 'complete' : ''}>{webConnected ? 'Connected' : 'Required'}</em></div>
          <label htmlFor="ra-username">Username<input id="ra-username" name="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Your RA username" /></label>
          <label htmlFor="ra-api-key">Web API key<input id="ra-api-key" name="apiKey" autoComplete="off" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={hasApiKey ? 'Key already stored · enter only to replace' : 'Paste Web API key'} /></label>
          <div className="v72-step-actions">
            <button type="submit" disabled={['saving', 'verifying', 'refreshing'].includes(accountPhase)}>{accountPhase === 'saving' ? 'Saving…' : accountPhase === 'verifying' ? 'Verifying…' : accountPhase === 'refreshing' ? 'Refreshing…' : webConnected ? 'Save account changes' : 'Save & connect'}</button>
            <button type="button" className="secondary" disabled={!hasApiKey || ['saving', 'verifying', 'refreshing'].includes(accountPhase)} onClick={forceRefreshAccount}>Force refresh from RA</button>
          </div>
          <div className="v6-account-facts v72-account-facts">
            <div><span>Connection</span><b>{connectedUser ? `Connected as ${connectedUser}` : 'Not connected'}</b></div>
            <div><span>Progress owner</span><b>{progressOwner || '—'}</b></div>
            <div><span>Last verified</span><b>{lastVerifiedAt ? new Date(lastVerifiedAt).toLocaleString() : '—'}</b></div>
            <div><span>API key</span><b>{hasApiKey ? (apiKeyEncrypted ? 'Stored · encrypted' : 'Stored') : 'Missing'}</b></div>
          </div>
          <div className="v72-manage-row"><small className="v5-muted">Leaving the API key blank keeps the currently stored key.</small><button type="button" className="secondary danger-button" disabled={!hasApiKey && !username} onClick={disconnectAccount}>Disconnect RA account</button></div>
        </form>

        <form className={`v72-setup-step ${!webConnected ? 'locked' : ''}`} onSubmit={connectRuntimeData}>
          <div className="v72-step-heading"><span>STEP 2</span><div><b>Live runtime & Rich Presence</b><small>Required for official local RA Rich Presence, rcheevos definitions and measured achievement state.</small></div><em className={runtimeConnected ? 'complete' : webConnected ? 'required' : ''}>{runtimeConnected ? 'Connected' : webConnected ? 'Required' : 'Locked'}</em></div>
          {!webConnected ? (
            <div className="v72-prereq-callout locked"><b>Complete Step 1 first</b><span>Connect and verify the RA account above before enabling the local runtime.</span></div>
          ) : (
            <>
              <label htmlFor="ra-runtime-password">RA password<input id="ra-runtime-password" name="runtimePassword" autoComplete="current-password" type="password" value={runtimePassword} onChange={(e) => setRuntimePassword(e.target.value)} placeholder={runtimeConnected ? 'Token already stored · enter password only to reconnect' : 'Used once to request a runtime token'} disabled={runtimeBusy} /></label>
              <div className="v72-step-actions">
                <button type="submit" disabled={!runtimePassword || runtimeBusy}>{runtimeBusy ? 'Working…' : runtimeConnected ? 'Reconnect live runtime' : 'Finish setup'}</button>
                <button type="button" className="secondary" disabled={!runtimeConnected || runtimeBusy} onClick={validateRuntimeData}>Validate token</button>
              </div>
              <div className="v6-account-facts v72-account-facts">
                <div><span>Runtime account</span><b>{runtimeConnected ? runtimeAuth?.username : 'Not connected'}</b></div>
                <div><span>Token storage</span><b>{runtimeConnected ? (runtimeAuth?.persistent ? 'OS-encrypted' : 'Memory only') : '—'}</b></div>
                <div><span>Last validated</span><b>{runtimeAuth?.lastValidatedAt ? new Date(runtimeAuth.lastValidatedAt).toLocaleString() : '—'}</b></div>
                <div><span>Authority</span><b>RA server</b></div>
              </div>
              <div className="v72-manage-row"><small className="v5-muted">The password is used only for the one-time <code>login2</code> token exchange and is never stored.</small><button type="button" className="secondary danger-button" disabled={!runtimeConnected || runtimeBusy} onClick={disconnectRuntimeData}>Remove runtime token</button></div>
            </>
          )}
        </form>

        <details className="v72-runtime-diagnostics" open={Boolean(runtimeConnected && diagnosticError)}>
          <summary><span>Runtime & Rich Presence diagnostics</span><small>{diagnosticError ? 'Attention needed' : runtimeConnected ? 'Connection health' : 'Available after setup'}</small></summary>
          <div className="v72-diagnostic-grid">
            <div><span>Runtime authenticated</span><b className={runtimeConnected ? 'good' : 'warning-text'}>{runtimeConnected ? 'Yes' : 'No'}</b></div>
            <div><span>Helper installed</span><b className={runtimeHelper?.available ? 'good' : 'warning-text'}>{diagnosticValue(runtimeHelper?.available, 'Yes', 'No')}</b></div>
            <div><span>Helper running</span><b className={runtimeHelper?.running ? 'good' : 'warning-text'}>{diagnosticValue(runtimeHelper?.running, 'Yes', 'No')}</b></div>
            <div><span>rcheevos ready</span><b className={runtimeHelper?.ready ? 'good' : 'warning-text'}>{diagnosticValue(runtimeHelper?.ready, runtimeHelper?.rcheevosVersion ? `Yes · ${runtimeHelper.rcheevosVersion}` : 'Yes', 'No')}</b></div>
            <div><span>Dolphin attached</span><b className={runtimeHelper?.dolphinAttached ? 'good' : ''}>{runtimeHelper?.dolphinAttached ? `Yes${runtimeHelper.dolphinPid ? ` · PID ${runtimeHelper.dolphinPid}` : ''}` : gameActive ? 'No' : 'Waiting for game'}</b></div>
            <div><span>Official patch loaded</span><b className={patchLoaded ? 'good' : ''}>{patchLoaded ? `${runtimeObserver?.loadedAchievementCount || 0} achievements` : gameActive && runtimeConnected ? (runtimeObserver?.phase || 'Waiting') : 'Waiting for game'}</b></div>
            <div><span>Rich Presence</span><b className={richPresenceActive ? 'good' : ''}>{richPresenceActive ? 'Active' : runtimeConnected ? (gameActive ? 'Waiting / unavailable' : 'Waiting for game') : 'Needs Step 2'}</b></div>
            <div><span>Memory bridge</span><b className={runtimeHelper?.gameCubeMemoryBridge ? 'good' : ''}>{diagnosticValue(runtimeHelper?.gameCubeMemoryBridge, 'Read-only ready', 'Unavailable')}</b></div>
          </div>
          {diagnosticError && <div className="error-card v6-inline-error v72-diagnostic-error"><b>Runtime error</b><span>{diagnosticError}</span></div>}
          <button type="button" className="secondary compact-button" onClick={refreshRuntimeDiagnostics}>Refresh diagnostics</button>
        </details>

        {saved && <div className="saved v72-inline-message">{saved}</div>}
        {accountError && <div className="error-card v6-inline-error">{accountError}</div>}
        {runtimeMessage && <div className="saved v72-inline-message">{runtimeMessage}</div>}
        {runtimeError && <div className="error-card v6-inline-error">{runtimeError}</div>}
      </article>

      {error && <article className="v5-panel error-card">{error}</article>}
    </>
  );
}
'''
write_preserved(app_pages, prefix + settings, nl)


# ---------------------------------------------------------------------------
# Runtime helper diagnostics typing
# ---------------------------------------------------------------------------
global_types = ROOT / 'app/src/global.d.ts'
text, nl = read_preserved(global_types)
old = '''  interface RuntimeHelperStatus {\n    supportedPlatform: boolean;\n    available: boolean;\n    running: boolean;\n    ready: boolean;\n    protocolVersion: number | null;\n    rcheevosVersion: string;\n    rcheevosTag: string;\n    pid: number | null;\n    lastError: string;\n  }'''
new = '''  interface RuntimeHelperStatus {\n    supportedPlatform: boolean;\n    available: boolean;\n    running: boolean;\n    ready: boolean;\n    protocolVersion: number | null;\n    rcheevosVersion: string;\n    rcheevosTag: string;\n    gameCubeMemoryBridge?: boolean;\n    dolphinAttached?: boolean;\n    dolphinPid?: number | null;\n    pid: number | null;\n    lastError: string;\n  }'''
if old not in text:
    raise SystemExit('RuntimeHelperStatus block not found')
write_preserved(global_types, text.replace(old, new, 1), nl)


# ---------------------------------------------------------------------------
# Faron next-story-beat selector: exact RA IDs first, route evidence second.
# ---------------------------------------------------------------------------
faron_path = ROOT / 'app/src/profiles/faronNextStep.ts'
_, nl = read_preserved(faron_path)
faron = r'''import type { TwilightAchievementState } from './twilightPrincessState';

export const FARON_TEAR_ACHIEVEMENT_ID = 416987;
export const FARON_PREVIOUS_STORY_ACHIEVEMENT_ID = 398928;

const FARON_ROUTE_STAGES = new Set(['R_SP107', 'F_SP102', 'F_SP108', 'R_SP108', 'D_SB10']);

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function achievementId(achievement: any) {
  return Number(achievement?.ID ?? achievement?.id ?? 0) || 0;
}

function earnedHardcore(achievement: any) {
  return Boolean(achievement?.DateEarnedHardcore || achievement?.dateEarnedHardcore);
}

function isFaronTearAchievement(achievement: any) {
  if (achievementId(achievement) === FARON_TEAR_ACHIEVEMENT_ID) return true;
  const text = normalize(`${achievement?.Title ?? achievement?.title ?? ''} ${achievement?.Description ?? achievement?.description ?? ''}`);
  return /you unlock this door with the key of imagination/.test(text)
    || (/tears? of light/.test(text) && /return the light to faron/.test(text));
}

function routeHasReachedFaronTwilight(achievements: any[], ram?: Snapshot['ram']) {
  if (!ram) return false;
  if (ram.storyFlags?.faronTwilightStarted === true) return true;
  if (FARON_ROUTE_STAGES.has(String(ram.stageCode || '').trim())) return true;
  return achievements.some((achievement) => achievementId(achievement) === FARON_PREVIOUS_STORY_ACHIEVEMENT_ID && earnedHardcore(achievement));
}

export function isPendingFaronVesselObjective(achievement: any, ram?: Snapshot['ram'], achievements: any[] = [achievement]) {
  if (!ram?.attached || ram?.stale || ram.gameCode !== 'GZ2E01') return false;
  if (!isFaronTearAchievement(achievement) || earnedHardcore(achievement)) return false;
  if (ram.storyFlags?.faronVesselObtained === true) return false;
  if (ram.storyFlags?.forestTempleEntered === true || ram.storyFlags?.forestTempleCleared === true) return false;
  return routeHasReachedFaronTwilight(achievements, ram);
}

export function findPendingFaronVesselObjective(achievements: any[], ram?: Snapshot['ram']) {
  const target = achievements.find((achievement) => achievementId(achievement) === FARON_TEAR_ACHIEVEMENT_ID)
    || achievements.find((achievement) => isFaronTearAchievement(achievement));
  if (!target) return null;
  return isPendingFaronVesselObjective(target, ram, achievements) ? target : null;
}

export function pendingFaronVesselState(): TwilightAchievementState {
  return {
    kind: 'upcoming',
    label: 'Coming soon · Obtain the Vessel of Light',
    tone: 'upcoming',
    source: 'ram',
    coverage: 'deep',
    detail: 'Obtain the Faron Vessel of Light to begin the Tear hunt.',
  };
}
'''
write_preserved(faron_path, faron, nl)


# ---------------------------------------------------------------------------
# v0.7.2 regression coverage
# ---------------------------------------------------------------------------
test_path = ROOT / 'app/src/__tests__/v072.ra-setup-faron.test.ts'
test_path.write_text(r'''import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FARON_PREVIOUS_STORY_ACHIEVEMENT_ID,
  FARON_TEAR_ACHIEVEMENT_ID,
  findPendingFaronVesselObjective,
} from '../profiles/faronNextStep';

function achievement(id: number, title: string, description: string, earned = false) {
  return { ID: id, Title: title, Description: description, Type: 'progression', Points: 5, ...(earned ? { DateEarnedHardcore: '2026-09-15 10:00:00' } : {}) };
}

describe('v0.7.2 unified RA setup and Faron context', () => {
  it('surfaces the exact Faron Tears achievement when the previous progression is earned even if the old twilight flag is false', () => {
    const previous = achievement(FARON_PREVIOUS_STORY_ACHIEVEMENT_ID, 'Courage Need Not Be Remembered', 'Follow the strange little imp to the person she wants you to meet', true);
    const tears = achievement(FARON_TEAR_ACHIEVEMENT_ID, 'You Unlock This Door with the Key of Imagination', 'Collect all the Tears of Light and return the light to Faron');
    const ram: any = {
      attached: true,
      stale: false,
      gameCode: 'GZ2E01',
      stageCode: 'F_SP102',
      storyFlags: {
        faronTwilightStarted: false,
        faronVesselObtained: false,
        forestTempleEntered: false,
        forestTempleCleared: false,
      },
    };

    expect(findPendingFaronVesselObjective([previous, tears], ram)?.ID).toBe(FARON_TEAR_ACHIEVEMENT_ID);
  });

  it('does not surface the pre-vessel fallback before the route begins or after the vessel/Forest Temple transition', () => {
    const tears = achievement(FARON_TEAR_ACHIEVEMENT_ID, 'You Unlock This Door with the Key of Imagination', 'Collect all the Tears of Light and return the light to Faron');
    const baseRam: any = { attached: true, stale: false, gameCode: 'GZ2E01', stageCode: 'F_SP00', storyFlags: {} };
    expect(findPendingFaronVesselObjective([tears], baseRam)).toBeNull();
    expect(findPendingFaronVesselObjective([tears], { ...baseRam, stageCode: 'F_SP108', storyFlags: { faronVesselObtained: true } })).toBeNull();
    expect(findPendingFaronVesselObjective([tears], { ...baseRam, stageCode: 'F_SP108', storyFlags: { forestTempleEntered: true } })).toBeNull();
  });

  it('keeps account and runtime setup in one settings panel with explicit diagnostics', () => {
    const root = path.resolve(__dirname, '..', '..');
    const pages = fs.readFileSync(path.join(root, 'src/AppPages.tsx'), 'utf8');
    const types = fs.readFileSync(path.join(root, 'src/global.d.ts'), 'utf8');

    expect(pages).toContain('RETROACHIEVEMENTS CONNECTION');
    expect(pages).toContain('One more step for live Rich Presence');
    expect(pages).toContain('Live runtime & Rich Presence');
    expect(pages).toContain('Runtime & Rich Presence diagnostics');
    expect(pages).toContain('Helper installed');
    expect(pages).toContain('rcheevos ready');
    expect(pages).toContain('Official patch loaded');
    expect(pages).toContain('Rich Presence');
    expect(types).toContain('dolphinAttached?: boolean');
    expect(types).toContain('gameCubeMemoryBridge?: boolean');
  });
});
''', encoding='utf-8')


# ---------------------------------------------------------------------------
# Styling - append-only to avoid disturbing historical CSS line endings.
# ---------------------------------------------------------------------------
css_path = ROOT / 'app/src/styles.css'
css, nl = read_preserved(css_path)
css_marker = '/* v0.7.2 unified RA setup */'
if css_marker not in css:
    css += r'''

/* v0.7.2 unified RA setup */
.v72-ra-setup-card { display: flex; flex-direction: column; gap: 18px; }
.v72-setup-heading { align-items: flex-start; margin-bottom: 0; }
.v72-setup-heading h3 { margin-bottom: 5px; }
.v72-setup-overview { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.v72-setup-overview > div { min-height: 74px; display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 12px; border: 1px solid rgba(144,170,197,.14); border-radius: 12px; background: rgba(7,11,16,.28); }
.v72-setup-overview > div > span { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 50%; background: #18212b; color: #91a2b5; font-size: 11px; font-weight: 900; }
.v72-setup-overview > div > div { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.v72-setup-overview b { font-size: 12px; }
.v72-setup-overview small { color: #7f91a4; font-size: 10px; line-height: 1.35; }
.v72-setup-overview strong { font-size: 10px; text-transform: uppercase; letter-spacing: .7px; color: #8293a6; }
.v72-setup-overview > div.complete { border-color: rgba(90,240,166,.28); background: rgba(90,240,166,.05); }
.v72-setup-overview > div.complete > span, .v72-step-heading em.complete { color: #5af0a6; }
.v72-setup-overview > div.complete strong { color: #5af0a6; }
.v72-setup-overview > div.required { border-color: rgba(255,210,120,.28); background: rgba(255,210,120,.05); }
.v72-setup-overview > div.required strong, .v72-step-heading em.required { color: #ffd278; }
.v72-setup-overview > div.locked { opacity: .58; }
.v72-prereq-callout { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border-radius: 11px; border: 1px solid rgba(144,170,197,.14); font-size: 12px; line-height: 1.45; }
.v72-prereq-callout span { color: #8fa1b4; }
.v72-prereq-callout.warning { border-color: rgba(255,210,120,.28); background: rgba(255,210,120,.06); }
.v72-prereq-callout.warning b { color: #ffd278; }
.v72-prereq-callout.complete { border-color: rgba(90,240,166,.28); background: rgba(90,240,166,.05); }
.v72-prereq-callout.complete b { color: #5af0a6; }
.v72-prereq-callout.locked { background: rgba(255,255,255,.025); }
.v72-setup-step { display: flex; flex-direction: column; gap: 12px; padding-top: 18px; border-top: 1px solid rgba(144,170,197,.14); }
.v72-setup-step.locked { opacity: .72; }
.v72-step-heading { display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 11px; }
.v72-step-heading > span { color: #6ee7ff; font-size: 9px; font-weight: 900; letter-spacing: 1.2px; }
.v72-step-heading > div { display: flex; flex-direction: column; gap: 3px; }
.v72-step-heading > div b { font-size: 14px; }
.v72-step-heading > div small { color: #8293a6; font-size: 10px; }
.v72-step-heading em { font-style: normal; text-transform: uppercase; letter-spacing: .7px; color: #8293a6; font-size: 9px; font-weight: 900; }
.v72-step-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.v72-step-actions button { width: auto; margin: 0; }
.v72-account-facts { margin-top: 2px; }
.v72-manage-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-top: 4px; }
.v72-manage-row button { width: auto; flex: 0 0 auto; }
.v72-runtime-diagnostics { padding-top: 16px; border-top: 1px solid rgba(144,170,197,.14); }
.v72-runtime-diagnostics summary { cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 14px; list-style: none; font-weight: 800; }
.v72-runtime-diagnostics summary::-webkit-details-marker { display: none; }
.v72-runtime-diagnostics summary small { color: #8293a6; font-weight: 600; }
.v72-diagnostic-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 14px 0 12px; }
.v72-diagnostic-grid > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid rgba(144,170,197,.12); border-radius: 10px; background: rgba(7,11,16,.25); }
.v72-diagnostic-grid span { color: #8293a6; font-size: 10px; }
.v72-diagnostic-grid b { text-align: right; font-size: 11px; }
.v72-diagnostic-grid b.good { color: #5af0a6; }
.v72-diagnostic-error { display: flex; flex-direction: column; gap: 4px; margin: 0 0 12px; }
.v72-inline-message.saved { position: static; align-self: stretch; padding: 10px 12px; border-radius: 10px; background: rgba(90,240,166,.06); }
@media (max-width: 1100px) {
  .v72-setup-overview { grid-template-columns: 1fr; }
  .v72-diagnostic-grid { grid-template-columns: 1fr; }
  .v72-manage-row { align-items: flex-start; flex-direction: column; }
}
'''
write_preserved(css_path, css, nl)


# ---------------------------------------------------------------------------
# Validation workflow
# ---------------------------------------------------------------------------
workflow = ROOT / '.github/workflows/v072-ra-setup-faron.yml'
workflow.write_text(r'''name: v0.7.2 RA Setup + Faron Validation

on:
  push:
    branches:
      - feature/v0.7.2-ra-setup-faron-diagnostics
    paths:
      - 'app/**'
      - 'scripts/test-*.cjs'
      - '.github/workflows/v072-ra-setup-faron.yml'
  pull_request:
    branches: [main]
    paths:
      - 'app/**'
      - 'scripts/test-*.cjs'
      - '.github/workflows/v072-ra-setup-faron.yml'

permissions:
  contents: read

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: app/package-lock.json
      - name: Install dependencies
        working-directory: app
        run: npm ci
      - name: v0.7.2 focused regression
        working-directory: app
        run: npx vitest run src/__tests__/v072.ra-setup-faron.test.ts --environment jsdom
      - name: TypeScript
        working-directory: app
        run: npm run typecheck
      - name: Full renderer regressions
        working-directory: app
        run: npm run test:regressions
      - name: Runtime data service regression
        run: node scripts/test-ra-runtime-data-service.cjs
      - name: Observer runtime regression
        run: node scripts/test-observer-runtime-service.cjs
      - name: Rich Presence UI contract
        run: node scripts/test-rich-presence-ui-contract.cjs
      - name: Live counter contract
        run: node scripts/test-live-achievement-counters.cjs
      - name: Authority and forbidden-endpoint guard
        shell: bash
        run: |
          set -euo pipefail
          grep -Fq 'const progress = baseProgress;' app/electron/main.cjs
          ! grep -R -nE "r: ['\"](startsession|ping|awardachievement|submitlbentry)['\"]" app/electron native/rcheevos-runtime-helper
      - name: Production build
        working-directory: app
        run: npm run build
''', encoding='utf-8')

print('v0.7.2 patch prepared')
