import type { ResourcePool, Track, Slot } from '../types/player-board.js';

// ---------------------------------------------------------------------------
// ResourcePool
// ---------------------------------------------------------------------------

/** Create a resource pool with optional initial amounts and per-resource caps. */
export function createResourcePool(
  resources?: Record<string, number>,
  limits?: Record<string, number>,
): ResourcePool {
  return {
    amounts: resources ? { ...resources } : {},
    limits: limits ? { ...limits } : undefined,
  };
}

/** Add `amount` of a resource, clamped to its limit if one is set (Immer-safe). */
export function addResource(pool: ResourcePool, name: string, amount: number): void {
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
export function removeResource(pool: ResourcePool, name: string, amount: number): number {
  const current = pool.amounts[name] ?? 0;
  const removed = Math.min(current, amount);
  pool.amounts[name] = current - removed;
  return removed;
}

/** Safe accessor — returns 0 for undefined resources. */
export function getResource(pool: ResourcePool, name: string): number {
  return pool.amounts[name] ?? 0;
}

/** Check whether the pool has at least `amount` of a resource. */
export function hasResource(pool: ResourcePool, name: string, amount: number): boolean {
  return (pool.amounts[name] ?? 0) >= amount;
}

// ---------------------------------------------------------------------------
// Track
// ---------------------------------------------------------------------------

/** Create a bounded track. `start` defaults to `min`. */
export function createTrack(min: number, max: number, start?: number, label?: string): Track {
  const position = Math.max(min, Math.min(max, start ?? min));
  return { position, min, max, label };
}

/** Move track position by `delta` (positive or negative), clamped to bounds (Immer-safe). Returns new position. */
export function advanceTrack(track: Track, delta: number): number {
  track.position = Math.max(track.min, Math.min(track.max, track.position + delta));
  return track.position;
}

/** Set track to an absolute position, clamped to bounds (Immer-safe). */
export function setTrack(track: Track, position: number): void {
  track.position = Math.max(track.min, Math.min(track.max, position));
}

// ---------------------------------------------------------------------------
// Slot
// ---------------------------------------------------------------------------

/** Create an empty slot with optional capacity and label. */
export function createSlot<T = unknown>(capacity?: number, label?: string): Slot<T> {
  return { items: [], capacity, label };
}

/** Push an item into a slot. Returns `false` if the slot is at capacity. */
export function addToSlot<T>(slot: Slot<T>, item: T): boolean {
  if (slot.capacity !== undefined && slot.items.length >= slot.capacity) return false;
  slot.items.push(item);
  return true;
}

/** Remove an item by index. Returns the removed item, or `undefined` if index is invalid. */
export function removeFromSlot<T>(slot: Slot<T>, index: number): T | undefined {
  if (index < 0 || index >= slot.items.length) return undefined;
  return slot.items.splice(index, 1)[0];
}

/** Check whether a slot is at its capacity limit. Always `false` for unlimited slots. */
export function isSlotFull<T>(slot: Slot<T>): boolean {
  return slot.capacity !== undefined && slot.items.length >= slot.capacity;
}
