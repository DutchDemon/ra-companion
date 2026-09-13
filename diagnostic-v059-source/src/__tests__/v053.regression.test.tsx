import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppViewContext, SettingsPage } from '../AppPages';
import { buildTwilightAchievementStates } from '../profiles/twilightPrincessState';
import { getTwilightMissableGuide } from '../profiles/twilightPrincessGuide';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('v0.5.3 regressions', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('keeps Account Connection input focus across parent refresh rerenders', async () => {
    function Harness({ tick }: { tick: number }) {
      const [username, setUsername] = useState('GregMcGrega');
      const [apiKey, setApiKey] = useState('');
      const view = {
        tick,
        saveSettings: (event: React.FormEvent) => event.preventDefault(),
        username,
        setUsername,
        apiKey,
        setApiKey,
        hasApiKey: true,
        apiKeyEncrypted: true,
        saved: '',
        error: '',
      };
      return <AppViewContext.Provider value={view}><SettingsPage /></AppViewContext.Provider>;
    }

    await act(async () => root.render(<Harness tick={0} />));
    const input = document.querySelector<HTMLInputElement>('#ra-username');
    expect(input).not.toBeNull();
    input!.focus();
    expect(document.activeElement).toBe(input);

    for (let tick = 1; tick <= 4; tick += 1) {
      await act(async () => root.render(<Harness tick={tick} />));
      expect(document.querySelector('#ra-username')).toBe(input);
      expect(document.activeElement).toBe(input);
    }
  });

  it('detects Pump up the King from a filled bottle in Ordon Village', () => {
    const achievement = {
      ID: 449436,
      Title: 'Pump up the King!',
      Description: 'Regrow some Ordon Pumpkin.',
      Type: 'Missable',
    };
    const inventory = Array(24).fill(0xff);
    inventory[11] = 0x64; // Milk Bottle: still a bottle.
    const ram = {
      enabled: true,
      ok: true,
      attached: true,
      stale: false,
      gameCode: 'GZ2E01',
      stageCode: 'F_SP103',
      linkForm: 'human',
      bottleCount: 1,
      inventory,
    } as any;
    const context = {
      context: { kind: 'area', label: 'Ordon Village' },
      relevantAll: [],
      missables: [],
      current: [],
      comingUp: [],
      source: 'ram',
      routeLabel: 'Opening Ordon',
    } as any;

    const state = buildTwilightAchievementStates([achievement], ram, context).get('449436');
    expect(state?.coverage).toBe('deep');
    expect(state?.kind).toBe('available');
    expect(state?.label).toBe('Available now');
    expect(getTwilightMissableGuide(achievement)?.specific).toBe(true);
  });

  it('uses inventory bottle slots even if a stale aggregate bottleCount says zero', () => {
    const achievement = { ID: 449436, Title: 'Pump up the King!', Description: 'Regrow some Ordon Pumpkin.' };
    const inventory = Array(24).fill(0xff);
    inventory[12] = 0x67; // Water Bottle.
    const ram = {
      enabled: true,
      ok: true,
      attached: true,
      stale: false,
      gameCode: 'GZ2E01',
      stageCode: 'F_SP103',
      linkForm: 'human',
      bottleCount: 0,
      inventory,
    } as any;
    const context = { context: {}, relevantAll: [], missables: [], current: [], comingUp: [], source: 'ram', routeLabel: '' } as any;

    const state = buildTwilightAchievementStates([achievement], ram, context).get('449436');
    expect(state?.kind).toBe('available');
    expect(state?.label).toBe('Ready now');
  });
});
