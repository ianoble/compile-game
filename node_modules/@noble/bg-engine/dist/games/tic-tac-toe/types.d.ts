import type { BaseGameState } from '../../types/index.js';
/** Represents one cell on the board — null means empty. */
export type CellValue = 'X' | 'O' | null;
/** The authoritative Tic-Tac-Toe game state. */
export interface TicTacToeState extends BaseGameState {
    cells: CellValue[];
    winner: string | undefined;
    isDraw: boolean;
}
//# sourceMappingURL=types.d.ts.map