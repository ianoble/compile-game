"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCardHidden = isCardHidden;
exports.redactCards = redactCards;
/** Type guard: returns `true` when the card's data has been redacted. */
function isCardHidden(card) {
    return 'hidden' in card && card.hidden === true;
}
/**
 * Replace an array of visible cards with same-length array of
 * {@link HiddenCard} objects.  Useful inside `stripSecretInfo`
 * to redact opponents' hands or the draw pile.
 */
function redactCards(cards) {
    return cards.map(function () { return ({ hidden: true }); });
}
