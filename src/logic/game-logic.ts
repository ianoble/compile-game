import type { Game, Ctx } from 'boardgame.io';
import { defineGame } from '@engine/client/index';
import type { BaseGameState } from '@engine/client/index';
import { INVALID_MOVE } from 'boardgame.io/core';

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
// Types (engine-agnostic: no card content, only ids and value lookups)
// ---------------------------------------------------------------------------

/** Setup data provided by the client when creating a game. Card content lives in the client; server only stores ids and value map. */
export interface CompileSetupData {
	protocolPool: { id: string; name?: string }[];
	cardIdToValue: Record<string, number>;
	protocolToCardIds: Record<string, string[]>;
}

export interface CommandStackEntry {
	cardId: string;
	owner: string;
	faceUp: boolean;
	value: number;
}

export interface ColumnState {
	protocol: [string | null, string | null];
	protocolCompiled: [boolean, boolean];
	commandStack: CommandStackEntry[];
}

export interface CompilePlayerState {
	/** Command card ids in hand (client resolves to display via its card catalog). */
	hand: string[];
	/** Drafted protocol cards: id + name (client sends in pool; server stores as-is). */
	protocolCards: { id: string; name?: string }[];
	commandDeck: string[];
	discard: string[];
}

export interface CompileGameState extends BaseGameState {
	protocolPool: { id: string; name?: string }[];
	/** Lookup: command card id → value (for column total). Provided by client in setupData. */
	cardIdToValue: Record<string, number>;
	/** Lookup: protocol id → command card ids (for building decks). Provided by client in setupData. */
	protocolToCardIds: Record<string, string[]>;
	players: Record<string, CompilePlayerState>;
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
		'0': { hand: [], protocolCards: [], commandDeck: [], discard: [] },
		'1': { hand: [], protocolCards: [], commandDeck: [], discard: [] },
	};
}

/** Fisher-Yates shuffle (server has no dependency on compile-cards). */
function shuffle<T>(array: T[]): T[] {
	const out = [...array];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/** Setup: uses client-provided setupData (protocol pool + card lookups). No card definitions on server. If setupData is missing (e.g. framework call at startup), use empty state so the server can start; the client must send setupData when creating a match. */
function setup(
	{ ctx }: { ctx: Ctx },
	setupData?: CompileSetupData
): CompileGameState {
	if (ctx.numPlayers !== 2) {
		throw new Error('Compile is a 2-player game only');
	}
	const protocolPool =
		setupData?.protocolPool?.length ? [...setupData.protocolPool] : [];
	const cardIdToValue =
		setupData?.cardIdToValue && Object.keys(setupData.cardIdToValue).length > 0
			? { ...setupData.cardIdToValue }
			: {};
	const protocolToCardIds =
		setupData?.protocolToCardIds && Object.keys(setupData.protocolToCardIds).length > 0
			? { ...setupData.protocolToCardIds }
			: {};
	return {
		protocolPool,
		cardIdToValue,
		protocolToCardIds,
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

function columnSum(col: ColumnState): number {
	return col.commandStack.reduce((s, e) => s + e.value, 0);
}

/** Play phase: play one command card (by id) from hand to a column. Value from G.cardIdToValue. */
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

	const cardId = hand[handIndex];
	const value = G.cardIdToValue[cardId] ?? 0;
	player.hand.splice(handIndex, 1);
	const col = G.columns[columnIndex];
	col.commandStack.push({
		cardId,
		owner: playerId,
		faceUp,
		value,
	});

	if (columnSum(col) >= COMPILE_THRESHOLD) {
		const p = playerId === '0' ? 0 : 1;
		const alreadyCompiled = col.protocolCompiled[p];

		for (const entry of col.commandStack) {
			const owner = G.players[entry.owner];
			if (owner) owner.discard.push(entry.cardId);
		}
		col.commandStack = [];

		if (!alreadyCompiled) {
			col.protocolCompiled[p] = true;
		} else {
			const otherId = playerId === '0' ? '1' : '0';
			const opponent = G.players[otherId];
			if (opponent?.commandDeck.length > 0) {
				const drawnId = opponent.commandDeck.shift()!;
				player.hand.push(drawnId);
			}
		}
	}
}

/** When draft ends: place protocols on columns, build decks from G.protocolToCardIds, deal hand ids. */
function onPlayPhaseBegin({ G }: { G: CompileGameState }): void {
	for (let col = 0; col < NUM_COLUMNS; col++) {
		G.columns[col].protocol[0] = G.players['0'].protocolCards[col]?.id ?? null;
		G.columns[col].protocol[1] = G.players['1'].protocolCards[col]?.id ?? null;
	}

	for (const playerId of ['0', '1']) {
		const player = G.players[playerId];
		const protocolIds = player.protocolCards.map(p => p.id);
		const allIds: string[] = [];
		for (const pid of protocolIds) {
			const ids = G.protocolToCardIds[pid];
			if (ids) allIds.push(...ids);
		}
		const shuffled = shuffle(allIds);

		player.hand = shuffled.slice(0, HAND_SIZE);
		player.commandDeck = shuffled.slice(HAND_SIZE);
		player.discard = [];
	}
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
	endIf: ({ G }) => {
		if (!G.columns?.length) return undefined;
		for (const playerId of ['0', '1'] as const) {
			const p = playerId === '0' ? 0 : 1;
			const allCompiled = G.columns.every(col => col.protocolCompiled?.[p]);
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
			if (
				typeof poolIndex !== 'number' ||
				poolIndex < 0 ||
				poolIndex >= (G.protocolPool?.length ?? 0)
			)
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
		// Hide opponent's hand (replace ids with placeholders; client shows as hidden)
		stripped.players[otherId] = {
			...stripped.players[otherId],
			hand: stripped.players[otherId].hand.map(() => '[hidden]'),
		};
		for (const col of stripped.columns) {
			col.commandStack = col.commandStack.map(entry => {
				if (entry.owner === otherId && !entry.faceUp) {
					return { cardId: '[hidden]', owner: entry.owner, faceUp: false, value: 0 };
				}
				return entry;
			});
		}
		return stripped;
	},
});
