import type { Game, Ctx } from 'boardgame.io';
import { defineGame } from '@engine/client';
import type { BaseGameState } from '@engine/client';
import { INVALID_MOVE } from 'boardgame.io/core';

// ---------------------------------------------------------------------------
// Types — minimal Golden-Ages-style: board, territory, gold, multi-category scoring
// ---------------------------------------------------------------------------

export type PlayerColor = 'red' | 'blue' | 'green' | 'yellow';

export const PLAYER_COLORS: PlayerColor[] = ['red', 'blue', 'green', 'yellow'];

export const BOARD_SIZE = 4;

export interface TemplateGameState extends BaseGameState {
	/** 2D board: cell is playerId who placed there, or null. */
	board: (string | null)[][];
	players: Record<string, { color: PlayerColor; score: number; gold: number }>;
	endGameScored: boolean;
	endGameScoreBreakdown: Record<string, { label: string; vp: number }[]>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEmptyBoard(): (string | null)[][] {
	return Array(BOARD_SIZE)
		.fill(null)
		.map(() => Array(BOARD_SIZE).fill(null));
}

function isBoardFull(G: TemplateGameState): boolean {
	return G.board.every((row) => row.every((cell) => cell !== null));
}

function countTerritory(G: TemplateGameState, playerId: string): number {
	let count = 0;
	for (const row of G.board) {
		for (const cell of row) {
			if (cell === playerId) count++;
		}
	}
	return count;
}

function performEndGameScoring(G: TemplateGameState): void {
	if (G.endGameScored) return;
	G.endGameScored = true;
	const pids = Object.keys(G.players);
	G.endGameScoreBreakdown = {};
	for (const pid of pids) {
		const territory = countTerritory(G, pid);
		const goldVp = Math.floor(G.players[pid].gold / 3);
		G.players[pid].score = territory + goldVp;
		G.endGameScoreBreakdown[pid] = [
			{ label: 'Territory (1 VP per cell)', vp: territory },
			{ label: 'Gold (1 VP per 3)', vp: goldVp },
			{ label: 'Final score', vp: territory + goldVp },
		];
	}
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

export const TemplateGame: Game<TemplateGameState> = {
	name: 'template-game',

	setup: (ctx): TemplateGameState => {
		const players: Record<string, { color: PlayerColor; score: number; gold: number }> = {};
		for (let i = 0; i < ctx.numPlayers; i++) {
			players[String(i)] = {
				color: PLAYER_COLORS[i % PLAYER_COLORS.length],
				score: 0,
				gold: 0,
			};
		}
		return {
			board: createEmptyBoard(),
			players,
			endGameScored: false,
			endGameScoreBreakdown: {},
			history: [],
		};
	},

	moves: {
		setPlayerColor: ({ G, ctx }: { G: TemplateGameState; ctx: Ctx }, color: PlayerColor) => {
			if (!PLAYER_COLORS.includes(color)) return INVALID_MOVE;
			const pid = ctx.playerID;
			if (pid && G.players[pid]) {
				G.players[pid].color = color;
			}
		},
		placePiece: ({ G, ctx }: { G: TemplateGameState; ctx: Ctx }, row: number, col: number) => {
			if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return INVALID_MOVE;
			if (G.board[row][col] !== null) return INVALID_MOVE;
			G.board[row][col] = ctx.currentPlayer;
			if (isBoardFull(G)) {
				performEndGameScoring(G);
			}
		},
		takeGold: ({ G, ctx }: { G: TemplateGameState; ctx: Ctx }) => {
			G.players[ctx.currentPlayer].gold += 3;
			if (isBoardFull(G)) {
				performEndGameScoring(G);
			}
		},
	},

	endIf: ({ G }: { G: TemplateGameState }) => {
		if (!G.endGameScored) return undefined;
		const pids = Object.keys(G.players);
		const scores = pids.map((pid) => G.players[pid].score);
		const maxScore = Math.max(...scores);
		const winners = pids.filter((pid) => G.players[pid].score === maxScore);
		if (winners.length === 1) return { winner: winners[0] };
		if (winners.length > 1) return { isDraw: true };
		return undefined;
	},

	turn: {
		minMoves: 1,
		maxMoves: 1,
	},
};

// ---------------------------------------------------------------------------
// Definition
// ---------------------------------------------------------------------------

export const gameDef = defineGame<TemplateGameState>({
	game: TemplateGame,
	id: 'template-game',
	displayName: 'Template Game',
	description: 'A minimal Golden-Ages-style game: claim territory and collect gold. Replace with your own game.',
	minPlayers: 2,
	maxPlayers: 4,

	validateMove({ G, playerID, currentPlayer }, moveName, ...args) {
		if (playerID !== currentPlayer && moveName !== 'setPlayerColor') return 'Not your turn';
		if (moveName === 'setPlayerColor') {
			const color = args[0];
			if (!PLAYER_COLORS.includes(color as PlayerColor)) return 'Invalid color';
			return true;
		}
		if (moveName === 'placePiece') {
			const [row, col] = args as [number, number];
			if (typeof row !== 'number' || typeof col !== 'number') return 'Invalid cell';
			if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return 'Out of bounds';
			if (G.board[row][col] !== null) return 'Cell already claimed';
			return true;
		}
		if (moveName === 'takeGold') return true;
		return true;
	},
});

/** Rankings for the final score table (by score desc). */
export function getPlayerRankings(G: TemplateGameState): { playerId: string; score: number; cities: number }[] {
	const rankings = Object.keys(G.players).map((pid) => ({
		playerId: pid,
		score: G.players[pid].score,
		cities: 0,
	}));
	rankings.sort((a, b) => b.score - a.score);
	return rankings;
}
