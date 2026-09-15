from pathlib import Path


def load(path):
    p = Path(path)
    raw = p.read_bytes()
    text = raw.decode('utf-8')
    nl = '\r\n' if raw.count(b'\r\n') > raw.count(b'\n') / 2 else '\n'
    return p, text, nl


def save(p, text):
    p.write_bytes(text.encode('utf-8'))


def with_nl(text, nl):
    return text.replace('\n', nl)


# Renderer app: make account save return success and dedupe Current/Next.
p, text, nl = load('app/src/main.tsx')
start = text.index(with_nl('  async function saveSettings(', nl))
end = text.index(with_nl('\n\n  async function forceRefreshAccount', nl), start)
block = text[start:end]
old = with_nl('''  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();''', nl)
new = with_nl('''  async function saveSettings(e?: React.FormEvent) {
    e?.preventDefault();''', nl)
if old not in block:
    raise SystemExit('saveSettings signature anchor missing')
block = block.replace(old, new, 1)
old = with_nl("""      setSaved('Connected');
      window.setTimeout(() => setSaved(''), 1600);
    } catch (err: any) {""", nl)
new = with_nl("""      setSaved('Connected');
      window.setTimeout(() => setSaved(''), 1600);
      return true;
    } catch (err: any) {""", nl)
if old not in block:
    raise SystemExit('saveSettings success anchor missing')
block = block.replace(old, new, 1)
old = with_nl("""      clearSnapshot();
    }
  }""", nl)
new = with_nl("""      clearSnapshot();
      return false;
    }
  }""", nl)
if old not in block:
    raise SystemExit('saveSettings failure anchor missing')
block = block.replace(old, new, 1)
text = text[:start] + block + text[end:]

anchor = with_nl('''  const contextPct = contextTotal ? Math.round((contextUnlocked / contextTotal) * 100) : 0;
''', nl)
addition = with_nl('''  const contextPct = contextTotal ? Math.round((contextUnlocked / contextTotal) * 100) : 0;
  const currentStoryIds = new Set(companion.current.map(achievementId));
  const nextStoryAchievements = uniqueAchievements([
    ...(pendingFaronVesselAchievement ? [pendingFaronVesselAchievement] : []),
    ...companion.comingUp,
  ])
    .filter((achievement: any) => !currentStoryIds.has(achievementId(achievement)))
    .slice(0, 1);
''', nl)
if anchor not in text:
    raise SystemExit('contextPct anchor missing')
text = text.replace(anchor, addition, 1)
old = with_nl('''<OverlaySection runtimeLive={runtimeLive} profile={activeProfile} kind="coming" title="◉ Next Story Beat" achievements={pendingFaronVesselAchievement ? [pendingFaronVesselAchievement] : companion.comingUp} ram={effectiveRam} states={achievementStates} />''', nl)
new = with_nl('''<OverlaySection runtimeLive={runtimeLive} profile={activeProfile} kind="coming" title="◉ Next Story Beat" achievements={nextStoryAchievements} ram={effectiveRam} states={achievementStates} />''', nl)
if old not in text:
    raise SystemExit('Next Story Beat render anchor missing')
text = text.replace(old, new, 1)
old = with_nl('''!companion.missables.length && !companion.current.length && !companion.comingUp.length && !pendingFaronVesselAchievement && !fallbackAchievements.length && !deepLiveAchievements.length''', nl)
new = with_nl('''!companion.missables.length && !companion.current.length && !nextStoryAchievements.length && !fallbackAchievements.length && !deepLiveAchievements.length''', nl)
if old not in text:
    raise SystemExit('overlay empty-state anchor missing')
text = text.replace(old, new, 1)
save(p, text)


# Runtime helper: consume pipe errors and make writes/shutdown race-safe.
p, text, nl = load('app/electron/services/runtime-helper-service.cjs')
anchor = with_nl("""  let child = null;
  let stdoutBuffer = '';""", nl)
repl = with_nl("""  let child = null;
  let stoppingChild = null;
  let stdoutBuffer = '';""", nl)
if anchor not in text:
    raise SystemExit('runtime child anchor missing')
text = text.replace(anchor, repl, 1)

anchor = with_nl('''  function rejectPending(error) {
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  }
''', nl)
repl = with_nl('''  function rejectPending(error) {
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  }

  function isPipeClosureError(error) {
    const code = String(error?.code || '');
    return code === 'EPIPE' || code === 'ERR_STREAM_DESTROYED' || code === 'ERR_STREAM_WRITE_AFTER_END';
  }

  function handlePipeFailure(spawned, error) {
    const expectedStop = stoppingChild === spawned;
    if (child !== spawned && !expectedStop) return;

    if (child === spawned) child = null;
    if (expectedStop) stoppingChild = null;
    const normalizedError = error instanceof Error ? error : new Error(String(error || 'Runtime helper pipe closed.'));
    state = {
      ...state,
      running: false,
      ready: false,
      dolphinAttached: false,
      dolphinPid: null,
      pid: null,
      lastError: expectedStop
        ? state.lastError
        : isPipeClosureError(normalizedError)
          ? 'Runtime helper connection closed. It will reconnect automatically.'
          : normalizedError.message,
    };
    rejectPending(normalizedError);
    try { if (!spawned.killed) spawned.kill(); } catch { /* best effort */ }
  }
''', nl)
if anchor not in text:
    raise SystemExit('rejectPending anchor missing')
text = text.replace(anchor, repl, 1)

stderr_block = with_nl('''      spawned.stderr.on('data', (chunk) => {
        stderrBuffer = `${stderrBuffer}${String(chunk || '')}`.slice(-4000);
        const message = stderrBuffer.trim();
        if (message) state = { ...state, lastError: message.split(/\\r?\\n/).slice(-1)[0] };
      });
''', nl)
stderr_repl = stderr_block + with_nl("""      spawned.stdin.on('error', (error) => handlePipeFailure(spawned, error));
""", nl)
if stderr_block not in text:
    raise SystemExit('stderr handler anchor missing')
text = text.replace(stderr_block, stderr_repl, 1)

old = with_nl('''      spawned.on('exit', (code, signal) => {
        if (child !== spawned) return;
        child = null;
        const expected = code === 0 || signal === 'SIGTERM';''', nl)
new = with_nl('''      spawned.on('exit', (code, signal) => {
        if (child !== spawned && stoppingChild !== spawned) return;
        if (child === spawned) child = null;
        const expected = code === 0 || signal === 'SIGTERM' || stoppingChild === spawned;
        if (stoppingChild === spawned) stoppingChild = null;''', nl)
if old not in text:
    raise SystemExit('exit handler anchor missing')
text = text.replace(old, new, 1)

request_start = text.index(with_nl('  function request(command, payload = {}, timeoutMs = 2500) {', nl))
request_end = text.index(with_nl('\n\n  function attachDolphin', nl), request_start)
request_new = with_nl('''  function request(command, payload = {}, timeoutMs = 2500) {
    if (typeof payload === 'number') {
      timeoutMs = payload;
      payload = {};
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) payload = {};

    start();
    const target = child;
    if (!target || target.killed || !target.stdin?.writable) {
      return Promise.reject(new Error(state.lastError || 'Runtime helper is not running.'));
    }

    const id = nextRequestId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Runtime helper command timed out: ${command}`));
      }, timeoutMs);

      pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });

      const failWrite = (error) => {
        const normalizedError = error instanceof Error ? error : new Error(String(error || 'Runtime helper write failed.'));
        const entry = pending.get(id);
        if (entry) {
          pending.delete(id);
          entry.reject(normalizedError);
        }
        if (isPipeClosureError(normalizedError)) handlePipeFailure(target, normalizedError);
      };

      try {
        target.stdin.write(`${JSON.stringify({ id, command, ...payload })}\\n`, (error) => {
          if (error) failWrite(error);
        });
      } catch (error) {
        failWrite(error);
      }
    });
  }''', nl)
text = text[:request_start] + request_new + text[request_end:]

stop_start = text.index(with_nl('  function stop() {', nl))
stop_end = text.index(with_nl('\n\n  return {', nl), stop_start)
stop_new = with_nl('''  function stop() {
    if (!child || child.killed) return;
    const target = child;
    stoppingChild = target;
    try {
      if (target.stdin?.writable) {
        const id = nextRequestId++;
        target.stdin.write(`${JSON.stringify({ id, command: 'shutdown' })}\\n`, (error) => {
          if (error) handlePipeFailure(target, error);
        });
      } else {
        const error = new Error('Runtime helper input stream is already closed.');
        error.code = 'ERR_STREAM_DESTROYED';
        handlePipeFailure(target, error);
      }
    } catch (error) {
      handlePipeFailure(target, error);
    }
    setTimeout(() => {
      if (child === target && !target.killed) {
        try { target.kill(); } catch { /* best effort */ }
      }
    }, 400).unref();
  }''', nl)
text = text[:stop_start] + stop_new + text[stop_end:]
save(p, text)


# Settings: one compact username/password/API-key connection card.
p, text, nl = load('app/src/AppPages.tsx')
settings_start = text.index(with_nl('export function SettingsPage() {', nl))
settings = r'''export function SettingsPage() {
  const {
    saveSettings,
    username,
    setUsername,
    apiKey,
    setApiKey,
    hasApiKey,
    saved,
    accountPhase,
    connectedUser,
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
  const setupLabel = setupReady ? 'READY' : setupHasError ? 'ATTENTION' : 'CONNECT';
  const setupTone = setupReady ? 'complete' : setupHasError ? 'danger' : 'neutral';
  const richPresenceActive = Boolean(
    snapshot?.runtime?.live?.active &&
    snapshot?.runtime?.live?.richPresenceLoaded &&
    !snapshot?.runtime?.live?.stale &&
    snapshot?.runtime?.live?.richPresence,
  );
  const gameActive = Boolean(snapshot?.game?.active);
  const patchLoaded = runtimeObserver?.phase === 'ready' && Number(runtimeObserver.loadedAchievementCount || 0) > 0;
  const observerReady = Boolean(runtimeConnected && runtimeHelper?.ready);
  const diagnosticError = runtimeError || runtimeObserver?.error || snapshot?.runtime?.live?.lastError || runtimeHelper?.lastError || '';
  const diagnosticHealthy = Boolean(setupReady && runtimeHelper?.available && runtimeHelper?.running && runtimeHelper?.ready && !diagnosticError);

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
      return auth;
    } catch (runtimeStatusError: any) {
      setRuntimeError(runtimeStatusError?.message || String(runtimeStatusError));
      return null;
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

  async function loginRuntimeWithPassword() {
    const password = runtimePassword;
    if (!password) {
      setRuntimeError('Enter your RetroAchievements password once to create a new runtime token.');
      return false;
    }
    setRuntimeBusy(true);
    setRuntimeError('');
    setRuntimeMessage('');
    try {
      const status = await window.raCompanion.loginRuntimeAccount(password);
      setRuntimeAuth(status);
      setRuntimeMessage(status.persistent
        ? 'Connected. Your encrypted runtime token will be reused automatically.'
        : 'Connected for this app session; OS encryption is unavailable.');
      await refreshRuntimeDiagnostics();
      return true;
    } catch (runtimeLoginError: any) {
      setRuntimeError(runtimeLoginError?.message || String(runtimeLoginError));
      return false;
    } finally {
      setRuntimePassword('');
      setRuntimeBusy(false);
    }
  }

  async function saveAndConnect(event: React.FormEvent) {
    event.preventDefault();
    if (runtimeBusy) return;
    setRuntimeError('');
    setRuntimeMessage('');
    const accountConnected = await saveSettings();
    if (!accountConnected) return;

    const auth = await refreshRuntimeDiagnostics();
    if (runtimePassword) {
      await loginRuntimeWithPassword();
    } else if (!auth?.connected) {
      setRuntimeError('Enter your RetroAchievements password once to finish connecting. It is never stored.');
    } else {
      setRuntimeMessage('Connected. Saved credentials will be reused automatically.');
    }
  }

  async function reconnectRuntimeData() {
    if (runtimeBusy) return;
    setRuntimeError('');
    setRuntimeMessage('');
    if (runtimePassword) {
      await loginRuntimeWithPassword();
      return;
    }
    if (!runtimeConnected) {
      setRuntimeError('Enter your RetroAchievements password to reconnect.');
      return;
    }
    setRuntimeBusy(true);
    try {
      const status = await window.raCompanion.validateRuntimeAccount();
      setRuntimeAuth(status);
      setRuntimeMessage('Connection validated. No new login is needed.');
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
      setRuntimeMessage('Saved runtime token removed.');
      await refreshRuntimeDiagnostics();
    } catch (runtimeDisconnectError: any) {
      setRuntimeError(runtimeDisconnectError?.message || String(runtimeDisconnectError));
    } finally {
      setRuntimeBusy(false);
    }
  }

  async function disconnectEverything() {
    await disconnectAccount();
    setRuntimeAuth(await window.raCompanion.getRuntimeAuthStatus());
    await refreshRuntimeDiagnostics();
  }

  function diagnosticValue(ok: boolean | undefined, readyText: string, waitingText: string) {
    if (ok === undefined) return 'Checking…';
    return ok ? readyText : waitingText;
  }

  const busy = runtimeBusy || ['saving', 'verifying', 'refreshing'].includes(accountPhase);

  return (
    <>
      <header className="v5-page-header"><div><span className="v5-page-icon">⚙</span><div><h1>Settings</h1><p>RetroAchievements and companion preferences.</p></div></div></header>

      <article className="v5-panel v5-settings-form v81-ra-card">
        <div className="v5-card-heading v81-ra-heading">
          <div>
            <div className="v5-section-label">RETROACHIEVEMENTS</div>
            <p className="v5-muted">Connect your RetroAchievements account for achievements, Rich Presence and live observer.</p>
          </div>
          <span className={`v5-status-pill ${setupTone}`}>{setupLabel}</span>
        </div>

        <form className="v81-ra-form" onSubmit={saveAndConnect}>
          <label htmlFor="ra-username">Username
            <input id="ra-username" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Your RA username" />
          </label>

          <label htmlFor="ra-runtime-password">Password
            <span className="v81-input-state">
              <input id="ra-runtime-password" name="runtimePassword" autoComplete="current-password" type="password" value={runtimePassword} onChange={(event) => setRuntimePassword(event.target.value)} placeholder={runtimeConnected ? 'Authenticated · enter only to reconnect' : 'Enter your RA password'} disabled={runtimeBusy} />
              {runtimeConnected && !runtimePassword && <i aria-hidden="true">✓</i>}
            </span>
          </label>

          <label htmlFor="ra-api-key">API Key
            <span className="v81-input-state">
              <input id="ra-api-key" name="apiKey" autoComplete="off" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={hasApiKey ? 'Stored · enter only to replace' : 'Paste Web API key'} />
              {hasApiKey && !apiKey && <i aria-hidden="true">✓</i>}
            </span>
          </label>

          <div className="v81-form-actions">
            <button type="submit" disabled={busy}>{busy ? 'Working…' : 'Save & connect'}</button>
            <button type="button" className="secondary" disabled={busy} onClick={reconnectRuntimeData}>Reconnect</button>
          </div>
        </form>

        <div className="v81-status-line" aria-label="RetroAchievements connection status">
          <span className={webConnected ? 'complete' : 'waiting'}>{webConnected ? '✓' : '•'} Connected</span>
          <em>·</em>
          <span className={runtimeConnected ? 'complete' : 'waiting'}>{runtimeConnected ? '✓' : '•'} Rich Presence</span>
          <em>·</em>
          <span className={observerReady ? 'complete' : 'waiting'}>{observerReady ? '✓' : '•'} Live observer</span>
        </div>

        <details className="v72-runtime-diagnostics v81-diagnostics" open={Boolean(diagnosticError)}>
          <summary><span>Diagnostics</span><small className={diagnosticHealthy ? 'good' : diagnosticError ? 'warning-text' : ''}>{diagnosticHealthy ? '● Healthy' : diagnosticError ? '● Attention' : '● Checking'}</small></summary>
          <div className="v72-diagnostic-grid">
            <div><span>Account</span><b className={webConnected ? 'good' : 'warning-text'}>{webConnected ? connectedUser : 'Not connected'}</b></div>
            <div><span>Runtime token</span><b className={runtimeConnected ? 'good' : 'warning-text'}>{runtimeConnected ? (runtimeAuth?.persistent ? 'Stored · OS-encrypted' : 'Memory only') : 'Missing'}</b></div>
            <div><span>Helper installed</span><b className={runtimeHelper?.available ? 'good' : 'warning-text'}>{diagnosticValue(runtimeHelper?.available, 'Yes', 'No')}</b></div>
            <div><span>Helper running</span><b className={runtimeHelper?.running ? 'good' : 'warning-text'}>{diagnosticValue(runtimeHelper?.running, 'Yes', 'No')}</b></div>
            <div><span>rcheevos ready</span><b className={runtimeHelper?.ready ? 'good' : 'warning-text'}>{diagnosticValue(runtimeHelper?.ready, runtimeHelper?.rcheevosVersion ? `Yes · ${runtimeHelper.rcheevosVersion}` : 'Yes', 'No')}</b></div>
            <div><span>Dolphin attached</span><b className={runtimeHelper?.dolphinAttached ? 'good' : ''}>{runtimeHelper?.dolphinAttached ? `Yes${runtimeHelper.dolphinPid ? ` · PID ${runtimeHelper.dolphinPid}` : ''}` : gameActive ? 'No' : 'Waiting for game'}</b></div>
            <div><span>Official patch loaded</span><b className={patchLoaded ? 'good' : ''}>{patchLoaded ? `${runtimeObserver?.loadedAchievementCount || 0} achievements` : gameActive && runtimeConnected ? (runtimeObserver?.phase || 'Waiting') : 'Waiting for game'}</b></div>
            <div><span>Rich Presence</span><b className={richPresenceActive ? 'good' : ''}>{richPresenceActive ? 'Active' : runtimeConnected ? (gameActive ? 'Waiting / unavailable' : 'Ready · waiting for game') : 'Not connected'}</b></div>
            <div><span>Memory bridge</span><b className={runtimeHelper?.gameCubeMemoryBridge ? 'good' : ''}>{diagnosticValue(runtimeHelper?.gameCubeMemoryBridge, 'Read-only ready', 'Unavailable')}</b></div>
          </div>
          <p className="v81-auth-note">Your password is used only when a new runtime token is needed and is never stored. The saved API key and encrypted runtime token are reused automatically.</p>
          {diagnosticError && <div className="error-card v6-inline-error v72-diagnostic-error"><b>Runtime error</b><span>{diagnosticError}</span></div>}
          <div className="v81-advanced-actions">
            <button type="button" className="secondary compact-button" onClick={refreshRuntimeDiagnostics}>Refresh diagnostics</button>
            <button type="button" className="secondary compact-button" disabled={!hasApiKey || busy} onClick={forceRefreshAccount}>Refresh RA data</button>
            <button type="button" className="secondary danger-button compact-button" disabled={!runtimeConnected || runtimeBusy} onClick={disconnectRuntimeData}>Remove runtime token</button>
            <button type="button" className="secondary danger-button compact-button" disabled={!hasApiKey && !username} onClick={disconnectEverything}>Disconnect account</button>
          </div>
        </details>

        {saved && <div className="saved v72-inline-message">{saved}</div>}
        {runtimeMessage && <div className="saved v72-inline-message">{runtimeMessage}</div>}
        {accountError && <div className="error-card v6-inline-error">{accountError}</div>}
        {runtimeError && <div className="error-card v6-inline-error">{runtimeError}</div>}
      </article>

      {error && <article className="v5-panel error-card">{error}</article>}
    </>
  );
}
'''
text = text[:settings_start] + with_nl(settings, nl)
save(p, text)


# Compact mockup-aligned Settings styles.
p, text, nl = load('app/src/styles.css')
styles = r'''

/* v0.8.1 — compact unified RetroAchievements connection */
.v81-ra-card{max-width:920px;border-color:rgba(55,222,166,.34);box-shadow:0 18px 44px rgba(0,0,0,.2)}
.v81-ra-heading{align-items:flex-start;margin-bottom:18px}
.v81-ra-heading .v5-section-label{color:#ff9b29;font-size:12px;letter-spacing:.16em}
.v81-ra-heading p{margin:5px 0 0;max-width:620px}
.v81-ra-form{display:grid;gap:14px}
.v81-ra-form>label{display:grid;gap:7px;font-size:12px;font-weight:800;color:#aebdca}
.v81-ra-form input{width:100%;min-height:44px}
.v81-input-state{position:relative;display:block}
.v81-input-state input{padding-right:46px}
.v81-input-state>i{position:absolute;right:14px;top:50%;transform:translateY(-50%);display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#45e6ad;color:#071611;font-style:normal;font-weight:1000;box-shadow:0 0 16px rgba(69,230,173,.2)}
.v81-form-actions{display:flex;gap:10px;align-items:center;margin-top:4px}
.v81-form-actions button:first-child{min-width:205px}
.v81-status-line{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:18px;padding-top:15px;border-top:1px solid rgba(255,255,255,.08);font-size:13px;font-weight:900}
.v81-status-line span{color:#82919f}
.v81-status-line span.complete{color:#45e6ad}
.v81-status-line em{color:#61707d;font-style:normal}
.v81-diagnostics{margin-top:14px}
.v81-diagnostics summary{min-height:46px}
.v81-diagnostics summary small.good{color:#45e6ad}
.v81-auth-note{margin:12px 0 0;color:#8c99a5;font-size:11px;line-height:1.55}
.v81-advanced-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px}
@media (max-width:760px){.v81-form-actions{align-items:stretch;flex-direction:column}.v81-form-actions button{width:100%}.v81-status-line{gap:7px}.v81-ra-card{max-width:none}}
'''
if 'v0.8.1 — compact unified RetroAchievements connection' not in text:
    text += with_nl(styles, nl)
save(p, text)


# Update legacy contracts to the new one-card UI.
p, text, nl = load('app/src/__tests__/v070.runtime-auth-data.test.ts')
old = with_nl("""    expect(settings).toContain('never stores the password');
    expect(settings).toContain('Web API key');
    expect(settings).toContain('Live runtime & Rich Presence');""", nl)
new = with_nl("""    expect(settings).toContain('never stored');
    expect(settings).toContain('API Key');
    expect(settings).toContain('Password');
    expect(settings).toContain('Save & connect');""", nl)
if old not in text:
    raise SystemExit('v070 settings contract anchor missing')
text = text.replace(old, new, 1)
save(p, text)

p, text, nl = load('app/src/__tests__/v072.ra-setup-faron.test.ts')
old = with_nl("""    expect(pages).toContain('RETROACHIEVEMENTS CONNECTION');
    expect(pages).toContain('One more step for live Rich Presence');
    expect(pages).toContain('Live runtime & Rich Presence');
    expect(pages).toContain('Runtime & Rich Presence diagnostics');
    expect(pages).toContain('Helper installed');""", nl)
new = with_nl("""    expect(pages).toContain('RETROACHIEVEMENTS');
    expect(pages).toContain('Username');
    expect(pages).toContain('Password');
    expect(pages).toContain('API Key');
    expect(pages).toContain('Save & connect');
    expect(pages).toContain('Diagnostics');
    expect(pages).toContain('Helper installed');""", nl)
if old not in text:
    raise SystemExit('v072 settings contract anchor missing')
text = text.replace(old, new, 1)
save(p, text)


# New v0.8.1 regression contract.
test = r'''import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function source(relativePath: string) {
  const root = path.resolve(__dirname, '..', '..');
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('v0.8.1 compact RA login, EPIPE hardening and story-next dedupe', () => {
  it('renders one compact username/password/API-key connection flow and reuses stored auth', () => {
    const pages = source('src/AppPages.tsx');
    expect(pages).toContain('Username');
    expect(pages).toContain('Password');
    expect(pages).toContain('API Key');
    expect(pages).toContain('Save & connect');
    expect(pages).toContain('Authenticated · enter only to reconnect');
    expect(pages).toContain('Stored · enter only to replace');
    expect(pages).toContain('Saved credentials will be reused automatically');
    expect(pages).toContain('encrypted runtime token are reused automatically');
    expect(pages).not.toContain('STEP 1');
    expect(pages).not.toContain('STEP 2');
    expect(pages).not.toContain('Account & live runtime');
    expect(pages).not.toContain('v72-setup-overview');
  });

  it('consumes helper stdin EPIPE-style errors and makes shutdown best-effort', () => {
    const helper = source('electron/services/runtime-helper-service.cjs');
    expect(helper).toContain("spawned.stdin.on('error'");
    expect(helper).toContain("code === 'EPIPE'");
    expect(helper).toContain("code === 'ERR_STREAM_DESTROYED'");
    expect(helper).toContain("code === 'ERR_STREAM_WRITE_AFTER_END'");
    expect(helper).toContain('handlePipeFailure');
    expect(helper).toContain('stoppingChild = target');
    expect(helper).toContain('It will reconnect automatically.');
  });

  it('never renders the same achievement as Current Story Beat and Next Story Beat', () => {
    const main = source('src/main.tsx');
    expect(main).toContain('const currentStoryIds = new Set(companion.current.map(achievementId));');
    expect(main).toContain('const nextStoryAchievements = uniqueAchievements([');
    expect(main).toContain('.filter((achievement: any) => !currentStoryIds.has(achievementId(achievement)))');
    expect(main).toContain('achievements={nextStoryAchievements}');
    expect(main).not.toContain('achievements={pendingFaronVesselAchievement ? [pendingFaronVesselAchievement] : companion.comingUp}');
  });
});
'''
Path('app/src/__tests__/v081.settings-epipe-story-next.test.ts').write_bytes(test.encode('utf-8'))


# Functional EPIPE smoke test using a mocked child_process in a VM.
script = r'''const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function makeStream() {
  const stream = new EventEmitter();
  stream.writable = true;
  stream.setEncoding = () => {};
  stream.write = (_data, callback) => {
    if (callback) callback();
    return true;
  };
  return stream;
}

function makeChild(pid) {
  const child = new EventEmitter();
  child.stdin = makeStream();
  child.stdout = makeStream();
  child.stderr = makeStream();
  child.killed = false;
  child.pid = pid;
  child.kill = () => { child.killed = true; return true; };
  return child;
}

(async () => {
  const filename = path.resolve(__dirname, '../app/electron/services/runtime-helper-service.cjs');
  const source = fs.readFileSync(filename, 'utf8');
  const children = [];
  const fakeSpawn = () => {
    const child = makeChild(9000 + children.length);
    children.push(child);
    return child;
  };

  const moduleObject = { exports: {} };
  const sandbox = {
    module: moduleObject,
    exports: moduleObject.exports,
    __dirname: path.dirname(filename),
    console,
    Buffer,
    JSON,
    Error,
    Number,
    String,
    Boolean,
    Array,
    Map,
    Promise,
    setTimeout,
    clearTimeout,
    process: { platform: 'win32' },
    require(id) {
      if (id === 'fs') return { existsSync: () => true };
      if (id === 'path') return path;
      if (id === 'child_process') return { spawn: fakeSpawn };
      throw new Error(`Unexpected require: ${id}`);
    },
  };

  const wrapper = vm.runInNewContext(`(function(require,module,exports,__dirname){${source}\n})`, sandbox, { filename });
  wrapper(sandbox.require, moduleObject, moduleObject.exports, sandbox.__dirname);
  const service = moduleObject.exports.createRuntimeHelperService({ app: { getAppPath: () => '/fake' } });

  service.start();
  assert.equal(children.length, 1);
  assert.equal(service.getStatus().running, true);

  const epipe = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
  children[0].stdin.emit('error', epipe);
  assert.equal(service.getStatus().running, false);
  assert.equal(children[0].killed, true);
  assert.match(service.getStatus().lastError, /reconnect automatically/i);

  service.start();
  assert.equal(children.length, 2, 'service should be restartable after the pipe closes');

  children[1].stdin.write = (_data, callback) => {
    const error = Object.assign(new Error('stream destroyed'), { code: 'ERR_STREAM_DESTROYED' });
    callback?.(error);
    return false;
  };
  await assert.rejects(service.request('memoryStatus'), /stream destroyed/i);
  assert.equal(service.getStatus().running, false);

  service.start();
  assert.equal(children.length, 3);
  children[2].stdin.write = (_data, callback) => {
    const error = Object.assign(new Error('shutdown EPIPE'), { code: 'EPIPE' });
    callback?.(error);
    return false;
  };
  assert.doesNotThrow(() => service.stop());
  assert.equal(service.getStatus().running, false);

  console.log('runtime-helper EPIPE/shutdown regression: ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
'''
Path('scripts/test-runtime-helper-epipe.cjs').write_bytes(script.encode('utf-8'))
