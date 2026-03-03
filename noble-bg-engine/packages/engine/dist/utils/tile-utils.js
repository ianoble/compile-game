"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STANDARD_TILE_SHAPES = void 0;
exports.defineTileShape = defineTileShape;
exports.rotateTileOffsets = rotateTileOffsets;
exports.getCellKey = getCellKey;
exports.createTileLayer = createTileLayer;
exports.canPlaceTile = canPlaceTile;
exports.placeTile = placeTile;
exports.getTileAt = getTileAt;
exports.getTileCells = getTileCells;
// ---------------------------------------------------------------------------
// Shape definition
// ---------------------------------------------------------------------------
/** Factory for creating a tile shape template. */
function defineTileShape(id, offsets, label) {
    return { id: id, offsets: offsets, label: label };
}
// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------
/**
 * Rotate tile offsets clockwise by the given amount.
 * Normalizes the result so all offsets are non-negative (min row/col = 0).
 */
function rotateTileOffsets(offsets, rotation) {
    var steps = rotation / 90;
    var result = offsets.map(function (_a) {
        var r = _a[0], c = _a[1];
        return [r, c];
    });
    for (var i = 0; i < steps; i++) {
        result = result.map(function (_a) {
            var r = _a[0], c = _a[1];
            return [c, -r];
        });
    }
    var minR = Math.min.apply(Math, result.map(function (_a) {
        var r = _a[0];
        return r;
    }));
    var minC = Math.min.apply(Math, result.map(function (_a) {
        var c = _a[1];
        return c;
    }));
    return result.map(function (_a) {
        var r = _a[0], c = _a[1];
        return [r - minR, c - minC];
    });
}
// ---------------------------------------------------------------------------
// Cell key helpers
// ---------------------------------------------------------------------------
/** Serialize row/col to an occupancy map key. */
function getCellKey(row, col) {
    return "".concat(row, ",").concat(col);
}
// ---------------------------------------------------------------------------
// Layer operations
// ---------------------------------------------------------------------------
/** Create an empty tile layer. */
function createTileLayer() {
    return { placed: {}, occupancy: {} };
}
var _tileCounter = 0;
/**
 * Check whether a tile shape can be placed at the given anchor with the
 * given rotation. All cells must be in-bounds and unoccupied.
 */
function canPlaceTile(layer, board, shape, anchorRow, anchorCol, rotation) {
    if (rotation === void 0) { rotation = 0; }
    var rotated = rotateTileOffsets(shape.offsets, rotation);
    for (var _i = 0, rotated_1 = rotated; _i < rotated_1.length; _i++) {
        var _a = rotated_1[_i], dr = _a[0], dc = _a[1];
        var r = anchorRow + dr;
        var c = anchorCol + dc;
        if (r < 0 || r >= board.rows || c < 0 || c >= board.cols)
            return false;
        if (layer.occupancy[getCellKey(r, c)] !== undefined)
            return false;
    }
    return true;
}
/**
 * Place a tile on the board (Immer-safe mutation).
 * Computes absolute cell positions, registers in `placed` and `occupancy`.
 * Throws if placement is invalid. Returns the created `PlacedTile`.
 */
function placeTile(layer, board, shape, anchorRow, anchorCol, rotation, owner, id) {
    if (rotation === void 0) { rotation = 0; }
    if (owner === void 0) { owner = null; }
    if (!canPlaceTile(layer, board, shape, anchorRow, anchorCol, rotation)) {
        throw new Error("Cannot place tile \"".concat(shape.id, "\" at (").concat(anchorRow, ",").concat(anchorCol, ") rotation=").concat(rotation));
    }
    var tileId = id !== null && id !== void 0 ? id : "tile_".concat(_tileCounter++);
    var rotated = rotateTileOffsets(shape.offsets, rotation);
    var cells = rotated.map(function (_a) {
        var dr = _a[0], dc = _a[1];
        return [anchorRow + dr, anchorCol + dc];
    });
    var tile = {
        id: tileId,
        shapeId: shape.id,
        owner: owner,
        anchorRow: anchorRow,
        anchorCol: anchorCol,
        rotation: rotation,
        cells: cells,
    };
    layer.placed[tileId] = tile;
    for (var _i = 0, cells_1 = cells; _i < cells_1.length; _i++) {
        var _a = cells_1[_i], r = _a[0], c = _a[1];
        layer.occupancy[getCellKey(r, c)] = tileId;
    }
    return tile;
}
/** Get the placed tile covering a cell, or `undefined` if the cell is empty. */
function getTileAt(layer, row, col) {
    var tileId = layer.occupancy[getCellKey(row, col)];
    if (tileId === undefined)
        return undefined;
    return layer.placed[tileId];
}
/** Get the absolute cell positions for a placed tile, or `undefined` if not found. */
function getTileCells(layer, tileId) {
    var _a;
    return (_a = layer.placed[tileId]) === null || _a === void 0 ? void 0 : _a.cells;
}
// ---------------------------------------------------------------------------
// Standard shapes
// ---------------------------------------------------------------------------
/** Common polyomino shapes for convenience. Games can use these or define custom shapes. */
exports.STANDARD_TILE_SHAPES = {
    '1x1': defineTileShape('1x1', [[0, 0]], '1x1'),
    '1x2': defineTileShape('1x2', [[0, 0], [0, 1]], '1x2 horizontal'),
    '2x1': defineTileShape('2x1', [[0, 0], [1, 0]], '2x1 vertical'),
    '2x2': defineTileShape('2x2', [[0, 0], [0, 1], [1, 0], [1, 1]], '2x2 square'),
    'I3': defineTileShape('I3', [[0, 0], [1, 0], [2, 0]], 'I-3'),
    'I4': defineTileShape('I4', [[0, 0], [1, 0], [2, 0], [3, 0]], 'I-4'),
    'L': defineTileShape('L', [[0, 0], [1, 0], [2, 0], [2, 1]], 'L'),
    'J': defineTileShape('J', [[0, 1], [1, 1], [2, 1], [2, 0]], 'J'),
    'T': defineTileShape('T', [[0, 0], [0, 1], [0, 2], [1, 1]], 'T'),
    'S': defineTileShape('S', [[0, 1], [0, 2], [1, 0], [1, 1]], 'S'),
    'Z': defineTileShape('Z', [[0, 0], [0, 1], [1, 1], [1, 2]], 'Z'),
    'O': defineTileShape('O', [[0, 0], [0, 1], [1, 0], [1, 1]], 'O (2x2)'),
};
