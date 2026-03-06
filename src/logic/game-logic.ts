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
	/** Command card ids that have a "Start" ability (for turn phase skip logic). */
	cardIdsWithStartAbility?: string[];
	/** Per cardId: which ability rows have triggers (e.g. "When you play", "Start"). Only these get pushed onto the resolution stack. */
	cardTriggerRows?: Record<string, ('top' | 'middle' | 'bottom')[]>;
	/** Per cardId: which ability rows have "After you clear cache" trigger (pushed when Check Cache discards). */
	cardAfterClearCacheRows?: Record<string, ('top' | 'middle' | 'bottom')[]>;
	/** Card ids with "All face-down in this stack have value 4". */
	cardIdsWithFaceDownValue4InStack?: string[];
	/** Card ids with "play face-up without matching protocols". */
	cardIdsPlayFaceUpWithoutMatching?: string[];
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

/** Turn phases within the play phase. */
export type TurnPhase =
	| 'Start'
	| 'CheckControl'
	| 'CheckCompile'
	| 'Action'
	| 'CheckCache'
	| 'End';

/** One entry on the LIFO ability resolution stack (triggered ability waiting to resolve). */
export interface AbilityResolutionEntry {
	columnIndex: number;
	stackIndex: number;
	cardId: string;
	owner: string;
	abilityRow: 'top' | 'middle' | 'bottom';
}

export interface CompileGameState extends BaseGameState {
	protocolPool: { id: string; name?: string }[];
	/** Lookup: command card id → value (for column total). Provided by client in setupData. */
	cardIdToValue: Record<string, number>;
	/** Lookup: protocol id → command card ids (for building decks). Provided by client in setupData. */
	protocolToCardIds: Record<string, string[]>;
	/** Command card ids that have a "Start" ability (from setupData; default []). */
	cardIdsWithStartAbility?: string[];
	/** Per cardId: which ability rows have triggers (from setupData; only these rows are pushed onto resolution stack). */
	cardTriggerRows?: Record<string, ('top' | 'middle' | 'bottom')[]>;
	/** Per cardId: which rows have "After you clear cache" (pushed when Check Cache phase discards). */
	cardAfterClearCacheRows?: Record<string, ('top' | 'middle' | 'bottom')[]>;
	/** Current player skips the discard part of Check Cache this turn (Spirit 0 "Skip your check cache phase"). */
	skipCheckCacheThisTurn?: boolean;
	/** Command card ids with "All face-down cards in this stack have a value of 4" (Darkness 2). */
	cardIdsWithFaceDownValue4InStack?: string[];
	/** Command card ids with "When you play face-up, they may be played without matching protocols" (Spirit 1). */
	cardIdsPlayFaceUpWithoutMatching?: string[];
	players: Record<string, CompilePlayerState>;
	columns: ColumnState[];
	/** Current turn phase (play phase only). Set in onPlayPhaseBegin. */
	turnPhase?: TurnPhase;
	/** True if a compile happened this turn (Check Compile or from a play); Action is skipped. */
	compiledThisTurn?: boolean;
	/** Player id who has Control (play phase only). */
	controlPlayerId?: string | null;
	/** LIFO stack of triggered abilities waiting to resolve (play, flip, uncover). */
	abilityResolutionStack?: AbilityResolutionEntry[];
	/** When set, only this player may call resolveAbilityTarget (effect owner chooses how effect is applied). */
	pendingAbilityTarget?: { entryIndex: number; ownerId: string } | null;
	/** Last target chosen by effect owner (columnIndex, stackIndex of target uncovered card). */
	lastAbilityTargetChoice?: { columnIndex: number; stackIndex: number } | null;
	/** When set, current player must call chooseResolutionOrder to order simultaneous effects. */
	pendingResolutionOrder?: { count: number } | null;
	/** After "Your opponent reveals their hand": hand card IDs visible only to forPlayerId (cleared when turn ends). */
	revealedHandForPlayer?: { forPlayerId: string; hand: string[] };
	/** After "Reveal 1 face-down card": one card ID shown to forPlayerId (cleared when turn ends). */
	revealedCardForDisplay?: { forPlayerId: string; cardId: string };
}

/** Move context may include plugin APIs (e.g. events) from boardgame.io. */
type MoveContext = { G: CompileGameState; ctx: Ctx; events?: { endTurn?: () => void } };

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
	const cardIdsWithStartAbility = setupData?.cardIdsWithStartAbility?.length
		? [...setupData.cardIdsWithStartAbility]
		: [];
	const cardTriggerRows = setupData?.cardTriggerRows
		? JSON.parse(JSON.stringify(setupData.cardTriggerRows)) as Record<string, ('top' | 'middle' | 'bottom')[]>
		: undefined;
	const cardAfterClearCacheRows = setupData?.cardAfterClearCacheRows
		? JSON.parse(JSON.stringify(setupData.cardAfterClearCacheRows)) as Record<string, ('top' | 'middle' | 'bottom')[]>
		: undefined;
	const cardIdsWithFaceDownValue4InStack = setupData?.cardIdsWithFaceDownValue4InStack?.length
		? [...setupData.cardIdsWithFaceDownValue4InStack]
		: undefined;
	const cardIdsPlayFaceUpWithoutMatching = setupData?.cardIdsPlayFaceUpWithoutMatching?.length
		? [...setupData.cardIdsPlayFaceUpWithoutMatching]
		: undefined;
	return {
		protocolPool,
		cardIdToValue,
		protocolToCardIds,
		cardIdsWithStartAbility,
		cardTriggerRows,
		cardAfterClearCacheRows,
		cardIdsWithFaceDownValue4InStack,
		cardIdsPlayFaceUpWithoutMatching,
		players: createEmptyPlayers(),
		columns: createInitialColumns(),
		abilityResolutionStack: [],
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

/** Column total for compile/control; applies "face-down value 4" modifier if top card has that ability. */
function columnSumWithModifiers(G: CompileGameState, colIdx: number): number {
	const col = G.columns[colIdx];
	if (!col || col.commandStack.length === 0) return 0;
	const top = col.commandStack[col.commandStack.length - 1];
	const use4ForFaceDown = top && (G.cardIdsWithFaceDownValue4InStack ?? []).includes(top.cardId);
	return col.commandStack.reduce(
		(s, e) => s + (e.faceUp ? e.value : use4ForFaceDown ? 4 : 2),
		0
	);
}

/** Sum of card values in a column for one player (for Control). */
function columnTotalByPlayer(col: ColumnState, playerId: string): number {
	return col.commandStack
		.filter(e => e.owner === playerId)
		.reduce((s, e) => s + e.value, 0);
}

/** Like columnTotalByPlayer but applies "face-down value 4" modifier when top card has that ability. */
function columnTotalByPlayerWithModifiers(G: CompileGameState, colIdx: number, playerId: string): number {
	const col = G.columns[colIdx];
	if (!col) return 0;
	const top = col.commandStack[col.commandStack.length - 1];
	const use4ForFaceDown = top && (G.cardIdsWithFaceDownValue4InStack ?? []).includes(top.cardId);
	return col.commandStack
		.filter(e => e.owner === playerId)
		.reduce((s, e) => s + (e.faceUp ? e.value : use4ForFaceDown ? 4 : 2), 0);
}

/** True if the player has at least one face-up command card with a Start ability on the board. */
function hasFaceUpCardWithStartAbility(G: CompileGameState, playerId: string): boolean {
	const set = new Set(G.cardIdsWithStartAbility ?? []);
	for (const col of G.columns) {
		for (const entry of col.commandStack) {
			if (entry.owner === playerId && entry.faceUp && set.has(entry.cardId)) return true;
		}
	}
	return false;
}

/** Protocol id that this command card belongs to (from protocolToCardIds). */
function getProtocolForCard(G: CompileGameState, cardId: string): string | null {
	for (const [pid, ids] of Object.entries(G.protocolToCardIds ?? {})) {
		if (ids.includes(cardId)) return pid;
	}
	return null;
}

/** True if the player has an uncovered (top) card with "play face-up without matching protocols". */
function hasUncoveredCardWithPlayWithoutMatching(G: CompileGameState, playerId: string): boolean {
	const set = new Set(G.cardIdsPlayFaceUpWithoutMatching ?? []);
	for (const col of G.columns) {
		if (col.commandStack.length === 0) continue;
		const top = col.commandStack[col.commandStack.length - 1];
		if (top.owner === playerId && set.has(top.cardId)) return true;
	}
	return false;
}

// ---------------------------------------------------------------------------
// Ability resolution stack helpers (LIFO; uncovered = single top card per line)
// ---------------------------------------------------------------------------

/** True iff the entry at (colIdx, stackIdx) is the top of that column's stack (uncovered). */
function isUncovered(G: CompileGameState, colIdx: number, stackIdx: number): boolean {
	const col = G.columns[colIdx];
	if (!col) return false;
	return col.commandStack.length > 0 && stackIdx === col.commandStack.length - 1;
}

/** Push a triggered ability onto the resolution stack (LIFO). */
function pushAbility(G: CompileGameState, entry: AbilityResolutionEntry): void {
	if (!G.abilityResolutionStack) G.abilityResolutionStack = [];
	G.abilityResolutionStack.push(entry);
}

/** Remove all resolution stack entries for the card at (colIdx, stackIdx). */
function removeAbilitiesForCard(G: CompileGameState, colIdx: number, stackIdx: number): void {
	if (!G.abilityResolutionStack) return;
	G.abilityResolutionStack = G.abilityResolutionStack.filter(
		e => !(e.columnIndex === colIdx && e.stackIndex === stackIdx)
	);
}

/** Remove all resolution stack entries for the given cardId (e.g. when card is deleted or returned). */
function removeAbilitiesForCardId(G: CompileGameState, cardId: string): void {
	if (!G.abilityResolutionStack) return;
	G.abilityResolutionStack = G.abilityResolutionStack.filter(e => e.cardId !== cardId);
}

/** Draw up to `count` cards; if deck is empty, shuffle trash into deck first (only drawing triggers reshuffle). Returns number drawn. */
function drawFromDeck(G: CompileGameState, playerId: string, count: number): number {
	const player = G.players[playerId];
	if (!player || count <= 0) return 0;
	let drawn = 0;
	while (drawn < count) {
		if (player.commandDeck.length === 0) {
			if (player.discard.length === 0) break;
			player.commandDeck = shuffle(player.discard);
			player.discard = [];
		}
		const card = player.commandDeck.shift();
		if (card) {
			player.hand.push(card);
			drawn++;
		} else break;
	}
	return drawn;
}

/** Take one card from player's deck (reshuffle discard if empty). Returns cardId or null. Does not add to hand. */
function takeTopOfDeck(G: CompileGameState, playerId: string): string | null {
	const player = G.players[playerId];
	if (!player) return null;
	if (player.commandDeck.length === 0) {
		if (player.discard.length === 0) return null;
		player.commandDeck = shuffle(player.discard);
		player.discard = [];
	}
	const card = player.commandDeck.shift();
	return card ?? null;
}

/** Play one card from player's deck face-down to a column. If insertAtStackIndex is set, insert under that index (for "under this card"). Returns true if a card was played. */
function playCardFromDeckFaceDown(
	G: CompileGameState,
	playerId: string,
	columnIndex: number,
	insertAtStackIndex?: number
): boolean {
	const cardId = takeTopOfDeck(G, playerId);
	if (!cardId) return false;
	const col = G.columns[columnIndex];
	if (!col) return false;
	const entry: CommandStackEntry = { cardId, owner: playerId, faceUp: false, value: 2 };
	if (insertAtStackIndex != null && insertAtStackIndex >= 0 && insertAtStackIndex <= col.commandStack.length) {
		// Deactivate abilities for the card that will be covered (at insertAtStackIndex).
		if (insertAtStackIndex < col.commandStack.length) {
			removeAbilitiesForCard(G, columnIndex, insertAtStackIndex);
		}
		col.commandStack.splice(insertAtStackIndex, 0, entry);
		// Update ability stack: entries in this column at or above insert index shift up.
		if (G.abilityResolutionStack) {
			G.abilityResolutionStack = G.abilityResolutionStack.map((e) =>
				e.columnIndex === columnIndex && e.stackIndex >= insertAtStackIndex!
					? { ...e, stackIndex: e.stackIndex + 1 }
					: e
			);
		}
	} else {
		// Append to end; deactivate current top if any.
		const topIdx = col.commandStack.length - 1;
		if (topIdx >= 0) removeAbilitiesForCard(G, columnIndex, topIdx);
		col.commandStack.push(entry);
	}
	return true;
}

/** Perform compile on one column: discard stack to owners, set protocolCompiled, maybe draw from opponent. */
function performCompile(G: CompileGameState, colIdx: number, playerId: string): void {
	const col = G.columns[colIdx];
	// Deactivate abilities for all cards in this line before deleting (covered/deleted).
	for (let stackIdx = 0; stackIdx < col.commandStack.length; stackIdx++) {
		removeAbilitiesForCard(G, colIdx, stackIdx);
	}
	for (const entry of col.commandStack) {
		const owner = G.players[entry.owner];
		if (owner) owner.discard.push(entry.cardId);
	}
	col.commandStack = [];
	const p = playerId === '0' ? 0 : 1;
	const alreadyCompiled = col.protocolCompiled[p];
	if (!alreadyCompiled) {
		col.protocolCompiled[p] = true;
	} else {
		const otherId = playerId === '0' ? '1' : '0';
		const opponent = G.players[otherId];
		const player = G.players[playerId];
		if (opponent?.commandDeck.length > 0 && player) {
			const drawnId = opponent.commandDeck.shift()!;
			player.hand.push(drawnId);
		}
	}
}

/** Play phase, Action only: play one command card. Face down = value 2, no powers, any lane. */
function playCommandCard(
	{ G, ctx, events }: MoveContext,
	columnIndex: number,
	handIndex: number,
	faceUp: boolean
): typeof INVALID_MOVE | void {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	const phase = G.turnPhase ?? 'Start';
	if (phase !== 'Action') return INVALID_MOVE;
	if (columnIndex < 0 || columnIndex >= NUM_COLUMNS) return INVALID_MOVE;
	const playerId = ctx.currentPlayer;
	const player = G.players[playerId];
	if (!player) return INVALID_MOVE;
	const hand = player.hand;
	if (handIndex < 0 || handIndex >= hand.length) return INVALID_MOVE;

	const cardId = hand[handIndex];
	// Face-up: card's protocol must match column's protocol for this player, unless "play without matching" ability is active
	if (faceUp) {
		const playerIdx = playerId === '0' ? 0 : 1;
		const colProtocol = G.columns[columnIndex]?.protocol?.[playerIdx] ?? null;
		const cardProtocol = getProtocolForCard(G, cardId);
		if (cardProtocol != null && colProtocol !== cardProtocol && !hasUncoveredCardWithPlayWithoutMatching(G, playerId)) {
			return INVALID_MOVE;
		}
	}
	const value = faceUp ? (G.cardIdToValue[cardId] ?? 0) : 2;
	player.hand.splice(handIndex, 1);
	const col = G.columns[columnIndex];
	// Deactivate abilities for the card that is about to become covered (current top).
	const oldTopStackIdx = col.commandStack.length - 1;
	if (oldTopStackIdx >= 0) {
		removeAbilitiesForCard(G, columnIndex, oldTopStackIdx);
	}
	col.commandStack.push({
		cardId,
		owner: playerId,
		faceUp,
		value,
	});
	const newStackIdx = col.commandStack.length - 1;
	// Push triggered ability rows for the new card (only if face-up and has trigger metadata).
	if (faceUp && G.cardTriggerRows?.[cardId]?.length) {
		for (const abilityRow of G.cardTriggerRows[cardId]) {
			pushAbility(G, { columnIndex, stackIndex: newStackIdx, cardId, owner: playerId, abilityRow });
		}
	}

	if (columnSumWithModifiers(G, columnIndex) >= COMPILE_THRESHOLD) {
		performCompile(G, columnIndex, playerId);
		G.compiledThisTurn = true;
	}

	const stackLen = (G.abilityResolutionStack ?? []).length;
	if (stackLen === 0) {
		G.turnPhase = 'CheckCache';
		runOnePhaseStep(G, ctx, events); // CheckCache → End
		runOnePhaseStep(G, ctx, events); // End → endTurn
	}
	// If stack non-empty, leave turnPhase as Action so player must resolve abilities before turn ends.
}

/** Play phase: draw back up to HAND_SIZE (Refresh). Uses drawFromDeck so only drawing triggers reshuffle. */
function refreshHand({ G, ctx, events }: MoveContext): typeof INVALID_MOVE | void {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	const phase = G.turnPhase ?? 'Start';
	if (phase !== 'Action') return INVALID_MOVE;
	const playerId = ctx.currentPlayer;
	const player = G.players[playerId];
	if (!player) return INVALID_MOVE;

	const toDraw = Math.max(0, HAND_SIZE - player.hand.length);
	drawFromDeck(G, playerId, toDraw);
	G.turnPhase = 'CheckCache';

	// Run rest of turn (Check Cache → End → endTurn) in same move so turn passes to opponent.
	runOnePhaseStep(G, ctx, events); // CheckCache → End
	runOnePhaseStep(G, ctx, events); // End → endTurn
}

/** Play phase: effect owner submits target (uncovered card). Only valid when pendingAbilityTarget.ownerId === currentPlayer. */
function resolveAbilityTarget(
	{ G, ctx }: MoveContext,
	targetColumnIndex: number,
	targetStackIndex: number
): typeof INVALID_MOVE | void {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	const pending = G.pendingAbilityTarget;
	if (!pending || ctx.currentPlayer !== pending.ownerId) return INVALID_MOVE;
	if (targetColumnIndex < 0 || targetColumnIndex >= NUM_COLUMNS) return INVALID_MOVE;
	if (!isUncovered(G, targetColumnIndex, targetStackIndex)) return INVALID_MOVE;
	G.lastAbilityTargetChoice = { columnIndex: targetColumnIndex, stackIndex: targetStackIndex };
	G.pendingAbilityTarget = null;
}

/** Effect types the server can apply (client sends these when resolving abilities). */
export type EffectType =
	| 'draw' | 'discard' | 'delete' | 'return' | 'shift' | 'shiftAllInLine' | 'flip' | 'flipMultiple' | 'reveal'
	| 'drawThenDiscardThenReveal' | 'revealFaceDownThenOptional'
	| 'discardThenDraw' | 'drawThenDiscard' | 'discardThenReturn' | 'discardThenDelete'
	| 'playFromHandFaceDownAnotherLine' | 'playTopOfDeckFaceDownUnderThisCard' | 'opponentPlayTopOfDeckFaceDownInLine'
	| 'playTopOfDeckFaceDownInEachLineWhereYouHaveCard' | 'playTopOfDeckFaceDownAnotherLine' | 'playOneCard'
	| 'playTopOfDeckFaceDownInEachOtherLine'
	| 'refreshThenDraw'
	| 'rearrange'
	| 'skipCheckCache';

/** Params for applyEffect (shape depends on effect type). */
export type EffectParams =
	| { type: 'draw'; playerId: string; count: number; optional?: boolean }
	| { type: 'discard'; playerId: string; count?: number; downTo?: number; cardIds?: string[] }
	| { type: 'discardThenDraw'; playerId: string; cardIds: string[]; drawBonus: number }
	| { type: 'drawThenDiscard'; drawPlayerId: string; drawCount: number; discardPlayerId: string; discardCount: number }
	| { type: 'discardThenReturn'; playerId: string; discardCardId: string | null; returnColumnIndex?: number; returnStackIndex?: number }
	| { type: 'discardThenDelete'; playerId: string; discardCardId: string | null; columnIndex?: number; stackIndex?: number }
	| { type: 'delete'; columnIndex: number; stackIndex: number }
	| { type: 'return'; columnIndex: number; stackIndex: number }
	| { type: 'shift'; fromColumnIndex: number; fromStackIndex: number; toColumnIndex: number }
	| { type: 'shiftAllInLine'; fromColumnIndex: number; toColumnIndex: number }
	| { type: 'flip'; columnIndex: number; stackIndex: number }
	| { type: 'flipMultiple'; targets: Array<{ columnIndex: number; stackIndex: number }> };

/** Apply one effect from the resolution stack (LIFO). Pops the top entry after applying. Client sends effect type + params; server validates and runs. */
function applyEffect({ G, ctx, events }: MoveContext, effectType: EffectType, params: unknown): typeof INVALID_MOVE | void {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	const stack = G.abilityResolutionStack ?? [];
	if (stack.length === 0) return INVALID_MOVE;

	switch (effectType) {
		case 'draw': {
			const p = params as { playerId: string; count: number; optional?: boolean };
			if (typeof p?.playerId !== 'string' || typeof p?.count !== 'number' || p.count < 0) return INVALID_MOVE;
			if (p.optional === true && p.count === 0) {
				// Skip optional draw: no-op, pop will happen below
			} else if (p.count >= 1) {
				drawFromDeck(G, p.playerId, p.count);
			} else return INVALID_MOVE;
			break;
		}
		case 'discard': {
			const p = params as { playerId: string; count?: number; downTo?: number; cardIds?: string[] };
			if (typeof p?.playerId !== 'string') return INVALID_MOVE;
			const pl = G.players[p.playerId];
			if (!pl) return INVALID_MOVE;
			const requiredCount = p.count ?? 1;
			if (Array.isArray(p.cardIds) && p.cardIds.length > 0) {
				if (p.cardIds.length !== requiredCount) return INVALID_MOVE;
				const handSet = new Set(pl.hand);
				const seen = new Set<string>();
				for (const id of p.cardIds) {
					if (typeof id !== 'string' || !handSet.has(id) || seen.has(id)) return INVALID_MOVE;
					seen.add(id);
				}
				for (const id of p.cardIds) {
					const idx = pl.hand.indexOf(id);
					if (idx !== -1) {
						pl.hand.splice(idx, 1);
						pl.discard.push(id);
					}
				}
			} else {
				let toDiscard: number;
				if (p.downTo !== undefined) {
					if (p.downTo < 0 || p.downTo > 10) return INVALID_MOVE;
					toDiscard = Math.max(0, pl.hand.length - p.downTo);
				} else if (typeof p.count === 'number' && p.count >= 0) {
					toDiscard = Math.min(p.count, pl.hand.length);
				} else return INVALID_MOVE;
				for (let i = 0; i < toDiscard && pl.hand.length > 0; i++) {
					pl.discard.push(pl.hand.pop()!);
				}
			}
			break;
		}
		case 'discardThenDraw': {
			const p = params as { playerId: string; cardIds: string[]; drawBonus: number };
			if (typeof p?.playerId !== 'string' || !Array.isArray(p.cardIds) || typeof p?.drawBonus !== 'number') return INVALID_MOVE;
			if (p.cardIds.length < 1) return INVALID_MOVE;
			const pl = G.players[p.playerId];
			if (!pl) return INVALID_MOVE;
			const handSet = new Set(pl.hand);
			const seen = new Set<string>();
			for (const id of p.cardIds) {
				if (typeof id !== 'string' || !handSet.has(id) || seen.has(id)) return INVALID_MOVE;
				seen.add(id);
			}
			for (const id of p.cardIds) {
				const idx = pl.hand.indexOf(id);
				if (idx !== -1) {
					pl.hand.splice(idx, 1);
					pl.discard.push(id);
				}
			}
			const toDraw = p.cardIds.length + Math.max(0, p.drawBonus);
			drawFromDeck(G, p.playerId, Math.min(toDraw, 20));
			break;
		}
		case 'drawThenDiscard': {
			const p = params as { drawPlayerId: string; drawCount: number; discardPlayerId: string; discardCount: number };
			if (typeof p?.drawPlayerId !== 'string' || typeof p?.drawCount !== 'number' || typeof p?.discardPlayerId !== 'string' || typeof p?.discardCount !== 'number') return INVALID_MOVE;
			if (p.drawCount < 1 || p.discardCount < 1) return INVALID_MOVE;
			drawFromDeck(G, p.drawPlayerId, Math.min(p.drawCount, 10));
			const discardPl = G.players[p.discardPlayerId];
			if (discardPl) {
				const toDiscard = Math.min(p.discardCount, discardPl.hand.length);
				for (let i = 0; i < toDiscard && discardPl.hand.length > 0; i++) {
					discardPl.discard.push(discardPl.hand.pop()!);
				}
			}
			break;
		}
		case 'discardThenReturn': {
			const p = params as { playerId: string; discardCardId: string | null; returnColumnIndex?: number; returnStackIndex?: number };
			if (typeof p?.playerId !== 'string') return INVALID_MOVE;
			const pl = G.players[p.playerId];
			if (!pl) return INVALID_MOVE;
			if (p.discardCardId === null || p.discardCardId === undefined) {
				// Skip: no discard, no return
				break;
			}
			const handIdx = pl.hand.indexOf(p.discardCardId);
			if (handIdx === -1) return INVALID_MOVE;
			pl.hand.splice(handIdx, 1);
			pl.discard.push(p.discardCardId);
			if (typeof p.returnColumnIndex !== 'number' || typeof p.returnStackIndex !== 'number') return INVALID_MOVE;
			if (!isUncovered(G, p.returnColumnIndex, p.returnStackIndex)) return INVALID_MOVE;
			const retCol = G.columns[p.returnColumnIndex];
			if (!retCol || p.returnStackIndex < 0 || p.returnStackIndex >= retCol.commandStack.length) return INVALID_MOVE;
			const removed = retCol.commandStack.splice(p.returnStackIndex, 1)[0];
			if (!removed) return INVALID_MOVE;
			const owner = G.players[removed.owner];
			if (owner) owner.hand.push(removed.cardId);
			removeAbilitiesForCardId(G, removed.cardId);
			if (G.abilityResolutionStack) {
				G.abilityResolutionStack = G.abilityResolutionStack.map(e =>
					e.columnIndex === p.returnColumnIndex! && e.stackIndex > p.returnStackIndex! ? { ...e, stackIndex: e.stackIndex - 1 } : e
				);
			}
			break;
		}
		case 'discardThenDelete': {
			const p = params as { playerId: string; discardCardId: string | null; columnIndex?: number; stackIndex?: number };
			if (typeof p?.playerId !== 'string') return INVALID_MOVE;
			const pl = G.players[p.playerId];
			if (!pl) return INVALID_MOVE;
			if (p.discardCardId === null || p.discardCardId === undefined) {
				break;
			}
			const handIdxDel = pl.hand.indexOf(p.discardCardId);
			if (handIdxDel === -1) return INVALID_MOVE;
			pl.hand.splice(handIdxDel, 1);
			pl.discard.push(p.discardCardId);
			if (typeof p.columnIndex !== 'number' || typeof p.stackIndex !== 'number') return INVALID_MOVE;
			if (!isUncovered(G, p.columnIndex, p.stackIndex)) return INVALID_MOVE;
			const delCol = G.columns[p.columnIndex];
			if (!delCol || p.stackIndex < 0 || p.stackIndex >= delCol.commandStack.length) return INVALID_MOVE;
			const delEntry = delCol.commandStack.splice(p.stackIndex, 1)[0];
			if (!delEntry) return INVALID_MOVE;
			const delOwner = G.players[delEntry.owner];
			if (delOwner) delOwner.discard.push(delEntry.cardId);
			removeAbilitiesForCardId(G, delEntry.cardId);
			if (G.abilityResolutionStack) {
				G.abilityResolutionStack = G.abilityResolutionStack.map(e =>
					e.columnIndex === p.columnIndex! && e.stackIndex > p.stackIndex! ? { ...e, stackIndex: e.stackIndex - 1 } : e
				);
			}
			break;
		}
		case 'delete': {
			const p = params as { columnIndex: number; stackIndex: number };
			if (typeof p?.columnIndex !== 'number' || typeof p?.stackIndex !== 'number') return INVALID_MOVE;
			const col = G.columns[p.columnIndex];
			if (!col || p.stackIndex < 0 || p.stackIndex >= col.commandStack.length) return INVALID_MOVE;
			const removed = col.commandStack.splice(p.stackIndex, 1)[0];
			if (!removed) return INVALID_MOVE;
			const owner = G.players[removed.owner];
			if (owner) owner.discard.push(removed.cardId);
			removeAbilitiesForCardId(G, removed.cardId);
			if (G.abilityResolutionStack) {
				G.abilityResolutionStack = G.abilityResolutionStack.map(e =>
					e.columnIndex === p.columnIndex && e.stackIndex > p.stackIndex ? { ...e, stackIndex: e.stackIndex - 1 } : e
				);
			}
			break;
		}
		case 'return': {
			const p = params as { columnIndex: number; stackIndex: number };
			if (typeof p?.columnIndex !== 'number' || typeof p?.stackIndex !== 'number') return INVALID_MOVE;
			const col = G.columns[p.columnIndex];
			if (!col || p.stackIndex < 0 || p.stackIndex >= col.commandStack.length) return INVALID_MOVE;
			const removed = col.commandStack.splice(p.stackIndex, 1)[0];
			if (!removed) return INVALID_MOVE;
			const owner = G.players[removed.owner];
			if (owner) owner.hand.push(removed.cardId);
			removeAbilitiesForCardId(G, removed.cardId);
			if (G.abilityResolutionStack) {
				G.abilityResolutionStack = G.abilityResolutionStack.map(e =>
					e.columnIndex === p.columnIndex && e.stackIndex > p.stackIndex ? { ...e, stackIndex: e.stackIndex - 1 } : e
				);
			}
			break;
		}
		case 'shift': {
			const p = params as { fromColumnIndex: number; fromStackIndex: number; toColumnIndex: number };
			if (typeof p?.fromColumnIndex !== 'number' || typeof p?.fromStackIndex !== 'number' || typeof p?.toColumnIndex !== 'number')
				return INVALID_MOVE;
			if (p.toColumnIndex < 0 || p.toColumnIndex >= NUM_COLUMNS || p.fromColumnIndex === p.toColumnIndex) return INVALID_MOVE;
			const fromCol = G.columns[p.fromColumnIndex];
			const toCol = G.columns[p.toColumnIndex];
			if (!fromCol || !toCol || p.fromStackIndex < 0 || p.fromStackIndex >= fromCol.commandStack.length) return INVALID_MOVE;
			const [moved] = fromCol.commandStack.splice(p.fromStackIndex, 1);
			if (!moved) return INVALID_MOVE;
			toCol.commandStack.push(moved);
			const newStackIdx = toCol.commandStack.length - 1;
			if (G.cardTriggerRows?.[moved.cardId]?.length) {
				for (const abilityRow of G.cardTriggerRows[moved.cardId]) {
					pushAbility(G, { columnIndex: p.toColumnIndex, stackIndex: newStackIdx, cardId: moved.cardId, owner: moved.owner, abilityRow });
				}
			}
			if (G.abilityResolutionStack) {
				G.abilityResolutionStack = G.abilityResolutionStack.map(e => {
					if (e.columnIndex === p.fromColumnIndex && e.stackIndex === p.fromStackIndex)
						return { ...e, columnIndex: p.toColumnIndex, stackIndex: newStackIdx };
					if (e.columnIndex === p.fromColumnIndex && e.stackIndex > p.fromStackIndex) return { ...e, stackIndex: e.stackIndex - 1 };
					if (e.columnIndex === p.toColumnIndex && e.stackIndex >= newStackIdx) return { ...e, stackIndex: e.stackIndex + 1 };
					return e;
				});
			}
			break;
		}
		case 'shiftAllInLine': {
			const p = params as { fromColumnIndex: number; toColumnIndex: number };
			if (typeof p?.fromColumnIndex !== 'number' || typeof p?.toColumnIndex !== 'number') return INVALID_MOVE;
			if (p.fromColumnIndex === p.toColumnIndex) return INVALID_MOVE;
			if (p.fromColumnIndex < 0 || p.fromColumnIndex >= NUM_COLUMNS || p.toColumnIndex < 0 || p.toColumnIndex >= NUM_COLUMNS)
				return INVALID_MOVE;
			const fromCol = G.columns[p.fromColumnIndex];
			const toCol = G.columns[p.toColumnIndex];
			if (!fromCol || !toCol) return INVALID_MOVE;
			const faceDownIndices: number[] = [];
			fromCol.commandStack.forEach((entry, idx) => {
				if (!entry.faceUp) faceDownIndices.push(idx);
			});
			if (faceDownIndices.length === 0) break;
			const toMove = fromCol.commandStack.filter((e) => !e.faceUp);
			fromCol.commandStack = fromCol.commandStack.filter((e) => e.faceUp);
			const baseNewIdx = toCol.commandStack.length;
			for (const entry of toMove) {
				toCol.commandStack.push(entry);
			}
			if (G.abilityResolutionStack) {
				G.abilityResolutionStack = G.abilityResolutionStack.map((e) => {
					if (e.columnIndex === p.fromColumnIndex) {
						const idxInMoved = faceDownIndices.indexOf(e.stackIndex);
						if (idxInMoved >= 0) {
							return { ...e, columnIndex: p.toColumnIndex, stackIndex: baseNewIdx + idxInMoved };
						}
						const removedBelow = faceDownIndices.filter((i) => i < e.stackIndex).length;
						return { ...e, stackIndex: e.stackIndex - removedBelow };
					}
					return e;
				});
			}
			break;
		}
		case 'flip': {
			const p = params as { columnIndex: number; stackIndex: number };
			if (typeof p?.columnIndex !== 'number' || typeof p?.stackIndex !== 'number') return INVALID_MOVE;
			const col = G.columns[p.columnIndex];
			if (!col || p.stackIndex < 0 || p.stackIndex >= col.commandStack.length) return INVALID_MOVE;
			const card = col.commandStack[p.stackIndex];
			if (!card) return INVALID_MOVE;
			card.faceUp = !card.faceUp;
			if (card.faceUp) {
				card.value = G.cardIdToValue[card.cardId] ?? 0;
				if (G.cardTriggerRows?.[card.cardId]?.length) {
					for (const abilityRow of G.cardTriggerRows[card.cardId]) {
						pushAbility(G, { columnIndex: p.columnIndex, stackIndex: p.stackIndex, cardId: card.cardId, owner: card.owner, abilityRow });
					}
				}
			} else {
				card.value = 2;
				removeAbilitiesForCard(G, p.columnIndex, p.stackIndex);
			}
			break;
		}
		case 'reveal': {
			const otherId = ctx.currentPlayer === '0' ? '1' : '0';
			const opp = G.players[otherId];
			if (opp) {
				G.revealedHandForPlayer = { forPlayerId: ctx.currentPlayer, hand: [...opp.hand] };
			}
			break;
		}
		case 'drawThenDiscardThenReveal': {
			const p = params as { drawPlayerId: string; drawCount: number; discardPlayerId: string; discardCount: number };
			if (typeof p?.drawPlayerId !== 'string' || typeof p?.drawCount !== 'number' || typeof p?.discardPlayerId !== 'string' || typeof p?.discardCount !== 'number')
				return INVALID_MOVE;
			drawFromDeck(G, p.drawPlayerId, Math.min(p.drawCount, 10));
			const discardPl = G.players[p.discardPlayerId];
			if (discardPl) {
				const toDiscard = Math.min(p.discardCount, discardPl.hand.length);
				for (let i = 0; i < toDiscard && discardPl.hand.length > 0; i++) {
					discardPl.discard.push(discardPl.hand.pop()!);
				}
				G.revealedHandForPlayer = { forPlayerId: ctx.currentPlayer, hand: [...discardPl.hand] };
			}
			break;
		}
		case 'revealFaceDownThenOptional': {
			const p = params as { columnIndex: number; stackIndex: number; action: 'none' | 'shift' | 'flip'; toColumnIndex?: number };
			if (typeof p?.columnIndex !== 'number' || typeof p?.stackIndex !== 'number') return INVALID_MOVE;
			const col = G.columns[p.columnIndex];
			if (!col || p.stackIndex < 0 || p.stackIndex >= col.commandStack.length) return INVALID_MOVE;
			const card = col.commandStack[p.stackIndex];
			if (!card || card.faceUp) return INVALID_MOVE;
			G.revealedCardForDisplay = { forPlayerId: ctx.currentPlayer, cardId: card.cardId };
			if (p.action === 'flip') {
				card.faceUp = true;
				card.value = G.cardIdToValue[card.cardId] ?? 0;
				if (G.cardTriggerRows?.[card.cardId]?.length) {
					for (const abilityRow of G.cardTriggerRows[card.cardId]) {
						pushAbility(G, { columnIndex: p.columnIndex, stackIndex: p.stackIndex, cardId: card.cardId, owner: card.owner, abilityRow });
					}
				}
			} else if (p.action === 'shift' && typeof p.toColumnIndex === 'number' && p.toColumnIndex >= 0 && p.toColumnIndex < NUM_COLUMNS && p.toColumnIndex !== p.columnIndex) {
				const toCol = G.columns[p.toColumnIndex];
				if (toCol) {
					const [moved] = col.commandStack.splice(p.stackIndex, 1);
					if (moved) {
						toCol.commandStack.push(moved);
						const newStackIdx = toCol.commandStack.length - 1;
						if (G.cardTriggerRows?.[moved.cardId]?.length) {
							for (const abilityRow of G.cardTriggerRows[moved.cardId]) {
								pushAbility(G, { columnIndex: p.toColumnIndex, stackIndex: newStackIdx, cardId: moved.cardId, owner: moved.owner, abilityRow });
							}
						}
						if (G.abilityResolutionStack) {
							const fromCol = p.columnIndex;
							const toCol = p.toColumnIndex;
							G.abilityResolutionStack = G.abilityResolutionStack.map((e) => {
								if (e.columnIndex === fromCol && e.stackIndex === p.stackIndex)
									return { ...e, columnIndex: toCol, stackIndex: newStackIdx };
								if (e.columnIndex === fromCol && e.stackIndex > p.stackIndex) return { ...e, stackIndex: e.stackIndex - 1 };
								if (e.columnIndex === toCol && e.stackIndex >= newStackIdx) return { ...e, stackIndex: e.stackIndex + 1 };
								return e;
							});
						}
					}
				}
			}
			break;
		}
		case 'flipMultiple': {
			const p = params as { targets: Array<{ columnIndex: number; stackIndex: number }> };
			if (!Array.isArray(p?.targets) || p.targets.length === 0) return INVALID_MOVE;
			const seen = new Set<string>();
			for (const t of p.targets) {
				if (typeof t?.columnIndex !== 'number' || typeof t?.stackIndex !== 'number') return INVALID_MOVE;
				const key = `${t.columnIndex},${t.stackIndex}`;
				if (seen.has(key)) return INVALID_MOVE;
				seen.add(key);
				const col = G.columns[t.columnIndex];
				if (!col || t.stackIndex < 0 || t.stackIndex >= col.commandStack.length) return INVALID_MOVE;
			}
			for (const t of p.targets) {
				const col = G.columns[t.columnIndex];
				const card = col!.commandStack[t.stackIndex];
				if (!card) return INVALID_MOVE;
				card.faceUp = !card.faceUp;
				if (card.faceUp) {
					card.value = G.cardIdToValue[card.cardId] ?? 0;
					if (G.cardTriggerRows?.[card.cardId]?.length) {
						for (const abilityRow of G.cardTriggerRows[card.cardId]) {
							pushAbility(G, { columnIndex: t.columnIndex, stackIndex: t.stackIndex, cardId: card.cardId, owner: card.owner, abilityRow });
						}
					}
				} else {
					card.value = 2;
					removeAbilitiesForCard(G, t.columnIndex, t.stackIndex);
				}
			}
			break;
		}
		case 'playFromHandFaceDownAnotherLine': {
			const topEntry = stack[stack.length - 1];
			const sourceCol = topEntry?.columnIndex ?? -1;
			const p = params as { handCardId: string; toColumnIndex: number };
			if (typeof p?.handCardId !== 'string' || typeof p?.toColumnIndex !== 'number') return INVALID_MOVE;
			if (p.toColumnIndex < 0 || p.toColumnIndex >= NUM_COLUMNS || p.toColumnIndex === sourceCol) return INVALID_MOVE;
			const playerId = ctx.currentPlayer;
			const player = G.players[playerId];
			if (!player || !player.hand.includes(p.handCardId)) return INVALID_MOVE;
			const col = G.columns[p.toColumnIndex];
			if (!col) return INVALID_MOVE;
			player.hand.splice(player.hand.indexOf(p.handCardId), 1);
			const topIdx = col.commandStack.length - 1;
			if (topIdx >= 0) removeAbilitiesForCard(G, p.toColumnIndex, topIdx);
			col.commandStack.push({ cardId: p.handCardId, owner: playerId, faceUp: false, value: 2 });
			break;
		}
		case 'playTopOfDeckFaceDownUnderThisCard': {
			const p = params as { columnIndex: number; stackIndex: number };
			if (typeof p?.columnIndex !== 'number' || typeof p?.stackIndex !== 'number') return INVALID_MOVE;
			const col = G.columns[p.columnIndex];
			if (!col || p.stackIndex < 0 || p.stackIndex >= col.commandStack.length) return INVALID_MOVE;
			const playerId = ctx.currentPlayer;
			const n = Math.floor(col.commandStack.length / 2);
			for (let i = 0; i < n; i++) {
				const inserted = playCardFromDeckFaceDown(G, playerId, p.columnIndex, p.stackIndex);
				if (!inserted) break;
			}
			break;
		}
		case 'opponentPlayTopOfDeckFaceDownInLine': {
			const topEntry = stack[stack.length - 1];
			const colIdx = topEntry?.columnIndex ?? (params as { columnIndex?: number })?.columnIndex;
			if (typeof colIdx !== 'number' || colIdx < 0 || colIdx >= NUM_COLUMNS) return INVALID_MOVE;
			const opponentId = ctx.currentPlayer === '0' ? '1' : '0';
			playCardFromDeckFaceDown(G, opponentId, colIdx);
			break;
		}
		case 'playTopOfDeckFaceDownInEachLineWhereYouHaveCard': {
			const playerId = ctx.currentPlayer;
			for (let c = 0; c < NUM_COLUMNS; c++) {
				const col = G.columns[c];
				if (!col) continue;
				const hasMine = col.commandStack.some((e) => e.owner === playerId);
				if (hasMine) playCardFromDeckFaceDown(G, playerId, c);
			}
			break;
		}
		case 'playTopOfDeckFaceDownAnotherLine': {
			const topEntry = stack[stack.length - 1];
			const sourceCol = topEntry?.columnIndex ?? -1;
			const p = params as { toColumnIndex: number };
			if (typeof p?.toColumnIndex !== 'number' || p.toColumnIndex < 0 || p.toColumnIndex >= NUM_COLUMNS || p.toColumnIndex === sourceCol)
				return INVALID_MOVE;
			playCardFromDeckFaceDown(G, ctx.currentPlayer, p.toColumnIndex);
			break;
		}
		case 'playOneCard': {
			const p = params as { handIndex: number; columnIndex: number; faceUp: boolean };
			if (typeof p?.handIndex !== 'number' || typeof p?.columnIndex !== 'number' || typeof p?.faceUp !== 'boolean') return INVALID_MOVE;
			if (p.columnIndex < 0 || p.columnIndex >= NUM_COLUMNS) return INVALID_MOVE;
			const playerId = ctx.currentPlayer;
			const player = G.players[playerId];
			if (!player || p.handIndex < 0 || p.handIndex >= player.hand.length) return INVALID_MOVE;
			const cardId = player.hand[p.handIndex];
			const value = p.faceUp ? (G.cardIdToValue[cardId] ?? 0) : 2;
			player.hand.splice(p.handIndex, 1);
			const col = G.columns[p.columnIndex];
			if (!col) return INVALID_MOVE;
			const oldTopStackIdx = col.commandStack.length - 1;
			if (oldTopStackIdx >= 0) removeAbilitiesForCard(G, p.columnIndex, oldTopStackIdx);
			col.commandStack.push({ cardId, owner: playerId, faceUp: p.faceUp, value });
			const newStackIdx = col.commandStack.length - 1;
			if (p.faceUp && G.cardTriggerRows?.[cardId]?.length) {
				for (const abilityRow of G.cardTriggerRows[cardId]) {
					pushAbility(G, { columnIndex: p.columnIndex, stackIndex: newStackIdx, cardId, owner: playerId, abilityRow });
				}
			}
			if (columnSumWithModifiers(G, p.columnIndex) >= COMPILE_THRESHOLD) {
				performCompile(G, p.columnIndex, playerId);
				G.compiledThisTurn = true;
			}
			break;
		}
		case 'skipCheckCache': {
			G.skipCheckCacheThisTurn = true;
			break;
		}
		case 'playTopOfDeckFaceDownInEachOtherLine': {
			const topEntry = stack[stack.length - 1];
			const sourceCol = topEntry?.columnIndex ?? (params as { sourceColumnIndex?: number })?.sourceColumnIndex ?? -1;
			if (sourceCol < 0 || sourceCol >= NUM_COLUMNS) return INVALID_MOVE;
			const playerId = ctx.currentPlayer;
			for (let c = 0; c < NUM_COLUMNS; c++) {
				if (c === sourceCol) continue;
				playCardFromDeckFaceDown(G, playerId, c);
			}
			break;
		}
		case 'refreshThenDraw': {
			const p = params as { drawCount?: number };
			const drawCount = Math.min(Math.max(0, (p?.drawCount ?? 1)), 10);
			const playerId = ctx.currentPlayer;
			const player = G.players[playerId];
			if (!player) return INVALID_MOVE;
			const toRefresh = Math.max(0, HAND_SIZE - player.hand.length);
			drawFromDeck(G, playerId, toRefresh);
			drawFromDeck(G, playerId, drawCount);
			break;
		}
		case 'rearrange': {
			const p = params as { permutation?: [number, number, number] };
			const perm = p?.permutation;
			if (!Array.isArray(perm) || perm.length !== NUM_COLUMNS) return INVALID_MOVE;
			const sorted = [...perm].sort((a, b) => a - b);
			if (sorted[0] !== 0 || sorted[1] !== 1 || sorted[2] !== 2) return INVALID_MOVE;
			if (perm[0] === 0 && perm[1] === 1 && perm[2] === 2) return INVALID_MOVE;
			applyProtocolPermutation(G, perm as [number, number, number]);
			break;
		}
		default:
			return INVALID_MOVE;
	}

	// Pop the resolved entry
	G.abilityResolutionStack = stack.slice(0, -1);

	// When stack becomes empty, finish the turn (CheckCache → End → endTurn).
	if (G.abilityResolutionStack.length === 0 && events) {
		G.turnPhase = 'CheckCache';
		runOnePhaseStep(G, ctx, events);
		runOnePhaseStep(G, ctx, events);
	}
}

/** Apply a protocol permutation to G.columns (protocol + protocolCompiled only; commandStack unchanged). */
function applyProtocolPermutation(G: CompileGameState, permutation: [number, number, number]): void {
	const columns = G.columns;
	const newProtocol: [string | null, string | null][] = [];
	const newProtocolCompiled: [boolean, boolean][] = [];
	for (let col = 0; col < NUM_COLUMNS; col++) {
		const src = permutation[col];
		newProtocol[col] = columns[src].protocol;
		newProtocolCompiled[col] = columns[src].protocolCompiled;
	}
	for (let col = 0; col < NUM_COLUMNS; col++) {
		columns[col].protocol = newProtocol[col];
		columns[col].protocolCompiled = newProtocolCompiled[col];
	}
}

/** Play phase: rearrange protocol cards only (not stacks). permutation[col] = source column index for that column's new protocol. Must be a real change (not identity). */
function rearrangeProtocols({ G, ctx }: MoveContext, permutation: [number, number, number]): typeof INVALID_MOVE | void {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	if (permutation.length !== NUM_COLUMNS) return INVALID_MOVE;
	const sorted = [...permutation].sort((a, b) => a - b);
	if (sorted[0] !== 0 || sorted[1] !== 1 || sorted[2] !== 2) return INVALID_MOVE;
	if (permutation[0] === 0 && permutation[1] === 1 && permutation[2] === 2) return INVALID_MOVE;
	applyProtocolPermutation(G, permutation);
}

/** Play phase: current player chooses order to resolve multiple simultaneous effects. Only valid when pendingResolutionOrder is set. */
function chooseResolutionOrder({ G, ctx }: MoveContext, orderedIndices: number[]): typeof INVALID_MOVE | void {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	const pending = G.pendingResolutionOrder;
	if (!pending) return INVALID_MOVE;
	const stack = G.abilityResolutionStack ?? [];
	if (orderedIndices.length !== pending.count) return INVALID_MOVE;
	const top = stack.slice(-pending.count);
	if (top.length !== pending.count) return INVALID_MOVE;
	// orderedIndices[j] = index in top of the effect to resolve (j+1)th (0 = resolve first)
	const seen = new Set<number>();
	for (const i of orderedIndices) {
		if (i < 0 || i >= top.length || seen.has(i)) return INVALID_MOVE;
		seen.add(i);
	}
	const reordered = orderedIndices.map(i => top[i]);
	G.abilityResolutionStack = [...stack.slice(0, -pending.count), ...reordered];
	G.pendingResolutionOrder = null;
}

/** Run one turn-phase step (mutates G). Used by advancePhase and advanceToAction. */
function runOnePhaseStep(
	G: CompileGameState,
	ctx: Ctx,
	events?: { endTurn?: () => void }
): void {
	const phase = G.turnPhase ?? 'Start';
	const playerId = ctx.currentPlayer;
	const opponentId = playerId === '0' ? '1' : '0';
	const player = G.players[playerId];

	switch (phase) {
		case 'Start':
			if (!hasFaceUpCardWithStartAbility(G, playerId)) {
				// Skip Start phase (no-op; hook for future effects)
			}
			G.turnPhase = 'CheckControl';
			break;
		case 'CheckControl': {
			let wins = 0;
			for (let c = 0; c < NUM_COLUMNS; c++) {
				const mine = columnTotalByPlayerWithModifiers(G, c, playerId);
				const theirs = columnTotalByPlayerWithModifiers(G, c, opponentId);
				if (mine > theirs) wins++;
			}
			G.controlPlayerId = wins >= 2 ? playerId : null;
			G.turnPhase = 'CheckCompile';
			break;
		}
		case 'CheckCompile': {
			let compiled = false;
			for (let c = 0; c < NUM_COLUMNS; c++) {
				if (columnSumWithModifiers(G, c) >= COMPILE_THRESHOLD) {
					performCompile(G, c, playerId);
					compiled = true;
					break;
				}
			}
			G.compiledThisTurn = compiled;
			G.turnPhase = compiled ? 'CheckCache' : 'Action';
			break;
		}
		case 'CheckCache': {
			let didClearCache = false;
			if (!G.skipCheckCacheThisTurn && player && player.hand.length > HAND_SIZE) {
				const toDiscard = player.hand.length - HAND_SIZE;
				for (let i = 0; i < toDiscard; i++) {
					const idx = player.hand.length - 1;
					player.discard.push(player.hand[idx]);
					player.hand.splice(idx, 1);
				}
				didClearCache = true;
			}
			if (didClearCache && G.cardAfterClearCacheRows) {
				for (let colIdx = 0; colIdx < NUM_COLUMNS; colIdx++) {
					const col = G.columns[colIdx];
					if (!col || col.commandStack.length === 0) continue;
					const topIdx = col.commandStack.length - 1;
					const top = col.commandStack[topIdx];
					if (!top || top.owner !== playerId) continue;
					const rows = G.cardAfterClearCacheRows[top.cardId];
					if (rows) {
						for (const abilityRow of rows) {
							pushAbility(G, { columnIndex: colIdx, stackIndex: topIdx, cardId: top.cardId, owner: top.owner, abilityRow });
						}
					}
				}
			}
			if ((G.abilityResolutionStack?.length ?? 0) > 0) {
				break;
			}
			G.turnPhase = 'End';
			break;
		}
		case 'End': {
			G.turnPhase = 'Start';
			G.compiledThisTurn = false;
			delete G.revealedHandForPlayer;
			delete G.revealedCardForDisplay;
			delete G.skipCheckCacheThisTurn;
			const endTurn = events?.endTurn ?? (ctx as Ctx & { events?: { endTurn?: () => void } }).events?.endTurn;
			if (endTurn) endTurn();
			break;
		}
		default:
			break;
	}
}

/** Advance to next turn phase (single step). Exposed for optional manual use. */
function advancePhase({ G, ctx, events }: MoveContext): typeof INVALID_MOVE | void {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	const phase = G.turnPhase ?? 'Start';
	if (phase === 'Action') return INVALID_MOVE;
	runOnePhaseStep(G, ctx, events);
}

/**
 * Auto-advance until Action phase (so the player can play a card), or run CheckCache → End → endTurn
 * if we hit CheckCache (e.g. compile happened and Action was skipped). The client calls this when
 * it's the player's turn and turnPhase is not Action, so the player never sees an "Advance" button.
 */
function advanceToAction({ G, ctx, events }: MoveContext): typeof INVALID_MOVE | void {
	if (ctx.phase !== 'play') return INVALID_MOVE;
	let phase = G.turnPhase ?? 'Start';
	if (phase === 'Action') return; // Already in Action; no-op

	// Run Start → CheckControl → CheckCompile until we reach Action or CheckCache
	while (phase === 'Start' || phase === 'CheckControl' || phase === 'CheckCompile') {
		runOnePhaseStep(G, ctx, events);
		phase = G.turnPhase ?? 'Start';
	}

	// If a compile happened we're in CheckCache; run rest of turn and end
	if (phase === 'CheckCache') {
		runOnePhaseStep(G, ctx, events); // CheckCache → End
		if ((G.turnPhase ?? 'Start') === 'End') {
			runOnePhaseStep(G, ctx, events); // End → endTurn
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

	// Skip Start on first turn (no cards on board); later turns may show Start only if player has face-up Start-ability cards
	G.turnPhase = 'CheckControl';
	G.compiledThisTurn = false;
	G.controlPlayerId = null;
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

export const CompileGame: Game<CompileGameState> = {
	name: 'compile',
	setup,
	events: {
		endTurn: true,
	},
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
				minMoves: 0,
				maxMoves: 99,
			},
			moves: {
				advancePhase,
				advanceToAction,
				playCommandCard,
				refreshHand,
				resolveAbilityTarget,
				chooseResolutionOrder,
				rearrangeProtocols,
				applyEffect,
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
		if (moveName === 'advancePhase') {
			if ((G.turnPhase ?? 'Start') === 'Action') return 'Use play or refresh in Action';
			return true;
		}
		if (moveName === 'advanceToAction') {
			if ((G.turnPhase ?? 'Start') === 'Action') return true; // no-op when already in Action
			return true;
		}
		if (moveName === 'playCommandCard') {
			const phase = G.turnPhase ?? 'Start';
			if (phase !== 'Action') return 'Only play during Action phase';
			const player = G.players[playerID];
			if (!player || player.hand.length === 0) return 'No cards to play; refresh hand instead';
			const [columnIndex, handIndex, faceUp] = args as [number, number, boolean];
			if (typeof columnIndex !== 'number' || columnIndex < 0 || columnIndex >= NUM_COLUMNS)
				return 'Invalid column';
			if (handIndex < 0 || handIndex >= player.hand.length) return 'Invalid hand index';
			if (typeof faceUp !== 'boolean') return 'faceUp must be boolean';
			return true;
		}
		if (moveName === 'refreshHand') {
			if ((G.turnPhase ?? 'Start') !== 'Action') return 'Only refresh during Action phase';
			return true;
		}
		if (moveName === 'resolveAbilityTarget') {
			const pending = G.pendingAbilityTarget;
			if (!pending) return 'No target choice requested';
			if (playerID !== pending.ownerId) return 'Only the effect owner may choose the target';
			const [targetCol, targetStack] = args as [number, number];
			if (typeof targetCol !== 'number' || targetCol < 0 || targetCol >= NUM_COLUMNS) return 'Invalid target column';
			const col = G.columns[targetCol];
			if (!col || targetStack !== col.commandStack.length - 1) return 'Target must be an uncovered card';
			return true;
		}
		if (moveName === 'rearrangeProtocols') {
			const [perm] = args as [[number, number, number]];
			if (!Array.isArray(perm) || perm.length !== NUM_COLUMNS) return 'Invalid permutation';
			const sorted = [...perm].sort((a, b) => a - b);
			if (sorted[0] !== 0 || sorted[1] !== 1 || sorted[2] !== 2) return 'Permutation must be 0,1,2';
			if (perm[0] === 0 && perm[1] === 1 && perm[2] === 2) return 'Must change protocol positions';
			return true;
		}
		if (moveName === 'chooseResolutionOrder') {
			if (!G.pendingResolutionOrder) return 'No resolution order requested';
			const [orderedIndices] = args as [number[]];
			if (!Array.isArray(orderedIndices) || orderedIndices.length !== G.pendingResolutionOrder.count)
				return 'Invalid order';
			const stack = G.abilityResolutionStack ?? [];
			const topCount = G.pendingResolutionOrder.count;
			if (stack.length < topCount) return 'Invalid order';
			const seen = new Set<number>();
			for (const i of orderedIndices) {
				if (typeof i !== 'number' || i < 0 || i >= topCount || seen.has(i)) return 'Invalid order';
				seen.add(i);
			}
			return true;
		}
		if (moveName === 'applyEffect') {
			const stack = G.abilityResolutionStack ?? [];
			if (stack.length === 0) return 'No ability to resolve';
			const [effectType, params] = args as [EffectType, unknown];
			const valid: EffectType[] = [
				'draw', 'discard', 'delete', 'return', 'shift', 'shiftAllInLine', 'flip', 'flipMultiple', 'reveal',
				'drawThenDiscardThenReveal', 'revealFaceDownThenOptional', 'discardThenDraw', 'drawThenDiscard', 'discardThenReturn', 'discardThenDelete',
				'playFromHandFaceDownAnotherLine', 'playTopOfDeckFaceDownUnderThisCard', 'opponentPlayTopOfDeckFaceDownInLine',
				'playTopOfDeckFaceDownInEachLineWhereYouHaveCard', 'playTopOfDeckFaceDownAnotherLine', 'playOneCard',
				'playTopOfDeckFaceDownInEachOtherLine', 'refreshThenDraw', 'rearrange', 'skipCheckCache',
			];
			if (typeof effectType !== 'string' || !valid.includes(effectType as EffectType)) return 'Invalid effect type';
			if (effectType === 'draw' && typeof params === 'object' && params !== null && 'playerId' in params && 'count' in params) {
				const p = params as { count: number; optional?: boolean };
				if (p.count === 0 && !p.optional) return 'Draw count 0 requires optional';
				return true;
			}
			if (effectType === 'discard' && typeof params === 'object' && params !== null && 'playerId' in params) return true;
			if (effectType === 'discardThenDraw' && typeof params === 'object' && params !== null && 'playerId' in params && 'cardIds' in params && 'drawBonus' in params) return true;
			if (effectType === 'drawThenDiscard' && typeof params === 'object' && params !== null && 'drawPlayerId' in params && 'drawCount' in params && 'discardPlayerId' in params && 'discardCount' in params) return true;
			if (effectType === 'discardThenReturn' && typeof params === 'object' && params !== null && 'playerId' in params && 'discardCardId' in params) return true;
			if (effectType === 'discardThenDelete' && typeof params === 'object' && params !== null && 'playerId' in params && 'discardCardId' in params) return true;
			if ((effectType === 'delete' || effectType === 'return' || effectType === 'flip') && typeof params === 'object' && params !== null && 'columnIndex' in params && 'stackIndex' in params) return true;
			if (effectType === 'flipMultiple' && typeof params === 'object' && params !== null && Array.isArray((params as { targets?: unknown }).targets)) return true;
			if (effectType === 'shift' && typeof params === 'object' && params !== null && 'fromColumnIndex' in params && 'fromStackIndex' in params && 'toColumnIndex' in params) return true;
			if (effectType === 'shiftAllInLine' && typeof params === 'object' && params !== null && 'fromColumnIndex' in params && 'toColumnIndex' in params) return true;
			if (effectType === 'reveal') return true;
			if (effectType === 'drawThenDiscardThenReveal' && typeof params === 'object' && params !== null && 'drawPlayerId' in params && 'drawCount' in params && 'discardPlayerId' in params && 'discardCount' in params) return true;
			if (effectType === 'revealFaceDownThenOptional' && typeof params === 'object' && params !== null && 'columnIndex' in params && 'stackIndex' in params && 'action' in params) return true;
			if (effectType === 'playFromHandFaceDownAnotherLine' && typeof params === 'object' && params !== null && 'handCardId' in params && 'toColumnIndex' in params) return true;
			if (effectType === 'playTopOfDeckFaceDownUnderThisCard' && typeof params === 'object' && params !== null && 'columnIndex' in params && 'stackIndex' in params) return true;
			if (effectType === 'opponentPlayTopOfDeckFaceDownInLine') return true;
			if (effectType === 'playTopOfDeckFaceDownInEachLineWhereYouHaveCard') return true;
			if (effectType === 'playTopOfDeckFaceDownAnotherLine' && typeof params === 'object' && params !== null && 'toColumnIndex' in params) return true;
			if (effectType === 'playOneCard' && typeof params === 'object' && params !== null && 'handIndex' in params && 'columnIndex' in params && 'faceUp' in params) return true;
			if (effectType === 'playTopOfDeckFaceDownInEachOtherLine') return true;
			if (effectType === 'refreshThenDraw') return true;
			if (effectType === 'rearrange' && typeof params === 'object' && params !== null && Array.isArray((params as { permutation?: unknown }).permutation)) return true;
			if (effectType === 'skipCheckCache') return true;
			return 'Invalid effect params';
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
		// Revealed hand: only visible to the player who triggered the reveal
		if (stripped.revealedHandForPlayer && stripped.revealedHandForPlayer.forPlayerId !== playerID) {
			delete stripped.revealedHandForPlayer;
		}
		// Revealed card (face-down reveal): only visible to forPlayerId
		if (stripped.revealedCardForDisplay && stripped.revealedCardForDisplay.forPlayerId !== playerID) {
			delete stripped.revealedCardForDisplay;
		}
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
