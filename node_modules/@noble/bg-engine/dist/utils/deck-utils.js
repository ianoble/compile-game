const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
/** Build a fresh 52-card deck with each card's blackjack-style value pre-computed. */
export function createStandardDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            let value;
            if (rank === 'A')
                value = 11;
            else if (['J', 'Q', 'K'].includes(rank))
                value = 10;
            else
                value = parseInt(rank, 10);
            deck.push({ id: `${rank}-${suit}`, suit, rank, value });
        }
    }
    return deck;
}
/** Fisher-Yates in-place shuffle. Returns the same array for convenience. */
export function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
//# sourceMappingURL=deck-utils.js.map