import type { GamePiece, BoardCell, SquareBoard, HexBoard, HexCoord } from '../types/board.js';
/** Create an empty square board. An optional `init` callback can populate each cell. */
export declare function createSquareBoard<P extends GamePiece = GamePiece>(rows: number, cols: number, init?: (row: number, col: number) => BoardCell<P>): SquareBoard<P>;
/** Safely get a cell. Returns undefined if coordinates are out of bounds. */
export declare function getSquareCell<P extends GamePiece>(board: SquareBoard<P>, row: number, col: number): BoardCell<P> | undefined;
/**
 * Return in-bounds neighbor coordinates.
 * 4-connected by default; pass `diagonal: true` for 8-connected.
 */
export declare function squareNeighbors(row: number, col: number, rows: number, cols: number, diagonal?: boolean): {
    row: number;
    col: number;
}[];
/** Push a piece onto a cell (Immer-safe mutation). */
export declare function placePiece<P extends GamePiece>(board: SquareBoard<P>, row: number, col: number, piece: P): void;
/** Remove a piece by id from a cell (Immer-safe mutation). */
export declare function removePiece<P extends GamePiece>(board: SquareBoard<P>, row: number, col: number, pieceId: string): P | undefined;
/** Flip a square-board cell face-up or face-down (Immer-safe mutation). */
export declare function flipCell<P extends GamePiece>(board: SquareBoard<P>, row: number, col: number, faceDown?: boolean): void;
/** Find all pieces matching a predicate. Returns their coordinates and piece. */
export declare function findPieces<P extends GamePiece>(board: SquareBoard<P>, predicate: (piece: P, row: number, col: number) => boolean): {
    row: number;
    col: number;
    piece: P;
}[];
/** Serialize axial coordinates to a record key. */
export declare function hexKey(q: number, r: number): string;
/** Parse a hex key back to axial coordinates. */
export declare function parseHexKey(key: string): HexCoord;
/**
 * Create a hex board with the given radius (distance from center in cells).
 * Radius 0 = 1 cell, radius 1 = 7 cells, radius 2 = 19 cells, etc.
 */
export declare function createHexBoard<P extends GamePiece = GamePiece>(radius: number, init?: (q: number, r: number) => BoardCell<P>): HexBoard<P>;
/** Safely get a hex cell. Returns undefined if coordinates don't exist. */
export declare function getHexCell<P extends GamePiece>(board: HexBoard<P>, q: number, r: number): BoardCell<P> | undefined;
/** Return the 6 axial-coordinate neighbors of a hex cell. */
export declare function hexNeighbors(q: number, r: number): HexCoord[];
/** Push a piece onto a hex cell (Immer-safe mutation). */
export declare function placePieceHex<P extends GamePiece>(board: HexBoard<P>, q: number, r: number, piece: P): void;
/** Remove a piece by id from a hex cell (Immer-safe mutation). */
export declare function removePieceHex<P extends GamePiece>(board: HexBoard<P>, q: number, r: number, pieceId: string): P | undefined;
/** Flip a hex-board cell face-up or face-down (Immer-safe mutation). */
export declare function flipHexCell<P extends GamePiece>(board: HexBoard<P>, q: number, r: number, faceDown?: boolean): void;
/** Find all pieces matching a predicate on a hex board. */
export declare function findPiecesHex<P extends GamePiece>(board: HexBoard<P>, predicate: (piece: P, q: number, r: number) => boolean): {
    q: number;
    r: number;
    piece: P;
}[];
//# sourceMappingURL=board-utils.d.ts.map