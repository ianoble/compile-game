import { watch, onUnmounted, type Ref } from 'vue';
import { Client } from 'boardgame.io/client';
import { SocketIO } from 'boardgame.io/multiplayer';
import { gameDef, NUM_COLUMNS } from '../logic/game-logic';
import { getEffectForAbility } from '../logic/compile-cards';
import { SERVER_URL } from '../config';

/**
 * Compile bots: draft phase = draft 3 random protocol cards; play phase = play a random card to a random lane.
 */
export function useBotPlayers(matchIDRef: Ref<string>, _humanPlayerID: Ref<string>) {
	const botClients: Array<{ playerID: string; client: ReturnType<typeof Client> }> = [];

	function getBotCreds(matchID: string): Record<string, string> {
		const key = `bgf:bots:${gameDef.id}:${matchID}`;
		try {
			return JSON.parse(localStorage.getItem(key) || '{}');
		} catch {
			return {};
		}
	}

	type ClientMoves = {
		draftProtocol?: (i: number) => void;
		advanceToAction?: () => void;
		playCommandCard?: (columnIndex: number, handIndex: number, faceUp: boolean) => void;
		refreshHand?: () => void;
		applyEffect?: (effectType: string, params: unknown) => void;
	};

	function makeDraftMove(client: ReturnType<typeof Client>, state: unknown) {
		const s = state as { G?: { protocolPool?: unknown[] }; ctx?: { phase?: string } };
		const pool = s.G?.protocolPool;
		const moves = (client as unknown as { moves?: ClientMoves }).moves;
		if (!pool?.length || s.ctx?.phase !== 'draft' || !moves?.draftProtocol) return;
		const idx = Math.floor(Math.random() * pool.length);
		moves.draftProtocol(idx);
	}

	function makePlayMove(client: ReturnType<typeof Client>, state: unknown, botPlayerID: string) {
		const s = state as {
			G?: {
				players?: Record<string, { hand?: unknown[] }>;
				turnPhase?: string;
				abilityResolutionStack?: Array<{ cardId: string; owner: string; abilityRow: 'top' | 'middle' | 'bottom' }>;
			};
			ctx?: { phase?: string };
		};
		const turnPhase = s.G?.turnPhase ?? 'Start';
		const moves = (client as unknown as { moves?: ClientMoves }).moves;
		if (s.ctx?.phase !== 'play' || !moves?.advanceToAction) return;
		// Auto-advance until Action (Start → CheckControl → CheckCompile → Action, or CheckCache → End → endTurn)
		if (turnPhase !== 'Action') {
			moves.advanceToAction();
			return;
		}
		// If there is a pending ability to resolve and we own the top entry, resolve it first (LIFO).
		const stack = s.G?.abilityResolutionStack ?? [];
		if (stack.length > 0 && moves.applyEffect) {
			const top = stack[stack.length - 1];
			if (top && top.owner === botPlayerID) {
				const effect = getEffectForAbility(top.cardId, top.abilityRow, top.owner);
				if (effect) {
					if (effect.type === 'discard' && (effect.params as { playerId?: string }).playerId === botPlayerID) {
						const count = (effect.params as { count?: number }).count ?? 1;
						const hand = (s.G?.players?.[botPlayerID]?.hand ?? []) as string[];
						if (hand.length >= count) {
							const shuffled = [...hand].sort(() => Math.random() - 0.5);
							const cardIds = shuffled.slice(0, count);
							moves.applyEffect('discard', { playerId: botPlayerID, count, cardIds });
							return;
						}
					}
					if (effect.type === 'draw' && (effect.params as { optional?: boolean }).optional) {
						const draw = Math.random() < 0.5;
						if (draw) {
							moves.applyEffect('draw', effect.params);
						} else {
							moves.applyEffect('draw', {
								playerId: (effect.params as { playerId: string }).playerId,
								count: 0,
								optional: true,
							});
						}
						return;
					}
					if (effect.type === 'discardThenDraw' && (effect.params as { playerId?: string }).playerId === botPlayerID) {
						const hand = (s.G?.players?.[botPlayerID]?.hand ?? []) as string[];
						const drawBonus = (effect.params as { drawBonus?: number }).drawBonus ?? 1;
						if (hand.length >= 1) {
							const n = 1 + Math.floor(Math.random() * hand.length);
							const shuffled = [...hand].sort(() => Math.random() - 0.5);
							const cardIds = shuffled.slice(0, n);
							moves.applyEffect('discardThenDraw', { playerId: botPlayerID, cardIds, drawBonus });
							return;
						}
					}
					if ((effect.type === 'discardThenReturn' || effect.type === 'discardThenDelete') && (effect.params as { playerId?: string }).playerId === botPlayerID) {
						const cols = s.G?.columns ?? [];
						const uncoveredColumns: number[] = cols
							.map((col: { commandStack: unknown[] }, idx: number) => (col.commandStack.length > 0 ? idx : -1))
							.filter((i: number) => i >= 0);
						const skip = Math.random() < 0.5;
						if (skip || uncoveredColumns.length === 0) {
							moves.applyEffect(effect.type, { playerId: botPlayerID, discardCardId: null });
							return;
						}
						const hand = (s.G?.players?.[botPlayerID]?.hand ?? []) as string[];
						if (hand.length === 0) {
							moves.applyEffect(effect.type, { playerId: botPlayerID, discardCardId: null });
							return;
						}
						const cardId = hand[Math.floor(Math.random() * hand.length)]!;
						const colIdx = uncoveredColumns[Math.floor(Math.random() * uncoveredColumns.length)]!;
						const stackIndex = (cols[colIdx] as { commandStack: unknown[] }).commandStack.length - 1;
						if (effect.type === 'discardThenReturn') {
							moves.applyEffect('discardThenReturn', {
								playerId: botPlayerID,
								discardCardId: cardId,
								returnColumnIndex: colIdx,
								returnStackIndex: stackIndex,
							});
						} else {
							moves.applyEffect('discardThenDelete', {
								playerId: botPlayerID,
								discardCardId: cardId,
								columnIndex: colIdx,
								stackIndex,
							});
						}
						return;
					}
					if (effect.type === 'delete') {
						const cols = s.G?.columns ?? [];
						const uncoveredColumns: number[] = cols
							.map((col: { commandStack: unknown[] }, idx: number) => (col.commandStack.length > 0 ? idx : -1))
							.filter((i: number) => i >= 0);
						if (uncoveredColumns.length > 0) {
							const colIdx = uncoveredColumns[Math.floor(Math.random() * uncoveredColumns.length)]!;
							const stackIndex = (cols[colIdx] as { commandStack: unknown[] }).commandStack.length - 1;
							moves.applyEffect('delete', { columnIndex: colIdx, stackIndex });
							return;
						}
					}
					if (effect.type === 'return') {
						const cols = s.G?.columns ?? [];
						const uncoveredColumns: number[] = cols
							.map((col: { commandStack: unknown[] }, idx: number) => (col.commandStack.length > 0 ? idx : -1))
							.filter((i: number) => i >= 0);
						if (uncoveredColumns.length > 0) {
							const colIdx = uncoveredColumns[Math.floor(Math.random() * uncoveredColumns.length)]!;
							const stackIndex = (cols[colIdx] as { commandStack: unknown[] }).commandStack.length - 1;
							moves.applyEffect('return', { columnIndex: colIdx, stackIndex });
							return;
						}
					}
					if (effect.type === 'flip') {
						const cols = s.G?.columns ?? [];
						const uncoveredColumns: number[] = cols
							.map((col: { commandStack: unknown[] }, idx: number) => (col.commandStack.length > 0 ? idx : -1))
							.filter((i: number) => i >= 0);
						if (uncoveredColumns.length > 0) {
							const colIdx = uncoveredColumns[Math.floor(Math.random() * uncoveredColumns.length)]!;
							const stackIndex = (cols[colIdx] as { commandStack: unknown[] }).commandStack.length - 1;
							moves.applyEffect('flip', { columnIndex: colIdx, stackIndex });
							return;
						}
					}
					if (effect.type === 'shift') {
						const cols = s.G?.columns ?? [];
						const uncoveredColumns: number[] = cols
							.map((col: { commandStack: unknown[] }, idx: number) => (col.commandStack.length > 0 ? idx : -1))
							.filter((i: number) => i >= 0);
						if (uncoveredColumns.length >= 1) {
							const fromColIdx = uncoveredColumns[Math.floor(Math.random() * uncoveredColumns.length)]!;
							const toCols = [0, 1, 2].filter((c) => c !== fromColIdx);
							if (toCols.length > 0) {
								const toColIdx = toCols[Math.floor(Math.random() * toCols.length)]!;
								const fromStackIndex = (cols[fromColIdx] as { commandStack: unknown[] }).commandStack.length - 1;
								moves.applyEffect('shift', {
									fromColumnIndex: fromColIdx,
									fromStackIndex,
									toColumnIndex: toColIdx,
								});
								return;
							}
						}
					}
					if (effect.type === 'shiftAllInLine') {
						const cols = s.G?.columns ?? [];
						const columnsWithFaceDown: number[] = cols
							.map((col: { commandStack: Array<{ faceUp?: boolean }> }, idx: number) =>
								col.commandStack.some((e) => !e.faceUp) ? idx : -1
							)
							.filter((i: number) => i >= 0);
						if (columnsWithFaceDown.length >= 1) {
							const fromColIdx = columnsWithFaceDown[Math.floor(Math.random() * columnsWithFaceDown.length)]!;
							const toCols = [0, 1, 2].filter((c) => c !== fromColIdx);
							if (toCols.length > 0) {
								const toColIdx = toCols[Math.floor(Math.random() * toCols.length)]!;
								moves.applyEffect('shiftAllInLine', {
									fromColumnIndex: fromColIdx,
									toColumnIndex: toColIdx,
								});
								return;
							}
						}
					}
					if (effect.type === 'reveal') {
						moves.applyEffect('reveal', {});
						return;
					}
					if (effect.type === 'drawThenDiscardThenReveal') {
						moves.applyEffect('drawThenDiscardThenReveal', effect.params);
						return;
					}
					if (effect.type === 'revealFaceDownThenOptional') {
						const cols = s.G?.columns ?? [];
						const faceDownPositions: { columnIndex: number; stackIndex: number }[] = [];
						for (let c = 0; c < cols.length; c++) {
							const stack = (cols[c] as { commandStack: Array<{ faceUp?: boolean }> }).commandStack;
							for (let s = 0; s < stack.length; s++) {
								if (stack[s] && !stack[s].faceUp) faceDownPositions.push({ columnIndex: c, stackIndex: s });
							}
						}
						if (faceDownPositions.length > 0) {
							const pos = faceDownPositions[Math.floor(Math.random() * faceDownPositions.length)]!;
							const actions: Array<'none' | 'shift' | 'flip'> = ['none', 'shift', 'flip'];
							const action = actions[Math.floor(Math.random() * actions.length)]!;
							if (action === 'none') {
								moves.applyEffect('revealFaceDownThenOptional', {
									columnIndex: pos.columnIndex,
									stackIndex: pos.stackIndex,
									action: 'none',
								});
								return;
							}
							if (action === 'flip') {
								moves.applyEffect('revealFaceDownThenOptional', {
									columnIndex: pos.columnIndex,
									stackIndex: pos.stackIndex,
									action: 'flip',
								});
								return;
							}
							const toCols = [0, 1, 2].filter((c) => c !== pos.columnIndex);
							if (toCols.length > 0) {
								const toColIdx = toCols[Math.floor(Math.random() * toCols.length)]!;
								moves.applyEffect('revealFaceDownThenOptional', {
									columnIndex: pos.columnIndex,
									stackIndex: pos.stackIndex,
									action: 'shift',
									toColumnIndex: toColIdx,
								});
								return;
							}
							moves.applyEffect('revealFaceDownThenOptional', {
								columnIndex: pos.columnIndex,
								stackIndex: pos.stackIndex,
								action: 'none',
							});
							return;
						}
					}
					if (effect.type === 'flipMultiple') {
						const cols = s.G?.columns ?? [];
						const params = effect.params as { allOtherFaceUp?: boolean; count?: number };
						if (params?.allOtherFaceUp && top) {
							const srcCol = top.columnIndex;
							const srcStack = top.stackIndex;
							const targets: { columnIndex: number; stackIndex: number }[] = [];
							for (let c = 0; c < cols.length; c++) {
								const stack = (cols[c] as { commandStack: Array<{ faceUp?: boolean }> }).commandStack;
								for (let s = 0; s < stack.length; s++) {
									if (stack[s]?.faceUp && !(c === srcCol && s === srcStack)) {
										targets.push({ columnIndex: c, stackIndex: s });
									}
								}
							}
							if (targets.length > 0) {
								moves.applyEffect('flipMultiple', { targets });
								return;
							}
						}
						if (params?.count === 2) {
							const uncoveredColumns: number[] = cols
								.map((col: { commandStack: unknown[] }, idx: number) => (col.commandStack.length > 0 ? idx : -1))
								.filter((i: number) => i >= 0);
							if (uncoveredColumns.length >= 2) {
								const shuffled = [...uncoveredColumns].sort(() => Math.random() - 0.5);
								const [c0, c1] = [shuffled[0]!, shuffled[1]!];
								const targets = [
									{ columnIndex: c0, stackIndex: (cols[c0] as { commandStack: unknown[] }).commandStack.length - 1 },
									{ columnIndex: c1, stackIndex: (cols[c1] as { commandStack: unknown[] }).commandStack.length - 1 },
								];
								moves.applyEffect('flipMultiple', { targets });
								return;
							}
						}
					}
					// Play effects
					if (effect.type === 'playTopOfDeckFaceDownUnderThisCard' && top) {
						moves.applyEffect('playTopOfDeckFaceDownUnderThisCard', {
							columnIndex: top.columnIndex,
							stackIndex: top.stackIndex,
						});
						return;
					}
					if (effect.type === 'opponentPlayTopOfDeckFaceDownInLine') {
						moves.applyEffect('opponentPlayTopOfDeckFaceDownInLine', {});
						return;
					}
					if (effect.type === 'playTopOfDeckFaceDownInEachLineWhereYouHaveCard') {
						moves.applyEffect('playTopOfDeckFaceDownInEachLineWhereYouHaveCard', {});
						return;
					}
					if (effect.type === 'playTopOfDeckFaceDownInEachOtherLine') {
						moves.applyEffect('playTopOfDeckFaceDownInEachOtherLine', {});
						return;
					}
					if (effect.type === 'playFromHandFaceDownAnotherLine' && top) {
						const hand = (s.G?.players?.[botPlayerID]?.hand ?? []) as string[];
						const srcCol = top.columnIndex;
						const otherCols = [0, 1, 2].filter((c) => c !== srcCol);
						if (hand.length > 0 && otherCols.length > 0) {
							const cardId = hand[Math.floor(Math.random() * hand.length)]!;
							const toCol = otherCols[Math.floor(Math.random() * otherCols.length)]!;
							moves.applyEffect('playFromHandFaceDownAnotherLine', { handCardId: cardId, toColumnIndex: toCol });
							return;
						}
					}
					if (effect.type === 'playTopOfDeckFaceDownAnotherLine' && top) {
						const otherCols = [0, 1, 2].filter((c) => c !== top.columnIndex);
						if (otherCols.length > 0) {
							const toCol = otherCols[Math.floor(Math.random() * otherCols.length)]!;
							moves.applyEffect('playTopOfDeckFaceDownAnotherLine', { toColumnIndex: toCol });
							return;
						}
					}
					if (effect.type === 'playOneCard') {
						const hand = (s.G?.players?.[botPlayerID]?.hand ?? []) as string[];
						if (hand.length > 0) {
							const handIndex = Math.floor(Math.random() * hand.length);
							const columnIndex = Math.floor(Math.random() * NUM_COLUMNS);
							const faceUp = Math.random() < 0.5;
							moves.applyEffect('playOneCard', { handIndex, columnIndex, faceUp });
							return;
						}
					}
					if (effect.type === 'refreshThenDraw') {
						moves.applyEffect('refreshThenDraw', effect.params);
						return;
					}
					if (effect.type === 'skipCheckCache') {
						moves.applyEffect('skipCheckCache', {});
						return;
					}
					if (effect.type === 'eitherDiscardOrFlipThis') {
						const hand = state?.G?.players?.[topAbilityEntry.owner]?.hand ?? [];
						const choice = hand.length > 0 && Math.random() < 0.5 ? 'discard' as const : 'flip' as const;
						if (choice === 'discard') {
							const cardId = hand[Math.floor(Math.random() * hand.length)];
							moves.applyEffect('eitherDiscardOrFlipThis', { choice: 'discard', cardIds: [cardId] });
						} else {
							moves.applyEffect('eitherDiscardOrFlipThis', { choice: 'flip' });
						}
						return;
					}
					if (effect.type === 'rearrange') {
						const a = Math.floor(Math.random() * 3);
						let b = Math.floor(Math.random() * 3);
						while (b === a) b = Math.floor(Math.random() * 3);
						const perm: [number, number, number] = [0, 1, 2];
						perm[a] = b;
						perm[b] = a;
						moves.applyEffect('rearrange', { permutation: perm });
						return;
					}
					// drawThenDiscard and other effects: pass params as-is
					moves.applyEffect(effect.type, effect.params);
					return;
				}
			}
		}
		const hand = s.G?.players?.[botPlayerID]?.hand;
		if (!hand?.length) {
			if (moves.refreshHand) moves.refreshHand();
			return;
		}
		if (!moves?.playCommandCard) return;
		const handIndex = Math.floor(Math.random() * hand.length);
		const columnIndex = Math.floor(Math.random() * NUM_COLUMNS);
		const faceUp = Math.random() < 0.5;
		moves.playCommandCard(columnIndex, handIndex, faceUp);
	}

	function startBots(matchID: string) {
		stopBots();
		const creds = getBotCreds(matchID);
		const botPlayerIDs = Object.keys(creds);
		if (!botPlayerIDs.length || !SERVER_URL) return;

		const game = gameDef.game;
		for (const botPlayerID of botPlayerIDs) {
			const credentials = creds[botPlayerID];
			const client = Client({
				game,
				multiplayer: SocketIO({ server: SERVER_URL }),
				matchID,
				playerID: botPlayerID,
				credentials,
			} as Parameters<typeof Client>[0]);

			let lastTurn = -1;
			let lastCurrent = '';
			let lastTurnPhase = '';
			let lastStackLen = 0;
			client.subscribe((state) => {
				const ctx = state?.ctx as { phase?: string; currentPlayer: string; turn?: number; gameover?: unknown } | undefined;
				if (ctx?.gameover) return;
				const currentPlayer = ctx?.currentPlayer ?? '';
				const turn = ctx?.turn ?? -1;
				if (currentPlayer !== botPlayerID) return;
				const G = state?.G as { turnPhase?: string; abilityResolutionStack?: unknown[] } | undefined;
				const turnPhase = G?.turnPhase ?? '';
				const stackLen = G?.abilityResolutionStack?.length ?? 0;
				// React when turn, phase, or ability stack length changes (e.g. after playing a card that pushes abilities)
				if (turn === lastTurn && currentPlayer === lastCurrent && turnPhase === lastTurnPhase && stackLen === lastStackLen) return;
				lastTurn = turn;
				lastCurrent = currentPlayer;
				lastTurnPhase = turnPhase;
				lastStackLen = stackLen;
				const phase = ctx?.phase ?? '';
				setTimeout(() => {
					if (phase === 'draft') makeDraftMove(client, state);
					else if (phase === 'play') makePlayMove(client, state, botPlayerID);
				}, 150);
			});

			client.start();
			botClients.push({ playerID: botPlayerID, client });
		}
	}

	function stopBots() {
		for (const { client } of botClients) {
			try {
				client.stop();
			} catch {}
		}
		botClients.length = 0;
	}

	watch(
		matchIDRef,
		matchID => {
			if (!matchID) {
				stopBots();
				return;
			}
			const creds = getBotCreds(matchID);
			if (Object.keys(creds).length > 0) startBots(matchID);
		},
		{ immediate: true }
	);

	onUnmounted(stopBots);
}
