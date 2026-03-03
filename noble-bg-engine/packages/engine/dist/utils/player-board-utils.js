"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createResourcePool = createResourcePool;
exports.addResource = addResource;
exports.removeResource = removeResource;
exports.getResource = getResource;
exports.hasResource = hasResource;
exports.createTrack = createTrack;
exports.advanceTrack = advanceTrack;
exports.setTrack = setTrack;
exports.createSlot = createSlot;
exports.addToSlot = addToSlot;
exports.removeFromSlot = removeFromSlot;
exports.isSlotFull = isSlotFull;
// ---------------------------------------------------------------------------
// ResourcePool
// ---------------------------------------------------------------------------
/** Create a resource pool with optional initial amounts and per-resource caps. */
function createResourcePool(resources, limits) {
    return {
        amounts: resources ? __assign({}, resources) : {},
        limits: limits ? __assign({}, limits) : undefined,
    };
}
/** Add `amount` of a resource, clamped to its limit if one is set (Immer-safe). */
function addResource(pool, name, amount) {
    var _a;
    var current = (_a = pool.amounts[name]) !== null && _a !== void 0 ? _a : 0;
    var next = current + amount;
    if (pool.limits && name in pool.limits) {
        next = Math.min(next, pool.limits[name]);
    }
    pool.amounts[name] = next;
}
/**
 * Remove up to `amount` of a resource, clamped to 0 (Immer-safe).
 * Returns the actual amount removed.
 */
function removeResource(pool, name, amount) {
    var _a;
    var current = (_a = pool.amounts[name]) !== null && _a !== void 0 ? _a : 0;
    var removed = Math.min(current, amount);
    pool.amounts[name] = current - removed;
    return removed;
}
/** Safe accessor — returns 0 for undefined resources. */
function getResource(pool, name) {
    var _a;
    return (_a = pool.amounts[name]) !== null && _a !== void 0 ? _a : 0;
}
/** Check whether the pool has at least `amount` of a resource. */
function hasResource(pool, name, amount) {
    var _a;
    return ((_a = pool.amounts[name]) !== null && _a !== void 0 ? _a : 0) >= amount;
}
// ---------------------------------------------------------------------------
// Track
// ---------------------------------------------------------------------------
/** Create a bounded track. `start` defaults to `min`. */
function createTrack(min, max, start, label) {
    var position = Math.max(min, Math.min(max, start !== null && start !== void 0 ? start : min));
    return { position: position, min: min, max: max, label: label };
}
/** Move track position by `delta` (positive or negative), clamped to bounds (Immer-safe). Returns new position. */
function advanceTrack(track, delta) {
    track.position = Math.max(track.min, Math.min(track.max, track.position + delta));
    return track.position;
}
/** Set track to an absolute position, clamped to bounds (Immer-safe). */
function setTrack(track, position) {
    track.position = Math.max(track.min, Math.min(track.max, position));
}
// ---------------------------------------------------------------------------
// Slot
// ---------------------------------------------------------------------------
/** Create an empty slot with optional capacity and label. */
function createSlot(capacity, label) {
    return { items: [], capacity: capacity, label: label };
}
/** Push an item into a slot. Returns `false` if the slot is at capacity. */
function addToSlot(slot, item) {
    if (slot.capacity !== undefined && slot.items.length >= slot.capacity)
        return false;
    slot.items.push(item);
    return true;
}
/** Remove an item by index. Returns the removed item, or `undefined` if index is invalid. */
function removeFromSlot(slot, index) {
    if (index < 0 || index >= slot.items.length)
        return undefined;
    return slot.items.splice(index, 1)[0];
}
/** Check whether a slot is at its capacity limit. Always `false` for unlimited slots. */
function isSlotFull(slot) {
    return slot.capacity !== undefined && slot.items.length >= slot.capacity;
}
