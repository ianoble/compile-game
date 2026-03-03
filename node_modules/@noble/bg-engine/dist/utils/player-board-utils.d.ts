import type { ResourcePool, Track, Slot } from '../types/player-board.js';
/** Create a resource pool with optional initial amounts and per-resource caps. */
export declare function createResourcePool(resources?: Record<string, number>, limits?: Record<string, number>): ResourcePool;
/** Add `amount` of a resource, clamped to its limit if one is set (Immer-safe). */
export declare function addResource(pool: ResourcePool, name: string, amount: number): void;
/**
 * Remove up to `amount` of a resource, clamped to 0 (Immer-safe).
 * Returns the actual amount removed.
 */
export declare function removeResource(pool: ResourcePool, name: string, amount: number): number;
/** Safe accessor — returns 0 for undefined resources. */
export declare function getResource(pool: ResourcePool, name: string): number;
/** Check whether the pool has at least `amount` of a resource. */
export declare function hasResource(pool: ResourcePool, name: string, amount: number): boolean;
/** Create a bounded track. `start` defaults to `min`. */
export declare function createTrack(min: number, max: number, start?: number, label?: string): Track;
/** Move track position by `delta` (positive or negative), clamped to bounds (Immer-safe). Returns new position. */
export declare function advanceTrack(track: Track, delta: number): number;
/** Set track to an absolute position, clamped to bounds (Immer-safe). */
export declare function setTrack(track: Track, position: number): void;
/** Create an empty slot with optional capacity and label. */
export declare function createSlot<T = unknown>(capacity?: number, label?: string): Slot<T>;
/** Push an item into a slot. Returns `false` if the slot is at capacity. */
export declare function addToSlot<T>(slot: Slot<T>, item: T): boolean;
/** Remove an item by index. Returns the removed item, or `undefined` if index is invalid. */
export declare function removeFromSlot<T>(slot: Slot<T>, index: number): T | undefined;
/** Check whether a slot is at its capacity limit. Always `false` for unlimited slots. */
export declare function isSlotFull<T>(slot: Slot<T>): boolean;
//# sourceMappingURL=player-board-utils.d.ts.map