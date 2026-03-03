import { defineGame } from '../../types/index.js';
import { TicTacToe } from './game.js';
export const ticTacToeDef = defineGame({
    game: TicTacToe,
    id: 'tic-tac-toe',
    displayName: 'Tic-Tac-Toe',
    description: 'Classic 3x3 grid game. Get three in a row to win.',
    minPlayers: 2,
    maxPlayers: 2,
    validateMove({ G, playerID, currentPlayer }, moveName, ...args) {
        if (playerID !== currentPlayer)
            return 'Not your turn';
        if (moveName !== 'clickCell')
            return `Unknown move: ${moveName}`;
        const cellIndex = args[0];
        if (typeof cellIndex !== 'number' || cellIndex < 0 || cellIndex > 8) {
            return 'Invalid cell index';
        }
        if (G.cells[cellIndex] !== null)
            return 'Cell already occupied';
        return true;
    },
});
//# sourceMappingURL=index.js.map