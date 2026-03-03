// Composables
export { provideGameContext, useGame } from './composables/useGame.js';
export type { GameContext } from './composables/useGame.js';

export { provideToastContext, useToast } from './composables/useToast.js';
export type { Toast, ToastContext } from './composables/useToast.js';

export { provideCardDrag, useCardDrag } from './composables/useCardDrag.js';
export type { DragPayload, DropZone, DragState, CardDragContext } from './composables/useCardDrag.js';

export { provideCardInspect, useCardInspect } from './composables/useCardInspect.js';
export type { CardInspectContext } from './composables/useCardInspect.js';

export { useTurnNotifications } from './composables/useTurnNotifications.js';
export type { TurnNotificationOptions, TurnNotificationReturn } from './composables/useTurnNotifications.js';

// Game registration (re-exported here so client apps use the same module
// instance as the store — avoids the dist/src dual-instance problem).
export { registerGame } from '../games/registry.js';
export { defineGame } from '../types/index.js';
export type { BaseGameState, GameDefinition } from '../types/index.js';

// Re-export boardgame.io types/values so consumers don't need a direct dependency.
export type { Game, Ctx } from 'boardgame.io';
export { INVALID_MOVE } from 'boardgame.io/core';

// Deck utilities
export { createStandardDeck, shuffle } from '../utils/deck-utils.js';
export type { StandardCard, Suit, Rank } from '../utils/deck-utils.js';

// Store
export { useGameStore, setServerUrl, setDebug } from './stores/game.js';

// Utilities
export { saveSession, loadSession, clearSession } from './utils/session.js';
export type { PlayerSession } from './utils/session.js';

// Components
export { default as NobleProvider } from './components/NobleProvider.vue';
export { default as ToastOverlay } from './components/ToastOverlay.vue';
export { default as GameLog } from './components/GameLog.vue';
export { default as CardComponent } from './components/cards/CardComponent.vue';
export { default as CardDeck } from './components/cards/CardDeck.vue';
export { default as CardHand } from './components/cards/CardHand.vue';
export { default as CardTableau } from './components/cards/CardTableau.vue';
export { default as CardInspector } from './components/cards/CardInspector.vue';
export { default as DragOverlay } from './components/cards/DragOverlay.vue';

// Board types, utilities, and components
export type { GamePiece, BoardCell, SquareBoard, HexCoord, HexBoard, Board } from '../types/index.js';
export {
  createSquareBoard, getSquareCell, squareNeighbors, placePiece, removePiece, flipCell, findPieces,
  hexKey, parseHexKey, createHexBoard, getHexCell, hexNeighbors, placePieceHex, removePieceHex, flipHexCell, findPiecesHex,
} from '../utils/board-utils.js';
export { default as SquareGrid } from './components/board/SquareGrid.vue';
export { default as HexGrid } from './components/board/HexGrid.vue';
export { default as PieceToken } from './components/board/PieceToken.vue';

// Player board types, utilities, and components
export type { ResourcePool, Track, Slot } from '../types/index.js';
export {
  createResourcePool, addResource, removeResource, getResource, hasResource,
  createTrack, advanceTrack, setTrack,
  createSlot, addToSlot, removeFromSlot, isSlotFull,
} from '../utils/player-board-utils.js';
export { default as ResourceCounter } from './components/player/ResourceCounter.vue';
export { default as TrackMeter } from './components/player/TrackMeter.vue';
export { default as SlotArea } from './components/player/SlotArea.vue';

// Tile types and utilities
export type { TileShape, TileRotation, PlacedTile, TileLayer } from '../types/index.js';
export {
  defineTileShape, rotateTileOffsets, getCellKey,
  createTileLayer, canPlaceTile, placeTile, getTileAt, getTileCells,
  STANDARD_TILE_SHAPES,
} from '../utils/tile-utils.js';
