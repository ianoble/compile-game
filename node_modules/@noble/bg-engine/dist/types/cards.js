/** Type guard: returns `true` when the card's data has been redacted. */
export function isCardHidden(card) {
    return 'hidden' in card && card.hidden === true;
}
/**
 * Replace an array of visible cards with same-length array of
 * {@link HiddenCard} objects.  Useful inside `stripSecretInfo`
 * to redact opponents' hands or the draw pile.
 */
export function redactCards(cards) {
    return cards.map(() => ({ hidden: true }));
}
//# sourceMappingURL=cards.js.map