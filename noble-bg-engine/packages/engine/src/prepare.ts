import type { Game } from 'boardgame.io';
import type { GameDefinition, BaseGameState, LogEntry } from './types/index.js';

const INVALID_MOVE = 'INVALID_MOVE';

type MoveContext = { G: unknown; ctx: { currentPlayer: string }; playerID: string };

/**
 * Prepare a {@link GameDefinition} for registration with boardgame.io's
 * `Server`.  Applies three wrappers in order:
 *
 * 1. **History injection** — wraps `setup` to seed `history: []` and
 *    wraps every move to push a {@link LogEntry} after successful execution.
 * 2. **Move validation** — if `validateMove` is defined, every move is
 *    guarded by it before the actual move function runs.
 * 3. **Secret-info stripping** — if `stripSecretInfo` is defined, it is
 *    wired into boardgame.io's `playerView`.
 */
export function prepareGame(def: GameDefinition): Game {
  let game: Game = { ...def.game, name: def.id };

  game = applyHistoryTracking(game);

  if (def.validateMove) {
    game = applyMoveValidation(game, def.validateMove);
  }

  if (def.stripSecretInfo) {
    const strip = def.stripSecretInfo;
    game = {
      ...game,
      playerView: ({ G, playerID }) =>
        strip(G as BaseGameState, playerID ?? null),
    } as Game;
  }

  return game;
}

function wrapMoveWithHistory(
  moveName: string,
  moveFn: (context: MoveContext, ...args: unknown[]) => unknown,
): (context: MoveContext, ...args: unknown[]) => unknown {
  return (context, ...args) => {
    const result = moveFn(context, ...args);
    if (result === INVALID_MOVE) return INVALID_MOVE;

    const G = context.G as BaseGameState;
    if (!G.history) G.history = [];

    const logEntry: LogEntry = {
      seq: G.history.length + 1,
      timestamp: new Date().toISOString(),
      playerID: context.playerID ?? context.ctx.currentPlayer,
      moveName,
      args: args.map(sanitiseArg),
    };
    G.history.push(logEntry);

    return result;
  };
}

/**
 * Wraps `setup` to inject `history: []` and wraps every move so that a
 * {@link LogEntry} is appended to `G.history` after successful execution.
 * Long-form moves `{ move, undoable, ... }` keep their metadata for boardgame.io.
 * Applied unconditionally by {@link prepareGame}.
 */
function applyHistoryTracking(game: Game): Game {
  const originalSetup = game.setup;
  const originalMoves = game.moves ?? {};
  const trackedMoves: Record<string, unknown> = {};

  for (const [name, entry] of Object.entries(originalMoves)) {
    if (typeof entry === 'function') {
      trackedMoves[name] = wrapMoveWithHistory(
        name,
        entry as (context: MoveContext, ...args: unknown[]) => unknown,
      );
    } else if (entry != null && typeof entry === 'object' && 'move' in entry) {
      const desc = entry as { move: (context: MoveContext, ...args: unknown[]) => unknown };
      trackedMoves[name] = {
        ...entry,
        move: wrapMoveWithHistory(name, desc.move),
      };
    } else {
      trackedMoves[name] = entry;
    }
  }

  return {
    ...game,
    setup: (...setupArgs: unknown[]) => {
      const state = originalSetup
        ? (originalSetup as (...a: unknown[]) => Record<string, unknown>)(...setupArgs)
        : {};
      return { ...state, history: [] };
    },
    moves: trackedMoves,
  } as Game;
}

/** Keep only JSON-safe primitives in logged args. */
function sanitiseArg(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') return val;
  if (Array.isArray(val)) return val.map(sanitiseArg);
  if (typeof val === 'object') {
    try { return JSON.parse(JSON.stringify(val)); } catch { return '[object]'; }
  }
  return String(val);
}

function applyMoveValidation(
  game: Game,
  validate: NonNullable<GameDefinition['validateMove']>,
): Game {
  const originalMoves = game.moves ?? {};
  const wrappedMoves: Record<string, unknown> = {};

  for (const [name, entry] of Object.entries(originalMoves)) {
    const wrapValidatedInner = (
      inner: (context: MoveContext, ...args: unknown[]) => unknown,
    ): ((context: MoveContext, ...args: unknown[]) => unknown) => {
      return (context, ...args) => {
        const v = validate(
          {
            G: context.G as BaseGameState,
            playerID: context.playerID,
            currentPlayer: context.ctx.currentPlayer,
          },
          name,
          ...args,
        );

        if (v !== true) return INVALID_MOVE;

        return inner(context, ...args);
      };
    };

    if (typeof entry === 'function') {
      wrappedMoves[name] = wrapValidatedInner(entry as (context: MoveContext, ...args: unknown[]) => unknown);
    } else if (entry != null && typeof entry === 'object' && 'move' in entry) {
      const desc = entry as { move: (context: MoveContext, ...args: unknown[]) => unknown };
      wrappedMoves[name] = {
        ...entry,
        move: wrapValidatedInner(desc.move),
      };
    } else {
      wrappedMoves[name] = entry;
    }
  }

  return { ...game, moves: wrappedMoves } as Game;
}
