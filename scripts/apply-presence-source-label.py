from pathlib import Path


def read(path):
    with open(path, 'r', encoding='utf-8', newline='') as h:
        return h.read()


def write(path, text):
    with open(path, 'w', encoding='utf-8', newline='') as h:
        h.write(text)


p = 'app/src/main.tsx'
text = read(p)
needle = "  const presenceMessage = officialPresenceMessage || fastRamPresence || fallbackSnapshotPresence;"
replacement = needle + "\n  const presenceSource = officialPresenceMessage ? 'rcheevos-runtime' : fastRamPresence ? 'ram' : fallbackSnapshotPresence ? (snapshot?.presence?.source || 'retro-achievements') : 'none';"
count = text.count(needle)
if count != 2:
    raise SystemExit(f'{p}: expected two presenceMessage assignments, got {count}')
text = text.replace(needle, replacement)

app_view_needle = """    serverPresenceMessage,
    presenceMessage,
    companion,"""
app_view_replacement = """    serverPresenceMessage,
    presenceMessage,
    presenceSource,
    companion,"""
if text.count(app_view_needle) != 1:
    raise SystemExit(f'{p}: appView anchor mismatch')
text = text.replace(app_view_needle, app_view_replacement, 1)
write(p, text)

p = 'app/src/AppPages.tsx'
text = read(p)
current_destructure = """    ramLive,
    serverPresenceMessage,
    presenceMessage,
    companion,"""
current_replacement = """    ramLive,
    serverPresenceMessage,
    presenceMessage,
    presenceSource,
    companion,"""
if text.count(current_destructure) != 1:
    raise SystemExit(f'{p}: CurrentGame destructure anchor mismatch')
text = text.replace(current_destructure, current_replacement, 1)
old_label = """              <div><span>Context source</span><b>{snapshot?.presence?.source === 'rcheevos-runtime' ? 'Official RA · rcheevos' : snapshot?.presence?.source === 'ram' || (presenceMessage && ramLive) ? 'Dolphin RAM fallback' : serverPresenceMessage ? 'RA server profile' : 'Waiting'}</b></div>"""
new_label = """              <div><span>Context source</span><b>{presenceSource === 'rcheevos-runtime' ? 'Official RA · rcheevos' : presenceSource === 'ram' ? 'Dolphin RAM fallback' : presenceSource === 'retro-achievements' ? 'RA server profile' : 'Waiting'}</b></div>"""
if text.count(old_label) != 1:
    raise SystemExit(f'{p}: CurrentGame source label anchor mismatch')
text = text.replace(old_label, new_label, 1)
write(p, text)

# Extend the permanent static contract.
p = 'scripts/test-rich-presence-ui-contract.cjs'
text = read(p)
needle = "assert(renderer.includes('officialPresenceMessage || fastRamPresence || fallbackSnapshotPresence'));"
replacement = needle + "\nassert(renderer.includes(\"const presenceSource = officialPresenceMessage ? 'rcheevos-runtime' : fastRamPresence ? 'ram'\"));\nassert(pages.includes(\"presenceSource === 'rcheevos-runtime' ? 'Official RA · rcheevos'\"));"
if text.count(needle) != 1:
    raise SystemExit(f'{p}: contract anchor mismatch')
write(p, text.replace(needle, replacement, 1))

Path('.github/workflows/v070-presence-source-label-apply.yml').unlink(missing_ok=True)
Path('scripts/apply-presence-source-label.py').unlink(missing_ok=True)
