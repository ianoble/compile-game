// ---------------------------------------------------------------------------
// ResourcePool
// ---------------------------------------------------------------------------
/** Create a resource pool with optional initial amounts and per-resource caps. */
export function createResourcePool(resources, limits) {
    return {
        amounts: resources ? { ...resources } : {},
        limits: limits ? { ...limits } : undefined,
    };
}
/** Add `amount` of a resource, clamped to its limit if one is set (Immer-safe). */
export function addResource(pool, name, amount) {
    const current = pool.amounts[name] ?? 0;
    let next = current + amount;
    if (pool.limits && name in pool.limits) {
        next = Math.min(next, pool.limits[name]);
    }
    pool.amounts[name] = next;
}
/**
 * Remove up to `amount` of a resource, clamped to 0 (Immer-safe).
 * Returns the actual amount removed.
 */
export function removeResource(pool, name, amount) {
    const current = pool.amounts[name] ?? 0;
    const removed = Math.min(current, amount);
    pool.amounts[name] = current - removed;
    return removed;
}
/** Safe accessor — returns 0 for undefined resources. */
export function getResource(pool, name) {
    return pool.amounts[name] ?? 0;
}
/** Check whether the pool has at least `amount` of a resource. */
export function hasResource(pool, name, amount) {
    return (pool.amounts[name] ?? 0) >= amount;
}
// ---------------------------------------------------------------------------
// Track
// ---------------------------------------------------------------------------
/** Create a bounded track. `start` defaults to `min`. */
export function createTrack(min, max, start, label) {
    const position = Math.max(min, Math.min(max, start ?? min));
    return { position, min, max, label };
}
/** Move track position by `delta` (positive or negative), clamped to bounds (Immer-safe). Returns new position. */
export function advanceTrack(track, delta) {
    track.position = Math.max(track.min, Math.min(track.max, track.position + delta));
    return track.position;
}
/** Set track to an absolute position, clamped to bounds (Immer-safe). */
export function setTrack(track, position) {
    track.position = Math.max(track.min, Math.min(track.max, position));
}
// ---------------------------------------------------------------------------
// Slot
// ---------------------------------------------------------------------------
/** Create an empty slot with optional capacity and label. */
export function createSlot(capacity, label) {
    return { items: [], capacity, label };
}
/** Push an item into a slot. Returns `false` if the slot is at capacity. */
export function addToSlot(slot, item) {
    if (slot.capacity !== undefined && slot.items.length >= slot.capacity)
        return false;
    slot.items.push(item);
    return true;
}
/** Remove an item by index. Returns the removed item, or `undefined` if index is invalid. */
export function removeFromSlot(slot, index) {
    if (index < 0 || index >= slot.items.length)
        return undefined;
    return slot.items.splice(index, 1)[0];
}
/** Check whether a slot is at its capacity limit. Always `false` for unlimited slots. */
export function isSlotFull(slot) {
    return slot.capacity !== undefined && slot.items.length >= slot.capacity;
}
//# sourceMappingURL=player-board-utils.js.map