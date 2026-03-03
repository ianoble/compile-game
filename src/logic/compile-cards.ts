import type { VisibleCard } from '@engine/client/index';

// ---------------------------------------------------------------------------
// Compile card types (VisibleCard-compatible)
// ---------------------------------------------------------------------------

export interface CommandCard extends VisibleCard {
	id: string;
	name?: string;
	/** Value that contributes to column total; when column sum >= 10, that player's protocol compiles. */
	value: number;
}

export interface ProtocolCard extends VisibleCard {
	id: string;
	name?: string;
}

// ---------------------------------------------------------------------------
// Deck definitions: 72 command, 12 protocol
// ---------------------------------------------------------------------------

const COMMAND_COUNT = 72;
const PROTOCOL_COUNT = 12;

/** Values 1–6, 12 of each, so column sums can reach 10. */
const COMMAND_VALUES = [1, 2, 3, 4, 5, 6] as const;
const VALUES_PER_CARD = COMMAND_COUNT / COMMAND_VALUES.length; // 12

function createCommandDeck(): CommandCard[] {
	const deck: CommandCard[] = [];
	for (let i = 1; i <= COMMAND_COUNT; i++) {
		const valueIndex = Math.floor((i - 1) / VALUES_PER_CARD) % COMMAND_VALUES.length;
		const value = COMMAND_VALUES[valueIndex];
		deck.push({ id: `command-${i}`, name: `Command ${i}`, value });
	}
	return deck;
}

function createProtocolDeck(): ProtocolCard[] {
	const deck: ProtocolCard[] = [];
	for (let i = 1; i <= PROTOCOL_COUNT; i++) {
		deck.push({ id: `protocol-${i}`, name: `Protocol ${i}` });
	}
	return deck;
}

/** Fresh command deck (72 cards). */
export function getCommandDeck(): CommandCard[] {
	return createCommandDeck();
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

export { COMMAND_COUNT, PROTOCOL_COUNT };
