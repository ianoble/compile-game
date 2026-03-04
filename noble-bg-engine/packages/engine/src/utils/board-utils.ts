import type {
  GamePiece,
  BoardCell,
  SquareBoard,
  HexBoard,
  HexCoord,
} from '../types/board.js';

// ---------------------------------------------------------------------------
// Square grid
// ---------------------------------------------------------------------------

function emptyCell<P extends GamePiece>(): BoardCell<P> {
  return { pieces: [] };
}

/** Create an empty square board. An optional `init` callback can populate each cell. */
export function createSquareBoard<P extends GamePiece = GamePiece>(
  rows: number,
  cols: number,
  init?: (row: number, col: number) => BoardCell<P>,
): SquareBoard<P> {
  const cells: BoardCell<P>[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: BoardCell<P>[] = [];
    for (let c = 0; c < cols; c++) {
      row.push(init ? init(r, c) : emptyCell<P>());
    }
    cells.push(row);
  }
  return { kind: 'square', rows, cols, cells };
}

/** Safely get a cell. Returns undefined if coordinates are out of bounds. */
export function getSquareCell<P extends GamePiece>(
  board: SquareBoard<P>,
  row: number,
  col: number,
): BoardCell<P> | undefined {
  if (row < 0 || row >= board.rows || col < 0 || col >= board.cols) return undefined;
  return board.cells[row][col];
}

const ORTHOGONAL: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAGONAL: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

/**
 * Return in-bounds neighbor coordinates.
 * 4-connected by default; pass `diagonal: true` for 8-connected.
 */
export function squareNeighbors(
  row: number,
  col: number,
  rows: number,
  cols: number,
  diagonal = false,
): { row: number; col: number }[] {
  const dirs = diagonal ? [...ORTHOGONAL, ...DIAGONAL] : ORTHOGONAL;
  const result: { row: number; col: number }[] = [];
  for (const [dr, dc] of dirs) {
    const nr = row + dr;
    const nc = col + dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
      result.push({ row: nr, col: nc });
    }
  }
  return result;
}

/** Push a piece onto a cell (Immer-safe mutation). */
export function placePiece<P extends GamePiece>(
  board: SquareBoard<P>,
  row: number,
  col: number,
  piece: P,
): void {
  const cell = getSquareCell(board, row, col);
  if (!cell) throw new Error(`Cell (${row},${col}) is out of bounds`);
  cell.pieces.push(piece);
}

/** Remove a piece by id from a cell (Immer-safe mutation). */
export function removePiece<P extends GamePiece>(
  board: SquareBoard<P>,
  row: number,
  col: number,
  pieceId: string,
): P | undefined {
  const cell = getSquareCell(board, row, col);
  if (!cell) return undefined;
  const idx = cell.pieces.findIndex((p) => p.id === pieceId);
  if (idx === -1) return undefined;
  return cell.pieces.splice(idx, 1)[0];
}

/** Flip a square-board cell face-up or face-down (Immer-safe mutation). */
export function flipCell<P extends GamePiece>(
  board: SquareBoard<P>,
  row: number,
  col: number,
  faceDown?: boolean,
): void {
  const cell = getSquareCell(board, row, col);
  if (!cell) throw new Error(`Cell (${row},${col}) is out of bounds`);
  cell.faceDown = faceDown ?? !cell.faceDown;
}

/** Find all pieces matching a predicate. Returns their coordinates and piece. */
export function findPieces<P extends GamePiece>(
  board: SquareBoard<P>,
  predicate: (piece: P, row: number, col: number) => boolean,
): { row: number; col: number; piece: P }[] {
  const results: { row: number; col: number; piece: P }[] = [];
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      for (const piece of board.cells[r][c].pieces) {
        if (predicate(piece, r, c)) {
          results.push({ row: r, col: c, piece });
        }
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Hex grid (axial coordinates, pointy-top)
// ---------------------------------------------------------------------------

/** Serialize axial coordinates to a record key. */
export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

/** Parse a hex key back to axial coordinates. */
export function parseHexKey(key: string): HexCoord {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

/**
 * Create a hex board with the given radius (distance from center in cells).
 * Radius 0 = 1 cell, radius 1 = 7 cells, radius 2 = 19 cells, etc.
 */
export function createHexBoard<P extends GamePiece = GamePiece>(
  radius: number,
  init?: (q: number, r: number) => BoardCell<P>,
): HexBoard<P> {
  const cells: Record<string, BoardCell<P>> = {};
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      cells[hexKey(q, r)] = init ? init(q, r) : emptyCell<P>();
    }
  }
  return { kind: 'hex', cells };
}

/** Safely get a hex cell. Returns undefined if coordinates don't exist. */
export function getHexCell<P extends GamePiece>(
  board: HexBoard<P>,
  q: number,
  r: number,
): BoardCell<P> | undefined {
  return board.cells[hexKey(q, r)];
}

const HEX_DIRECTIONS: [number, number][] = [
  [1, 0], [1, -1], [0, -1],
  [-1, 0], [-1, 1], [0, 1],
];

/** Return the 6 axial-coordinate neighbors of a hex cell. */
export function hexNeighbors(q: number, r: number): HexCoord[] {
  return HEX_DIRECTIONS.map(([dq, dr]) => ({ q: q + dq, r: r + dr }));
}

/** Push a piece onto a hex cell (Immer-safe mutation). */
export function placePieceHex<P extends GamePiece>(
  board: HexBoard<P>,
  q: number,
  r: number,
  piece: P,
): void {
  const cell = getHexCell(board, q, r);
  if (!cell) throw new Error(`Hex cell (${q},${r}) does not exist`);
  cell.pieces.push(piece);
}

/** Remove a piece by id from a hex cell (Immer-safe mutation). */
export function removePieceHex<P extends GamePiece>(
  board: HexBoard<P>,
  q: number,
  r: number,
  pieceId: string,
): P | undefined {
  const cell = getHexCell(board, q, r);
  if (!cell) return undefined;
  const idx = cell.pieces.findIndex((p) => p.id === pieceId);
  if (idx === -1) return undefined;
  return cell.pieces.splice(idx, 1)[0];
}

/** Flip a hex-board cell face-up or face-down (Immer-safe mutation). */
export function flipHexCell<P extends GamePiece>(
  board: HexBoard<P>,
  q: number,
  r: number,
  faceDown?: boolean,
): void {
  const cell = getHexCell(board, q, r);
  if (!cell) throw new Error(`Hex cell (${q},${r}) does not exist`);
  cell.faceDown = faceDown ?? !cell.faceDown;
}

/** Find all pieces matching a predicate on a hex board. */
export function findPiecesHex<P extends GamePiece>(
  board: HexBoard<P>,
  predicate: (piece: P, q: number, r: number) => boolean,
): { q: number; r: number; piece: P }[] {
  const results: { q: number; r: number; piece: P }[] = [];
  for (const [key, cell] of Object.entries(board.cells)) {
    const { q, r } = parseHexKey(key);
    for (const piece of cell.pieces as P[]) {
      if (predicate(piece, q, r)) {
        results.push({ q, r, piece });
      }
    }
  }
  return results;
}
