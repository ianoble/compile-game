import { defineStore } from 'pinia';
import { ref, computed, shallowRef } from 'vue';
import { Client } from 'boardgame.io/client';
import { SocketIO } from 'boardgame.io/multiplayer';
import { gameMap } from '../../games/registry.js';

let _serverUrl = '';
let _debug = false;

export function setServerUrl(url: string) {
  _serverUrl = url;
}

export function setDebug(enabled: boolean) {
  _debug = enabled;
}

export const useGameStore = defineStore('game', () => {
  let bgioClient: ReturnType<typeof Client> | null = null;
  const clientVersion = ref(0);

  const G = shallowRef<Record<string, unknown>>({});
  const currentPlayer = ref('0');
  const gameover = ref<{ winner?: string; isDraw?: boolean } | undefined>();
  const isActive = ref(false);
  const isConnected = ref(false);
  const reconnecting = ref(false);
  const playerID = ref<string | null>(null);
  const matchID = ref<string | null>(null);
  const gameId = ref<string | null>(null);

  const isMyTurn = computed(() => isActive.value && currentPlayer.value === playerID.value);

  const moves = computed(() => {
    clientVersion.value;
    return bgioClient?.moves ?? {};
  });

  function syncState(state: unknown) {
    const s = state as {
      G: Record<string, unknown>;
      ctx: { currentPlayer: string; gameover?: unknown };
      isActive: boolean;
      isConnected: boolean;
    } | null;
    if (!s) return;

    if (reconnecting.value) {
      reconnecting.value = false;
    }

    G.value = s.G;
    currentPlayer.value = s.ctx.currentPlayer;
    gameover.value = s.ctx.gameover as typeof gameover.value;
    isActive.value = s.isActive;
    isConnected.value = s.isConnected;
  }

  function connect(gId: string, mID: string, pID: string, credentials?: string) {
    const def = gameMap[gId];
    if (!def) throw new Error(`Unknown game: ${gId}`);

    gameId.value = gId;
    matchID.value = mID;
    playerID.value = pID;

    if (credentials) {
      reconnecting.value = true;
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
    bgioClient?.stop();
    bgioClient = null;
    clientVersion.value++;
    G.value = {};
    currentPlayer.value = '0';
    gameover.value = undefined;
    isActive.value = false;
    isConnected.value = false;
    reconnecting.value = false;
    gameId.value = null;
  }

  return {
    G,
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
