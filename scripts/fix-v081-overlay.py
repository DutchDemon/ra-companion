from pathlib import Path

p = Path('app/src/main.tsx')
text = p.read_text(encoding='utf-8')
old = """  const currentStoryIds = new Set(companion.current.map(achievementId));
  const nextStoryAchievements = uniqueAchievements([
    ...(pendingFaronVesselAchievement ? [pendingFaronVesselAchievement] : []),
    ...companion.comingUp,
  ])
    .filter((achievement: any) => !currentStoryIds.has(achievementId(achievement)))
    .slice(0, 1);"""
new = """  const currentStoryIds = new Set(companion.current.map(achievementId));
  const nextStorySeen = new Set<string>();
  const nextStoryAchievements = [
    ...(pendingFaronVesselAchievement ? [pendingFaronVesselAchievement] : []),
    ...companion.comingUp,
  ]
    .filter((achievement: any) => {
      const id = achievementId(achievement);
      if (!id || currentStoryIds.has(id) || nextStorySeen.has(id)) return false;
      nextStorySeen.add(id);
      return true;
    })
    .slice(0, 1);"""
if old not in text:
    raise SystemExit('overlay dedupe anchor missing')
p.write_text(text.replace(old, new, 1), encoding='utf-8', newline='\n')

p = Path('app/src/__tests__/v081.settings-epipe-story-next.test.ts')
text = p.read_text(encoding='utf-8')
old = "    expect(main).toContain('const nextStoryAchievements = uniqueAchievements([');"
new = "    expect(main).toContain('const nextStorySeen = new Set<string>();');\n    expect(main).toContain('const nextStoryAchievements = [');"
if old not in text:
    raise SystemExit('v081 unique helper test anchor missing')
text = text.replace(old, new, 1)
old = "    expect(main).toContain('.filter((achievement: any) => !currentStoryIds.has(achievementId(achievement)))');"
new = "    expect(main).toContain('currentStoryIds.has(id) || nextStorySeen.has(id)');"
if old not in text:
    raise SystemExit('v081 filter test anchor missing')
text = text.replace(old, new, 1)
p.write_text(text, encoding='utf-8', newline='\n')
