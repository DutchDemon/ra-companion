import React from 'react';
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AppViewContext, UpdateBanner } from '../AppPages';
import { buildTwilightAchievementStates } from '../profiles/twilightPrincessState';

function achievement(id: number, title: string, description = '') {
  return { ID: id, Title: title, Description: description, HardcoreMode: false };
}

const emptyContext: any = { missables: [], current: [], comingUp: [], relevantAll: [] };

describe('v0.5.4 update banner and actor-aware achievements', () => {
  it('surfaces a puppy in the current room and detects carrying it', () => {
    const a = achievement(419985, 'The Hero of Puppies');
    const base: any = { attached: true, stale: false, gameCode: 'GZ2E01', actors: { dog: { total: 1, currentRoom: 1, carried: 0 }, cucco: { total: 0, currentRoom: 0, carried: 0, controlled: 0 } } };
    expect(buildTwilightAchievementStates([a], base, emptyContext).get('419985')?.label).toBe('Puppy nearby');
    base.actors.dog.carried = 1;
    expect(buildTwilightAchievementStates([a], base, emptyContext).get('419985')?.label).toBe('Puppy in your arms');
  });

  it('surfaces a Cucco and detects ACTION_PLAY control state', () => {
    const a = achievement(419988, "What's the Matter, McFly? Chicken??");
    const base: any = { attached: true, stale: false, gameCode: 'GZ2E01', actors: { dog: { total: 0, currentRoom: 0, carried: 0 }, cucco: { total: 1, currentRoom: 1, carried: 0, controlled: 0 } } };
    expect(buildTwilightAchievementStates([a], base, emptyContext).get('419988')?.label).toBe('Cucco nearby');
    base.actors.cucco.controlled = 1;
    expect(buildTwilightAchievementStates([a], base, emptyContext).get('419988')?.label).toBe('Cucco control active');
  });

  it('renders the startup update banner and lets Later dismiss it for the session', async () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost' });
    Object.assign(globalThis, { window: dom.window, document: dom.window.document, navigator: dom.window.navigator });
    let dismissed = false;
    const view: any = {
      showUpdateBanner: true,
      updateStatus: { available: true, latestVersion: '0.5.5' },
      updateBusy: false,
      updateInProgress: false,
      updatePercent: 0,
      installUpdate: () => {},
      dismissUpdateBanner: () => { dismissed = true; },
    };
    const root = createRoot(document.getElementById('root')!);
    await act(async () => root.render(<AppViewContext.Provider value={view}><UpdateBanner /></AppViewContext.Provider>));
    expect(document.body.textContent).toContain('RA Companion v0.5.5 is available');
    const later = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Later') as HTMLButtonElement;
    await act(async () => later.click());
    expect(dismissed).toBe(true);
    root.unmount();
  });
});
