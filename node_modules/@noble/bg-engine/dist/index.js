export { defineGame, isCardHidden, redactCards } from './types/index.js';
export { createStandardDeck, shuffle } from './utils/deck-utils.js';
// Defined locally to avoid `boardgame.io/core` directory import which breaks
// Node.js ESM resolution (boardgame.io lacks a proper exports map for /core).
export const INVALID_MOVE = 'INVALID_MOVE';
export { createSquareBoard, getSquareCell, squareNeighbors, placePiece, removePiece, flipCell, findPieces, hexKey, parseHexKey, createHexBoard, getHexCell, hexNeighbors, placePieceHex, removePieceHex, flipHexCell, findPiecesHex, } from './utils/board-utils.js';
export { createResourcePool, addResource, removeResource, getResource, hasResource, createTrack, advanceTrack, setTrack, createSlot, addToSlot, removeFromSlot, isSlotFull, } from './utils/player-board-utils.js';
export { defineTileShape, rotateTileOffsets, getCellKey, createTileLayer, canPlaceTile, placeTile, getTileAt, getTileCells, STANDARD_TILE_SHAPES, } from './utils/tile-utils.js';
export { prepareGame } from './prepare.js';
export { gameRegistry, gameMap, registerGame } from './games/registry.js';
//# sourceMappingURL=index.js.map