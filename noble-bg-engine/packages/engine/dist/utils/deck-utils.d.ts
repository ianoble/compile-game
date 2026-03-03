import type { VisibleCard } from '../types/cards.js';
declare const SUITS: readonly ["hearts", "diamonds", "clubs", "spades"];
declare const RANKS: readonly ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];
export interface StandardCard extends VisibleCard {
    suit: Suit;
    rank: Rank;
    value: number;
}
/** Build a fresh 52-card deck with each card's blackjack-style value pre-computed. */
export declare function createStandardDeck(): StandardCard[];
/** Fisher-Yates in-place shuffle. Returns the same array for convenience. */
export declare function shuffle<T>(array: T[]): T[];
export {};
//# sourceMappingURL=deck-utils.d.ts.map