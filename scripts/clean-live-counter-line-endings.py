from pathlib import Path


def read_preserve(path):
    with open(path, 'r', encoding='utf-8', newline='') as handle:
        return handle.read()


def write_preserve(path, text):
    with open(path, 'w', encoding='utf-8', newline='') as handle:
        handle.write(text)


# Files are reset to origin/main by the workflow before this script runs.
p = 'app/src/profiles/twilightPrincessState.ts'
text = read_preserve(p)
old = "source: 'ram' | 'ra';"
new = "source: 'rcheevos' | 'ram' | 'ra';"
if text.count(old) != 1:
    raise SystemExit(f'{p}: expected one source union anchor, got {text.count(old)}')
write_preserve(p, text.replace(old, new, 1))

p = 'app/src/styles.css'
text = read_preserve(p)
newline = '\r\n' if '\r\n' in text else '\n'
if '/* v0.7.0 — live measured achievement counters */' in text:
    raise SystemExit(f'{p}: live counter CSS unexpectedly already present after reset')
css_lines = [
    '',
    '',
    '/* v0.7.0 — live measured achievement counters */',
    '.v7-session-counter-block { margin: 2px 18px 12px; padding: 10px 12px; border: 1px solid rgba(110,231,255,.14); border-radius: 11px; background: rgba(110,231,255,.035); }',
    '.v7-live-counter-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 7px; }',
    '.v7-live-counter-heading > span { color: #6ee7ff; font-size: 8px; font-weight: 900; letter-spacing: 1.05px; }',
    '.v7-live-counter-heading > small { color: #8295a5; font-size: 9px; font-weight: 700; }',
    '.v7-live-counter-list { display: grid; gap: 8px; }',
    '.v7-live-counter-list.compact { grid-template-columns: repeat(3, minmax(0, 1fr)); }',
    '.v7-live-counter-card { min-width: 0; padding: 9px 10px; border: 1px solid rgba(255,255,255,.075); border-radius: 9px; background: rgba(18,18,18,.56); }',
    '.v7-live-counter-row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }',
    '.v7-live-counter-row b { min-width: 0; color: #f2f7fb; font-size: 11px; font-weight: 780; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.v7-live-counter-row strong { color: #6ee7ff; font-size: 11px; white-space: nowrap; }',
    '.v7-live-counter-card > small { display: block; margin-top: 5px; color: #778b9c; font-size: 9px; }',
    '.v7-live-counter-track { height: 4px; margin-top: 7px; overflow: hidden; border-radius: 999px; background: rgba(255,255,255,.07); }',
    '.v7-live-counter-track > i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #38bdf8, #6ee7ff); }',
    '.v7-live-progress-panel .v5-card-heading { margin-bottom: 10px; }',
    '.v7-live-progress-panel h3 { max-width: 680px; font-size: 13px; }',
    '.v7-overlay-live-counters { margin: 0 0 9px; padding: 8px 9px; border: 1px solid rgba(110,231,255,.13); border-radius: 10px; background: rgba(110,231,255,.035); display: grid; gap: 6px; }',
    '.v7-overlay-live-counters .v7-live-counter-heading { margin-bottom: 1px; }',
    '.v7-overlay-counter { display: grid; gap: 4px; }',
    '.v7-overlay-counter > div:first-child { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }',
    '.v7-overlay-counter b { min-width: 0; color: #e8f1f7; font-size: 9px; font-weight: 760; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.v7-overlay-counter strong { color: #6ee7ff; font-size: 9px; white-space: nowrap; }',
    '.v7-overlay-counter > small { color: #708392; font-size: 8px; }',
    '.overlay-shell.compact .v7-overlay-live-counters { padding: 6px 7px; gap: 5px; }',
    '.overlay-shell.compact .v7-overlay-live-counters .v7-overlay-counter:nth-child(n+4) { display: none; }',
    '@media (max-width: 1180px) { .v7-live-counter-list.compact { grid-template-columns: 1fr; } }',
    '',
]
write_preserve(p, text.rstrip('\r\n') + newline.join(css_lines))

Path('.github/workflows/clean-live-counter-line-endings.yml').unlink(missing_ok=True)
Path('scripts/clean-live-counter-line-endings.py').unlink(missing_ok=True)
