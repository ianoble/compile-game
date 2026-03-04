import { provide, inject, computed, type InjectionKey, type ComputedRef, type Ref } from 'vue';
import type { BaseGameState } from '../../types/index.js';
import { gameMap } from '../../games/registry.js';
import { useGameStore } from '../stores/game.js';
import { useToast, type ToastContext } from './useToast.js';

export interface GameContext<S extends BaseGameState = BaseGameState> {
  state: ComputedRef<S>;
  /** Boardgame.io context (phase, currentPlayer, etc.). */
  ctx: Ref<{ currentPlayer: string; phase?: string; gameover?: unknown }>;
  currentPlayer: Ref<string>;
  playerID: Ref<string | null>;
  matchID: Ref<string | null>;
  gameId: Ref<string | null>;
  gameover: Ref<{ winner?: string; isDraw?: boolean } | undefined>;
  isActive: Ref<boolean>;
  isConnected: Ref<boolean>;
  /** True while re-authenticating with stored credentials after a page refresh. */
  reconnecting: Ref<boolean>;
  isMyTurn: ComputedRef<boolean>;
  /** Dispatch a boardgame.io move by name. Shows a toast if the move is invalid. */
  move: (name: string, ...args: unknown[]) => void;
  canDo: (moveName: string, ...args: unknown[]) => true | string;
  connect: (gameId: string, matchID: string, playerID: string, credentials?: string) => void;
  disconnect: () => void;
}

const GAME_KEY: InjectionKey<GameContext> = Symbol('game-context');

export function provideGameContext(toast?: ToastContext): GameContext {
  const store = useGameStore();
  const { showToast } = toast ?? useToast();

  function canDo(moveName: string, ...args: unknown[]): true | string {
    const gId = store.gameId;
    if (!gId) return 'No game connected';

    const def = gameMap[gId];
    if (!def?.validateMove) return true;

    return def.validateMove(
      {
        G: store.G as BaseGameState,
        playerID: store.playerID ?? '',
        currentPlayer: store.currentPlayer,
      },
      moveName,
      ...args,
    );
  }

  function move(name: string, ...args: unknown[]) {
    const result = canDo(name, ...args);
    if (result !== true) {
      showToast(result, 'error');
      return;
    }

    const fn = store.moves[name];
    if (typeof fn === 'function') {
      (fn as (...a: unknown[]) => void)(...args);
    }
  }

  const gameCtx: GameContext = {
    state: computed(() => store.G as BaseGameState),
    ctx: store.ctx as unknown as Ref<{ currentPlayer: string; phase?: string; gameover?: unknown }>,
    currentPlayer: computed({ get: () => store.currentPlayer, set() {} }),
    playerID: computed({ get: () => store.playerID, set() {} }),
    matchID: computed({ get: () => store.matchID, set() {} }),
    gameId: computed({ get: () => store.gameId, set() {} }),
    gameover: computed({ get: () => store.gameover, set() {} }),
    isActive: computed({ get: () => store.isActive, set() {} }),
    isConnected: computed({ get: () => store.isConnected, set() {} }),
    reconnecting: computed({ get: () => store.reconnecting, set() {} }),
    isMyTurn: computed(() => store.isMyTurn),
    move,
    canDo,
    connect: store.connect,
    disconnect: store.disconnect,
  };

  provide(GAME_KEY, gameCtx);
  return gameCtx;
}

export function useGame<S extends BaseGameState = BaseGameState>(): GameContext<S> {
  const injected = inject(GAME_KEY);
  if (!injected) {
    throw new Error('useGame() requires an ancestor component to call provideGameContext()');
  }
  return injected as unknown as GameContext<S>;
}
