import type { GameDefinition } from '../types/index.js';
/** All registered games. Games are added at runtime via registerGame() (e.g. from server in-repo games). */
export declare const gameRegistry: GameDefinition[];
/** Lookup a game definition by its id. */
export declare const gameMap: Record<string, GameDefinition>;
/** Register a game at runtime so external projects can add their own games. */
export declare function registerGame(def: GameDefinition): void;
//# sourceMappingURL=registry.d.ts.map