import type { VisibleCard } from '@engine/client/index';

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
// Deck definitions: 6 command cards per protocol, 12 protocols
// ---------------------------------------------------------------------------

const COMMANDS_PER_PROTOCOL = 6;
const PROTOCOL_COUNT = 12;

/** Values 1–6, one of each per protocol */
const COMMAND_VALUES = [1, 2, 3, 4, 5, 6] as const;

function createCommandCardsForProtocol(protocolId: string): CommandCard[] {
	const cards: CommandCard[] = [];
	for (let i = 0; i < COMMANDS_PER_PROTOCOL; i++) {
		const value = COMMAND_VALUES[i];
		cards.push({
			id: `${protocolId}-command-${value}`,
			name: `${protocolId.replace('protocol-', 'P')} Command ${value}`,
			value,
			protocolId,
		});
	}
	return cards;
}

function createProtocolDeck(): ProtocolCard[] {
	const deck: ProtocolCard[] = [];
	for (let i = 1; i <= PROTOCOL_COUNT; i++) {
		const protocolId = `protocol-${i}`;
		const commandCards = createCommandCardsForProtocol(protocolId);
		deck.push({
			id: protocolId,
			name: `Protocol ${i}`,
			commandCards,
		});
	}
	return deck;
}

/** Get all command cards for the given protocol IDs */
export function getCommandCardsForProtocols(protocolIds: string[]): CommandCard[] {
	const allCards: CommandCard[] = [];
	for (const protocolId of protocolIds) {
		allCards.push(...createCommandCardsForProtocol(protocolId));
	}
	return allCards;
}

/** Fresh protocol deck (12 cards). */
export function getProtocolDeck(): ProtocolCard[] {
	return createProtocolDeck();
}

/** Fisher-Yates in-place shuffle. */
export function shuffle<T>(array: T[]): T[] {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
	return array;
}

export { COMMANDS_PER_PROTOCOL, PROTOCOL_COUNT };
