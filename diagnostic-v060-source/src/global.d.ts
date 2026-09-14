export {};

declare global {
  type OverlayMode = 'compact' | 'full';
  type OverlayCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  type OverlayResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

  interface OverlayBounds {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  interface OverlayState {
    visible: boolean;
    mode: OverlayMode;
    clickThrough: boolean;
    corner: OverlayCorner;
    opacity: number;
    manualPlacement: boolean;
    bounds: OverlayBounds | null;
  }

  interface ShortcutBindingState {
    registered: boolean;
    accelerator: string;
    primary: string;
    fallback?: string;
    usingFallback?: boolean;
    lastReceivedAt?: number | null;
    callbackCount?: number;
    lastResult?: 'never' | 'received' | 'handled' | 'error' | string;
    lastRegistrationAt?: number | null;
    lastRegistrationError?: string;
  }

  interface ShortcutState {
    overlayToggle: ShortcutBindingState;
    clickThrough: ShortcutBindingState;
  }

  interface UpdateStatus {
    ok: boolean;
    currentVersion: string;
    latestVersion?: string;
    available: boolean;
    notes?: string;
    mandatory?: boolean;
    packaged?: boolean;
    installing?: boolean;
    phase?: 'current' | 'available' | 'checking' | 'downloading' | 'downloaded' | 'installing' | 'error';
    progress?: number;
    transferred?: number;
    total?: number;
    bytesPerSecond?: number;
    message?: string;
    error?: string;
  }

  interface Window {
    raCompanion: {
      getAppVersion: () => Promise<string>;
      getConfig: () => Promise<{ username: string; hasApiKey: boolean; apiKeyEncrypted: boolean; verifiedUsername?: string; lastVerifiedAt?: number; shortcuts?: { overlayToggle: string; clickThrough: string } }>;
      checkForUpdates: (force?: boolean) => Promise<UpdateStatus>;
      installUpdate: () => Promise<UpdateStatus>;
      onUpdateStatusChanged: (callback: (status: UpdateStatus) => void) => () => void;
      saveConfig: (config: { username: string; apiKey: string }) => Promise<{ username: string; hasApiKey: boolean; apiKeyEncrypted: boolean; verifiedUsername?: string; lastVerifiedAt?: number; shortcuts?: { overlayToggle: string; clickThrough: string } }>;
      verifyAccount: () => Promise<{ ok: boolean; username: string; progressOwner: string; lastVerifiedAt: number; hasApiKey?: boolean; apiKeyEncrypted?: boolean; error?: string }>;
      disconnectAccount: () => Promise<{ username: string; hasApiKey: boolean; apiKeyEncrypted: boolean }>;
      getSnapshot: (forceRa?: boolean) => Promise<Snapshot>;
      getRamState: () => Promise<Snapshot['ram']>;
      onRamStateChanged: (callback: (state: Snapshot['ram']) => void) => () => void;
      toggleOverlay: (force?: boolean) => Promise<boolean>;
      getOverlayState: () => Promise<OverlayState>;
      updateOverlay: (patch: Partial<Omit<OverlayState, 'visible'>>) => Promise<OverlayState>;
      resetOverlayPreset: () => Promise<OverlayState>;
      getShortcutState: () => Promise<ShortcutState>;
      reregisterShortcuts: () => Promise<ShortcutState>;
      updateShortcuts: (patch: { overlayToggle?: string; clickThrough?: string }) => Promise<ShortcutState>;
      onShortcutStateChanged: (callback: (state: ShortcutState) => void) => () => void;
      startOverlayResize: (direction: OverlayResizeDirection, screenX: number, screenY: number) => void;
      moveOverlayResize: (screenX: number, screenY: number) => void;
      endOverlayResize: () => void;
      startOverlayMove: (screenX: number, screenY: number) => void;
      moveOverlayMove: (screenX: number, screenY: number) => void;
      endOverlayMove: () => void;
      onOverlayStateChanged: (callback: (state: OverlayState) => void) => () => void;
    };
  }

  interface Snapshot {
    timestamp: number;
    dolphin: {
      running: boolean;
      supportedPlatform: boolean;
      title: string;
      pid: number | null;
      processName?: string;
      detectedGameId: number | null;
    };
    game: {
      id: number | null;
      profile: string;
      autoDetected: boolean;
      active: boolean;
    };
    progress: {
      ok: boolean;
      owner?: string;
      needsConfig?: boolean;
      inactive?: boolean;
      error?: string;
      data?: any;
    };
    ram?: {
      enabled: boolean;
      ok: boolean;
      attached: boolean;
      stale?: boolean;
      ageMs?: number | null;
      processId?: number | null;
      gameCode?: string;
      region?: string;
      mem1Base?: string;
      hookSource?: string;
      sharedMemoryName?: string;
      mappingOpen?: boolean;
      headerGameCode?: string;
      headerMagic?: boolean;
      stageOffset?: string;
      scanning?: boolean;
      regionsScanned?: number;
      readableRegions?: number;
      signatureRegionsScanned?: number;
      signatureBytesScanned?: number;
      headerHits?: number;
      stageHits?: number;
      expectedGameCode?: string;
      bestCandidate?: string;
      candidatesTested?: number;
      magicHits?: number;
      lastMagicGameCode?: string;
      stageCode?: string;
      stageName?: string;
      kind?: string;
      boss?: string | null;
      mapped?: boolean;
      startRoom?: number;
      room?: number;
      layer?: number;
      darkArea?: number;
      point?: number;
      linkForm?: 'human' | 'wolf' | 'unknown';
      playerControl?: boolean | null;
      inCutscene?: boolean | null;
      areaEntranceId?: number | null;
      roomBuildingId?: number | null;
      grottoId?: number | null;
      minigameId?: number | null;
      storyFlags?: Record<string, boolean>;
      stateFlags?: Record<string, boolean>;
      gameStateEngine?: string;
      supportedSet?: string;
      eventBitsHex?: string;
      tempBitsHex?: string;
      inventory?: number[];
      maxLife?: number | null;
      life?: number | null;
      maxHearts?: number | null;
      currentHearts?: number | null;
      rupees?: number | null;
      bottleCount?: number | null;
      magicArmorOwned?: boolean;
      fishingCounts?: number[];
      miniGameStats?: {
        hookGameTime?: number | null;
        balloonScore?: number | null;
        raceGameTime?: number | null;
      };
      poeSouls?: number | null;
      goldenBugs?: number | null;
      fusedShadows?: number | null;
      mirrorShards?: number | null;
      faronTears?: number | null;
      eldinTears?: number | null;
      lanayruTears?: number | null;
      gameOvers?: number | null;
      actors?: {
        scanVersion?: number;
        dog?: { total?: number; currentRoom?: number; carried?: number };
        cucco?: { total?: number; currentRoom?: number; carried?: number; controlled?: number };
      };
      localPresence?: string;
      pollMs?: number;
      error?: string;
      timestamp?: number;
    };
    presence: {
      ok: boolean;
      inactive?: boolean;
      error?: string;
      message: string;
      lastGameId: number | null;
      currentGameMatches: boolean;
      source?: 'ram' | 'retro-achievements' | 'none';
    };
  }
}
