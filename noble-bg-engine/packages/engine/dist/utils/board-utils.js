"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSquareBoard = createSquareBoard;
exports.getSquareCell = getSquareCell;
exports.squareNeighbors = squareNeighbors;
exports.placePiece = placePiece;
exports.removePiece = removePiece;
exports.flipCell = flipCell;
exports.findPieces = findPieces;
exports.hexKey = hexKey;
exports.parseHexKey = parseHexKey;
exports.createHexBoard = createHexBoard;
exports.getHexCell = getHexCell;
exports.hexNeighbors = hexNeighbors;
exports.placePieceHex = placePieceHex;
exports.removePieceHex = removePieceHex;
exports.flipHexCell = flipHexCell;
exports.findPiecesHex = findPiecesHex;
// ---------------------------------------------------------------------------
// Square grid
// ---------------------------------------------------------------------------
function emptyCell() {
    return { pieces: [] };
}
/** Create an empty square board. An optional `init` callback can populate each cell. */
function createSquareBoard(rows, cols, init) {
    var cells = [];
    for (var r = 0; r < rows; r++) {
        var row = [];
        for (var c = 0; c < cols; c++) {
            row.push(init ? init(r, c) : emptyCell());
        }
        cells.push(row);
    }
    return { kind: 'square', rows: rows, cols: cols, cells: cells };
}
/** Safely get a cell. Returns undefined if coordinates are out of bounds. */
function getSquareCell(board, row, col) {
    if (row < 0 || row >= board.rows || col < 0 || col >= board.cols)
        return undefined;
    return board.cells[row][col];
}
var ORTHOGONAL = [[-1, 0], [1, 0], [0, -1], [0, 1]];
var DIAGONAL = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
/**
 * Return in-bounds neighbor coordinates.
 * 4-connected by default; pass `diagonal: true` for 8-connected.
 */
function squareNeighbors(row, col, rows, cols, diagonal) {
    if (diagonal === void 0) { diagonal = false; }
    var dirs = diagonal ? __spreadArray(__spreadArray([], ORTHOGONAL, true), DIAGONAL, true) : ORTHOGONAL;
    var result = [];
    for (var _i = 0, dirs_1 = dirs; _i < dirs_1.length; _i++) {
        var _a = dirs_1[_i], dr = _a[0], dc = _a[1];
        var nr = row + dr;
        var nc = col + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            result.push({ row: nr, col: nc });
        }
    }
    return result;
}
/** Push a piece onto a cell (Immer-safe mutation). */
function placePiece(board, row, col, piece) {
    var cell = getSquareCell(board, row, col);
    if (!cell)
        throw new Error("Cell (".concat(row, ",").concat(col, ") is out of bounds"));
    cell.pieces.push(piece);
}
/** Remove a piece by id from a cell (Immer-safe mutation). */
function removePiece(board, row, col, pieceId) {
    var cell = getSquareCell(board, row, col);
    if (!cell)
        return undefined;
    var idx = cell.pieces.findIndex(function (p) { return p.id === pieceId; });
    if (idx === -1)
        return undefined;
    return cell.pieces.splice(idx, 1)[0];
}
/** Flip a square-board cell face-up or face-down (Immer-safe mutation). */
function flipCell(board, row, col, faceDown) {
    var cell = getSquareCell(board, row, col);
    if (!cell)
        throw new Error("Cell (".concat(row, ",").concat(col, ") is out of bounds"));
    cell.faceDown = faceDown !== null && faceDown !== void 0 ? faceDown : !cell.faceDown;
}
/** Find all pieces matching a predicate. Returns their coordinates and piece. */
function findPieces(board, predicate) {
    var results = [];
    for (var r = 0; r < board.rows; r++) {
        for (var c = 0; c < board.cols; c++) {
            for (var _i = 0, _a = board.cells[r][c].pieces; _i < _a.length; _i++) {
                var piece = _a[_i];
                if (predicate(piece, r, c)) {
                    results.push({ row: r, col: c, piece: piece });
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
function hexKey(q, r) {
    return "".concat(q, ",").concat(r);
}
/** Parse a hex key back to axial coordinates. */
function parseHexKey(key) {
    var _a = key.split(',').map(Number), q = _a[0], r = _a[1];
    return { q: q, r: r };
}
/**
 * Create a hex board with the given radius (distance from center in cells).
 * Radius 0 = 1 cell, radius 1 = 7 cells, radius 2 = 19 cells, etc.
 */
function createHexBoard(radius, init) {
    var cells = {};
    for (var q = -radius; q <= radius; q++) {
        var r1 = Math.max(-radius, -q - radius);
        var r2 = Math.min(radius, -q + radius);
        for (var r = r1; r <= r2; r++) {
            cells[hexKey(q, r)] = init ? init(q, r) : emptyCell();
        }
    }
    return { kind: 'hex', cells: cells };
}
/** Safely get a hex cell. Returns undefined if coordinates don't exist. */
function getHexCell(board, q, r) {
    return board.cells[hexKey(q, r)];
}
var HEX_DIRECTIONS = [
    [1, 0], [1, -1], [0, -1],
    [-1, 0], [-1, 1], [0, 1],
];
/** Return the 6 axial-coordinate neighbors of a hex cell. */
function hexNeighbors(q, r) {
    return HEX_DIRECTIONS.map(function (_a) {
        var dq = _a[0], dr = _a[1];
        return ({ q: q + dq, r: r + dr });
    });
}
/** Push a piece onto a hex cell (Immer-safe mutation). */
function placePieceHex(board, q, r, piece) {
    var cell = getHexCell(board, q, r);
    if (!cell)
        throw new Error("Hex cell (".concat(q, ",").concat(r, ") does not exist"));
    cell.pieces.push(piece);
}
/** Remove a piece by id from a hex cell (Immer-safe mutation). */
function removePieceHex(board, q, r, pieceId) {
    var cell = getHexCell(board, q, r);
    if (!cell)
        return undefined;
    var idx = cell.pieces.findIndex(function (p) { return p.id === pieceId; });
    if (idx === -1)
        return undefined;
    return cell.pieces.splice(idx, 1)[0];
}
/** Flip a hex-board cell face-up or face-down (Immer-safe mutation). */
function flipHexCell(board, q, r, faceDown) {
    var cell = getHexCell(board, q, r);
    if (!cell)
        throw new Error("Hex cell (".concat(q, ",").concat(r, ") does not exist"));
    cell.faceDown = faceDown !== null && faceDown !== void 0 ? faceDown : !cell.faceDown;
}
/** Find all pieces matching a predicate on a hex board. */
function findPiecesHex(board, predicate) {
    var results = [];
    for (var _i = 0, _a = Object.entries(board.cells); _i < _a.length; _i++) {
        var _b = _a[_i], key = _b[0], cell = _b[1];
        var _c = parseHexKey(key), q = _c.q, r = _c.r;
        for (var _d = 0, _e = cell.pieces; _d < _e.length; _d++) {
            var piece = _e[_d];
            if (predicate(piece, q, r)) {
                results.push({ q: q, r: r, piece: piece });
            }
        }
    }
    return results;
}
