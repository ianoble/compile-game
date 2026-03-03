/** A card whose data is visible to the receiving player. */
export interface VisibleCard {
    id: string;
    [key: string]: unknown;
}
/** An opaque card — only its existence is known; no identifying data is sent. */
export interface HiddenCard {
    hidden: true;
}
/** A card that may or may not be visible to the current player. */
export type Card = VisibleCard | HiddenCard;
/** Type guard: returns `true` when the card's data has been redacted. */
export declare function isCardHidden(card: Card): card is HiddenCard;
/**
 * Replace an array of visible cards with same-length array of
 * {@link HiddenCard} objects.  Useful inside `stripSecretInfo`
 * to redact opponents' hands or the draw pile.
 */
export declare function redactCards(cards: VisibleCard[]): HiddenCard[];
//# sourceMappingURL=cards.d.ts.map