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
export function defineGame(def) {
    return def;
}
//# sourceMappingURL=framework.js.map