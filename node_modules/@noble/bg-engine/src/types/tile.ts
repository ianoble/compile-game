/**
 * A reusable tile shape template defined as `[row, col]` offsets
 * relative to an anchor at `[0, 0]`.
 *
 * @example
 * ```ts
 * // L-shape
 * const lShape: TileShape = {
 *   id: 'L',
 *   offsets: [[0, 0], [1, 0], [2, 0], [2, 1]],
 * };
 * ```
 */
export interface TileShape {
  id: string;
  offsets: [number, number][];
  label?: string;
}

/** Clockwise rotation in degrees. */
export type TileRotation = 0 | 90 | 180 | 270;

/**
 * A tile that has been placed on the board.
 * `cells` contains the **absolute** board positions computed at placement time.
 */
export interface PlacedTile {
  id: string;
  shapeId: string;
  owner: string | null;
  anchorRow: number;
  anchorCol: number;
  rotation: TileRotation;
  /** Absolute `[row, col]` positions this tile occupies on the board. */
  cells: [number, number][];
  [key: string]: unknown;
}

/**
 * A companion data structure for `SquareBoard` that tracks tile placement.
 * `occupancy` maps `"row,col"` strings to tile IDs for O(1) lookups.
 */
export interface TileLayer {
  placed: Record<string, PlacedTile>;
  /** Maps `"row,col"` -> tile ID for quick cell-to-tile lookups. */
  occupancy: Record<string, string>;
}
