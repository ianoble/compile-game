import type { Game } from 'boardgame.io';

/** A single entry in the move history log. */
export interface LogEntry {
  /** Monotonically increasing sequence number. */
  seq: number;
  /** ISO-8601 timestamp of when the move was executed. */
  timestamp: string;
  /** The player who made the move. */
  playerID: string;
  /** The boardgame.io move name. */
  moveName: string;
  /** Serialisable summary of move arguments (for display only). */
  args: unknown[];
}

/**
 * Base interface all game states must extend.
 * Guarantees state objects are plain serialisable records suitable for
 * boardgame.io synchronisation. Individual games add their own fields
 * on top of this contract.
 */
export interface BaseGameState {
  /** Framework-managed move history. Automatically populated by `prepareGame`. */
  history: LogEntry[];
  [key: string]: unknown;
}

/** Context passed to {@link GameDefinition.validateMove}. */
export interface MoveValidationContext<S extends BaseGameState = BaseGameState> {
  G: S;
  playerID: string;
  currentPlayer: string;
}

// ---------------------------------------------------------------------------
// Setup options — declarative schema for per-match configuration
// ---------------------------------------------------------------------------

/** A boolean toggle (e.g. "Include expansion content"). */
export interface GameSetupOptionBoolean {
  type: 'boolean';
  id: string;
  label: string;
  description?: string;
  default: boolean;
}

/**
 * Union of all supported option types.
 * Extend this union when new control types are needed (select, number, …).
 */
export type GameSetupOption = GameSetupOptionBoolean;

// ---------------------------------------------------------------------------
// Game definition
// ---------------------------------------------------------------------------

/**
 * Registry-facing metadata for a game.
 * The `game` field stores a boardgame.io `Game` without a state type
 * parameter so that heterogeneous games can coexist in a single array.
 * Use {@link defineGame} to create instances with compile-time state
 * validation.
 */
export interface GameDefinition {
  game: Game;
  id: string;
  displayName: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  /**
   * Optional pre-move validator shared between client and server.
   * Return `true` to allow the move, or a string describing why it
   * is invalid. When omitted, all moves are allowed through to
   * boardgame.io's own move logic.
   */
  validateMove?: (
    context: MoveValidationContext,
    moveName: string,
    ...args: unknown[]
  ) => true | string;
  /**
   * Optional server-side filter that removes secret information from
   * the game state before it is sent to a specific player.  Wired
   * into boardgame.io's `playerView`.  Return a new state object
   * with secrets redacted (e.g. replace the deck array with a count,
   * replace opponents' hands with {@link HiddenCard} arrays).
   */
  stripSecretInfo?: (
    G: BaseGameState,
    playerID: string | null,
  ) => BaseGameState;
  /**
   * Declarative list of per-match options shown to the host when
   * creating a game.  Values are passed to the game's `setup` function
   * via boardgame.io's `setupData`.
   */
  setupOptions?: GameSetupOption[];
}

/**
 * Type-safe factory for creating a {@link GameDefinition}.
 * Constrains `S` to extend {@link BaseGameState} at the call-site,
 * then widens the result so it fits into the heterogeneous registry.
 *
 * @example
 * ```ts
 * export const myGameDef = defineGame<MyGameState>({
 *   game: MyGame,
 *   id: 'my-game',
 *   displayName: 'My Game',
 *   description: 'Description.',
 *   minPlayers: 2,
 *   maxPlayers: 4,
 *   validateMove({ G, playerID, currentPlayer }, moveName, ...args) {
 *     if (playerID !== currentPlayer) return 'Not your turn';
 *     return true;
 *   },
 * });
 * ```
 */
export function defineGame<S extends BaseGameState>(
  def: Omit<GameDefinition, 'game' | 'validateMove' | 'stripSecretInfo'> & {
    game: Game<S>;
    validateMove?: (
      context: MoveValidationContext<S>,
      moveName: string,
      ...args: unknown[]
    ) => true | string;
    stripSecretInfo?: (G: S, playerID: string | null) => BaseGameState;
  },
): GameDefinition {
  return def as GameDefinition;
}

/**
 * Generic envelope for any board-game state so the Pinia store
 * can work with any game without knowing its concrete state type.
 */
export interface GameContext<S = unknown> {
  G: S;
  currentPlayer: string;
  gameover?: { winner?: string; isDraw?: boolean };
  isActive: boolean;
  isConnected: boolean;
}
