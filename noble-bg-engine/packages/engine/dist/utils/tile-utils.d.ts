import type { SquareBoard } from '../types/board.js';
import type { TileShape, TileRotation, PlacedTile, TileLayer } from '../types/tile.js';
/** Factory for creating a tile shape template. */
export declare function defineTileShape(id: string, offsets: [number, number][], label?: string): TileShape;
/**
 * Rotate tile offsets clockwise by the given amount.
 * Normalizes the result so all offsets are non-negative (min row/col = 0).
 */
export declare function rotateTileOffsets(offsets: [number, number][], rotation: TileRotation): [number, number][];
/** Serialize row/col to an occupancy map key. */
export declare function getCellKey(row: number, col: number): string;
/** Create an empty tile layer. */
export declare function createTileLayer(): TileLayer;
/**
 * Check whether a tile shape can be placed at the given anchor with the
 * given rotation. All cells must be in-bounds and unoccupied.
 */
export declare function canPlaceTile(layer: TileLayer, board: SquareBoard, shape: TileShape, anchorRow: number, anchorCol: number, rotation?: TileRotation): boolean;
/**
 * Place a tile on the board (Immer-safe mutation).
 * Computes absolute cell positions, registers in `placed` and `occupancy`.
 * Throws if placement is invalid. Returns the created `PlacedTile`.
 */
export declare function placeTile(layer: TileLayer, board: SquareBoard, shape: TileShape, anchorRow: number, anchorCol: number, rotation?: TileRotation, owner?: string | null, id?: string): PlacedTile;
/** Get the placed tile covering a cell, or `undefined` if the cell is empty. */
export declare function getTileAt(layer: TileLayer, row: number, col: number): PlacedTile | undefined;
/** Get the absolute cell positions for a placed tile, or `undefined` if not found. */
export declare function getTileCells(layer: TileLayer, tileId: string): [number, number][] | undefined;
/** Common polyomino shapes for convenience. Games can use these or define custom shapes. */
export declare const STANDARD_TILE_SHAPES: Record<string, TileShape>;
//# sourceMappingURL=tile-utils.d.ts.map