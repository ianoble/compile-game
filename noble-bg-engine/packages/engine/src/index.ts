export type { BaseGameState, GameDefinition, GameContext, MoveValidationContext, LogEntry } from './types/index.js';
export type { VisibleCard, HiddenCard, Card } from './types/index.js';
export { defineGame, isCardHidden, redactCards } from './types/index.js';
export { createStandardDeck, shuffle } from './utils/deck-utils.js';

// Re-export boardgame.io types/values so game-logic files can import from
// @noble/bg-engine (server-compatible) rather than @noble/bg-engine/client.
export type { Game, Ctx } from 'boardgame.io';
// Defined locally to avoid `boardgame.io/core` directory import which breaks
// Node.js ESM resolution (boardgame.io lacks a proper exports map for /core).
export const INVALID_MOVE = 'INVALID_MOVE';
export type { StandardCard, Suit, Rank } from './utils/deck-utils.js';
export type { GamePiece, BoardCell, SquareBoard, HexCoord, HexBoard, Board } from './types/index.js';
export {
  createSquareBoard, getSquareCell, squareNeighbors, placePiece, removePiece, flipCell, findPieces,
  hexKey, parseHexKey, createHexBoard, getHexCell, hexNeighbors, placePieceHex, removePieceHex, flipHexCell, findPiecesHex,
} from './utils/board-utils.js';
export type { ResourcePool, Track, Slot } from './types/index.js';
export {
  createResourcePool, addResource, removeResource, getResource, hasResource,
  createTrack, advanceTrack, setTrack,
  createSlot, addToSlot, removeFromSlot, isSlotFull,
} from './utils/player-board-utils.js';
export type { TileShape, TileRotation, PlacedTile, TileLayer } from './types/index.js';
export {
  defineTileShape, rotateTileOffsets, getCellKey,
  createTileLayer, canPlaceTile, placeTile, getTileAt, getTileCells,
  STANDARD_TILE_SHAPES,
} from './utils/tile-utils.js';
export { prepareGame } from './prepare.js';
export { gameRegistry, gameMap, registerGame } from './games/registry.js';
