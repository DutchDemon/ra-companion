from pathlib import Path


def patch(path, old, new):
    text = Path(path).read_text(encoding='utf-8')
    if text.count(old) != 1:
        raise SystemExit(f'{path}: expected exactly one match, got {text.count(old)}')
    Path(path).write_text(text.replace(old, new, 1), encoding='utf-8')

patch(
    'app/src/profiles/twilightPrincessState.ts',
    "source: 'ram' | 'ra';",
    "source: 'rcheevos' | 'ram' | 'ra';",
)
patch(
    'app/src/styles.css',
    '.overlay-shell.compact .v7-overlay-live-counters .v7-overlay-counter:nth-of-type(n+3) { display: none; }',
    '.overlay-shell.compact .v7-overlay-live-counters .v7-overlay-counter:nth-child(n+4) { display: none; }',
)

Path('.github/workflows/fix-live-counter-review.yml').unlink(missing_ok=True)
Path('scripts/fix-live-counter-review.py').unlink(missing_ok=True)
