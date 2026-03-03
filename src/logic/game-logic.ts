import type { Game, Ctx } from 'boardgame.io';
import { defineGame } from '@engine/client/index';
import type { BaseGameState } from '@engine/client/index';
import { INVALID_MOVE } from 'boardgame.io/core';
import type { VisibleCard } from '@engine/client/index';
import { redactCards } from '@engine/client/index';
import { getCommandDeck, getProtocolDeck, shuffle } from './compile-cards';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const NUM_COLUMNS = 3;

/** For lobby/join: 2 seats only. */
export type PlayerColor = 'red' | 'blue';
export const PLAYER_COLORS: PlayerColor[] = ['red', 'blue'];
const DRAFT_ORDER = ['0', '1', '1', '0', '0', '1'] as const; // 1-2-2-1 picks
const HAND_SIZE = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommandStackEntry {
	cardId: string;
	owner: string;
	faceUp: boolean;
	/** Value contributing to column total; when sum >= 10, current player's protocol compiles. */
	value: number;
}

export interface ColumnState {
	/** [player0, player1] protocol card IDs at top of column */
	protocol: [string | null, string | null];
	/** [player0, player1] whether that player's protocol in this column has been compiled (flipped). */
	protocolCompiled: [boolean, boolean];
	commandStack: CommandStackEntry[];
}

export interface CompilePlayerState {
	hand: VisibleCard[];
	protocolCards: VisibleCard[];
}

export interface CompileGameState extends BaseGameState {
	/** Draft phase: pool of protocol cards to pick from */
	protocolPool: VisibleCard[];
	/** Play phase: draw pile (card IDs) */
	commandDeck: string[];
	players: Record<string, CompilePlayerState>;
	/** 3 columns: left, center, right */
	columns: ColumnState[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createInitialColumns(): ColumnState[] {
	return Array.from({ length: NUM_COLUMNS }, () => ({
		protocol: [null, null],
		protocolCompiled: [false, false],
		commandStack: [],
	}));
}

function createEmptyPlayers(): Record<string, CompilePlayerState> {
	return {
		'0': { hand: [], protocolCards: [] },
		'1': { hand: [], protocolCards: [] },
	};
}

/** Setup: 2 players only, shuffle decks, start in draft. */
function setup(ctx: Ctx): CompileGameState {
	if (ctx.numPlayers !== 2) {
		throw new Error('Compile is a 2-player game only');
	}
	const protocolDeck = shuffle([...getProtocolDeck()]);
	return {
		protocolPool: protocolDeck,
		commandDeck: [],
		players: createEmptyPlayers(),
		columns: createInitialColumns(),
		history: [],
	};
}

/** Draft phase: pick one protocol card from pool. */
function draftProtocol(
	{ G, ctx }: { G: CompileGameState; ctx: Ctx },
	poolIndex: number
): typeof INVALID_MOVE | void {
	if (ctx.phase !== 'draft') return INVALID_MOVE;
	const pool = G.protocolPool;
	if (poolIndex < 0 || poolIndex >= pool.length) return INVALID_MOVE;
	const playerId = ctx.currentPlayer;
	const player = G.players[playerId];
	if (!player || player.protocolCards.length >= 3) return INVALID_MOVE;

	const [card] = pool.splice(poolIndex, 1);
	player.protocolCards.push(card);
}

const COMPILE_THRESHOLD = 10;

/** Sum of command card values in a column. */
function columnSum(col: ColumnState): number {
	return col.commandStack.reduce((s, e) => s + e.value, 0);
}

/** Play phase: play one command card from hand to a column, face up or face down. */
function playCommandCard(
	{ G, ctx }: { G: CompileGameState; ctx: Ctx },
	columnIndex: number,
	handIndex: number,
	faceUp: boolean
): typeof INVALID_MOVE | void {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	if (columnIndex < 0 || columnIndex >= NUM_COLUMNS) return INVALID_MOVE;
	const playerId = ctx.currentPlayer;
	const player = G.players[playerId];
	if (!player) return INVALID_MOVE;
	const hand = player.hand;
	if (handIndex < 0 || handIndex >= hand.length) return INVALID_MOVE;

	const card = hand[handIndex];
	const cardId = typeof card === 'object' && card && 'id' in card ? (card as VisibleCard).id : String(card);
	const value = typeof card === 'object' && card && 'value' in card ? (card as VisibleCard & { value: number }).value : 1;
	player.hand.splice(handIndex, 1);
	const col = G.columns[columnIndex];
	col.commandStack.push({
		cardId,
		owner: playerId,
		faceUp,
		value,
	});
	// When column total >= 10, this player's protocol in this column is compiled (flipped).
	if (columnSum(col) >= COMPILE_THRESHOLD) {
		const p = playerId === '0' ? 0 : 1;
		col.protocolCompiled[p] = true;
	}
}

/** When draft ends: place protocols on columns, shuffle command deck, deal hands. */
function onPlayPhaseBegin({ G }: { G: CompileGameState }): void {
	// Place each player's 3 protocol cards on the 3 columns (one per column)
	for (let col = 0; col < NUM_COLUMNS; col++) {
		G.columns[col].protocol[0] = (G.players['0'].protocolCards[col] as VisibleCard)?.id ?? null;
		G.columns[col].protocol[1] = (G.players['1'].protocolCards[col] as VisibleCard)?.id ?? null;
	}
	// Build and shuffle full command deck (with values), then deal 5 each
	const fullDeck = shuffle([...getCommandDeck()]);
	let deckIdx = 0;
	const deal = (playerId: string) => {
		const player = G.players[playerId];
		for (let i = 0; i < HAND_SIZE && deckIdx < fullDeck.length; i++) {
			const c = fullDeck[deckIdx++];
			player.hand.push({ id: c.id, name: c.name, value: c.value });
		}
	};
	deal('0');
	deal('1');
	G.commandDeck = fullDeck.slice(deckIdx).map((c) => c.id);
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

export const CompileGame: Game<CompileGameState> = {
	name: 'compile',

	setup,

	phases: {
		draft: {
			start: true,
			next: 'play',
			turn: {
				order: {
					first: () => 0,
					next: ({ ctx }) => {
						const pos = ctx.playOrderPos ?? 0;
						if (pos >= DRAFT_ORDER.length - 1) return undefined;
						return pos + 1;
					},
					playOrder: () => [...DRAFT_ORDER],
				},
				minMoves: 1,
				maxMoves: 1,
			},
			moves: {
				draftProtocol,
			},
		},
		play: {
			onBegin: onPlayPhaseBegin,
			turn: {
				minMoves: 1,
				maxMoves: 1,
			},
			moves: {
				playCommandCard,
			},
		},
	},
	// First player to have all 3 protocol cards compiled (column total >= 10 in each column) wins.
	endIf: ({ G }) => {
		if (!G.columns?.length) return undefined;
		for (const playerId of ['0', '1'] as const) {
			const p = playerId === '0' ? 0 : 1;
			const allCompiled = G.columns.every((col) => col.protocolCompiled?.[p]);
			if (allCompiled) return { winner: playerId };
		}
		return undefined;
	},
};

// ---------------------------------------------------------------------------
// Definition
// ---------------------------------------------------------------------------

export const gameDef = defineGame<CompileGameState>({
	game: CompileGame,
	id: 'compile',
	displayName: 'Compile',
	description: 'A 2-player card game: draft protocols, then play command cards to three columns.',
	minPlayers: 2,
	maxPlayers: 2,

	validateMove({ G, playerID, currentPlayer }, moveName, ...args) {
		if (playerID !== currentPlayer) return 'Not your turn';
		if (moveName === 'draftProtocol') {
			const [poolIndex] = args as [number];
			if (typeof poolIndex !== 'number' || poolIndex < 0 || poolIndex >= (G.protocolPool?.length ?? 0))
				return 'Invalid protocol pick';
			return true;
		}
		if (moveName === 'playCommandCard') {
			const [columnIndex, handIndex, faceUp] = args as [number, number, boolean];
			if (typeof columnIndex !== 'number' || columnIndex < 0 || columnIndex >= NUM_COLUMNS)
				return 'Invalid column';
			const player = G.players[playerID];
			if (!player || handIndex < 0 || handIndex >= player.hand.length) return 'Invalid hand index';
			if (typeof faceUp !== 'boolean') return 'faceUp must be boolean';
			return true;
		}
		return true;
	},

	stripSecretInfo(G, playerID): BaseGameState {
		const stripped = JSON.parse(JSON.stringify(G)) as CompileGameState;
		if (playerID == null) return stripped;
		const otherId = playerID === '0' ? '1' : '0';
		// Hide opponent's hand
		stripped.players[otherId] = {
			...stripped.players[otherId],
			hand: redactCards(stripped.players[otherId].hand as VisibleCard[]),
		};
		// Hide face-down cards owned by opponent
		for (const col of stripped.columns) {
			col.commandStack = col.commandStack.map((entry) => {
				if (entry.owner === otherId && !entry.faceUp) {
					return { cardId: '[hidden]', owner: entry.owner, faceUp: false, value: 0 };
				}
				return entry;
			});
		}
		return stripped;
	},
});
