import type { VisibleCard } from '@engine/client/index';

// MN01 data from compile-web (https://github.com/mcraigtyler/compile-web)
import protocolsJson from '../data/protocols.json';
import cardsJson from '../data/cards.json';

// ---------------------------------------------------------------------------
// Compile card types (VisibleCard-compatible)
// ---------------------------------------------------------------------------

export interface CommandCard extends VisibleCard {
	id: string;
	name?: string;
	/** Value that contributes to column total; when column sum >= 10, that player's protocol compiles. */
	value: number;
	/** Protocol this command belongs to */
	protocolId: string;
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
}

/** Build setup data from MN01 cards. Call on the client when creating a Compile game; server uses this data without needing card definitions. */
export function getCompileSetupData(): CompileSetupData {
	const protocolDeck = createProtocolDeck();
	const shuffled = shuffle([...protocolDeck]);
	const protocolPool = shuffled.map(p => ({ id: p.id, name: p.name }));

	const cardIdToValue: Record<string, number> = {};
	const protocolToCardIds: Record<string, string[]> = {};
	for (const card of ALL_COMMAND_CARDS) {
		cardIdToValue[card.id] = card.value;
		const list = protocolToCardIds[card.protocolId] ?? [];
		list.push(card.id);
		protocolToCardIds[card.protocolId] = list;
	}

	return { protocolPool, cardIdToValue, protocolToCardIds };
}
