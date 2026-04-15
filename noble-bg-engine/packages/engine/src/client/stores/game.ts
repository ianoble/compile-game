import { defineStore } from 'pinia';
import { ref, computed, shallowRef } from 'vue';
import { Client } from 'boardgame.io/client';
import { SocketIO } from 'boardgame.io/multiplayer';
import { gameMap } from '../../games/registry.js';

let _serverUrl = '';
let _debug = false;

/** If the socket never connects, stop showing "session restore" so the UI can surface server URL hints. */
const SESSION_RESTORE_TIMEOUT_MS = 12_000;

export function setServerUrl(url: string) {
  _serverUrl = url;
}

export function setDebug(enabled: boolean) {
  _debug = enabled;
}

export const useGameStore = defineStore('game', () => {
  let bgioClient: ReturnType<typeof Client> | null = null;
  let sessionRestoreTimer: ReturnType<typeof setTimeout> | null = null;
  const clientVersion = ref(0);

  function clearSessionRestoreTimer() {
    if (sessionRestoreTimer != null) {
      clearTimeout(sessionRestoreTimer);
      sessionRestoreTimer = null;
    }
  }

  function scheduleSessionRestoreTimeout() {
    clearSessionRestoreTimer();
    sessionRestoreTimer = setTimeout(() => {
      sessionRestoreTimer = null;
      if (reconnecting.value && !isConnected.value) {
        reconnecting.value = false;
      }
    }, SESSION_RESTORE_TIMEOUT_MS);
  }

  const G = shallowRef<Record<string, unknown>>({});
  const ctx = shallowRef<{
    currentPlayer: string;
    phase?: string | null;
    gameover?: unknown;
    activePlayers?: Record<string, string> | null;
  }>({ currentPlayer: '0' });
  const currentPlayer = ref('0');
  const gameover = ref<{ winner?: string; isDraw?: boolean } | undefined>();
  const isActive = ref(false);
  const isConnected = ref(false);
  const reconnecting = ref(false);
  const playerID = ref<string | null>(null);
  const matchID = ref<string | null>(null);
  const gameId = ref<string | null>(null);

  /** True when this client may make a move (current turn or listed in ctx.activePlayers). */
  const isMyTurn = computed(() => {
    if (!isActive.value || playerID.value == null) return false;
    const c = ctx.value;
    if (!c) return false;
    const ap = c.activePlayers;
    if (ap && playerID.value in ap) return true;
    return currentPlayer.value === playerID.value;
  });

  const moves = computed(() => {
    clientVersion.value;
    return bgioClient?.moves ?? {};
  });

  function syncState(state: unknown) {
    const s = state as {
      G?: Record<string, unknown> | null;
      ctx?: {
        currentPlayer: string;
        phase?: string | null;
        gameover?: unknown;
        activePlayers?: Record<string, string> | null;
      } | null;
      isActive?: boolean;
      isConnected?: boolean;
    } | null;
    if (!s) return;

    if (reconnecting.value) {
      reconnecting.value = false;
      clearSessionRestoreTimer();
    }

    if (s.G != null) {
      G.value = s.G;
    }
    // Merge ctx so partial payloads (e.g. missing `phase`) don’t wipe fields from the previous sync.
    if (s.ctx != null) {
      const prev = ctx.value;
      ctx.value = { ...prev, ...s.ctx };
      if (typeof s.ctx.currentPlayer === 'string') {
        currentPlayer.value = s.ctx.currentPlayer;
      }
      if (s.ctx.gameover !== undefined) {
        gameover.value = s.ctx.gameover as typeof gameover.value;
      }
    }
    // Some subscribe callbacks omit these; assigning undefined made the UI think the match stopped.
    if (typeof s.isActive === 'boolean') {
      isActive.value = s.isActive;
    }
    if (typeof s.isConnected === 'boolean') {
      isConnected.value = s.isConnected;
    }
  }

  function connect(gId: string, mID: string, pID: string, credentials?: string) {
    const def = gameMap[gId];
    if (!def) throw new Error(`Unknown game: ${gId}`);

    gameId.value = gId;
    matchID.value = mID;
    playerID.value = pID;

    clearSessionRestoreTimer();
    if (credentials) {
      reconnecting.value = true;
      scheduleSessionRestoreTimeout();
    }

    bgioClient = Client({
      game: def.game,
      debug: _debug,
      ...(_serverUrl ? { multiplayer: SocketIO({ server: _serverUrl }) } : {}),
      matchID: mID,
      playerID: pID,
      credentials,
    } as Parameters<typeof Client>[0]);

    bgioClient.subscribe(syncState);
    bgioClient.start();
    clientVersion.value++;
  }

  function disconnect() {
    clearSessionRestoreTimer();
    bgioClient?.stop();
    bgioClient = null;
    clientVersion.value++;
    G.value = {};
    ctx.value = { currentPlayer: '0' };
    currentPlayer.value = '0';
    gameover.value = undefined;
    isActive.value = false;
    isConnected.value = false;
    reconnecting.value = false;
    gameId.value = null;
  }

  return {
    G,
    ctx,
    currentPlayer,
    gameover,
    isActive,
    isConnected,
    reconnecting,
    playerID,
    matchID,
    gameId,
    isMyTurn,
    moves,
    connect,
    disconnect,
  };
});
