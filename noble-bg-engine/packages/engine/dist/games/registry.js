"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gameMap = exports.gameRegistry = void 0;
exports.registerGame = registerGame;
/** All registered games. Games are added at runtime via registerGame() (e.g. from server in-repo games). */
exports.gameRegistry = [];
/** Lookup a game definition by its id. */
exports.gameMap = Object.fromEntries(exports.gameRegistry.map(function (def) { return [def.id, def]; }));
/** Register a game at runtime so external projects can add their own games. */
function registerGame(def) {
    if (exports.gameMap[def.id])
        return;
    exports.gameRegistry.push(def);
    exports.gameMap[def.id] = def;
}
