import type { VisibleCard } from '@engine/client/index';
import type { EffectType } from './game-logic';

// MN01 data from compile-web (https://github.com/mcraigtyler/compile-web)
import protocolsJson from '../data/protocols.json';
import cardsJson from '../data/cards.json';

// ---------------------------------------------------------------------------
// Compile card types (VisibleCard-compatible)
// ---------------------------------------------------------------------------

export interface CommandCardAbility {
	emphasis: string;
	text: string;
}

export interface CommandCard extends VisibleCard {
	id: string;
	name?: string;
	/** Value that contributes to column total; when column sum >= 10, that player's protocol compiles. */
	value: number;
	/** Protocol this command belongs to */
	protocolId: string;
	/** Top ability (display row) */
	top?: CommandCardAbility;
	/** Middle ability (display row) */
	middle?: CommandCardAbility;
	/** Bottom ability (display row) */
	bottom?: CommandCardAbility;
}

export interface ProtocolCard extends VisibleCard {
	id: string;
	name?: string;
	/** Associated command cards for this protocol */
	commandCards: CommandCard[];
}

// ---------------------------------------------------------------------------
// MN01-only data: filter by set
// ---------------------------------------------------------------------------

type ProtocolEntry = { protocol: string; top: string; bottom: string; set: string };
type CardEntry = {
	protocol: string;
	value: number;
	top: { emphasis: string; text: string };
	middle: { emphasis: string; text: string };
	bottom: { emphasis: string; text: string };
	keywords: Record<string, boolean>;
	set: string;
};

const MN01_PROTOCOLS = (protocolsJson as ProtocolEntry[]).filter(p => p.set === 'MN01');
const MN01_CARDS = (cardsJson as CardEntry[]).filter(c => c.set === 'MN01');

/** Preferred order for protocol ids (protocol-1 … protocol-12). */
const PROTOCOL_ORDER = [
	'Spirit',
	'Death',
	'Fire',
	'Metal',
	'Gravity',
	'Life',
	'Light',
	'Plague',
	'Darkness',
	'Water',
	'Psychic',
	'Speed',
] as const;

const PROTOCOL_COUNT = PROTOCOL_ORDER.length;

/** MN01 protocol by name (for top/bottom lookup). */
const MN01_BY_NAME = new Map(MN01_PROTOCOLS.map(p => [p.protocol, p]));

/** Get display details for a protocol card by id (protocol-1 … protocol-12). For UI: name, top and bottom flavor text. */
export function getProtocolDetails(protocolId: string): { name: string; top: string; bottom: string } {
	const i = parseInt(protocolId.replace('protocol-', ''), 10);
	const name = Number.isNaN(i) || i < 1 || i > 12 ? protocolId : PROTOCOL_ORDER[i - 1];
	const entry = MN01_BY_NAME.get(name);
	return {
		name: entry?.protocol ?? name,
		top: entry?.top ?? '',
		bottom: entry?.bottom ?? '',
	};
}

/** Build protocol deck from MN01 data (12 cards, order by PROTOCOL_ORDER). */
function createProtocolDeck(): ProtocolCard[] {
	const byName = new Map(MN01_PROTOCOLS.map(p => [p.protocol, p]));
	return PROTOCOL_ORDER.map((name, i) => {
		const protocolId = `protocol-${i + 1}`;
		const entry = byName.get(name);
		const commandCards = buildCommandCardsForProtocol(protocolId, name);
		return {
			id: protocolId,
			name: entry?.protocol ?? name,
			commandCards,
		};
	});
}

/** Build command cards for one protocol from MN01 cards. Take up to 6 cards (sorted by repo value), game value = repo value + 1. */
function buildCommandCardsForProtocol(protocolId: string, protocolName: string): CommandCard[] {
	const protocolCards = MN01_CARDS
		.filter(c => c.protocol === protocolName)
		.sort((a, b) => a.value - b.value)
		.slice(0, 6);
	return protocolCards.map((c, idx) => {
		const gameValue = c.value + 1;
		const id = `${protocolId}-command-${idx + 1}`;
		const name = [c.top.text, c.middle.text, c.bottom.text].find(Boolean)?.trim() || `${protocolName} ${gameValue}`;
		return {
			id,
			name: name.slice(0, 60),
			value: gameValue,
			protocolId,
			top: c.top,
			middle: c.middle,
			bottom: c.bottom,
		};
	});
}

/** All MN01 command cards (one list per protocol, 6 values each). */
function buildAllCommandCards(): CommandCard[] {
	const all: CommandCard[] = [];
	for (let i = 0; i < PROTOCOL_COUNT; i++) {
		const protocolId = `protocol-${i + 1}`;
		const protocolName = PROTOCOL_ORDER[i];
		all.push(...buildCommandCardsForProtocol(protocolId, protocolName));
	}
	return all;
}

const ALL_COMMAND_CARDS = buildAllCommandCards();

/** Get all command cards for the given protocol IDs. */
export function getCommandCardsForProtocols(protocolIds: string[]): CommandCard[] {
	const set = new Set(protocolIds);
	return ALL_COMMAND_CARDS.filter(c => set.has(c.protocolId));
}

/** Fresh protocol deck (12 MN01 cards). */
export function getProtocolDeck(): ProtocolCard[] {
	return createProtocolDeck();
}

/** Resolve a command card ID to card data (for drawing from opponent deck). */
export function getCommandCardById(id: string): CommandCard | undefined {
	return ALL_COMMAND_CARDS.find(c => c.id === id);
}

/** Fisher-Yates in-place shuffle. */
export function shuffle<T>(array: T[]): T[] {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
	return array;
}

const COMMANDS_PER_PROTOCOL = 6;
export { COMMANDS_PER_PROTOCOL, PROTOCOL_COUNT };

// ---------------------------------------------------------------------------
// Setup data for server (client sends this when creating a game; server never imports card data)
// ---------------------------------------------------------------------------

export interface CompileSetupData {
	/** Shuffled protocol pool (id + name for display). */
	protocolPool: { id: string; name?: string }[];
	/** Map command card id → value (for column total and play). */
	cardIdToValue: Record<string, number>;
	/** Map protocol id → list of command card ids (for building decks when play starts). */
	protocolToCardIds: Record<string, string[]>;
	/** Command card ids that have a "Start" ability (for turn phase skip logic). */
	cardIdsWithStartAbility?: string[];
	/** Per cardId: which ability rows have triggers (e.g. "When you play", "Start"). Only these get pushed onto the resolution stack. */
	cardTriggerRows?: Record<string, ('top' | 'middle' | 'bottom')[]>;
	/** Per cardId: which rows have "After you clear cache" (pushed when Check Cache phase discards). */
	cardAfterClearCacheRows?: Record<string, ('top' | 'middle' | 'bottom')[]>;
	/** Per cardId: which rows trigger at Start phase. */
	cardStartRows?: Record<string, ('top' | 'middle' | 'bottom')[]>;
	/** Per cardId: which rows trigger at End phase. */
	cardEndRows?: Record<string, ('top' | 'middle' | 'bottom')[]>;
	/** Per cardId: which rows trigger when this card would be deleted by compiling. */
	cardWhenDeletedByCompileRows?: Record<string, ('top' | 'middle' | 'bottom')[]>;
	/** Per cardId: which rows trigger after you draw cards. */
	cardAfterDrawRows?: Record<string, ('top' | 'middle' | 'bottom')[]>;
	/** Per cardId: which rows trigger after your opponent discards cards. */
	cardAfterOpponentDiscardRows?: Record<string, ('top' | 'middle' | 'bottom')[]>;
	/** Per cardId: which rows trigger when this card would be covered. */
	cardWhenCoveredRows?: Record<string, ('top' | 'middle' | 'bottom')[]>;
	/** Card ids with "All face-down in this stack have value 4". */
	cardIdsWithFaceDownValue4InStack?: string[];
	/** Card ids with "play face-up without matching protocols". */
	cardIdsPlayFaceUpWithoutMatching?: string[];
	/** Card ids with "Your opponent's total value in this line is reduced by 2". */
	cardIdsOpponentValueReducedInLine?: string[];
	/** Card ids with "Your opponent cannot play cards face-down in this line". */
	cardIdsOpponentCannotPlayFaceDownInLine?: string[];
	/** Card ids with "Your opponent can only play cards face-down". */
	cardIdsOpponentCanOnlyPlayFaceDown?: string[];
	/** Card ids with "Your opponent cannot play cards in this line". */
	cardIdsOpponentCannotPlayInLine?: string[];
}

function hasStartAbility(card: CommandCard): boolean {
	const check = (a: { emphasis?: string; text?: string } | undefined) =>
		!!(a && ((a.emphasis && a.emphasis.includes('Start')) || (a.text && a.text.includes('Start'))));
	return check(card.top) || check(card.middle) || check(card.bottom);
}

/** True if this ability row has a trigger (e.g. "When you play", "Start", "When this is uncovered", or on-play effect text). */
function rowHasTrigger(row: { emphasis?: string; text?: string } | undefined): boolean {
	if (!row) return false;
	const t = `${row.emphasis ?? ''} ${row.text ?? ''}`.toLowerCase();
	const explicitTrigger =
		t.includes('when you play') ||
		t.includes('start') ||
		t.includes('end') ||
		t.includes('when this is uncovered') ||
		t.includes('when played') ||
		(t.includes('when') && t.includes('deleted') && t.includes('compiling')) ||
		t.includes('after you draw cards') ||
		t.includes('after your opponent discards');
	if (explicitTrigger) return true;
	// "Discard … Draw …" or "Draw … Discard …" (compound effects)
	if (t.includes('discard') && t.includes('draw')) return true;
	// "Discard … If you do, return/delete …"
	if (t.includes('discard') && (t.includes('return') || t.includes('delete'))) return true;
	// On-play effect text: "You discard …", "You draw …", "Your opponent discards …", "Delete …", "Return …", "Flip …", "Shift …"
	const onPlayEffect =
		t.includes('you discard') ||
		t.includes('you draw') ||
		t.includes('your opponent discards') ||
		t.includes('delete 1') ||
		t.includes('delete a') ||
		t.includes('delete all') ||
		t.includes('return 1') ||
		t.includes('return all') ||
		t.includes('flip 1') ||
		t.includes('flip this') ||
		t.includes('flip each') ||
		t.includes('flip all') ||
		t.includes('you may flip') ||
		t.includes('shift 1') ||
		t.includes('shift this') ||
		t.includes('shift all') ||
		t.includes('you may shift') ||
		t.includes('reveals their hand') ||
		t.includes('reveal') ||
		t.includes('play 1 card') ||
		t.includes('play the top card') ||
		t.includes('your opponent plays') ||
		(t.includes('play') && t.includes('deck')) ||
		t.includes('for every 2 cards') ||
		t.includes('when this card would be covered') ||
		t.includes('refresh') ||
		(t.includes('rearrange') && t.includes('protocol')) ||
		(t.includes('swap') && t.includes('protocol')) ||
		(t.includes('skip') && t.includes('check cache'));
	return !!onPlayEffect;
}

/** True if this row has "After you clear cache" trigger (not on-play; pushed when Check Cache discards). */
function rowHasAfterClearCacheTrigger(row: { emphasis?: string; text?: string } | undefined): boolean {
	if (!row) return false;
	const t = `${row.emphasis ?? ''} ${row.text ?? ''}`.toLowerCase();
	return t.includes('after you clear cache');
}

/** True if this row has "Start" phase trigger (pushed at start of turn). */
function rowHasStartTrigger(row: { emphasis?: string; text?: string } | undefined): boolean {
	if (!row) return false;
	const t = `${row.emphasis ?? ''} ${row.text ?? ''}`.toLowerCase();
	return t.includes('start');
}

/** True if this row has "End" phase trigger (pushed at end of turn before endTurn). */
function rowHasEndTrigger(row: { emphasis?: string; text?: string } | undefined): boolean {
	if (!row) return false;
	const t = `${row.emphasis ?? ''} ${row.text ?? ''}`.toLowerCase();
	return t.includes('end');
}

/** True if this row has "When this card would be deleted by compiling" trigger. */
function rowHasWhenDeletedByCompileTrigger(row: { emphasis?: string; text?: string } | undefined): boolean {
	if (!row) return false;
	const t = `${row.emphasis ?? ''} ${row.text ?? ''}`.toLowerCase();
	return t.includes('when') && t.includes('deleted') && t.includes('compiling');
}

/** True if this row has "After you draw cards" trigger. */
function rowHasAfterDrawTrigger(row: { emphasis?: string; text?: string } | undefined): boolean {
	if (!row) return false;
	const t = `${row.emphasis ?? ''} ${row.text ?? ''}`.toLowerCase();
	return t.includes('after you draw cards');
}

/** True if this row has "After your opponent discards cards" trigger. */
function rowHasAfterOpponentDiscardTrigger(row: { emphasis?: string; text?: string } | undefined): boolean {
	if (!row) return false;
	const t = `${row.emphasis ?? ''} ${row.text ?? ''}`.toLowerCase();
	return t.includes('after your opponent discards');
}

/** True if this row has "When this card would be covered" trigger. */
function rowHasWhenCoveredTrigger(row: { emphasis?: string; text?: string } | undefined): boolean {
	if (!row) return false;
	const t = `${row.emphasis ?? ''} ${row.text ?? ''}`.toLowerCase();
	return t.includes('when this card would be covered');
}

/** Build cardTriggerRows: for each command card, list which rows (top/middle/bottom) have triggers. */
function buildCardTriggerRows(): Record<string, ('top' | 'middle' | 'bottom')[]> {
	const out: Record<string, ('top' | 'middle' | 'bottom')[]> = {};
	for (const card of ALL_COMMAND_CARDS) {
		const rows: ('top' | 'middle' | 'bottom')[] = [];
		if (rowHasTrigger(card.top)) rows.push('top');
		if (rowHasTrigger(card.middle)) rows.push('middle');
		if (rowHasTrigger(card.bottom)) rows.push('bottom');
		if (rows.length > 0) out[card.id] = rows;
	}
	return out;
}

/** Build cardAfterClearCacheRows: rows that trigger when the player clears cache (Check Cache discards). */
function buildCardAfterClearCacheRows(): Record<string, ('top' | 'middle' | 'bottom')[]> {
	const out: Record<string, ('top' | 'middle' | 'bottom')[]> = {};
	for (const card of ALL_COMMAND_CARDS) {
		const rows: ('top' | 'middle' | 'bottom')[] = [];
		if (rowHasAfterClearCacheTrigger(card.top)) rows.push('top');
		if (rowHasAfterClearCacheTrigger(card.middle)) rows.push('middle');
		if (rowHasAfterClearCacheTrigger(card.bottom)) rows.push('bottom');
		if (rows.length > 0) out[card.id] = rows;
	}
	return out;
}

/** Build cardStartRows: rows that trigger at Start phase (pushed when entering Start). */
function buildCardStartRows(): Record<string, ('top' | 'middle' | 'bottom')[]> {
	const out: Record<string, ('top' | 'middle' | 'bottom')[]> = {};
	for (const card of ALL_COMMAND_CARDS) {
		const rows: ('top' | 'middle' | 'bottom')[] = [];
		if (rowHasStartTrigger(card.top)) rows.push('top');
		if (rowHasStartTrigger(card.middle)) rows.push('middle');
		if (rowHasStartTrigger(card.bottom)) rows.push('bottom');
		if (rows.length > 0) out[card.id] = rows;
	}
	return out;
}

/** Build cardEndRows: rows that trigger at End phase (pushed when entering End before endTurn). */
function buildCardEndRows(): Record<string, ('top' | 'middle' | 'bottom')[]> {
	const out: Record<string, ('top' | 'middle' | 'bottom')[]> = {};
	for (const card of ALL_COMMAND_CARDS) {
		const rows: ('top' | 'middle' | 'bottom')[] = [];
		if (rowHasEndTrigger(card.top)) rows.push('top');
		if (rowHasEndTrigger(card.middle)) rows.push('middle');
		if (rowHasEndTrigger(card.bottom)) rows.push('bottom');
		if (rows.length > 0) out[card.id] = rows;
	}
	return out;
}

/** Build cardWhenDeletedByCompileRows: rows that trigger when the card would be deleted by compiling. */
function buildCardWhenDeletedByCompileRows(): Record<string, ('top' | 'middle' | 'bottom')[]> {
	const out: Record<string, ('top' | 'middle' | 'bottom')[]> = {};
	for (const card of ALL_COMMAND_CARDS) {
		const rows: ('top' | 'middle' | 'bottom')[] = [];
		if (rowHasWhenDeletedByCompileTrigger(card.top)) rows.push('top');
		if (rowHasWhenDeletedByCompileTrigger(card.middle)) rows.push('middle');
		if (rowHasWhenDeletedByCompileTrigger(card.bottom)) rows.push('bottom');
		if (rows.length > 0) out[card.id] = rows;
	}
	return out;
}

/** Build cardAfterDrawRows: rows that trigger after you draw cards. */
function buildCardAfterDrawRows(): Record<string, ('top' | 'middle' | 'bottom')[]> {
	const out: Record<string, ('top' | 'middle' | 'bottom')[]> = {};
	for (const card of ALL_COMMAND_CARDS) {
		const rows: ('top' | 'middle' | 'bottom')[] = [];
		if (rowHasAfterDrawTrigger(card.top)) rows.push('top');
		if (rowHasAfterDrawTrigger(card.middle)) rows.push('middle');
		if (rowHasAfterDrawTrigger(card.bottom)) rows.push('bottom');
		if (rows.length > 0) out[card.id] = rows;
	}
	return out;
}

/** Build cardAfterOpponentDiscardRows: rows that trigger after your opponent discards cards. */
function buildCardAfterOpponentDiscardRows(): Record<string, ('top' | 'middle' | 'bottom')[]> {
	const out: Record<string, ('top' | 'middle' | 'bottom')[]> = {};
	for (const card of ALL_COMMAND_CARDS) {
		const rows: ('top' | 'middle' | 'bottom')[] = [];
		if (rowHasAfterOpponentDiscardTrigger(card.top)) rows.push('top');
		if (rowHasAfterOpponentDiscardTrigger(card.middle)) rows.push('middle');
		if (rowHasAfterOpponentDiscardTrigger(card.bottom)) rows.push('bottom');
		if (rows.length > 0) out[card.id] = rows;
	}
	return out;
}

/** Build cardWhenCoveredRows: rows that trigger when this card would be covered. */
function buildCardWhenCoveredRows(): Record<string, ('top' | 'middle' | 'bottom')[]> {
	const out: Record<string, ('top' | 'middle' | 'bottom')[]> = {};
	for (const card of ALL_COMMAND_CARDS) {
		const rows: ('top' | 'middle' | 'bottom')[] = [];
		if (rowHasWhenCoveredTrigger(card.top)) rows.push('top');
		if (rowHasWhenCoveredTrigger(card.middle)) rows.push('middle');
		if (rowHasWhenCoveredTrigger(card.bottom)) rows.push('bottom');
		if (rows.length > 0) out[card.id] = rows;
	}
	return out;
}

function rowHasFaceDownValue4InStack(row: { text?: string } | undefined): boolean {
	return !!row?.text?.toLowerCase().includes('face-down') && !!row?.text?.toLowerCase().includes('value of 4');
}

function rowHasPlayFaceUpWithoutMatching(row: { text?: string } | undefined): boolean {
	const t = (row?.text ?? '').toLowerCase();
	return t.includes('play') && t.includes('face-up') && t.includes('without matching');
}

function rowHasOpponentValueReducedInLine(row: { text?: string } | undefined): boolean {
	const t = (row?.text ?? '').toLowerCase();
	return t.includes('opponent') && t.includes('total value') && t.includes('reduced');
}

function rowHasOpponentCannotPlayFaceDownInLine(row: { text?: string } | undefined): boolean {
	const t = (row?.text ?? '').toLowerCase();
	return t.includes('opponent') && t.includes('cannot play') && t.includes('face-down') && t.includes('line');
}

function rowHasOpponentCanOnlyPlayFaceDown(row: { text?: string } | undefined): boolean {
	const t = (row?.text ?? '').toLowerCase();
	return t.includes('opponent') && t.includes('can only play') && t.includes('face-down');
}

function rowHasOpponentCannotPlayInLine(row: { text?: string } | undefined): boolean {
	const t = (row?.text ?? '').toLowerCase();
	return t.includes('opponent') && t.includes('cannot play') && t.includes('line') && !t.includes('face-down');
}

/** Card ids that have "All face-down cards in this stack have a value of 4" (Darkness 2). */
function buildCardIdsWithFaceDownValue4InStack(): string[] {
	const out: string[] = [];
	for (const card of ALL_COMMAND_CARDS) {
		if (rowHasFaceDownValue4InStack(card.top) || rowHasFaceDownValue4InStack(card.middle) || rowHasFaceDownValue4InStack(card.bottom)) {
			out.push(card.id);
		}
	}
	return out;
}

/** Card ids that have "When you play face-up, they may be played without matching protocols" (Spirit 1). */
function buildCardIdsPlayFaceUpWithoutMatching(): string[] {
	const out: string[] = [];
	for (const card of ALL_COMMAND_CARDS) {
		if (rowHasPlayFaceUpWithoutMatching(card.top) || rowHasPlayFaceUpWithoutMatching(card.middle) || rowHasPlayFaceUpWithoutMatching(card.bottom)) {
			out.push(card.id);
		}
	}
	return out;
}

function buildCardIdsOpponentValueReducedInLine(): string[] {
	const out: string[] = [];
	for (const card of ALL_COMMAND_CARDS) {
		if (rowHasOpponentValueReducedInLine(card.top) || rowHasOpponentValueReducedInLine(card.middle) || rowHasOpponentValueReducedInLine(card.bottom)) {
			out.push(card.id);
		}
	}
	return out;
}

function buildCardIdsOpponentCannotPlayFaceDownInLine(): string[] {
	const out: string[] = [];
	for (const card of ALL_COMMAND_CARDS) {
		if (rowHasOpponentCannotPlayFaceDownInLine(card.top) || rowHasOpponentCannotPlayFaceDownInLine(card.middle) || rowHasOpponentCannotPlayFaceDownInLine(card.bottom)) {
			out.push(card.id);
		}
	}
	return out;
}

function buildCardIdsOpponentCanOnlyPlayFaceDown(): string[] {
	const out: string[] = [];
	for (const card of ALL_COMMAND_CARDS) {
		if (rowHasOpponentCanOnlyPlayFaceDown(card.top) || rowHasOpponentCanOnlyPlayFaceDown(card.middle) || rowHasOpponentCanOnlyPlayFaceDown(card.bottom)) {
			out.push(card.id);
		}
	}
	return out;
}

function buildCardIdsOpponentCannotPlayInLine(): string[] {
	const out: string[] = [];
	for (const card of ALL_COMMAND_CARDS) {
		if (rowHasOpponentCannotPlayInLine(card.top) || rowHasOpponentCannotPlayInLine(card.middle) || rowHasOpponentCannotPlayInLine(card.bottom)) {
			out.push(card.id);
		}
	}
	return out;
}

/** Build setup data from MN01 cards. Call on the client when creating a Compile game; server uses this data without needing card definitions. */
export function getCompileSetupData(): CompileSetupData {
	const protocolDeck = createProtocolDeck();
	const shuffled = shuffle([...protocolDeck]);
	const protocolPool = shuffled.map(p => ({ id: p.id, name: p.name }));

	const cardIdToValue: Record<string, number> = {};
	const protocolToCardIds: Record<string, string[]> = {};
	const cardIdsWithStartAbility: string[] = [];
	for (const card of ALL_COMMAND_CARDS) {
		cardIdToValue[card.id] = card.value;
		const list = protocolToCardIds[card.protocolId] ?? [];
		list.push(card.id);
		protocolToCardIds[card.protocolId] = list;
		if (hasStartAbility(card)) cardIdsWithStartAbility.push(card.id);
	}

	const cardTriggerRows = buildCardTriggerRows();
	const cardAfterClearCacheRows = buildCardAfterClearCacheRows();
	const cardStartRows = buildCardStartRows();
	const cardEndRows = buildCardEndRows();
	const cardWhenDeletedByCompileRows = buildCardWhenDeletedByCompileRows();
	const cardAfterDrawRows = buildCardAfterDrawRows();
	const cardAfterOpponentDiscardRows = buildCardAfterOpponentDiscardRows();
	const cardWhenCoveredRows = buildCardWhenCoveredRows();
	const cardIdsWithFaceDownValue4InStack = buildCardIdsWithFaceDownValue4InStack();
	const cardIdsPlayFaceUpWithoutMatching = buildCardIdsPlayFaceUpWithoutMatching();
	const cardIdsOpponentValueReducedInLine = buildCardIdsOpponentValueReducedInLine();
	const cardIdsOpponentCannotPlayFaceDownInLine = buildCardIdsOpponentCannotPlayFaceDownInLine();
	const cardIdsOpponentCanOnlyPlayFaceDown = buildCardIdsOpponentCanOnlyPlayFaceDown();
	const cardIdsOpponentCannotPlayInLine = buildCardIdsOpponentCannotPlayInLine();
	return {
		protocolPool,
		cardIdToValue,
		protocolToCardIds,
		cardIdsWithStartAbility,
		cardTriggerRows,
		cardAfterClearCacheRows,
		cardStartRows,
		cardEndRows,
		cardWhenDeletedByCompileRows,
		cardAfterDrawRows,
		cardAfterOpponentDiscardRows,
		cardWhenCoveredRows,
		cardIdsWithFaceDownValue4InStack,
		cardIdsPlayFaceUpWithoutMatching,
		cardIdsOpponentValueReducedInLine,
		cardIdsOpponentCannotPlayFaceDownInLine,
		cardIdsOpponentCanOnlyPlayFaceDown,
		cardIdsOpponentCannotPlayInLine,
	};
}

// ---------------------------------------------------------------------------
// Ability → effect mapping (for client/bot to call applyEffect)
// ---------------------------------------------------------------------------

/** Result for resolving one ability: pass to move('applyEffect', type, params). */
export interface AbilityEffectResult {
	type: EffectType;
	params: Record<string, unknown>;
}

/**
 * Given a card id, ability row, and effect owner, return the effect to apply (if known).
 * Used by client and bot to call applyEffect when resolving the ability stack.
 */
export function getEffectForAbility(
	cardId: string,
	abilityRow: 'top' | 'middle' | 'bottom',
	ownerId: string
): AbilityEffectResult | null {
	const card = getCommandCardById(cardId);
	if (!card) return null;
	const row = abilityRow === 'top' ? card.top : abilityRow === 'middle' ? card.middle : card.bottom;
	if (!row) return null;
	const t = `${row.emphasis ?? ''} ${row.text ?? ''}`.toLowerCase();
	const text = row.text ?? '';

	// "After you clear cache: Draw 1 card." (Speed 1 top)
	if (t.includes('after you clear cache') && t.includes('draw')) {
		const m = text.match(/(\d+)\s*card/i);
		const count = m ? Math.min(parseInt(m[1], 10), 10) : 1;
		return { type: 'draw', params: { playerId: ownerId, count } };
	}
	// "Skip your check cache phase." (Spirit 0 bottom)
	if (t.includes('skip') && t.includes('check cache')) {
		return { type: 'skipCheckCache', params: {} };
	}
	// "Discard 1 or more cards. Draw the amount discarded plus 1."
	if (t.includes('discard') && t.includes('draw') && (t.includes('1 or more') || t.includes('amount discarded plus'))) {
		const drawBonusMatch = text.match(/plus\s*(\d+)/i) || text.match(/discarded\s*\+\s*(\d+)/i);
		const drawBonus = drawBonusMatch ? Math.min(parseInt(drawBonusMatch[1], 10), 5) : 1;
		return { type: 'discardThenDraw', params: { playerId: ownerId, drawBonus } };
	}
	// "Draw 2 cards. Your opponent discards 2 cards, then reveals their hand." (before generic drawThenDiscard)
	if (t.includes('draw') && t.includes('opponent') && t.includes('discards') && t.includes('then') && t.includes('reveals')) {
		const drawMatch = text.match(/draw\s+(\d+)\s*card/i);
		const discardMatch = text.match(/discards\s+(\d+)\s*card/i);
		const drawCount = drawMatch ? Math.min(parseInt(drawMatch[1], 10), 10) : 2;
		const discardCount = discardMatch ? Math.min(parseInt(discardMatch[1], 10), 10) : 2;
		const otherId = ownerId === '0' ? '1' : '0';
		return {
			type: 'drawThenDiscardThenReveal',
			params: { drawPlayerId: ownerId, drawCount, discardPlayerId: otherId, discardCount },
		};
	}
	// "Draw N cards. Your opponent discards M cards."
	if (t.includes('draw') && t.includes('your opponent discards')) {
		const drawMatch = text.match(/draw\s+(\d+)\s*card/i);
		const discardMatch = text.match(/opponent\s+discards\s+(\d+)\s*card/i);
		const drawCount = drawMatch ? Math.min(parseInt(drawMatch[1], 10), 10) : 2;
		const discardCount = discardMatch ? Math.min(parseInt(discardMatch[1], 10), 10) : 2;
		const otherId = ownerId === '0' ? '1' : '0';
		return { type: 'drawThenDiscard', params: { drawPlayerId: ownerId, drawCount, discardPlayerId: otherId, discardCount } };
	}
	// "Discard 1 card. If you do, return 1 card."
	if (t.includes('discard') && t.includes('if you do') && t.includes('return')) {
		return { type: 'discardThenReturn', params: { playerId: ownerId } };
	}
	// "Discard 1 card. If you do, delete 1 card."
	if (t.includes('discard') && t.includes('if you do') && t.includes('delete')) {
		return { type: 'discardThenDelete', params: { playerId: ownerId } };
	}
	// Plague 2: "Discard 1 or more. Your opponent discards the amount discarded plus 1."
	if (t.includes('discard') && t.includes('opponent') && t.includes('amount of cards discarded plus')) {
		const plusMatch = text.match(/plus\s*(\d+)/i);
		const bonus = plusMatch ? Math.min(parseInt(plusMatch[1], 10), 5) : 1;
		const otherId = ownerId === '0' ? '1' : '0';
		return { type: 'discardThenOpponentDiscardsPlusOne', params: { playerId: ownerId, opponentId: otherId, opponentBonus: bonus } };
	}
	// Psychic 2: "Your opponent discards 2 cards. Rearrange their protocols."
	if (t.includes('your opponent discards 2') && t.includes('rearrange their')) {
		const otherId = ownerId === '0' ? '1' : '0';
		return { type: 'opponentDiscardThenRearrangeTheirProtocols', params: { opponentId: otherId, discardCount: 2 } };
	}
	// Psychic 3: "Your opponent discards 1 card. Shift 1 of their cards."
	if (t.includes('your opponent discards 1') && t.includes('shift') && t.includes('their')) {
		const otherId = ownerId === '0' ? '1' : '0';
		return { type: 'opponentDiscardThenShiftTheirCard', params: { opponentId: otherId } };
	}
	// Water 2: "Draw 2 cards. Rearrange your protocols."
	if (t.includes('draw 2') && t.includes('rearrange your')) {
		return { type: 'drawThenRearrange', params: { playerId: ownerId, drawCount: 2 } };
	}

	// "You discard 1 card" / "You discard N cards"
	if (t.includes('you discard')) {
		const m = row.text?.match(/(\d+)\s*card/);
		const count = m ? Math.min(parseInt(m[1], 10), 10) : 1;
		return { type: 'discard', params: { playerId: ownerId, count } };
	}
	// "Your opponent discards 1 card"
	if (t.includes('your opponent discards')) {
		const otherId = ownerId === '0' ? '1' : '0';
		const m = row.text?.match(/(\d+)\s*card/);
		const count = m ? Math.min(parseInt(m[1], 10), 10) : 1;
		return { type: 'discard', params: { playerId: otherId, count } };
	}
	// "Your opponent draws N cards"
	if (t.includes('your opponent draws')) {
		const otherId = ownerId === '0' ? '1' : '0';
		const m = row.text?.match(/(\d+)\s*card/);
		const count = m ? Math.min(parseInt(m[1], 10), 10) : 1;
		return { type: 'draw', params: { playerId: otherId, count } };
	}
	// "Draw N cards" (self, no "you") e.g. "Draw 2 cards. Your opponent cannot compile on their next turn."
	if (
		t.includes('draw') && /\d+\s*card/.test(t) &&
		!t.includes('you draw') && !t.includes('your opponent draws') &&
		!(t.includes('reveal') && t.includes('face-down')) &&
		!t.includes('draw the top')
	) {
		const m = row.text?.match(/draw\s+(\d+)\s*card/i);
		const count = m ? Math.min(parseInt(m[1], 10), 10) : 1;
		const opponentCannotCompile = t.includes('cannot compile');
		return { type: 'draw', params: { playerId: ownerId, count, opponentCannotCompileNextTurn: opponentCannotCompile || undefined } };
	}
	// "You draw N cards" (mandatory)
	if (t.includes('you draw') && !t.includes('you may draw')) {
		const m = row.text?.match(/(\d+)\s*card/);
		const count = m ? Math.min(parseInt(m[1], 10), 10) : 1;
		return { type: 'draw', params: { playerId: ownerId, count } };
	}
	// "You may draw 1 card" (optional)
	if (t.includes('you may draw')) {
		const m = row.text?.match(/(\d+)\s*card/);
		const count = m ? Math.min(parseInt(m[1], 10), 10) : 1;
		return { type: 'draw', params: { playerId: ownerId, count, optional: true } };
	}
	// "Delete 1 card" / "Delete a card" / "Delete all" (standalone; target chosen by client/bot)
	if (t.includes('delete 1') || t.includes('delete a') || t.includes('delete all')) {
		return { type: 'delete', params: {} };
	}
	// "Return 1" / "Return all" (standalone; not "Discard 1. If you do, return 1" which is above)
	if (t.includes('return 1') || t.includes('return all')) {
		return { type: 'return', params: {} };
	}
	// "Flip each other face-up card" – flip all other face-up cards (client sends computed targets)
	if ((t.includes('flip each') || t.includes('flip all')) && t.includes('other') && t.includes('face-up')) {
		return { type: 'flipMultiple', params: { allOtherFaceUp: true } };
	}
	// "Flip 1 card. Flip 1 card." – player chooses 2 cards to flip
	if ((text.match(/flip\s+1\s+card/gi)?.length ?? 0) >= 2) {
		return { type: 'flipMultiple', params: { count: 2 } };
	}
	// "Flip 1" / "Flip this" / "Flip each" / "Flip all" / "You may flip" (single target)
	if (t.includes('flip 1') || t.includes('flip this') || t.includes('flip each') || t.includes('flip all') || t.includes('you may flip')) {
		return { type: 'flip', params: {} };
	}
	// "Shift all face-down cards in this line to another line." – move all face-down in one column to another
	if (t.includes('shift all') && t.includes('face-down') && t.includes('in this line')) {
		return { type: 'shiftAllInLine', params: {} };
	}
	// "Shift 1" / "Shift this" / "Shift all" / "You may shift" – client sends fromColumnIndex, fromStackIndex, toColumnIndex
	if (t.includes('shift 1') || t.includes('shift this') || t.includes('shift all') || t.includes('you may shift')) {
		return { type: 'shift', params: {} };
	}
	// "Your opponent reveals their hand." – server stores opponent hand for current player; client shows overlay
	if (t.includes('opponent') && t.includes('reveals') && t.includes('hand') && !t.includes('discards')) {
		return { type: 'reveal', params: {} };
	}
	// "Draw 2 cards. Reveal 1 face-down card. You may shift or flip that card."
	if (t.includes('reveal') && t.includes('face-down') && (t.includes('shift') || t.includes('flip'))) {
		return { type: 'revealFaceDownThenOptional', params: {} };
	}
	// Play effects (order: most specific first)
	if (t.includes('for every 2 cards') && t.includes('play the top card') && t.includes('under this card')) {
		return { type: 'playTopOfDeckFaceDownUnderThisCard', params: {} };
	}
	if (t.includes('your opponent plays') && t.includes('top card of their deck') && t.includes('face-down') && t.includes('this line')) {
		return { type: 'opponentPlayTopOfDeckFaceDownInLine', params: {} };
	}
	if (t.includes('play the top card of your deck face-down in each line where you have a card')) {
		return { type: 'playTopOfDeckFaceDownInEachLineWhereYouHaveCard', params: {} };
	}
	if (t.includes('play the top card of your deck face-down in each other line')) {
		return { type: 'playTopOfDeckFaceDownInEachOtherLine', params: {} };
	}
	if (t.includes('play 1 card face-down') && t.includes('another line')) {
		return { type: 'playFromHandFaceDownAnotherLine', params: {} };
	}
	if (t.includes('when this card would be covered') && t.includes('play the top card') && t.includes('another line')) {
		return { type: 'playTopOfDeckFaceDownAnotherLine', params: {} };
	}
	if (t.trim() === 'play 1 card.') {
		return { type: 'playOneCard', params: {} };
	}
	if (t.includes('play the top card') && t.includes('face-down') && t.includes('another line')) {
		return { type: 'playTopOfDeckFaceDownAnotherLine', params: {} };
	}
	// "Swap the positions of 2 of your protocols" / "Rearrange your protocols" (exclude "their" and "draw 2 ... rearrange")
	if ((t.includes('swap') && t.includes('protocol')) || (t.includes('rearrange') && t.includes('your') && t.includes('protocol'))) {
		return { type: 'rearrange', params: {} };
	}
	// "Rearrange their protocols" (Psychic 2 handled above as compound)
	if (t.includes('rearrange') && t.includes('their') && t.includes('protocol')) {
		const otherId = ownerId === '0' ? '1' : '0';
		return { type: 'rearrangeOpponentProtocols', params: { opponentId: otherId } };
	}
	// "Refresh. Draw 1 card." – draw to 5 (refresh), then draw N more
	if (t.includes('refresh') && t.includes('draw')) {
		const drawMatch = text.match(/draw\s+(\d+)\s*card/i);
		const drawCount = drawMatch ? Math.min(parseInt(drawMatch[1], 10), 10) : 1;
		return { type: 'refreshThenDraw', params: { drawCount } };
	}
	// "Either discard 1 card or flip this card." (Spirit 1 bottom)
	if ((t.includes('either') && t.includes('or')) && t.includes('discard') && t.includes('flip this card')) {
		return { type: 'eitherDiscardOrFlipThis', params: {} };
	}
	return null;
}
