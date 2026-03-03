import type { Game } from 'boardgame.io';
import type { GameDefinition } from './types/index.js';
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
export declare function prepareGame(def: GameDefinition): Game;
//# sourceMappingURL=prepare.d.ts.map