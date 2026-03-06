<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useGame, useCardDrag } from '@engine/client/index';
import type { CompileGameState, TurnPhase } from '../logic/game-logic';
import type { AbilityResolutionEntry } from '../logic/game-logic';
import { NUM_COLUMNS } from '../logic/game-logic';
import { getCommandCardById, getProtocolDetails, getEffectForAbility } from '../logic/compile-cards';
import type { CommandCard } from '../logic/compile-cards';
import type { VisibleCard } from '@engine/client/index';
import CommandCardFace from './CommandCardFace.vue';

defineProps<{ headerHeight: number }>();
defineEmits<{ 'back-to-lobby': [] }>();

const DROP_DEBUG = true; // set to false to disable drop troubleshooting logs

const { state, move, isMyTurn, playerID, canDo } = useGame();
const { registerDropZone, unregisterDropZone, startDrag, state: dragState, onDrop } = useCardDrag();

const G = computed(() => state.value as unknown as CompileGameState | undefined);

const columns = computed(() => G.value?.columns ?? []);
const myId = computed(() => playerID.value ?? null);
const turnPhase = computed(() => (G.value?.turnPhase ?? 'Start') as TurnPhase);
const controlPlayerId = computed(() => G.value?.controlPlayerId ?? null);
const isActionPhase = computed(() => turnPhase.value === 'Action');
const canPlayCard = computed(
	() => isMyTurn.value && isActionPhase.value && myHand.value.length > 0
);
// When it's our turn and we're not in Action, auto-advance (Start → CheckControl → CheckCompile → Action, or CheckCache → End → endTurn).
watch(
	() => ({ myTurn: isMyTurn.value, phase: turnPhase.value }),
	({ myTurn, phase }) => {
		if (myTurn && phase != null && phase !== 'Action') {
			move('advanceToAction');
		}
	},
	{ immediate: true }
);

/** Raw hand from server: card ids or '[hidden]'. */
const myHand = computed(() => {
	const pid = myId.value;
	if (!pid || !G.value?.players) return [];
	return G.value.players[pid]?.hand ?? [];
});

/** LIFO ability resolution stack (from server). */
const abilityResolutionStack = computed(() => G.value?.abilityResolutionStack ?? []);
/** Top entry to resolve (last in array = LIFO). */
const topAbilityEntry = computed((): AbilityResolutionEntry | null => {
	const stack = abilityResolutionStack.value;
	return stack.length > 0 ? stack[stack.length - 1]! : null;
});
/** True when we must resolve the top ability (we own it). */
const isOwnerOfTopAbility = computed(
	() => topAbilityEntry.value != null && topAbilityEntry.value.owner === myId.value
);
/** Effect to apply for the top entry (discard/draw etc.); null if needs targeting or unknown. */
const pendingAbilityEffect = computed(() => {
	const entry = topAbilityEntry.value;
	if (!entry || !isOwnerOfTopAbility.value) return null;
	return getEffectForAbility(entry.cardId, entry.abilityRow, entry.owner);
});
/** True when the top ability is an optional draw (owner may draw or skip). */
const isOptionalDraw = computed(
	() =>
		pendingAbilityEffect.value?.type === 'draw' &&
		(pendingAbilityEffect.value.params as { optional?: boolean })?.optional === true
);

/** True when we must choose which of our cards to discard (we are the discard target). */
const isDiscardSelectionMode = computed(
	() =>
		pendingAbilityEffect.value?.type === 'discard' &&
		pendingAbilityEffect.value.params?.playerId === myId.value
);
/** True when we must choose 1+ cards to discard, then draw that many + bonus (Discard … Draw …). */
const isDiscardThenDrawMode = computed(
	() =>
		pendingAbilityEffect.value?.type === 'discardThenDraw' &&
		pendingAbilityEffect.value.params?.playerId === myId.value
);
/** Number of cards we must select to discard; 0 when not in fixed-count discard mode. */
const discardRequiredCount = computed(() =>
	pendingAbilityEffect.value?.type === 'discard'
		? (pendingAbilityEffect.value.params?.count as number) ?? 1
		: 0
);
/** True when top ability is "Discard 1. If you do, return/delete 1" and we own it. */
const isDiscardThenTargetMode = computed(
	() =>
		(pendingAbilityEffect.value?.type === 'discardThenReturn' || pendingAbilityEffect.value?.type === 'discardThenDelete') &&
		pendingAbilityEffect.value?.params?.playerId === myId.value
);
/** Step for discard-then-return/delete: prompt → choose_discard → choose_target. */
const discardThenTargetStep = ref<'prompt' | 'choose_discard' | 'choose_target'>('prompt');
/** When we chose to discard and are now picking the return/delete target. */
const selectedDiscardForTarget = ref<string | null>(null);

/** When in discard or discard-then-draw or discard-then-return/delete (choose_discard) mode, use horizontal hand and click-to-select. */
const isDiscardChoiceMode = computed(
	() =>
		isDiscardSelectionMode.value ||
		isDiscardThenDrawMode.value ||
		(isDiscardThenTargetMode.value && discardThenTargetStep.value === 'choose_discard')
);
/** For discard-then-draw: draw = discarded count + this bonus (from card text "plus 1"). */
const discardThenDrawBonus = computed(() => {
	const p = pendingAbilityEffect.value?.params as { drawBonus?: number } | undefined;
	return typeof p?.drawBonus === 'number' ? p.drawBonus : 1;
});

/** Card IDs currently selected for discard (used in both discard and discardThenDraw modes). */
const discardSelection = ref<string[]>([]);
watch(
	() => isDiscardChoiceMode.value,
	(inMode) => {
		if (!inMode) discardSelection.value = [];
	}
);
watch(
	() => [isDiscardThenTargetMode.value, pendingAbilityEffect.value?.type],
	([inMode]) => {
		if (!inMode) {
			discardThenTargetStep.value = 'prompt';
			selectedDiscardForTarget.value = null;
		}
	}
);

// Debug: log when hand changes (e.g. after play) to confirm server state is applied
if (typeof DROP_DEBUG !== 'undefined' && DROP_DEBUG) {
	watch(
		() => ({ len: myHand.value.length, ids: myHand.value.slice(0, 3).join(',') }),
		(next, prev) => {
			if (prev && (next.len !== prev.len || next.ids !== prev.ids)) {
				console.log('[Compile drop] hand updated from server', { from: prev, to: next });
			}
		},
	);
}

// When it's our turn, Action phase, and hand is empty: auto-refresh (draw 5). Skip when we have a pending ability to resolve.
watch(
	() => ({
		myTurn: isMyTurn.value,
		actionPhase: isActionPhase.value,
		handLen: myHand.value.length,
		pending: pendingAbilityEffect.value,
	}),
	({ myTurn, actionPhase, handLen, pending }) => {
		if (myTurn && actionPhase && handLen === 0 && !pending) {
			move('refreshHand');
			nextTick(() => move('advanceToAction'));
		}
	},
	{ immediate: true }
);

/** Hand resolved to VisibleCard | HiddenCard for display (client card catalog). */
const myHandDisplay = computed(() =>
	myHand.value.map(id =>
		id === '[hidden]'
			? { hidden: true }
			: (getCommandCardById(id) ?? { id, name: id, value: 0 })
	)
);

const COLUMN_LABELS = ['Left', 'Center', 'Right'] as const;

/** Per-card face in hand: true = face-up, false = face-down. Keyed by card id; default true. */
const handFlippedState = ref<Record<string, boolean>>({});
const hoveredHandIndex = ref<number | null>(null);

const laneRefs = [ref<HTMLElement | null>(null), ref<HTMLElement | null>(null), ref<HTMLElement | null>(null)];
/** Full-area overlay so the engine's hitTest always finds a zone on pointer up; we use overLaneId for the actual lane. */
const boardDropOverlayRef = ref<HTMLElement | null>(null);

/** Normalize ref value to raw HTMLElement (handles component instance with $el). */
function getLaneEl(refVal: unknown): HTMLElement | null {
	if (refVal instanceof HTMLElement) return refVal;
	if (refVal && typeof (refVal as { $el?: HTMLElement }).$el !== 'undefined')
		return (refVal as { $el: HTMLElement }).$el;
	return null;
}

/** Manual hit-test during drag so lane highlight works even if engine's document listener doesn't fire. */
const overLaneId = ref<string | null>(null);

const DRAG_THRESHOLD = 8;
let pointerStartX = 0;
let pointerStartY = 0;
let pendingHandIndex: number | null = null;

/** One-time document listeners to start drag (no pointer capture). Engine then receives all pointer events. */
function onHandPointerDown(idx: number, ev: PointerEvent) {
	if (ev.button !== 0) return;
	if (isDiscardChoiceMode.value) {
		// In discard or discard-then-draw mode: handle click in document pointerup to toggle selection
		pendingHandIndex = idx;
		pointerStartX = ev.clientX;
		pointerStartY = ev.clientY;
		const onDocPointerUp = () => {
			document.removeEventListener('pointerup', onDocPointerUp);
			document.removeEventListener('pointercancel', onDocPointerUp);
			if (pendingHandIndex === idx) {
				const card = myHandDisplay.value[idx];
				if (card && typeof card === 'object' && 'id' in card && !('hidden' in card)) {
					const id = (card as { id: string }).id;
					const sel = discardSelection.value;
					const inSel = sel.includes(id);
					if (inSel) discardSelection.value = sel.filter(x => x !== id);
					else if (isDiscardThenDrawMode.value) discardSelection.value = [...sel, id];
					else if (isDiscardThenTargetMode.value && discardThenTargetStep.value === 'choose_discard') discardSelection.value = sel.length < 1 ? [...sel, id] : sel;
					else if (sel.length < discardRequiredCount.value) discardSelection.value = [...sel, id];
				}
			}
			pendingHandIndex = null;
		};
		document.addEventListener('pointerup', onDocPointerUp);
		document.addEventListener('pointercancel', onDocPointerUp);
		return;
	}
	if (!canPlayCard.value) return;
	const originEl = ev.currentTarget as HTMLElement;
	pendingHandIndex = idx;
	pointerStartX = ev.clientX;
	pointerStartY = ev.clientY;

	const onDocPointerMove = (moveEv: PointerEvent) => {
		const dx = moveEv.clientX - pointerStartX;
		const dy = moveEv.clientY - pointerStartY;
		if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
		cleanup();
		const card = myHandDisplay.value[idx];
		if (!card || typeof card !== 'object' || 'hidden' in card) return;
		// Ensure lane drop zones are registered with current refs before engine starts hit-testing
		registerLaneDropZones();
		const rect = originEl.getBoundingClientRect();
		startDrag(
			{ card: card as VisibleCard, sourceIndex: idx, sourceId: 'hand' },
			rect,
			moveEv
		);
		pendingHandIndex = null;
	};

	const onDocPointerUp = () => {
		cleanup();
		if (pendingHandIndex != null && canPlayCard.value) {
			const card = myHandDisplay.value[pendingHandIndex];
			if (card && typeof card === 'object' && 'id' in card && !('hidden' in card)) {
				const id = (card as { id: string }).id;
				handFlippedState.value = { ...handFlippedState.value, [id]: !(handFlippedState.value[id] ?? true) };
			}
		}
		pendingHandIndex = null;
	};

	const onDocPointerCancel = () => {
		cleanup();
		pendingHandIndex = null;
	};

	const cleanup = () => {
		document.removeEventListener('pointermove', onDocPointerMove);
		document.removeEventListener('pointerup', onDocPointerUp);
		document.removeEventListener('pointercancel', onDocPointerCancel);
	};

	document.addEventListener('pointermove', onDocPointerMove);
	document.addEventListener('pointerup', onDocPointerUp);
	document.addEventListener('pointercancel', onDocPointerCancel);
}

/** Hand card pointerup: clear local state only. Click-to-flip is handled by document pointerup. */
function onHandPointerUp() {
	// No-op for state; document pointerup handles click-to-flip when no drag started.
}

onMounted(() => {
	onDrop.value = (zoneId: string, payload) => {
		if (DROP_DEBUG) {
			console.log('[Compile drop] onDrop called', {
				zoneId,
				overLaneId: overLaneId.value,
				sourceId: payload?.sourceId,
				cardId: (payload?.card as { id?: string })?.id,
			});
		}
		if (payload.sourceId !== 'hand') {
			if (DROP_DEBUG) console.log('[Compile drop] skip: sourceId is not hand');
			return;
		}
		if (!isActionPhase.value || myHand.value.length === 0) {
			if (DROP_DEBUG) console.log('[Compile drop] skip: not action phase or hand empty', { isActionPhase: isActionPhase.value, handLen: myHand.value.length });
			return;
		}
		// Prefer engine's zoneId; fallback to our manual hit-test in case engine missed it
		const zone = zoneId.match(/^lane-(\d)$/) ? zoneId : overLaneId.value;
		const m = (zone ?? '').match(/^lane-(\d)$/);
		if (!m) {
			if (DROP_DEBUG) console.log('[Compile drop] skip: no lane from zone', { zone, zoneId });
			return;
		}
		const colIdx = parseInt(m[1], 10);
		if (colIdx < 0 || colIdx >= NUM_COLUMNS || !isMyTurn.value) {
			if (DROP_DEBUG) console.log('[Compile drop] skip: invalid col or not my turn', { colIdx, isMyTurn: isMyTurn.value });
			return;
		}
		if (!eligibleColumnIndices.value.has(colIdx)) {
			if (DROP_DEBUG) console.log('[Compile drop] skip: lane not eligible', { colIdx, eligible: [...eligibleColumnIndices.value] });
			return;
		}
		const cardId = (payload.card as { id?: string })?.id;
		const faceUp = cardId != null ? (handFlippedState.value[cardId] ?? true) : true;
		const canDoResult = canDo('playCommandCard', colIdx, payload.sourceIndex, faceUp);
		if (DROP_DEBUG) {
			console.log('[Compile drop] playing card', { colIdx, sourceIndex: payload.sourceIndex, faceUp, canDo: canDoResult });
		}
		if (canDoResult !== true) {
			if (DROP_DEBUG) console.warn('[Compile drop] canDo failed, not calling move:', canDoResult);
			return;
		}
		move('playCommandCard', colIdx, payload.sourceIndex, faceUp);
		// If ability stack is non-empty, server leaves us in Action to resolve; when empty, server advances turn.
	};
	nextTick(registerLaneDropZones);
});

onBeforeUnmount(() => {
	document.removeEventListener('pointermove', onDragPointerMove);
	overLaneId.value = null;
	for (let i = 0; i < NUM_COLUMNS; i++) unregisterDropZone(`lane-${i}`);
	unregisterDropZone('board-drop');
	onDrop.value = null;
});

/** Re-register lane drop zones with current refs so the engine's hitTest finds them when the user drags. */
function registerLaneDropZones() {
	let laneCount = 0;
	for (let i = 0; i < NUM_COLUMNS; i++) {
		const el = getLaneEl(laneRefs[i].value);
		if (el) {
			registerDropZone({ id: `lane-${i}`, el });
			laneCount++;
		}
	}
	const overlayEl = getLaneEl(boardDropOverlayRef.value);
	const hasOverlay = !!overlayEl;
	if (overlayEl) registerDropZone({ id: 'board-drop', el: overlayEl });
	if (DROP_DEBUG && (laneCount < NUM_COLUMNS || !hasOverlay)) {
		console.log('[Compile drop] registerLaneDropZones', { laneCount, hasOverlay, overlayRef: !!boardDropOverlayRef.value });
	}
}

// Manual lane hit-test during drag: attach document pointermove when dragging, set overLaneId from elementsUnderPoint.
// Re-register drop zones when drag starts so the engine's hitTest uses current lane elements.
watch(
	() => dragState.isDragging,
	(isDragging) => {
		if (!isDragging) {
			overLaneId.value = null;
			document.removeEventListener('pointermove', onDragPointerMove);
			return;
		}
		registerLaneDropZones();
		document.addEventListener('pointermove', onDragPointerMove);
	}
);

function onDragPointerMove(ev: PointerEvent) {
	const x = ev.clientX;
	const y = ev.clientY;
	let found: string | null = null;
	for (let i = 0; i < NUM_COLUMNS; i++) {
		const el = getLaneEl(laneRefs[i].value);
		if (!el) continue;
		const rect = el.getBoundingClientRect();
		if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
			found = `lane-${i}`;
			break;
		}
	}
	overLaneId.value = found;
}

function protocolDetails(protocolId: string | null) {
	return protocolId ? getProtocolDetails(protocolId) : { name: '—', top: '', bottom: '' };
}

const COMPILE_THRESHOLD = 10;

function columnTotal(col: { commandStack: { value?: number }[] }): number {
	return col.commandStack.reduce((s, e) => s + (e.value ?? 0), 0);
}

/** Sum of card values in a column for one player (for lane header). */
function columnTotalForPlayer(
	col: { commandStack: { owner: string; value: number }[] },
	playerId: string | null
): number {
	if (!playerId) return 0;
	return col.commandStack.filter(e => e.owner === playerId).reduce((s, e) => s + e.value, 0);
}

/** Command stack entries for opponent (above protocol) and me (below protocol). */
function partitionStack(
	col: { commandStack: { owner: string; cardId: string; faceUp: boolean; value: number }[] },
	myId: string | null
) {
	if (!myId) return { opponent: [], mine: [] };
	const opponent: typeof col.commandStack = [];
	const mine: typeof col.commandStack = [];
	for (const entry of col.commandStack) {
		if (entry.owner === myId) mine.push(entry);
		else opponent.push(entry);
	}
	return { opponent, mine };
}

const myCompiledCount = computed(() => {
	if (!G.value?.columns || myId.value == null) return 0;
	const p = myId.value === '0' ? 0 : 1;
	return G.value.columns.filter(col => col.protocolCompiled?.[p]).length;
});

const opponentCompiledCount = computed(() => {
	if (!G.value?.columns || myId.value == null) return 0;
	const p = myId.value === '0' ? 1 : 0;
	return G.value.columns.filter(col => col.protocolCompiled?.[p]).length;
});

const opponentId = computed(() => (myId.value === '0' ? '1' : '0'));
const myDeckCount = computed(() => G.value?.players?.[myId.value ?? '']?.commandDeck?.length ?? 0);
const myDiscardCount = computed(() => G.value?.players?.[myId.value ?? '']?.discard?.length ?? 0);
const opponentDeckCount = computed(() => G.value?.players?.[opponentId.value]?.commandDeck?.length ?? 0);
const opponentDiscardCount = computed(() => G.value?.players?.[opponentId.value]?.discard?.length ?? 0);

function getHandCardKey(card: unknown, idx: number): string {
	if (card && typeof card === 'object' && 'hidden' in card) return `h-${idx}`;
	return (card && typeof card === 'object' && 'id' in card ? String((card as { id: string }).id) : `h-${idx}`);
}

function getHandCardLabel(card: unknown): string {
	if (!card || typeof card !== 'object') return '?';
	const c = card as { name?: string; id?: string };
	return c.name ?? c.id ?? '?';
}

/** Protocol display name for command cards (e.g. "Spirit"). */
function getProtocolName(protocolId: string | undefined): string {
	return protocolId ? protocolDetails(protocolId).name : '—';
}

/** Resolve the top ability by calling applyEffect with the mapped type and params. */
function resolveTopAbility() {
	const effect = pendingAbilityEffect.value;
	const entry = topAbilityEntry.value;
	if (!effect || !isOwnerOfTopAbility.value) return;
	let params: Record<string, unknown> = { ...effect.params };
	if (effect.type === 'playTopOfDeckFaceDownUnderThisCard' && entry) {
		params = { ...params, columnIndex: entry.columnIndex, stackIndex: entry.stackIndex };
	}
	const ok = canDo('applyEffect', effect.type, params);
	if (ok === true) move('applyEffect', effect.type, params);
}

/** Skip optional draw (resolve without drawing). */
function skipOptionalDraw() {
	const effect = pendingAbilityEffect.value;
	if (!effect || effect.type !== 'draw' || !(effect.params as { optional?: boolean })?.optional) return;
	const params = {
		playerId: (effect.params as { playerId: string }).playerId,
		count: 0,
		optional: true,
	};
	const ok = canDo('applyEffect', 'draw', params);
	if (ok === true) move('applyEffect', 'draw', params);
}

/** Submit chosen cards for discard (only when in discard mode and selection count matches). */
function submitDiscardSelection() {
	if (!isDiscardSelectionMode.value || discardSelection.value.length !== discardRequiredCount.value) return;
	const playerId = pendingAbilityEffect.value?.params?.playerId as string;
	if (!playerId || playerId !== myId.value) return;
	const params = {
		playerId,
		count: discardRequiredCount.value,
		cardIds: [...discardSelection.value],
	};
	const ok = canDo('applyEffect', 'discard', params);
	if (ok === true) {
		move('applyEffect', 'discard', params);
		discardSelection.value = [];
	}
}

/** Submit chosen cards for discard-then-draw (1+ cards; then draw that many + drawBonus). */
function submitDiscardThenDraw() {
	if (!isDiscardThenDrawMode.value || discardSelection.value.length < 1) return;
	const effect = pendingAbilityEffect.value;
	if (!effect || effect.type !== 'discardThenDraw') return;
	const playerId = effect.params?.playerId as string;
	const drawBonus = (effect.params?.drawBonus as number) ?? 1;
	if (!playerId || playerId !== myId.value) return;
	const params = { playerId, cardIds: [...discardSelection.value], drawBonus };
	const ok = canDo('applyEffect', 'discardThenDraw', params);
	if (ok === true) {
		move('applyEffect', 'discardThenDraw', params);
		discardSelection.value = [];
	}
}

/** Skip "Discard 1 card. If you do, return/delete 1" (resolve without discarding). */
function skipDiscardThenTarget() {
	const effect = pendingAbilityEffect.value;
	if (!effect || (effect.type !== 'discardThenReturn' && effect.type !== 'discardThenDelete')) return;
	const playerId = effect.params?.playerId as string;
	if (!playerId || playerId !== myId.value) return;
	const params = { playerId, discardCardId: null };
	const ok = canDo('applyEffect', effect.type, params);
	if (ok === true) {
		move('applyEffect', effect.type, params);
		discardThenTargetStep.value = 'prompt';
		selectedDiscardForTarget.value = null;
	}
}

/** After choosing 1 card to discard, go to choose-target step. */
function advanceDiscardThenTargetToChooseTarget() {
	if (discardSelection.value.length !== 1 || !isDiscardThenTargetMode.value || discardThenTargetStep.value !== 'choose_discard') return;
	selectedDiscardForTarget.value = discardSelection.value[0] ?? null;
	discardThenTargetStep.value = 'choose_target';
}

/** Submit return/delete target (column's top card) for discard-then-return/delete. */
function submitDiscardThenTarget(colIdx: number) {
	const effect = pendingAbilityEffect.value;
	const cardId = selectedDiscardForTarget.value;
	if (!effect || !cardId || (effect.type !== 'discardThenReturn' && effect.type !== 'discardThenDelete')) return;
	const col = columns.value[colIdx];
	if (!col || col.commandStack.length === 0) return;
	const stackIndex = col.commandStack.length - 1;
	const playerId = effect.params?.playerId as string;
	if (!playerId || playerId !== myId.value) return;
	if (effect.type === 'discardThenReturn') {
		const params = { playerId, discardCardId: cardId, returnColumnIndex: colIdx, returnStackIndex: stackIndex };
		const ok = canDo('applyEffect', 'discardThenReturn', params);
		if (ok === true) {
			move('applyEffect', 'discardThenReturn', params);
			discardThenTargetStep.value = 'prompt';
			selectedDiscardForTarget.value = null;
			discardSelection.value = [];
		}
	} else {
		const params = { playerId, discardCardId: cardId, columnIndex: colIdx, stackIndex };
		const ok = canDo('applyEffect', 'discardThenDelete', params);
		if (ok === true) {
			move('applyEffect', 'discardThenDelete', params);
			discardThenTargetStep.value = 'prompt';
			selectedDiscardForTarget.value = null;
			discardSelection.value = [];
		}
	}
}

/** Columns that have at least one card (uncovered = top of that column). */
const columnsWithUncovered = computed(() =>
	columns.value.map((col, idx) => (col.commandStack.length > 0 ? idx : -1)).filter(i => i >= 0)
);

/** For "Flip each other face-up card": list of { columnIndex, stackIndex } for all face-up cards except the source. */
const flipMultipleAllOtherFaceUpTargets = computed(() => {
	const entry = topAbilityEntry.value;
	const cols = columns.value;
	if (!entry || cols.length === 0) return [];
	const srcCol = entry.columnIndex;
	const srcStack = entry.stackIndex;
	const out: { columnIndex: number; stackIndex: number }[] = [];
	for (let c = 0; c < cols.length; c++) {
		const stack = cols[c].commandStack;
		for (let s = 0; s < stack.length; s++) {
			const card = stack[s];
			if (card?.faceUp && !(c === srcCol && s === srcStack)) {
				out.push({ columnIndex: c, stackIndex: s });
			}
		}
	}
	return out;
});

/** For "Flip 1 card. Flip 1 card.": selected column indices (max 2). */
const selectedFlipMultipleColumns = ref<number[]>([]);
watch(
	() => pendingAbilityEffect.value?.type,
	(type) => {
		if (type !== 'flipMultiple') selectedFlipMultipleColumns.value = [];
	}
);

/** Submit flipMultiple with "all other face-up" targets. */
function submitFlipMultipleAllOtherFaceUp() {
	const targets = flipMultipleAllOtherFaceUpTargets.value;
	if (targets.length === 0) return;
	const ok = canDo('applyEffect', 'flipMultiple', { targets });
	if (ok === true) move('applyEffect', 'flipMultiple', { targets });
}

/** Toggle column selection for flipMultiple (count 2); max 2 columns. */
function toggleFlipMultipleColumn(colIdx: number) {
	const cur = selectedFlipMultipleColumns.value;
	const idx = cur.indexOf(colIdx);
	if (idx >= 0) {
		selectedFlipMultipleColumns.value = cur.filter((_, i) => i !== idx);
	} else if (cur.length < 2) {
		selectedFlipMultipleColumns.value = [...cur, colIdx];
	}
}

/** Submit flipMultiple with 2 chosen targets (uncovered card in each selected column). */
function submitFlipMultipleTwo() {
	const sel = selectedFlipMultipleColumns.value;
	if (sel.length !== 2) return;
	const cols = columns.value;
	const targets = sel.map((colIdx) => ({
		columnIndex: colIdx,
		stackIndex: cols[colIdx].commandStack.length - 1,
	}));
	const ok = canDo('applyEffect', 'flipMultiple', { targets });
	if (ok === true) {
		move('applyEffect', 'flipMultiple', { targets });
		selectedFlipMultipleColumns.value = [];
	}
}

/** For shift: selected source column (card to move = uncovered in that column). */
const selectedShiftFromColumn = ref<number | null>(null);
watch(
	() => pendingAbilityEffect.value?.type,
	(type) => {
		if (type !== 'shift') selectedShiftFromColumn.value = null;
	}
);
/** Column indices valid as shift destination (all columns except the chosen source). */
const shiftDestinationColumns = computed(() => {
	const from = selectedShiftFromColumn.value;
	if (from == null) return [];
	return [0, 1, 2].filter((c) => c !== from);
});
/** Set source column for shift (step 1). */
function setShiftFromColumn(colIdx: number) {
	selectedShiftFromColumn.value = colIdx;
}
/** Clear shift source (Back button). */
function clearShiftSelection() {
	selectedShiftFromColumn.value = null;
}
/** Submit shift: move uncovered card from fromColIdx to toColIdx. */
function submitShift(fromColIdx: number, toColIdx: number) {
	const col = columns.value[fromColIdx];
	if (!col || col.commandStack.length === 0 || fromColIdx === toColIdx) return;
	const fromStackIndex = col.commandStack.length - 1;
	const params = { fromColumnIndex: fromColIdx, fromStackIndex, toColumnIndex: toColIdx };
	const ok = canDo('applyEffect', 'shift', params);
	if (ok === true) {
		move('applyEffect', 'shift', params);
		selectedShiftFromColumn.value = null;
	}
}

/** Columns that have at least one face-down card (for "Shift all face-down in this line"). */
const columnsWithFaceDownCard = computed(() =>
	columns.value
		.map((col, idx) => (col.commandStack.some((e: { faceUp?: boolean }) => !e.faceUp) ? idx : -1))
		.filter((i) => i >= 0)
);
/** For shiftAllInLine: selected source column. */
const selectedShiftAllFromColumn = ref<number | null>(null);
watch(
	() => pendingAbilityEffect.value?.type,
	(type) => {
		if (type !== 'shiftAllInLine') selectedShiftAllFromColumn.value = null;
	}
);
/** Destination columns for shiftAllInLine (all except source). */
const shiftAllInLineDestinationColumns = computed(() => {
	const from = selectedShiftAllFromColumn.value;
	if (from == null) return [];
	return [0, 1, 2].filter((c) => c !== from);
});
function setShiftAllFromColumn(colIdx: number) {
	selectedShiftAllFromColumn.value = colIdx;
}
function clearShiftAllSelection() {
	selectedShiftAllFromColumn.value = null;
}
function submitShiftAllInLine(fromColIdx: number, toColIdx: number) {
	if (fromColIdx === toColIdx) return;
	const params = { fromColumnIndex: fromColIdx, toColumnIndex: toColIdx };
	const ok = canDo('applyEffect', 'shiftAllInLine', params);
	if (ok === true) {
		move('applyEffect', 'shiftAllInLine', params);
		selectedShiftAllFromColumn.value = null;
	}
}

/** All face-down card positions { columnIndex, stackIndex } (for "Reveal 1 face-down card. You may shift or flip."). */
const faceDownPositions = computed(() => {
	const cols = columns.value;
	const out: { columnIndex: number; stackIndex: number }[] = [];
	for (let c = 0; c < cols.length; c++) {
		const stack = cols[c].commandStack;
		for (let s = 0; s < stack.length; s++) {
			if (stack[s] && !(stack[s] as { faceUp?: boolean }).faceUp) {
				out.push({ columnIndex: c, stackIndex: s });
			}
		}
	}
	return out;
});
const columnLabel = (colIdx: number) => (colIdx === 0 ? 'Left' : colIdx === 1 ? 'Center' : 'Right');
/** For revealFaceDownThenOptional: selected face-down position, then action (none/shift/flip) and optional destination. */
const selectedRevealFaceDown = ref<{ columnIndex: number; stackIndex: number } | null>(null);
const selectedRevealFaceDownAction = ref<'none' | 'shift' | 'flip' | null>(null);
watch(
	() => pendingAbilityEffect.value?.type,
	(type) => {
		if (type !== 'revealFaceDownThenOptional') {
			selectedRevealFaceDown.value = null;
			selectedRevealFaceDownAction.value = null;
		}
	}
);
const revealFaceDownDestinationColumns = computed(() => {
	const pos = selectedRevealFaceDown.value;
	if (pos == null) return [];
	return [0, 1, 2].filter((c) => c !== pos.columnIndex);
});
function setRevealFaceDownPosition(pos: { columnIndex: number; stackIndex: number }) {
	selectedRevealFaceDown.value = pos;
	selectedRevealFaceDownAction.value = null;
}
function clearRevealFaceDownSelection() {
	selectedRevealFaceDown.value = null;
	selectedRevealFaceDownAction.value = null;
}
function submitRevealFaceDownNone() {
	const pos = selectedRevealFaceDown.value;
	if (!pos) return;
	const params = { columnIndex: pos.columnIndex, stackIndex: pos.stackIndex, action: 'none' as const };
	if (canDo('applyEffect', 'revealFaceDownThenOptional', params) === true) {
		move('applyEffect', 'revealFaceDownThenOptional', params);
		selectedRevealFaceDown.value = null;
		selectedRevealFaceDownAction.value = null;
	}
}
function submitRevealFaceDownFlip() {
	const pos = selectedRevealFaceDown.value;
	if (!pos) return;
	const params = { columnIndex: pos.columnIndex, stackIndex: pos.stackIndex, action: 'flip' as const };
	if (canDo('applyEffect', 'revealFaceDownThenOptional', params) === true) {
		move('applyEffect', 'revealFaceDownThenOptional', params);
		selectedRevealFaceDown.value = null;
		selectedRevealFaceDownAction.value = null;
	}
}
function submitRevealFaceDownShift(toColIdx: number) {
	const pos = selectedRevealFaceDown.value;
	if (!pos) return;
	const params = { columnIndex: pos.columnIndex, stackIndex: pos.stackIndex, action: 'shift' as const, toColumnIndex: toColIdx };
	if (canDo('applyEffect', 'revealFaceDownThenOptional', params) === true) {
		move('applyEffect', 'revealFaceDownThenOptional', params);
		selectedRevealFaceDown.value = null;
		selectedRevealFaceDownAction.value = null;
	}
}

/** Columns that are "another line" (excluding the ability source column). */
const playAnotherLineColumns = computed(() => {
	const entry = topAbilityEntry.value;
	if (entry == null) return [0, 1, 2];
	return [0, 1, 2].filter((c) => c !== entry.columnIndex);
});
/** Play from hand face-down in another line: selected hand card then destination column. */
const selectedPlayFromHandCard = ref<string | null>(null);
const selectedPlayFromHandToColumn = ref<number | null>(null);
watch(
	() => pendingAbilityEffect.value?.type,
	(type) => {
		if (type !== 'playFromHandFaceDownAnotherLine') {
			selectedPlayFromHandCard.value = null;
			selectedPlayFromHandToColumn.value = null;
		}
	}
);
function submitPlayFromHandFaceDownAnotherLine() {
	const cardId = selectedPlayFromHandCard.value;
	const toCol = selectedPlayFromHandToColumn.value;
	if (cardId == null || toCol == null) return;
	const ok = canDo('applyEffect', 'playFromHandFaceDownAnotherLine', { handCardId: cardId, toColumnIndex: toCol });
	if (ok === true) {
		move('applyEffect', 'playFromHandFaceDownAnotherLine', { handCardId: cardId, toColumnIndex: toCol });
		selectedPlayFromHandCard.value = null;
		selectedPlayFromHandToColumn.value = null;
	}
}
/** Play top of deck to another line: selected destination column. */
const selectedPlayDeckToColumn = ref<number | null>(null);
watch(
	() => pendingAbilityEffect.value?.type,
	(type) => {
		if (type !== 'playTopOfDeckFaceDownAnotherLine') selectedPlayDeckToColumn.value = null;
	}
);
function submitPlayTopOfDeckFaceDownAnotherLine(toCol?: number) {
	const col = toCol ?? selectedPlayDeckToColumn.value;
	if (col == null) return;
	const ok = canDo('applyEffect', 'playTopOfDeckFaceDownAnotherLine', { toColumnIndex: col });
	if (ok === true) {
		move('applyEffect', 'playTopOfDeckFaceDownAnotherLine', { toColumnIndex: col });
		selectedPlayDeckToColumn.value = null;
	}
}
/** Play 1 card (Speed 0): hand index, column, face up/down. */
const selectedPlayOneHandIndex = ref<number | null>(null);
const selectedPlayOneColumn = ref<number | null>(null);
const selectedPlayOneFaceUp = ref<boolean>(true);
watch(
	() => pendingAbilityEffect.value?.type,
	(type) => {
		if (type !== 'playOneCard') {
			selectedPlayOneHandIndex.value = null;
			selectedPlayOneColumn.value = null;
		}
	}
);
function submitPlayOneCard() {
	const handIdx = selectedPlayOneHandIndex.value;
	const col = selectedPlayOneColumn.value;
	if (handIdx == null || col == null) return;
	const myHandIds = myHand.value;
	if (handIdx < 0 || handIdx >= myHandIds.length) return;
	const ok = canDo('applyEffect', 'playOneCard', { handIndex: handIdx, columnIndex: col, faceUp: selectedPlayOneFaceUp.value });
	if (ok === true) {
		move('applyEffect', 'playOneCard', { handIndex: handIdx, columnIndex: col, faceUp: selectedPlayOneFaceUp.value });
		selectedPlayOneHandIndex.value = null;
		selectedPlayOneColumn.value = null;
	}
}

/** Rearrange (swap 2 protocols): pick two columns to swap. */
const selectedRearrangeCol1 = ref<number | null>(null);
const selectedRearrangeCol2 = ref<number | null>(null);
watch(
	() => pendingAbilityEffect.value?.type,
	(type) => {
		if (type !== 'rearrange') {
			selectedRearrangeCol1.value = null;
			selectedRearrangeCol2.value = null;
		}
	}
);
/** Build permutation that swaps col A and B: perm[A]=B, perm[B]=A, perm[other]=other. */
function swapPermutation(a: number, b: number): [number, number, number] {
	const perm: [number, number, number] = [0, 1, 2];
	perm[a] = b;
	perm[b] = a;
	return perm;
}
function submitRearrange() {
	const a = selectedRearrangeCol1.value;
	const b = selectedRearrangeCol2.value;
	if (a == null || b == null || a === b) return;
	const permutation = swapPermutation(a, b);
	const ok = canDo('applyEffect', 'rearrange', { permutation });
	if (ok === true) {
		move('applyEffect', 'rearrange', { permutation });
		selectedRearrangeCol1.value = null;
		selectedRearrangeCol2.value = null;
	}
}

/** Reveal overlay: show opponent's hand (from G.revealedHandForPlayer). Dismissed locally until turn ends. */
const revealOverlayDismissed = ref(false);
const revealedOpponentHand = computed(() => {
	const r = G.value?.revealedHandForPlayer;
	if (!r || r.forPlayerId !== myId.value) return null;
	return r.hand;
});
watch(revealedOpponentHand, (hand) => {
	if (hand?.length) revealOverlayDismissed.value = false;
});
const showRevealOverlay = computed(
	() => revealedOpponentHand.value != null && revealedOpponentHand.value.length >= 0 && !revealOverlayDismissed.value
);
/** Resolved card details for revealed hand (for display). */
const revealedHandCards = computed(() => {
	const ids = revealedOpponentHand.value;
	if (!ids) return [];
	return ids.map((id) => getCommandCardById(id) ?? { id, name: id, value: 0, protocolId: '' });
});

/** Single revealed face-down card (from "Reveal 1 face-down card") – shown to forPlayerId until dismissed. */
const revealedCardForDisplay = computed(() => {
	const r = G.value?.revealedCardForDisplay;
	if (!r || r.forPlayerId !== myId.value) return null;
	return getCommandCardById(r.cardId) ?? { id: r.cardId, name: r.cardId, value: 0, protocolId: '' };
});
const revealedCardOverlayDismissed = ref(false);
watch(revealedCardForDisplay, (card) => {
	if (card) revealedCardOverlayDismissed.value = false;
});
const showRevealedCardOverlay = computed(
	() => revealedCardForDisplay.value != null && !revealedCardOverlayDismissed.value
);

/** Submit target (column's uncovered card) for single-target effects: delete, return, flip. */
function submitSingleTargetEffect(effectType: 'delete' | 'return' | 'flip', colIdx: number) {
	const col = columns.value[colIdx];
	if (!col || col.commandStack.length === 0) return;
	const stackIndex = col.commandStack.length - 1;
	const params = { columnIndex: colIdx, stackIndex };
	const ok = canDo('applyEffect', effectType, params);
	if (ok === true) move('applyEffect', effectType, params);
}

/** Resolve stack entry to card details for CommandCardFace (face-up only). */
function getStackEntryCard(entry: { cardId: string; faceUp: boolean }): CommandCard | null {
	if (!entry.faceUp) return null;
	return getCommandCardById(entry.cardId) ?? null;
}

type StackEntry = { owner: string; cardId: string; faceUp: boolean; value: number };
/** Per-column, per-side resolved cards for stack display (avoids repeated getCommandCardById in template). */
const stackCardsResolved = computed(() => {
	const cols = G.value?.columns ?? [];
	const my = myId.value;
	return cols.map(col => {
		const { opponent, mine } = partitionStack(col, my);
		return {
			opponent: opponent.map((e: StackEntry) => getStackEntryCard(e)),
			mine: mine.map((e: StackEntry) => getStackEntryCard(e)),
		};
	});
});

/** Resolved card for custom drag ghost (value + protocol name); null when not dragging from hand. */
const dragGhostCard = computed(() => {
	if (!dragState.isDragging || !dragState.payload?.card || dragState.payload.sourceId !== 'hand') return null;
	const c = dragState.payload.card as CommandCard & { id?: string; protocolId?: string };
	return c;
});

const GHOST_WIDTH = 72;
const GHOST_HEIGHT = 100;
const customGhostStyle = computed(() => ({
	position: 'fixed' as const,
	left: `${dragState.pointerX - GHOST_WIDTH / 2}px`,
	top: `${dragState.pointerY - GHOST_HEIGHT / 2}px`,
	width: `${GHOST_WIDTH}px`,
	height: `${GHOST_HEIGHT}px`,
	zIndex: 9600,
	pointerEvents: 'none' as const,
	userSelect: 'none' as const,
}));

/** Column indices where the currently dragged card can be dropped. Face-down = all; face-up = columns matching card protocol, or all if "play without matching" ability is active. */
const eligibleColumnIndices = computed(() => {
	if (!dragState.isDragging || !dragState.payload?.card || dragState.payload.sourceId !== 'hand') return new Set<number>();
	const card = dragState.payload.card as CommandCard & { id?: string; protocolId?: string };
	const cols = G.value?.columns ?? [];
	if (cols.length !== NUM_COLUMNS) return new Set<number>();
	const mySide = myId.value === '0' ? 0 : 1;
	const isFaceUp = card.id != null ? (handFlippedState.value[card.id] ?? true) : true;
	if (!isFaceUp) return new Set([0, 1, 2]);
	const playWithoutMatching = (G.value?.cardIdsPlayFaceUpWithoutMatching ?? []).length > 0 &&
		cols.some((col) => {
			if (col.commandStack.length === 0) return false;
			const top = col.commandStack[col.commandStack.length - 1];
			return top.owner === myId.value && (G.value?.cardIdsPlayFaceUpWithoutMatching ?? []).includes(top.cardId);
		});
	if (playWithoutMatching) return new Set([0, 1, 2]);
	const protocolId = card.protocolId;
	if (!protocolId) return new Set([0, 1, 2]);
	const set = new Set<number>();
	for (let i = 0; i < NUM_COLUMNS; i++) {
		if (cols[i].protocol?.[mySide] === protocolId) set.add(i);
	}
	return set;
});

const FAN_DEG_PER_CARD = 5;
const FAN_OVERLAP_PX = 62;

/** Stack splay: peek height per card (rem) so value, protocol, and full top ability are visible. */
const STACK_STRIP_PEEK_REM = 4.75;
const STACK_CARD_HEIGHT_REM = 10.5; // 7.5rem * (3.5/2.5), matches .card-vertical
/** Extra top offset so bigger splayed cards sit lower in the lane. */
const STACK_TOP_OFFSET_REM = 0.5;

function fanStyle(idx: number): { transform: string; marginLeft: string } {
	const n = myHand.value.length;
	const center = (n - 1) / 2;
	const deg = (idx - center) * FAN_DEG_PER_CARD;
	const marginLeft = idx === 0 ? '0' : `-${FAN_OVERLAP_PX}px`;
	return {
		transform: `rotate(${deg}deg)`,
		marginLeft,
	};
}

function fanStyleHover(idx: number): { transform: string; marginLeft: string; zIndex: number } {
	const base = fanStyle(idx);
	return {
		...base,
		transform: `translateY(-12px) scale(1.2) ${base.transform}`,
		zIndex: 20,
	};
}
</script>

<template>
	<div class="w-full max-w-4xl mx-auto space-y-6 pb-80">
		<!-- Reveal overlay: opponent's hand (from "Your opponent reveals their hand") -->
		<Teleport to="body">
			<div
				v-if="showRevealOverlay"
				class="fixed inset-0 z-[9700] flex items-center justify-center bg-black/60"
				@click.self="revealOverlayDismissed = true"
			>
				<div
					class="rounded-xl border-2 p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-auto flex flex-col gap-4"
					style="background: var(--cyber-panel); border-color: rgba(34, 211, 238, 0.4);"
				>
					<h3 class="text-lg font-semibold text-cyan-300">Opponent's hand</h3>
					<div class="flex flex-wrap gap-2">
						<div
							v-for="card in revealedHandCards"
							:key="card.id"
							class="rounded border px-2 py-1 text-sm bg-slate-800/80 border-slate-500/50 text-slate-200"
						>
							{{ card.name ?? card.id }}
						</div>
						<span v-if="revealedHandCards.length === 0" class="text-slate-500 text-sm">(empty)</span>
					</div>
					<button
						type="button"
						class="self-end px-4 py-2 rounded-lg border border-cyan-500/50 bg-cyan-500/10 text-cyan-300 font-medium hover:bg-cyan-500/20"
						@click="revealOverlayDismissed = true"
					>
						Close
					</button>
				</div>
			</div>
		</Teleport>
		<!-- Revealed face-down card overlay (from "Reveal 1 face-down card") -->
		<Teleport to="body">
			<div
				v-if="showRevealedCardOverlay && revealedCardForDisplay"
				class="fixed inset-0 z-[9500] flex items-center justify-center bg-black/60"
				@click.self="revealedCardOverlayDismissed = true"
			>
				<div
					class="rounded-xl border p-4 max-w-xs shadow-xl"
					style="background: var(--cyber-panel); border-color: rgba(34, 211, 238, 0.4);"
					@click.stop
				>
					<h3 class="text-lg font-semibold text-cyan-300 mb-2">Revealed card</h3>
					<CommandCardFace
						v-if="revealedCardForDisplay"
						:name="revealedCardForDisplay.name ?? revealedCardForDisplay.id"
						:value="revealedCardForDisplay.value"
						:protocol="getProtocolName(revealedCardForDisplay.protocolId)"
						:top="revealedCardForDisplay.top ?? undefined"
						:middle="revealedCardForDisplay.middle ?? undefined"
						:bottom="revealedCardForDisplay.bottom ?? undefined"
					/>
					<button
						type="button"
						class="mt-3 w-full px-4 py-2 rounded-lg border border-cyan-500/50 bg-cyan-500/10 text-cyan-300 font-medium hover:bg-cyan-500/20"
						@click="revealedCardOverlayDismissed = true"
					>
						Close
					</button>
				</div>
			</div>
		</Teleport>
		<!-- Full-area drop zone overlay: engine always finds a zone on pointer up; onDrop uses overLaneId for lane. -->
		<div
			v-if="G?.columns"
			ref="boardDropOverlayRef"
			class="fixed inset-0 w-full h-full pointer-events-none"
			aria-hidden="true"
		/>
		<!-- <p class="text-center text-slate-400 text-sm">
			Play command cards to columns. When a column total reaches 10+, your protocol there compiles.
			First to compile all 3 wins.
		</p> -->

		<!-- Turn phase, Control, and Refresh Cards -->
		<div v-if="G?.columns" class="flex flex-wrap items-center justify-center gap-4 text-sm">
			<span class="text-slate-400">
				Phase: <strong class="text-cyan-300 font-display">{{ turnPhase }}</strong>
			</span>
			<span v-if="controlPlayerId != null" class="text-slate-400">
				Control: <strong :class="controlPlayerId === myId ? 'text-cyan-400' : 'text-amber-400'">{{
					controlPlayerId === myId ? 'You' : 'Opponent'
				}}</strong>
			</span>
			<button
				v-if="isMyTurn && isActionPhase && !pendingAbilityEffect"
				type="button"
				class="px-3 py-1.5 rounded-lg border border-cyan-500/50 bg-cyan-500/10 text-cyan-300 text-sm font-medium hover:bg-cyan-500/20 transition-colors"
				@click="move('refreshHand')"
			>
				Refresh Cards
			</button>
			<!-- Discard selection mode: button enabled only when exactly N cards selected -->
			<template v-if="isMyTurn && isDiscardSelectionMode">
				<button
					type="button"
					:disabled="discardSelection.length !== discardRequiredCount"
					class="px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
					@click="submitDiscardSelection"
				>
					Discard {{ discardRequiredCount }} card(s)
				</button>
			</template>
			<!-- Discard then draw: select 1+ cards, then draw that many + bonus -->
			<template v-else-if="isMyTurn && isDiscardThenDrawMode">
				<button
					type="button"
					:disabled="discardSelection.length < 1"
					class="px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
					@click="submitDiscardThenDraw"
				>
					Discard & Draw ({{ discardSelection.length }} card(s) → draw {{ discardSelection.length + discardThenDrawBonus }})
				</button>
			</template>
			<!-- Discard 1. If you do, return/delete 1: prompt → choose_discard → choose_target -->
			<template v-else-if="isMyTurn && isDiscardThenTargetMode && discardThenTargetStep === 'prompt'">
				<span class="text-slate-300 text-sm">Discard 1 card?</span>
				<button
					type="button"
					class="px-3 py-1.5 rounded-lg border border-cyan-500/50 bg-cyan-500/10 text-cyan-300 text-sm font-medium hover:bg-cyan-500/20"
					@click="discardThenTargetStep = 'choose_discard'"
				>
					Yes
				</button>
				<button
					type="button"
					class="px-3 py-1.5 rounded-lg border border-slate-500/50 bg-slate-500/10 text-slate-300 text-sm font-medium hover:bg-slate-500/20"
					@click="skipDiscardThenTarget"
				>
					Skip
				</button>
			</template>
			<template v-else-if="isMyTurn && isDiscardThenTargetMode && discardThenTargetStep === 'choose_discard'">
				<button
					type="button"
					:disabled="discardSelection.length !== 1"
					class="px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
					@click="advanceDiscardThenTargetToChooseTarget"
				>
					Discard & choose target
				</button>
			</template>
			<template v-else-if="isMyTurn && isDiscardThenTargetMode && discardThenTargetStep === 'choose_target'">
				<span class="text-slate-300 text-sm">
					{{ pendingAbilityEffect?.type === 'discardThenReturn' ? 'Choose a card on the field to return' : 'Choose a card on the field to delete' }}
				</span>
				<button
					v-for="colIdx in columnsWithUncovered"
					:key="`target-${colIdx}`"
					type="button"
					class="px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-300 text-sm font-medium hover:bg-amber-500/20"
					@click="submitDiscardThenTarget(colIdx)"
				>
					{{ COLUMN_LABELS[colIdx] }}
				</button>
			</template>
			<template v-else-if="isMyTurn && pendingAbilityEffect?.type === 'delete'">
				<span class="text-slate-300 text-sm">Choose a card on the field to delete</span>
				<button
					v-for="colIdx in columnsWithUncovered"
					:key="`delete-${colIdx}`"
					type="button"
					class="px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-300 text-sm font-medium hover:bg-amber-500/20"
					@click="submitSingleTargetEffect('delete', colIdx)"
				>
					{{ COLUMN_LABELS[colIdx] }}
				</button>
			</template>
			<template v-else-if="isMyTurn && pendingAbilityEffect?.type === 'flip'">
				<span class="text-slate-300 text-sm">Choose a card on the field to flip</span>
				<button
					v-for="colIdx in columnsWithUncovered"
					:key="`flip-${colIdx}`"
					type="button"
					class="px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-300 text-sm font-medium hover:bg-amber-500/20"
					@click="submitSingleTargetEffect('flip', colIdx)"
				>
					{{ COLUMN_LABELS[colIdx] }}
				</button>
			</template>
			<template v-else-if="isMyTurn && pendingAbilityEffect?.type === 'flipMultiple'">
				<template v-if="(pendingAbilityEffect.params as { allOtherFaceUp?: boolean })?.allOtherFaceUp">
					<span class="text-slate-300 text-sm">Flip all other face-up cards ({{ flipMultipleAllOtherFaceUpTargets.length }})</span>
					<button
						type="button"
						:disabled="flipMultipleAllOtherFaceUpTargets.length === 0"
						class="px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-300 text-sm font-medium hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
						@click="submitFlipMultipleAllOtherFaceUp"
					>
						Flip all
					</button>
				</template>
				<template v-else-if="(pendingAbilityEffect.params as { count?: number })?.count === 2">
					<span class="text-slate-300 text-sm">Choose 2 cards to flip ({{ selectedFlipMultipleColumns.length }}/2)</span>
					<button
						v-for="colIdx in columnsWithUncovered"
						:key="`flip2-${colIdx}`"
						type="button"
						:class="[
							'px-3 py-1.5 rounded-lg border text-sm font-medium',
							selectedFlipMultipleColumns.includes(colIdx)
								? 'border-amber-400 bg-amber-500/30 text-amber-200'
								: 'border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20',
						]"
						@click="toggleFlipMultipleColumn(colIdx)"
					>
						{{ COLUMN_LABELS[colIdx] }}
					</button>
					<button
						type="button"
						:disabled="selectedFlipMultipleColumns.length !== 2"
						class="px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
						@click="submitFlipMultipleTwo"
					>
						Flip both
					</button>
				</template>
			</template>
			<template v-else-if="isMyTurn && pendingAbilityEffect?.type === 'shift'">
				<template v-if="selectedShiftFromColumn === null">
					<span class="text-slate-300 text-sm">Choose a card to move (shift)</span>
					<button
						v-for="colIdx in columnsWithUncovered"
						:key="`shift-from-${colIdx}`"
						type="button"
						class="px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-300 text-sm font-medium hover:bg-amber-500/20"
						@click="setShiftFromColumn(colIdx)"
					>
						{{ COLUMN_LABELS[colIdx] }}
					</button>
				</template>
				<template v-else>
					<span class="text-slate-300 text-sm">Choose destination column</span>
					<button
						v-for="toCol in shiftDestinationColumns"
						:key="`shift-to-${toCol}`"
						type="button"
						class="px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-300 text-sm font-medium hover:bg-amber-500/20"
						@click="submitShift(selectedShiftFromColumn!, toCol)"
					>
						{{ COLUMN_LABELS[toCol] }}
					</button>
					<button
						type="button"
						class="px-3 py-1.5 rounded-lg border border-slate-500/50 bg-slate-500/10 text-slate-300 text-sm font-medium hover:bg-slate-500/20"
						@click="clearShiftSelection"
					>
						Back
					</button>
				</template>
			</template>
			<template v-else-if="isMyTurn && pendingAbilityEffect?.type === 'shiftAllInLine'">
				<template v-if="selectedShiftAllFromColumn === null">
					<span class="text-slate-300 text-sm">Choose line with face-down cards to move</span>
					<button
						v-for="colIdx in columnsWithFaceDownCard"
						:key="`shiftall-from-${colIdx}`"
						type="button"
						class="px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-300 text-sm font-medium hover:bg-amber-500/20"
						@click="setShiftAllFromColumn(colIdx)"
					>
						{{ COLUMN_LABELS[colIdx] }}
					</button>
				</template>
				<template v-else>
					<span class="text-slate-300 text-sm">Choose destination line</span>
					<button
						v-for="toCol in shiftAllInLineDestinationColumns"
						:key="`shiftall-to-${toCol}`"
						type="button"
						class="px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-300 text-sm font-medium hover:bg-amber-500/20"
						@click="submitShiftAllInLine(selectedShiftAllFromColumn!, toCol)"
					>
						{{ COLUMN_LABELS[toCol] }}
					</button>
					<button
						type="button"
						class="px-3 py-1.5 rounded-lg border border-slate-500/50 bg-slate-500/10 text-slate-300 text-sm font-medium hover:bg-slate-500/20"
						@click="clearShiftAllSelection"
					>
						Back
					</button>
				</template>
			</template>
			<template v-else-if="isMyTurn && pendingAbilityEffect?.type === 'reveal'">
				<span class="text-slate-300 text-sm">Opponent reveals their hand</span>
				<button
					type="button"
					class="px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-300 text-sm font-medium hover:bg-amber-500/20"
					@click="move('applyEffect', 'reveal', {})"
				>
					Reveal
				</button>
			</template>
			<template v-else-if="isMyTurn && pendingAbilityEffect?.type === 'drawThenDiscardThenReveal'">
				<span class="text-slate-300 text-sm">Draw 2, opponent discards 2, then reveal their hand</span>
				<button
					type="button"
					class="px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-300 text-sm font-medium hover:bg-amber-500/20"
					@click="resolveTopAbility"
				>
					Resolve
				</button>
			</template>
			<template v-else-if="isMyTurn && pendingAbilityEffect?.type === 'playFromHandFaceDownAnotherLine'">
				<span class="text-slate-300 text-sm">Play 1 card face-down in another line</span>
				<template v-if="selectedPlayFromHandCard === null">
					<span class="text-slate-400 text-xs">Choose a card from your hand</span>
					<div class="flex flex-wrap gap-2">
						<button
							v-for="cardId in myHand"
							:key="cardId"
							type="button"
							class="px-3 py-1.5 rounded-lg border text-sm"
							:class="selectedPlayFromHandCard === cardId ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200' : 'border-slate-500/50 bg-slate-500/10 text-slate-300'"
							@click="selectedPlayFromHandCard = cardId"
						>
							{{ (getCommandCardById(cardId)?.name ?? cardId).slice(0, 20) }}
						</button>
					</div>
				</template>
				<template v-else>
					<span class="text-slate-400 text-xs">Choose destination line</span>
					<div class="flex gap-2">
						<button
							v-for="colIdx in playAnotherLineColumns"
							:key="colIdx"
							type="button"
							class="px-3 py-1.5 rounded-lg border border-cyan-500/50 bg-cyan-500/10 text-cyan-300 text-sm"
							@click="selectedPlayFromHandToColumn = colIdx; submitPlayFromHandFaceDownAnotherLine()"
						>
							{{ columnLabel(colIdx) }}
						</button>
						<button type="button" class="px-3 py-1.5 rounded-lg border border-slate-500/50 bg-slate-500/10 text-slate-300 text-sm" @click="selectedPlayFromHandCard = null">
							Back
						</button>
					</div>
				</template>
			</template>
			<template v-else-if="isMyTurn && pendingAbilityEffect?.type === 'playTopOfDeckFaceDownAnotherLine'">
				<span class="text-slate-300 text-sm">Play top card of your deck face-down in another line</span>
				<div class="flex gap-2">
					<button
						v-for="colIdx in playAnotherLineColumns"
						:key="colIdx"
						type="button"
						class="px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-300 text-sm"
						@click="submitPlayTopOfDeckFaceDownAnotherLine(colIdx)"
					>
						{{ columnLabel(colIdx) }}
					</button>
				</div>
			</template>
			<template v-else-if="isMyTurn && pendingAbilityEffect?.type === 'playOneCard'">
				<span class="text-slate-300 text-sm">Play 1 card</span>
				<div class="flex flex-wrap gap-2 items-center">
					<span class="text-slate-400 text-xs">Card:</span>
					<button
						v-for="(cardId, idx) in myHand"
						:key="cardId"
						type="button"
						class="px-2 py-1 rounded border text-xs"
						:class="selectedPlayOneHandIndex === idx ? 'border-cyan-400 bg-cyan-500/20' : 'border-slate-500/50 bg-slate-500/10'"
						@click="selectedPlayOneHandIndex = idx"
					>
						{{ (getCommandCardById(cardId)?.name ?? cardId).slice(0, 12) }}
					</button>
					<span class="text-slate-400 text-xs ml-2">Column:</span>
					<button
						v-for="colIdx in [0,1,2]"
						:key="colIdx"
						type="button"
						class="px-2 py-1 rounded border text-xs"
						:class="selectedPlayOneColumn === colIdx ? 'border-cyan-400 bg-cyan-500/20' : 'border-slate-500/50 bg-slate-500/10'"
						@click="selectedPlayOneColumn = colIdx"
					>
						{{ columnLabel(colIdx) }}
					</button>
					<label class="flex items-center gap-1 text-slate-400 text-xs ml-2">
						<input v-model="selectedPlayOneFaceUp" type="checkbox" class="rounded" />
						Face up
					</label>
					<button
						type="button"
						class="px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-300 text-sm"
						:disabled="selectedPlayOneHandIndex === null || selectedPlayOneColumn === null"
						@click="submitPlayOneCard()"
					>
						Play
					</button>
				</div>
			</template>
			<template v-else-if="isMyTurn && pendingAbilityEffect?.type === 'skipCheckCache'">
				<span class="text-slate-300 text-sm">Skip your check cache phase</span>
				<button
					type="button"
					class="px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-300 text-sm font-medium hover:bg-amber-500/20"
					@click="resolveTopAbility"
				>
					Resolve
				</button>
			</template>
			<template v-else-if="isMyTurn && pendingAbilityEffect?.type === 'rearrange'">
				<span class="text-slate-300 text-sm">Swap the positions of 2 of your protocols</span>
				<div class="flex flex-wrap gap-2 items-center">
					<span class="text-slate-400 text-xs">Choose two lanes to swap:</span>
					<button
						v-for="colIdx in [0, 1, 2]"
						:key="colIdx"
						type="button"
						class="px-3 py-1.5 rounded-lg border text-sm"
						:class="selectedRearrangeCol1 === colIdx || selectedRearrangeCol2 === colIdx ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200' : 'border-slate-500/50 bg-slate-500/10 text-slate-300'"
						@click="
							if (selectedRearrangeCol1 === null) selectedRearrangeCol1 = colIdx;
							else if (selectedRearrangeCol2 === null && colIdx !== selectedRearrangeCol1) selectedRearrangeCol2 = colIdx;
							else if (selectedRearrangeCol1 === colIdx) selectedRearrangeCol1 = null;
							else if (selectedRearrangeCol2 === colIdx) selectedRearrangeCol2 = null;
						"
					>
						{{ columnLabel(colIdx) }}
					</button>
					<button
						type="button"
						class="px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-300 text-sm"
						:disabled="selectedRearrangeCol1 === null || selectedRearrangeCol2 === null"
						@click="submitRearrange()"
					>
						Swap
					</button>
					<button
						v-if="selectedRearrangeCol1 !== null || selectedRearrangeCol2 !== null"
						type="button"
						class="px-3 py-1.5 rounded-lg border border-slate-500/50 bg-slate-500/10 text-slate-300 text-sm"
						@click="selectedRearrangeCol1 = null; selectedRearrangeCol2 = null"
					>
						Clear
					</button>
				</div>
			</template>
			<template v-else-if="isMyTurn && pendingAbilityEffect?.type === 'revealFaceDownThenOptional'">
				<template v-if="selectedRevealFaceDown === null">
					<span class="text-slate-300 text-sm">Choose a face-down card to reveal</span>
					<div class="flex flex-wrap gap-2">
						<button
							v-for="(pos, i) in faceDownPositions"
							:key="`${pos.columnIndex}-${pos.stackIndex}-${i}`"
							type="button"
							class="px-3 py-1.5 rounded-lg border border-cyan-500/50 bg-cyan-500/10 text-cyan-300 text-sm"
							@click="setRevealFaceDownPosition(pos)"
						>
							{{ columnLabel(pos.columnIndex) }} (card {{ pos.stackIndex + 1 }})
						</button>
					</div>
				</template>
				<template v-else>
					<span class="text-slate-300 text-sm">Reveal then: do nothing, shift, or flip?</span>
					<div class="flex flex-wrap gap-2 items-center">
						<button
							type="button"
							class="px-3 py-1.5 rounded-lg border border-slate-500/50 bg-slate-500/10 text-slate-300 text-sm"
							@click="submitRevealFaceDownNone"
						>
							Do nothing
						</button>
						<button
							type="button"
							class="px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-300 text-sm"
							@click="submitRevealFaceDownFlip"
						>
							Flip
						</button>
						<template v-if="selectedRevealFaceDownAction === 'shift'">
							<button
								v-for="colIdx in revealFaceDownDestinationColumns"
								:key="colIdx"
								type="button"
								class="px-3 py-1.5 rounded-lg border border-cyan-500/50 bg-cyan-500/10 text-cyan-300 text-sm"
								@click="submitRevealFaceDownShift(colIdx)"
							>
								Shift to {{ columnLabel(colIdx) }}
							</button>
						</template>
						<button
							v-else
							type="button"
							class="px-3 py-1.5 rounded-lg border border-cyan-500/50 bg-cyan-500/10 text-cyan-300 text-sm"
							@click="selectedRevealFaceDownAction = 'shift'"
						>
							Shift
						</button>
						<button
							type="button"
							class="px-3 py-1.5 rounded-lg border border-slate-500/50 bg-slate-500/10 text-slate-300 text-sm"
							@click="clearRevealFaceDownSelection"
						>
							Back
						</button>
					</div>
				</template>
			</template>
			<!-- Resolve top ability (e.g. draw) when we own it and not in discard-selection mode -->
			<template v-else-if="isMyTurn && pendingAbilityEffect">
				<button
					v-if="pendingAbilityEffect.type === 'draw'"
					type="button"
					class="px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-300 text-sm font-medium hover:bg-amber-500/20 transition-colors"
					@click="resolveTopAbility"
				>
					Draw {{ (pendingAbilityEffect.params.count as number) ?? 1 }} card(s)
				</button>
				<button
					v-if="pendingAbilityEffect.type === 'draw' && isOptionalDraw"
					type="button"
					class="px-3 py-1.5 rounded-lg border border-slate-500/50 bg-slate-500/10 text-slate-300 text-sm font-medium hover:bg-slate-500/20 transition-colors"
					@click="skipOptionalDraw"
				>
					Skip
				</button>
				<button
					v-else-if="pendingAbilityEffect.type !== 'draw' && pendingAbilityEffect.type !== 'discardThenDraw' && pendingAbilityEffect.type !== 'discardThenReturn' && pendingAbilityEffect.type !== 'discardThenDelete' && pendingAbilityEffect.type !== 'delete' && pendingAbilityEffect.type !== 'return' && pendingAbilityEffect.type !== 'flip' && pendingAbilityEffect.type !== 'flipMultiple' && pendingAbilityEffect.type !== 'shift' && pendingAbilityEffect.type !== 'shiftAllInLine' && pendingAbilityEffect.type !== 'reveal' && pendingAbilityEffect.type !== 'drawThenDiscardThenReveal' && pendingAbilityEffect.type !== 'revealFaceDownThenOptional' && pendingAbilityEffect.type !== 'playFromHandFaceDownAnotherLine' && pendingAbilityEffect.type !== 'playTopOfDeckFaceDownAnotherLine' && pendingAbilityEffect.type !== 'playOneCard' && pendingAbilityEffect.type !== 'rearrange' && pendingAbilityEffect.type !== 'skipCheckCache'"
					type="button"
					class="px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-300 text-sm font-medium hover:bg-amber-500/20 transition-colors"
					@click="resolveTopAbility"
				>
					{{ pendingAbilityEffect.type === 'skipCheckCache' ? 'Skip check cache' : pendingAbilityEffect.type === 'drawThenDiscard' ? 'Draw & opponent discards' : 'Resolve ability' }}
				</button>
			</template>
		</div>
		<!-- Compiled count: you vs opponent -->
		<div v-if="G?.columns" class="flex justify-center gap-6 text-sm">
			<span class="text-slate-300"
				>Your protocols compiled:
				<strong class="text-cyan-400" style="text-shadow: 0 0 8px rgba(34, 211, 238, 0.5);">{{ myCompiledCount }}/3</strong></span
			>
			<span class="text-slate-600">|</span>
			<span class="text-slate-500"
				>Opponent: <strong>{{ opponentCompiledCount }}/3</strong></span
			>
		</div>

		<!-- Deck/trash column (left) + 3 lanes. Order: opponent trash (top), opponent deck, my deck, my discard (bottom). -->
		<div class="grid gap-4" :style="{ gridTemplateColumns: `5.5rem repeat(${NUM_COLUMNS}, 1fr)` }">
			<!-- Left column: decks and discard piles -->
			<div
				v-if="G?.players"
				class="deck-trash-column flex flex-col justify-between rounded-lg border-2 min-h-[360px] py-3 px-2"
				style="background: var(--cyber-panel); border-color: rgba(34, 211, 238, 0.25);"
			>
				<!-- Opponent (top): trash then deck -->
				<div class="flex flex-col items-center gap-2">
					<div class="discard-pile flex flex-col items-center" title="Opponent's discard">
						<div
							class="w-12 h-16 rounded border-2 flex items-center justify-center text-xs font-mono tabular-nums shrink-0"
							style="background: linear-gradient(135deg, #422006 0%, #78350f 100%); border-color: rgba(251, 191, 36, 0.3);"
						>
							{{ opponentDiscardCount }}
						</div>
						<span class="text-[10px] uppercase tracking-wider text-slate-500">Trash</span>
					</div>
					<div class="deck-pile flex flex-col items-center" title="Opponent's deck">
						<div
							class="w-12 h-16 rounded border-2 flex items-center justify-center text-xs font-mono tabular-nums shrink-0"
							style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border-color: rgba(148, 163, 184, 0.4);"
						>
							{{ opponentDeckCount }}
						</div>
						<span class="text-[10px] uppercase tracking-wider text-slate-500">Deck</span>
					</div>
				</div>
				<!-- Me (bottom): deck then discard (discard below my deck, above opponent's deck) -->
				<div class="flex flex-col items-center gap-2">
					<div class="deck-pile flex flex-col items-center" title="Your deck">
						<div
							class="w-12 h-16 rounded border-2 flex items-center justify-center text-xs font-mono tabular-nums shrink-0"
							style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border-color: rgba(148, 163, 184, 0.4);"
						>
							{{ myDeckCount }}
						</div>
						<span class="text-[10px] uppercase tracking-wider text-slate-500">Deck</span>
					</div>
					<div class="discard-pile flex flex-col items-center" title="Your discard">
						<div
							class="w-12 h-16 rounded border-2 flex items-center justify-center text-xs font-mono tabular-nums shrink-0"
							style="background: linear-gradient(135deg, #422006 0%, #78350f 100%); border-color: rgba(251, 191, 36, 0.3);"
						>
							{{ myDiscardCount }}
						</div>
						<span class="text-[10px] uppercase tracking-wider text-slate-500">Trash</span>
					</div>
				</div>
			</div>
			<div
				v-for="(col, colIdx) in columns"
				:key="colIdx"
				:ref="(el) => { laneRefs[colIdx].value = getLaneEl(el) ?? null }"
				class="lane-column flex flex-col rounded-lg border-2 min-h-[360px] overflow-hidden transition-colors duration-150"
				style="background: var(--cyber-panel); border-color: rgba(34, 211, 238, 0.25);"
				:class="{
					'lane-drop-target': dragState.isDragging && (overLaneId ?? dragState.overZoneId) === `lane-${colIdx}` && eligibleColumnIndices.has(colIdx),
					'lane-drop-ineligible': dragState.isDragging && (overLaneId ?? dragState.overZoneId) === `lane-${colIdx}` && !eligibleColumnIndices.has(colIdx),
				}"
			>
				<!-- Lane header: our threshold (left), column label (center), opponent threshold (right) -->
				<div class="flex items-center justify-between px-3 py-2 border-b shrink-0 font-display text-xs uppercase tracking-wider" style="border-color: rgba(34, 211, 238, 0.2); background: rgba(0,0,0,0.2);">
					<span
						class="text-xs tabular-nums font-medium w-10 text-left"
						:class="
							columnTotal(col) >= COMPILE_THRESHOLD
								? 'text-amber-400'
								: 'text-slate-500'
						"
					>
						{{ columnTotalForPlayer(col, myId) }}/{{ COMPILE_THRESHOLD }}
					</span>
					<span class="text-cyan-400/90">{{ COLUMN_LABELS[colIdx] }}</span>
					<span
						class="text-xs tabular-nums font-medium w-10 text-right"
						:class="
							columnTotal(col) >= COMPILE_THRESHOLD
								? 'text-amber-400'
								: 'text-slate-500'
						"
					>
						{{ columnTotalForPlayer(col, myId === '0' ? '1' : '0') }}/{{ COMPILE_THRESHOLD }}
					</span>
				</div>
				<!-- Lane body: opponent (top) → protocol (center) → you (bottom) -->
				<div class="flex flex-1 flex-col min-h-0 p-2">
					<!-- Opponent's command cards: stacked, splayed up, rotated 180° (mirror of your layout) -->
					<div class="flex flex-col items-center mb-2" :style="{ marginTop: `${STACK_TOP_OFFSET_REM}rem` }">
						<div
							class="stack-splay stack-splay-up relative w-full flex justify-center"
							:style="{ minHeight: `${Math.max(0, (partitionStack(col, myId).opponent.length - 1) * STACK_STRIP_PEEK_REM) + (partitionStack(col, myId).opponent.length ? STACK_CARD_HEIGHT_REM : 0)}rem` }"
						>
							<div
								v-for="(entry, stackIdx) in partitionStack(col, myId).opponent"
								:key="`opp-${colIdx}-${stackIdx}`"
								class="card-vertical card-stack-item rounded-lg border-2 flex flex-col text-sm font-medium shrink-0 overflow-hidden absolute"
								:class="[
									entry.faceUp ? 'border-cyan-500/40 text-slate-200' : 'border-slate-600 text-slate-500',
									'items-center justify-center',
									stackIdx !== partitionStack(col, myId).opponent.length - 1 ? 'stack-card-covered' : '',
									{ 'stack-card-facedown': !entry.faceUp },
								]"
								:style="{
									left: '50%',
									transform: 'translateX(-50%) rotate(180deg)',
									top: `${(partitionStack(col, myId).opponent.length - 1 - stackIdx) * STACK_STRIP_PEEK_REM}rem`,
									zIndex: stackIdx,
									background: 'var(--cyber-panel)',
								}"
							>
								<template v-if="!entry.faceUp">
									<CommandCardFace
										:value="2"
										protocol="—"
										name="—"
										:top="null"
										:middle="null"
										:bottom="null"
									/>
								</template>
								<template v-else-if="stackCardsResolved[colIdx]?.opponent?.[stackIdx]">
									<CommandCardFace
										:value="stackCardsResolved[colIdx].opponent[stackIdx].value"
										:protocol="getProtocolName(stackCardsResolved[colIdx].opponent[stackIdx].protocolId)"
										:name="stackCardsResolved[colIdx].opponent[stackIdx].name ?? stackCardsResolved[colIdx].opponent[stackIdx].id"
										:top="stackCardsResolved[colIdx].opponent[stackIdx].top"
										:middle="stackCardsResolved[colIdx].opponent[stackIdx].middle"
										:bottom="stackCardsResolved[colIdx].opponent[stackIdx].bottom"
									/>
								</template>
								<span v-else>?</span>
							</div>
						</div>
					</div>
					<!-- Protocol cards: horizontal 3.5:2.5, stacked in the middle -->
					<div class="flex flex-col items-center gap-1.5 my-2 shrink-0">
						<div class="flex flex-col gap-1.5">
							<!-- Opponent's protocol (top of stack) -->
							<div
								class="card-protocol rounded-xl border-2 flex flex-col items-center justify-between text-sm font-medium shrink-0 px-2 py-1"
								:class="
									col.protocolCompiled?.[myId === '0' ? 1 : 0]
										? 'border-amber-500/80 text-amber-200'
										: 'border-cyan-500/30 text-slate-300'
								"
								:style="col.protocolCompiled?.[myId === '0' ? 1 : 0] ? { background: 'rgba(120,53,15,0.4)', boxShadow: '0 0 12px rgba(251,191,36,0.3)' } : { background: 'var(--cyber-panel)' }"
							>
								<template v-if="(myId === '0' ? col.protocol[1] : col.protocol[0])">
									<span v-if="protocolDetails(myId === '0' ? col.protocol[1] : col.protocol[0]).top" class="protocol-card-top w-full truncate">{{ protocolDetails(myId === '0' ? col.protocol[1] : col.protocol[0]).top }}</span>
									<span v-else class="flex-1 min-h-[0.5rem]"></span>
									<span class="protocol-card-name text-center truncate w-full flex-shrink-0">{{ protocolDetails(myId === '0' ? col.protocol[1] : col.protocol[0]).name }}</span>
									<span v-if="protocolDetails(myId === '0' ? col.protocol[1] : col.protocol[0]).bottom" class="protocol-card-bottom w-full truncate">{{ protocolDetails(myId === '0' ? col.protocol[1] : col.protocol[0]).bottom }}</span>
									<span v-else class="flex-1 min-h-[0.5rem]"></span>
								</template>
								<template v-else>
									<span class="text-center">—</span>
								</template>
								<span
									v-if="col.protocolCompiled?.[myId === '0' ? 1 : 0]"
									class="text-xs text-amber-400 mt-0.5 flex-shrink-0"
									>Compiled</span
								>
							</div>
							<!-- Your protocol (bottom of stack) -->
							<div
								class="card-protocol rounded-xl border-2 flex flex-col items-center justify-between text-sm font-medium shrink-0 px-2 py-1"
								:class="
									col.protocolCompiled?.[myId === '0' ? 0 : 1]
										? 'border-amber-500/80 text-amber-200'
										: 'border-cyan-500/50 text-cyan-100'
								"
								:style="col.protocolCompiled?.[myId === '0' ? 0 : 1] ? { background: 'rgba(120,53,15,0.4)', boxShadow: '0 0 12px rgba(251,191,36,0.3)' } : { background: 'var(--cyber-panel)', boxShadow: '0 0 10px rgba(34,211,238,0.2)' }"
							>
								<template v-if="(myId === '0' ? col.protocol[0] : col.protocol[1])">
									<span v-if="protocolDetails(myId === '0' ? col.protocol[0] : col.protocol[1]).top" class="protocol-card-top w-full truncate">{{ protocolDetails(myId === '0' ? col.protocol[0] : col.protocol[1]).top }}</span>
									<span v-else class="flex-1 min-h-[0.5rem]"></span>
									<span class="protocol-card-name text-center truncate w-full flex-shrink-0">{{ protocolDetails(myId === '0' ? col.protocol[0] : col.protocol[1]).name }}</span>
									<span v-if="protocolDetails(myId === '0' ? col.protocol[0] : col.protocol[1]).bottom" class="protocol-card-bottom w-full truncate">{{ protocolDetails(myId === '0' ? col.protocol[0] : col.protocol[1]).bottom }}</span>
									<span v-else class="flex-1 min-h-[0.5rem]"></span>
								</template>
								<template v-else>
									<span class="text-center">—</span>
								</template>
								<span
									v-if="col.protocolCompiled?.[myId === '0' ? 0 : 1]"
									class="text-xs text-amber-400 mt-0.5 flex-shrink-0"
									>Compiled</span
								>
							</div>
						</div>
					</div>
					<!-- Your command cards: stacked, splayed down (newest on top, older peek out above) -->
					<div class="flex flex-col items-center mt-auto" :style="{ marginTop: `${STACK_TOP_OFFSET_REM}rem` }">
						<div
							class="stack-splay stack-splay-down relative w-full flex justify-center"
							:style="{ minHeight: `${Math.max(0, (partitionStack(col, myId).mine.length - 1) * STACK_STRIP_PEEK_REM) + (partitionStack(col, myId).mine.length ? STACK_CARD_HEIGHT_REM : 0)}rem` }"
						>
							<div
								v-for="(entry, stackIdx) in partitionStack(col, myId).mine"
								:key="`me-${colIdx}-${stackIdx}`"
								class="card-vertical card-stack-item rounded-lg border-2 flex flex-col text-sm font-medium shrink-0 overflow-hidden absolute"
								:class="[
									entry.faceUp ? 'items-center justify-center border-cyan-500/50 text-slate-200' : 'items-start justify-start border-slate-600 text-slate-500',
									stackIdx !== partitionStack(col, myId).mine.length - 1 ? 'stack-card-covered' : '',
								]"
								:style="{
									left: '50%',
									transform: 'translateX(-50%)',
									top: `${stackIdx * STACK_STRIP_PEEK_REM}rem`,
									zIndex: stackIdx,
									background: 'var(--cyber-panel)',
								}"
							>
								<template v-if="!entry.faceUp">
									<div class="flex items-center gap-1.5 shrink-0 p-1 w-full">
										<span class="command-card-value">2</span>
										<span class="command-card-name text-slate-500">—</span>
									</div>
								</template>
								<template v-else-if="stackCardsResolved[colIdx]?.mine?.[stackIdx]">
									<CommandCardFace
										:value="stackCardsResolved[colIdx].mine[stackIdx].value"
										:protocol="getProtocolName(stackCardsResolved[colIdx].mine[stackIdx].protocolId)"
										:name="stackCardsResolved[colIdx].mine[stackIdx].name ?? stackCardsResolved[colIdx].mine[stackIdx].id"
										:top="stackCardsResolved[colIdx].mine[stackIdx].top"
										:middle="stackCardsResolved[colIdx].mine[stackIdx].middle"
										:bottom="stackCardsResolved[colIdx].mine[stackIdx].bottom"
									/>
								</template>
								<span v-else>?</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Hand: teleported to fixed tray, fanned, hover-grow, drag to lane -->
		<Teleport to="#game-hand-tray">
			<div
				class="hand-tray flex flex-col items-center justify-end py-4 px-4 pointer-events-auto"
				:class="{ 'hand-tray-dragging': dragState.isDragging, 'hand-tray-discard-mode': isDiscardChoiceMode }"
			>
				<div v-if="myHandDisplay.length === 0" class="hand-fan flex flex-col items-center justify-center gap-2 min-h-[8rem] text-slate-400">
					<p class="text-sm">No cards in hand</p>
					<p class="text-xs text-center max-w-xs">
						Your 5-card hand is dealt when the play phase starts. If you just finished the draft and still see this, the server may not have received setup data when the match was created—try creating a new game from the lobby.
					</p>
				</div>
				<div v-else class="hand-fan flex justify-center items-end" :class="{ 'hand-fan-discard': isDiscardChoiceMode }">
					<div
						v-for="(card, idx) in myHandDisplay"
						:key="getHandCardKey(card, idx)"
						class="hand-card card-vertical-hand select-none touch-none rounded-xl border-2 flex flex-col items-center justify-center text-sm font-medium shrink-0 px-1 transition-transform duration-150 relative"
						:class="[
							!isDiscardChoiceMode && (hoveredHandIndex === idx ? 'hand-card-hover' : ''),
							!isDiscardChoiceMode && (canPlayCard ? 'border-cyan-500/50 text-slate-200 cursor-grab active:cursor-grabbing' : 'border-cyan-500/20 text-slate-400 cursor-default'),
							isDiscardChoiceMode && 'cursor-pointer border-amber-500/50',
							discardSelection.includes((card as CommandCard).id) && 'ring-2 ring-amber-400',
						]"
						:style="isDiscardChoiceMode ? { background: '#0f172a' } : [{ background: '#0f172a' }, hoveredHandIndex === idx ? fanStyleHover(idx) : fanStyle(idx)]"
						@pointerdown="onHandPointerDown(idx, $event)"
						@pointerup="onHandPointerUp"
						@pointerleave="() => { onHandPointerUp(); hoveredHandIndex = null }"
						@pointercancel="onHandPointerUp"
						@mouseenter="hoveredHandIndex = idx"
						@mouseleave="hoveredHandIndex = null"
					>
						<template v-if="'hidden' in card">
							<span class="text-slate-500 text-lg">?</span>
						</template>
						<div v-else class="card-flip-outer flex-1 min-h-0 w-full">
							<div
								class="card-flip-inner"
								:class="{ flipped: !(handFlippedState[(card as CommandCard).id] ?? true) }"
							>
								<div class="card-flip-front">
									<CommandCardFace
										:value="(card as CommandCard).value"
										:protocol="getProtocolName((card as CommandCard).protocolId)"
										:name="getHandCardLabel(card)"
										:top="(card as CommandCard).top"
										:middle="(card as CommandCard).middle"
										:bottom="(card as CommandCard).bottom"
									/>
								</div>
								<div class="card-flip-back hand-card-facedown">
									<CommandCardFace
										:value="2"
										protocol="—"
										name="—"
										:top="null"
										:middle="null"
										:bottom="null"
									/>
								</div>
							</div>
						</div>
						<!-- Trash icon overlay when selected for discard -->
						<div
							v-if="isDiscardChoiceMode && (card as CommandCard).id && discardSelection.includes((card as CommandCard).id)"
							class="absolute inset-0 flex items-center justify-center pointer-events-none bg-slate-900/70 rounded-xl"
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
							</svg>
						</div>
					</div>
				</div>
			</div>
		</Teleport>
		<!-- Custom drag ghost: name + value only -->
		<Teleport to="body">
			<div
				v-if="dragGhostCard"
				class="custom-drag-ghost"
				:style="customGhostStyle"
			>
				<div class="custom-drag-ghost-inner rounded-lg border-2 overflow-hidden flex flex-col items-center justify-center gap-0.5 bg-[#0f172a] border-cyan-500/50 shadow-lg p-1.5">
					<span class="text-cyan-400 font-bold text-lg leading-tight">{{ dragGhostCard.value }}</span>
					<span class="text-slate-200 text-xs font-medium text-center leading-tight">{{ getProtocolName(dragGhostCard.protocolId) }}</span>
				</div>
			</div>
		</Teleport>
	</div>
</template>

<style scoped>
.hand-tray {
	/* background: linear-gradient(to top, rgba(10, 14, 20, 0.98) 0%, rgba(10, 14, 20, 0.9) 60%, transparent 100%); */
	border-top: 0px solid rgba(34, 211, 238, 0.15);
	transition: transform 0.22s ease-out;
}
.hand-tray-dragging {
	transform: translateY(420px);
}
.hand-fan {
	min-height: 10rem;
}
.hand-fan-discard {
	flex-direction: row;
	justify-content: center;
	align-items: flex-end;
	gap: 0.5rem;
}
.hand-fan-discard .hand-card {
	will-change: auto;
}
.hand-card {
	will-change: transform;
}

.card-flip-outer {
	perspective: 800px;
	width: 100%;
	height: 100%;
	min-height: 0;
}
.card-flip-inner {
	position: relative;
	width: 100%;
	height: 100%;
	min-height: 0;
	transform-style: preserve-3d;
	transition: transform 0.35s ease-in-out;
}
.card-flip-inner.flipped {
	transform: rotateY(180deg);
}
.card-flip-front,
.card-flip-back {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	backface-visibility: hidden;
	-webkit-backface-visibility: hidden;
	border-radius: inherit;
}
.card-flip-front {
	background: #0f172a;
}
.card-flip-back {
	background: #0f172a;
	border: 1px solid rgba(34, 211, 238, 0.3);
	border-radius: 0.5rem;
	transform: rotateY(180deg);
}

/* Covered cards: full card content; bottom is visually covered by the card above (higher z-index) */

/* Face-down cards: hide the three ability rows (no abilities) */
.stack-card-facedown :deep(.command-card-ability),
.hand-card-facedown :deep(.command-card-ability) {
	display: none;
}

.lane-drop-target {
	border-color: rgba(34, 211, 238, 0.85) !important;
	box-shadow: 0 0 24px rgba(34, 211, 238, 0.5);
	background: rgba(34, 211, 238, 0.08) !important;
}
.lane-drop-ineligible {
	opacity: 0.5;
	pointer-events: auto;
}
.custom-drag-ghost {
	-webkit-user-select: none;
	user-select: none;
}
.custom-drag-ghost-inner {
	width: 100%;
	height: 100%;
	min-height: 0;
	transform: scale(1.15) rotate(-3deg);
	filter: drop-shadow(0 16px 32px rgba(0, 0, 0, 0.55));
}
</style>
