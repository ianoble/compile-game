const INVALID_MOVE = 'INVALID_MOVE';
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
export function prepareGame(def) {
    let game = { ...def.game, name: def.id };
    game = applyHistoryTracking(game);
    if (def.validateMove) {
        game = applyMoveValidation(game, def.validateMove);
    }
    if (def.stripSecretInfo) {
        const strip = def.stripSecretInfo;
        game = {
            ...game,
            playerView: ({ G, playerID }) => strip(G, playerID ?? null),
        };
    }
    return game;
}
/**
 * Wraps `setup` to inject `history: []` and wraps every move so that a
 * {@link LogEntry} is appended to `G.history` after successful execution.
 * Applied unconditionally by {@link prepareGame}.
 */
function applyHistoryTracking(game) {
    const originalSetup = game.setup;
    const originalMoves = game.moves ?? {};
    const trackedMoves = {};
    for (const [name, entry] of Object.entries(originalMoves)) {
        const moveFn = typeof entry === 'function'
            ? entry
            : entry.move;
        trackedMoves[name] = (context, ...args) => {
            const result = moveFn(context, ...args);
            if (result === INVALID_MOVE)
                return INVALID_MOVE;
            const G = context.G;
            if (!G.history)
                G.history = [];
            const entry = {
                seq: G.history.length + 1,
                timestamp: new Date().toISOString(),
                playerID: context.playerID ?? context.ctx.currentPlayer,
                moveName: name,
                args: args.map(sanitiseArg),
            };
            G.history.push(entry);
            return result;
        };
    }
    return {
        ...game,
        setup: (...setupArgs) => {
            const state = originalSetup
                ? originalSetup(...setupArgs)
                : {};
            return { ...state, history: [] };
        },
        moves: trackedMoves,
    };
}
/** Keep only JSON-safe primitives in logged args. */
function sanitiseArg(val) {
    if (val === null || val === undefined)
        return val;
    if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean')
        return val;
    if (Array.isArray(val))
        return val.map(sanitiseArg);
    if (typeof val === 'object') {
        try {
            return JSON.parse(JSON.stringify(val));
        }
        catch {
            return '[object]';
        }
    }
    return String(val);
}
function applyMoveValidation(game, validate) {
    const originalMoves = game.moves ?? {};
    const wrappedMoves = {};
    for (const [name, entry] of Object.entries(originalMoves)) {
        const moveFn = typeof entry === 'function'
            ? entry
            : entry.move;
        wrappedMoves[name] = (context, ...args) => {
            const result = validate({
                G: context.G,
                playerID: context.playerID,
                currentPlayer: context.ctx.currentPlayer,
            }, name, ...args);
            if (result !== true)
                return INVALID_MOVE;
            return moveFn(context, ...args);
        };
    }
    return { ...game, moves: wrappedMoves };
}
//# sourceMappingURL=prepare.js.map