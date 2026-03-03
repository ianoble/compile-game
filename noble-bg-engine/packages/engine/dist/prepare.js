"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareGame = prepareGame;
var INVALID_MOVE = 'INVALID_MOVE';
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
function prepareGame(def) {
    var game = __assign(__assign({}, def.game), { name: def.id });
    game = applyHistoryTracking(game);
    if (def.validateMove) {
        game = applyMoveValidation(game, def.validateMove);
    }
    if (def.stripSecretInfo) {
        var strip_1 = def.stripSecretInfo;
        game = __assign(__assign({}, game), { playerView: function (_a) {
                var G = _a.G, playerID = _a.playerID;
                return strip_1(G, playerID !== null && playerID !== void 0 ? playerID : null);
            } });
    }
    return game;
}
/**
 * Wraps `setup` to inject `history: []` and wraps every move so that a
 * {@link LogEntry} is appended to `G.history` after successful execution.
 * Applied unconditionally by {@link prepareGame}.
 */
function applyHistoryTracking(game) {
    var _a;
    var originalSetup = game.setup;
    var originalMoves = (_a = game.moves) !== null && _a !== void 0 ? _a : {};
    var trackedMoves = {};
    var _loop_1 = function (name_1, entry) {
        var moveFn = typeof entry === 'function'
            ? entry
            : entry.move;
        trackedMoves[name_1] = function (context) {
            var _a;
            var args = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                args[_i - 1] = arguments[_i];
            }
            var result = moveFn.apply(void 0, __spreadArray([context], args, false));
            if (result === INVALID_MOVE)
                return INVALID_MOVE;
            var G = context.G;
            if (!G.history)
                G.history = [];
            var entry = {
                seq: G.history.length + 1,
                timestamp: new Date().toISOString(),
                playerID: (_a = context.playerID) !== null && _a !== void 0 ? _a : context.ctx.currentPlayer,
                moveName: name_1,
                args: args.map(sanitiseArg),
            };
            G.history.push(entry);
            return result;
        };
    };
    for (var _i = 0, _b = Object.entries(originalMoves); _i < _b.length; _i++) {
        var _c = _b[_i], name_1 = _c[0], entry = _c[1];
        _loop_1(name_1, entry);
    }
    return __assign(__assign({}, game), { setup: function () {
            var setupArgs = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                setupArgs[_i] = arguments[_i];
            }
            var state = originalSetup
                ? originalSetup.apply(void 0, setupArgs) : {};
            return __assign(__assign({}, state), { history: [] });
        }, moves: trackedMoves });
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
        catch (_a) {
            return '[object]';
        }
    }
    return String(val);
}
function applyMoveValidation(game, validate) {
    var _a;
    var originalMoves = (_a = game.moves) !== null && _a !== void 0 ? _a : {};
    var wrappedMoves = {};
    var _loop_2 = function (name_2, entry) {
        var moveFn = typeof entry === 'function'
            ? entry
            : entry.move;
        wrappedMoves[name_2] = function (context) {
            var args = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                args[_i - 1] = arguments[_i];
            }
            var result = validate.apply(void 0, __spreadArray([{
                    G: context.G,
                    playerID: context.playerID,
                    currentPlayer: context.ctx.currentPlayer,
                },
                name_2], args, false));
            if (result !== true)
                return INVALID_MOVE;
            return moveFn.apply(void 0, __spreadArray([context], args, false));
        };
    };
    for (var _i = 0, _b = Object.entries(originalMoves); _i < _b.length; _i++) {
        var _c = _b[_i], name_2 = _c[0], entry = _c[1];
        _loop_2(name_2, entry);
    }
    return __assign(__assign({}, game), { moves: wrappedMoves });
}
