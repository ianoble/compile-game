import type { SquareBoard } from '../types/board.js';
import type {
  TileShape,
  TileRotation,
  PlacedTile,
  TileLayer,
} from '../types/tile.js';

// ---------------------------------------------------------------------------
// Shape definition
// ---------------------------------------------------------------------------

/** Factory for creating a tile shape template. */
export function defineTileShape(
  id: string,
  offsets: [number, number][],
  label?: string,
): TileShape {
  return { id, offsets, label };
}

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------

/**
 * Rotate tile offsets clockwise by the given amount.
 * Normalizes the result so all offsets are non-negative (min row/col = 0).
 */
export function rotateTileOffsets(
  offsets: [number, number][],
  rotation: TileRotation,
): [number, number][] {
  const steps = rotation / 90;
  let result = offsets.map(([r, c]) => [r, c] as [number, number]);

  for (let i = 0; i < steps; i++) {
    result = result.map(([r, c]) => [c, -r] as [number, number]);
  }

  const minR = Math.min(...result.map(([r]) => r));
  const minC = Math.min(...result.map(([, c]) => c));
  return result.map(([r, c]) => [r - minR, c - minC] as [number, number]);
}

// ---------------------------------------------------------------------------
// Cell key helpers
// ---------------------------------------------------------------------------

/** Serialize row/col to an occupancy map key. */
export function getCellKey(row: number, col: number): string {
  return `${row},${col}`;
}

// ---------------------------------------------------------------------------
// Layer operations
// ---------------------------------------------------------------------------

/** Create an empty tile layer. */
export function createTileLayer(): TileLayer {
  return { placed: {}, occupancy: {} };
}

let _tileCounter = 0;

/**
 * Check whether a tile shape can be placed at the given anchor with the
 * given rotation. All cells must be in-bounds and unoccupied.
 */
export function canPlaceTile(
  layer: TileLayer,
  board: SquareBoard,
  shape: TileShape,
  anchorRow: number,
  anchorCol: number,
  rotation: TileRotation = 0,
): boolean {
  const rotated = rotateTileOffsets(shape.offsets, rotation);
  for (const [dr, dc] of rotated) {
    const r = anchorRow + dr;
    const c = anchorCol + dc;
    if (r < 0 || r >= board.rows || c < 0 || c >= board.cols) return false;
    if (layer.occupancy[getCellKey(r, c)] !== undefined) return false;
  }
  return true;
}

/**
 * Place a tile on the board (Immer-safe mutation).
 * Computes absolute cell positions, registers in `placed` and `occupancy`.
 * Throws if placement is invalid. Returns the created `PlacedTile`.
 */
export function placeTile(
  layer: TileLayer,
  board: SquareBoard,
  shape: TileShape,
  anchorRow: number,
  anchorCol: number,
  rotation: TileRotation = 0,
  owner: string | null = null,
  id?: string,
): PlacedTile {
  if (!canPlaceTile(layer, board, shape, anchorRow, anchorCol, rotation)) {
    throw new Error(
      `Cannot place tile "${shape.id}" at (${anchorRow},${anchorCol}) rotation=${rotation}`,
    );
  }

  const tileId = id ?? `tile_${_tileCounter++}`;
  const rotated = rotateTileOffsets(shape.offsets, rotation);
  const cells: [number, number][] = rotated.map(
    ([dr, dc]) => [anchorRow + dr, anchorCol + dc] as [number, number],
  );

  const tile: PlacedTile = {
    id: tileId,
    shapeId: shape.id,
    owner,
    anchorRow,
    anchorCol,
    rotation,
    cells,
  };

  layer.placed[tileId] = tile;
  for (const [r, c] of cells) {
    layer.occupancy[getCellKey(r, c)] = tileId;
  }

  return tile;
}

/** Get the placed tile covering a cell, or `undefined` if the cell is empty. */
export function getTileAt(
  layer: TileLayer,
  row: number,
  col: number,
): PlacedTile | undefined {
  const tileId = layer.occupancy[getCellKey(row, col)];
  if (tileId === undefined) return undefined;
  return layer.placed[tileId];
}

/** Get the absolute cell positions for a placed tile, or `undefined` if not found. */
export function getTileCells(
  layer: TileLayer,
  tileId: string,
): [number, number][] | undefined {
  return layer.placed[tileId]?.cells;
}

// ---------------------------------------------------------------------------
// Standard shapes
// ---------------------------------------------------------------------------

/** Common polyomino shapes for convenience. Games can use these or define custom shapes. */
export const STANDARD_TILE_SHAPES: Record<string, TileShape> = {
  '1x1':  defineTileShape('1x1',  [[0, 0]],                                             '1x1'),
  '1x2':  defineTileShape('1x2',  [[0, 0], [0, 1]],                                     '1x2 horizontal'),
  '2x1':  defineTileShape('2x1',  [[0, 0], [1, 0]],                                     '2x1 vertical'),
  '2x2':  defineTileShape('2x2',  [[0, 0], [0, 1], [1, 0], [1, 1]],                     '2x2 square'),
  'I3':   defineTileShape('I3',   [[0, 0], [1, 0], [2, 0]],                              'I-3'),
  'I4':   defineTileShape('I4',   [[0, 0], [1, 0], [2, 0], [3, 0]],                      'I-4'),
  'L':    defineTileShape('L',    [[0, 0], [1, 0], [2, 0], [2, 1]],                      'L'),
  'J':    defineTileShape('J',    [[0, 1], [1, 1], [2, 1], [2, 0]],                      'J'),
  'T':    defineTileShape('T',    [[0, 0], [0, 1], [0, 2], [1, 1]],                      'T'),
  'S':    defineTileShape('S',    [[0, 1], [0, 2], [1, 0], [1, 1]],                      'S'),
  'Z':    defineTileShape('Z',    [[0, 0], [0, 1], [1, 1], [1, 2]],                      'Z'),
  'O':    defineTileShape('O',    [[0, 0], [0, 1], [1, 0], [1, 1]],                      'O (2x2)'),
};
