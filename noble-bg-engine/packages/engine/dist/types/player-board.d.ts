/**
 * Named resource counters with optional per-resource caps.
 *
 * @example
 * ```ts
 * const pool: ResourcePool = {
 *   amounts: { gold: 3, wood: 5 },
 *   limits: { gold: 10 },
 * };
 * ```
 */
export interface ResourcePool {
    amounts: Record<string, number>;
    /** Optional maximum for each resource. Resources without a limit are unbounded. */
    limits?: Record<string, number>;
}
/**
 * A bounded numeric track (VP, income, morale, etc.).
 * `position` is always kept within `[min, max]` by the utility functions.
 */
export interface Track {
    position: number;
    min: number;
    max: number;
    label?: string;
}
/**
 * A holding area for serializable items (pieces, cards, tokens).
 * When `capacity` is set, utilities prevent adding beyond that limit.
 */
export interface Slot<T = unknown> {
    items: T[];
    /** Maximum number of items. Undefined means unlimited. */
    capacity?: number;
    label?: string;
}
//# sourceMappingURL=player-board.d.ts.map