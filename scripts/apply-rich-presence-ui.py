from pathlib import Path
import re


def read_preserve(path):
    with open(path, 'r', encoding='utf-8', newline='') as handle:
        return handle.read()


def write_preserve(path, text):
    with open(path, 'w', encoding='utf-8', newline='') as handle:
        handle.write(text)


def replace_exact(path, old, new, expected=1):
    text = read_preserve(path)
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'{path}: expected {expected} exact matches, found {count}')
    write_preserve(path, text.replace(old, new))


# Electron snapshot: official local rcheevos Rich Presence is primary.
p = 'app/electron/main.cjs'
text = read_preserve(p)
pattern = re.compile(
    r"  const ramPresenceMessage = activeProfile\?\.buildRamPresence\?\.\(ram\) \|\| '';\r?\n"
    r"  const hasLiveRamContext = Boolean\(ramPresenceMessage\);\r?\n"
    r"  const \[baseProgress, recent, profile\] = await Promise\.all\(\[\r?\n"
    r"    getRaProgress\(gameId, forceRa\),\r?\n"
    r"    getRaRecentAchievements\(\),\r?\n"
    r"    hasLiveRamContext \? Promise\.resolve\(null\) : getRaProfile\(\),\r?\n"
    r"  \]\);\r?\n"
    r"  const progress = baseProgress;"
)
newline = '\r\n' if '\r\n' in text else '\n'
replacement = newline.join([
    "  const runtimeLive = observerRuntimeService.getLiveState();",
    "  const runtimePresenceMessage = (",
    "    runtimeLive?.active &&",
    "    Number(runtimeLive.gameId || 0) === Number(gameId || 0) &&",
    "    runtimeLive.richPresenceLoaded &&",
    "    !runtimeLive.stale",
    "  ) ? String(runtimeLive.richPresence || '').trim() : '';",
    "  const ramPresenceMessage = activeProfile?.buildRamPresence?.(ram) || '';",
    "  const hasLiveRuntimeContext = Boolean(runtimePresenceMessage);",
    "  const hasLiveRamContext = Boolean(ramPresenceMessage);",
    "  const hasLocalContext = hasLiveRuntimeContext || hasLiveRamContext;",
    "  const [baseProgress, recent, profile] = await Promise.all([",
    "    getRaProgress(gameId, forceRa),",
    "    getRaRecentAchievements(),",
    "    hasLocalContext ? Promise.resolve(null) : getRaProfile(),",
    "  ]);",
    "  const progress = baseProgress;",
])
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'{p}: local presence prelude replacement count={count}')

presence_pattern = re.compile(
    r"  let presence;\r?\n.*?\r?\n  return \{\r?\n    timestamp: Date\.now\(\),",
    re.S,
)
presence_replacement = newline.join([
    "  let presence;",
    "  if (hasLiveRuntimeContext) {",
    "    presence = {",
    "      ok: true,",
    "      message: runtimePresenceMessage,",
    "      lastGameId: gameId,",
    "      currentGameMatches: true,",
    "      source: 'rcheevos-runtime',",
    "      live: true,",
    "      updatedAt: Number(runtimeLive?.richPresenceUpdatedAt || 0) || null,",
    "      ageMs: runtimeLive?.richPresenceAgeMs ?? null,",
    "    };",
    "  } else if (hasLiveRamContext) {",
    "    presence = {",
    "      ok: true,",
    "      message: ramPresenceMessage,",
    "      lastGameId: gameId,",
    "      currentGameMatches: true,",
    "      source: 'ram',",
    "      live: true,",
    "    };",
    "  } else if (profile?.ok) {",
    "    presence = {",
    "      ok: true,",
    "      message: profile.message || '',",
    "      lastGameId: profile.lastGameId,",
    "      currentGameMatches: profile.lastGameId === gameId,",
    "      source: 'retro-achievements',",
    "      live: false,",
    "    };",
    "  } else {",
    "    presence = {",
    "      ok: false,",
    "      error: profile?.error || (ram?.error ? `RAM: ${ram.error}` : 'Context unavailable.'),",
    "      message: '',",
    "      lastGameId: null,",
    "      currentGameMatches: false,",
    "      source: 'none',",
    "      live: false,",
    "    };",
    "  }",
    "",
    "  return {",
    "    timestamp: Date.now(),",
])
text, count = presence_pattern.subn(presence_replacement, text, count=1)
if count != 1:
    raise SystemExit(f'{p}: presence resolver replacement count={count}')
write_preserve(p, text)


# Renderer overlay and app paths have slightly different statement order.
overlay_old = """  const serverPresenceMessage = snapshot?.presence?.ok && snapshot?.presence?.currentGameMatches ? snapshot.presence.message : '';
  const effectiveRam = liveRamProfile && (!snapshotProfile || liveRamProfile.key === activeProfile?.key) ? liveRam : snapshot?.ram;
  const fastRamPresence = ramPresenceMessage(effectiveRam, activeProfile);
  const presenceMessage = fastRamPresence || serverPresenceMessage;"""
overlay_new = """  const serverPresenceMessage = snapshot?.presence?.ok && snapshot?.presence?.currentGameMatches ? snapshot.presence.message : '';
  const officialPresenceMessage = snapshot?.presence?.source === 'rcheevos-runtime' ? serverPresenceMessage : '';
  const effectiveRam = liveRamProfile && (!snapshotProfile || liveRamProfile.key === activeProfile?.key) ? liveRam : snapshot?.ram;
  const fastRamPresence = ramPresenceMessage(effectiveRam, activeProfile);
  const fallbackSnapshotPresence = snapshot?.presence?.source === 'rcheevos-runtime' ? '' : serverPresenceMessage;
  const presenceMessage = officialPresenceMessage || fastRamPresence || fallbackSnapshotPresence;"""
replace_exact('app/src/main.tsx', overlay_old, overlay_new, expected=1)

app_old = """  const effectiveRam = liveRamProfile && (!snapshotProfile || liveRamProfile.key === activeProfile?.key) ? liveRam : snapshot?.ram;
  const ramLive = Boolean(effectiveRam?.attached && !effectiveRam?.stale);
  const serverPresenceMessage = snapshot?.presence?.ok && snapshot?.presence?.currentGameMatches ? snapshot.presence.message : '';
  const fastRamPresence = ramPresenceMessage(effectiveRam, activeProfile);
  const presenceMessage = fastRamPresence || serverPresenceMessage;"""
app_new = """  const effectiveRam = liveRamProfile && (!snapshotProfile || liveRamProfile.key === activeProfile?.key) ? liveRam : snapshot?.ram;
  const ramLive = Boolean(effectiveRam?.attached && !effectiveRam?.stale);
  const serverPresenceMessage = snapshot?.presence?.ok && snapshot?.presence?.currentGameMatches ? snapshot.presence.message : '';
  const officialPresenceMessage = snapshot?.presence?.source === 'rcheevos-runtime' ? serverPresenceMessage : '';
  const fastRamPresence = ramPresenceMessage(effectiveRam, activeProfile);
  const fallbackSnapshotPresence = snapshot?.presence?.source === 'rcheevos-runtime' ? '' : serverPresenceMessage;
  const presenceMessage = officialPresenceMessage || fastRamPresence || fallbackSnapshotPresence;"""
replace_exact('app/src/main.tsx', app_old, app_new, expected=1)

p = 'app/src/main.tsx'
text = read_preserve(p)
old_header = """          <div className=\"overlay-badges\">
            {ramLive && <span className=\"pill ram-pill\">RAM LIVE</span>}
            <span className=\"pill blue\">{state.clickThrough ? 'PASS' : 'DRAG'}</span>
          </div>
        </header>"""
new_header = """          <div className=\"overlay-badges\">
            {snapshot?.presence?.source === 'rcheevos-runtime' && <span className=\"pill rp-pill\">RA RP</span>}
            {ramLive && <span className=\"pill ram-pill\">RAM LIVE</span>}
            <span className=\"pill blue\">{state.clickThrough ? 'PASS' : 'DRAG'}</span>
          </div>
        </header>

        {gameActive && presenceMessage && (
          <div className=\"v7-overlay-rich-presence\" aria-live=\"polite\">
            <span>{snapshot?.presence?.source === 'rcheevos-runtime' ? 'RA RICH PRESENCE' : 'LIVE CONTEXT'}</span>
            <b>{presenceMessage}</b>
          </div>
        )}"""
if text.count(old_header) != 1:
    raise SystemExit(f'{p}: overlay header match count={text.count(old_header)}')
write_preserve(p, text.replace(old_header, new_header, 1))


# Dashboard session and Current Game source label.
p = 'app/src/AppPages.tsx'
text = read_preserve(p)
dashboard_anchor = """    activeMissableCount,
    sessionStats,
    setPage,
    refresh,"""
dashboard_new = """    activeMissableCount,
    sessionStats,
    presenceMessage,
    setPage,
    refresh,"""
if text.count(dashboard_anchor) != 1:
    raise SystemExit(f'{p}: Dashboard destructure anchor count={text.count(dashboard_anchor)}')
text = text.replace(dashboard_anchor, dashboard_new, 1)
subtitle = """              <p>{gameActive ? `${activeProfile?.platform || snapshot?.game?.platform || 'Game'} · Hardcore achievement tracking` : 'Start Dolphin with a supported game and RA Companion will attach automatically.'}</p>"""
subtitle_new = subtitle + """
              {gameActive && presenceMessage && (
                <div className=\"v7-session-rich-presence\" aria-live=\"polite\">
                  <span>{snapshot?.presence?.source === 'rcheevos-runtime' ? 'RA RICH PRESENCE' : 'LIVE CONTEXT'}</span>
                  <b>{presenceMessage}</b>
                </div>
              )}"""
if text.count(subtitle) != 1:
    raise SystemExit(f'{p}: session subtitle match count={text.count(subtitle)}')
text = text.replace(subtitle, subtitle_new, 1)
old_source = """              <div><span>Context source</span><b>{ramLive ? 'Dolphin RAM' : serverPresenceMessage ? 'RA Rich Presence' : 'Waiting'}</b></div>"""
new_source = """              <div><span>Context source</span><b>{snapshot?.presence?.source === 'rcheevos-runtime' ? 'Official RA · rcheevos' : snapshot?.presence?.source === 'ram' || (presenceMessage && ramLive) ? 'Dolphin RAM fallback' : serverPresenceMessage ? 'RA server profile' : 'Waiting'}</b></div>"""
if text.count(old_source) != 1:
    raise SystemExit(f'{p}: context source match count={text.count(old_source)}')
write_preserve(p, text.replace(old_source, new_source, 1))


# Types for new snapshot source metadata.
p = 'app/src/global.d.ts'
text = read_preserve(p)
old_type = "      source?: 'ram' | 'retro-achievements' | 'none';"
new_type = """      source?: 'rcheevos-runtime' | 'ram' | 'retro-achievements' | 'none';
      live?: boolean;
      updatedAt?: number | null;
      ageMs?: number | null;"""
if text.count(old_type) != 1:
    raise SystemExit(f'{p}: presence source match count={text.count(old_type)}')
write_preserve(p, text.replace(old_type, new_type, 1))


# UI polish while preserving the existing CRLF/LF style.
p = 'app/src/styles.css'
text = read_preserve(p)
marker = '/* v0.7.0 — official rcheevos Rich Presence presentation */'
if marker not in text:
    nl = '\r\n' if '\r\n' in text else '\n'
    block = """

/* v0.7.0 — official rcheevos Rich Presence presentation */
.v7-session-rich-presence { margin: 10px 0 2px; padding: 9px 11px; border: 1px solid rgba(110,231,255,.18); border-radius: 10px; background: rgba(110,231,255,.055); display: flex; flex-direction: column; gap: 4px; }
.v7-session-rich-presence span, .v7-overlay-rich-presence span { color: #6ee7ff; font-size: 8px; font-weight: 900; letter-spacing: 1.1px; }
.v7-session-rich-presence b { color: #dceaf5; font-size: 12px; line-height: 1.4; font-weight: 750; }
.v7-overlay-rich-presence { margin: 8px 0 9px; padding: 8px 10px; border: 1px solid rgba(110,231,255,.16); border-radius: 10px; background: rgba(110,231,255,.05); display: flex; flex-direction: column; gap: 4px; }
.v7-overlay-rich-presence b { color: #d8e7f3; font-size: 10px; line-height: 1.35; font-weight: 750; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pill.rp-pill { color: #6ee7ff; border-color: rgba(110,231,255,.32); background: rgba(110,231,255,.09); }
.overlay-shell.compact .v7-overlay-rich-presence { margin: 6px 0; padding: 6px 8px; }
.overlay-shell.compact .v7-overlay-rich-presence b { -webkit-line-clamp: 1; font-size: 9px; }
""".replace('\n', nl)
    write_preserve(p, text + block)

Path('scripts/test-rich-presence-ui-contract.cjs').write_text("""const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'app/electron/main.cjs'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'app/src/main.tsx'), 'utf8');
const pages = fs.readFileSync(path.join(root, 'app/src/AppPages.tsx'), 'utf8');
const types = fs.readFileSync(path.join(root, 'app/src/global.d.ts'), 'utf8');
assert(main.includes(\"source: 'rcheevos-runtime'\"));
assert(main.includes('hasLiveRuntimeContext'));
assert(main.indexOf('if (hasLiveRuntimeContext)') < main.indexOf('else if (hasLiveRamContext)'));
assert(renderer.includes('officialPresenceMessage || fastRamPresence || fallbackSnapshotPresence'));
assert(renderer.includes('v7-overlay-rich-presence'));
assert(pages.includes('v7-session-rich-presence'));
assert(pages.includes(\"'Official RA · rcheevos'\"));
assert(types.includes(\"'rcheevos-runtime' | 'ram' | 'retro-achievements' | 'none'\"));
assert(main.includes('const progress = baseProgress;'));
console.log('rich-presence-ui contract: passed');
""", encoding='utf-8')

Path('.github/workflows/v070-rich-presence-ui-apply.yml').unlink(missing_ok=True)
Path('scripts/apply-rich-presence-ui.py').unlink(missing_ok=True)
