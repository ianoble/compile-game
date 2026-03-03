"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStandardDeck = createStandardDeck;
exports.shuffle = shuffle;
var SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
/** Build a fresh 52-card deck with each card's blackjack-style value pre-computed. */
function createStandardDeck() {
    var deck = [];
    for (var _i = 0, SUITS_1 = SUITS; _i < SUITS_1.length; _i++) {
        var suit = SUITS_1[_i];
        for (var _a = 0, RANKS_1 = RANKS; _a < RANKS_1.length; _a++) {
            var rank = RANKS_1[_a];
            var value = void 0;
            if (rank === 'A')
                value = 11;
            else if (['J', 'Q', 'K'].includes(rank))
                value = 10;
            else
                value = parseInt(rank, 10);
            deck.push({ id: "".concat(rank, "-").concat(suit), suit: suit, rank: rank, value: value });
        }
    }
    return deck;
}
/** Fisher-Yates in-place shuffle. Returns the same array for convenience. */
function shuffle(array) {
    var _a;
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        _a = [array[j], array[i]], array[i] = _a[0], array[j] = _a[1];
    }
    return array;
}
