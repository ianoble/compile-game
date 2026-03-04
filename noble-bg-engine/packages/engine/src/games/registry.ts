import type { GameDefinition } from '../types/index.js';

/** All registered games. Games are added at runtime via registerGame() (e.g. from server in-repo games). */
export const gameRegistry: GameDefinition[] = [];

/** Lookup a game definition by its id. */
export const gameMap: Record<string, GameDefinition> = Object.fromEntries(
	gameRegistry.map((def) => [def.id, def]),
);

/** Register a game at runtime so external projects can add their own games. */
export function registerGame(def: GameDefinition): void {
	if (gameMap[def.id]) return;
	gameRegistry.push(def);
	gameMap[def.id] = def;
}
