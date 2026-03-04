/** A game piece that can be placed on a board cell. */
export interface GamePiece {
  id: string;
  type: string;
  /** Player ID of the piece owner, or null for neutral/shared pieces. */
  owner: string | null;
  [key: string]: unknown;
}

/** A single cell on a board, holding zero or more pieces. */
export interface BoardCell<P extends GamePiece = GamePiece> {
  pieces: P[];
  /** Optional terrain or cell-type identifier for the game to interpret. */
  terrain?: string;
  /** When true the cell is face-down / hidden; games can reveal it with `flipCell`. */
  faceDown?: boolean;
}

/** A square/rectangular grid board. Cells are indexed [row][col]. */
export interface SquareBoard<P extends GamePiece = GamePiece> {
  kind: 'square';
  rows: number;
  cols: number;
  cells: BoardCell<P>[][];
}

/** Axial coordinates for a hexagonal grid (pointy-top orientation). */
export interface HexCoord {
  q: number;
  r: number;
}

/**
 * A hexagonal grid board.
 * Cells are stored in a Record keyed by `"q,r"` strings for serialization.
 */
export interface HexBoard<P extends GamePiece = GamePiece> {
  kind: 'hex';
  cells: Record<string, BoardCell<P>>;
}

/** Discriminated union of all board types. */
export type Board<P extends GamePiece = GamePiece> = SquareBoard<P> | HexBoard<P>;
