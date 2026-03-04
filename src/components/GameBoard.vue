<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useGame, useCardDrag } from '@engine/client/index';
import type { CompileGameState } from '../logic/game-logic';
import { NUM_COLUMNS } from '../logic/game-logic';
import { getCommandCardById, getProtocolDetails } from '../logic/compile-cards';
import type { VisibleCard } from '@engine/client/index';

defineProps<{ headerHeight: number }>();
defineEmits<{ 'back-to-lobby': [] }>();

const { state, move, isMyTurn, playerID } = useGame();
const { registerDropZone, unregisterDropZone, startDrag, state: dragState, onDrop } = useCardDrag();

const G = computed(() => state.value as unknown as CompileGameState | undefined);

const columns = computed(() => G.value?.columns ?? []);
const myId = computed(() => playerID.value ?? null);
/** Raw hand from server: card ids or '[hidden]'. */
const myHand = computed(() => {
	const pid = myId.value;
	if (!pid || !G.value?.players) return [];
	return G.value.players[pid]?.hand ?? [];
});

/** Hand resolved to VisibleCard | HiddenCard for display (client card catalog). */
const myHandDisplay = computed(() =>
	myHand.value.map(id =>
		id === '[hidden]'
			? { hidden: true }
			: (getCommandCardById(id) ?? { id, name: id, value: 0 })
	)
);

const COLUMN_LABELS = ['Left', 'Center', 'Right'] as const;

const playFaceUp = ref(true);
const hoveredHandIndex = ref<number | null>(null);

const laneRefs = [ref<HTMLElement | null>(null), ref<HTMLElement | null>(null), ref<HTMLElement | null>(null)];

const DRAG_THRESHOLD = 8;
let pointerDown = false;
let pointerStartX = 0;
let pointerStartY = 0;
let pendingHandIndex: number | null = null;

function onHandPointerDown(idx: number, ev: PointerEvent) {
	if (ev.button !== 0 || !isMyTurn.value) return;
	pointerDown = true;
	pendingHandIndex = idx;
	pointerStartX = ev.clientX;
	pointerStartY = ev.clientY;
	(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
}

function onHandPointerMove(idx: number, ev: PointerEvent) {
	if (!pointerDown || pendingHandIndex !== idx) return;
	const dx = ev.clientX - pointerStartX;
	const dy = ev.clientY - pointerStartY;
	if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
	pointerDown = false;
	pendingHandIndex = null;
	(ev.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId);
	const card = myHandDisplay.value[idx];
	if (!card || typeof card !== 'object' || 'hidden' in card) return;
	const el = ev.currentTarget as HTMLElement;
	const rect = el.getBoundingClientRect();
	startDrag(
		{ card: card as VisibleCard, sourceIndex: idx, sourceId: 'hand' },
		rect,
		ev
	);
}

function onHandPointerUp() {
	pointerDown = false;
	pendingHandIndex = null;
}

onMounted(() => {
	onDrop.value = (zoneId: string, payload: { sourceIndex: number; sourceId: string }) => {
		if (payload.sourceId !== 'hand') return;
		const m = zoneId.match(/^lane-(\d)$/);
		if (!m) return;
		const colIdx = parseInt(m[1], 10);
		if (colIdx >= 0 && colIdx < NUM_COLUMNS && isMyTurn.value) {
			move('playCommandCard', colIdx, payload.sourceIndex, playFaceUp.value);
		}
	};
	nextTick(() => {
		for (let i = 0; i < NUM_COLUMNS; i++) {
			const el = laneRefs[i].value;
			if (el) registerDropZone({ id: `lane-${i}`, el });
		}
	});
});

onBeforeUnmount(() => {
	for (let i = 0; i < NUM_COLUMNS; i++) unregisterDropZone(`lane-${i}`);
	onDrop.value = null;
});

function cardLabel(cardId: string): string {
	if (cardId === '[hidden]') return '?';
	const m = cardId.match(/command-(\d+)/);
	return m ? `Command ${m[1]}` : cardId;
}

function protocolDetails(protocolId: string | null) {
	return protocolId ? getProtocolDetails(protocolId) : { name: '—', top: '', bottom: '' };
}

const COMPILE_THRESHOLD = 10;

function columnTotal(col: { commandStack: { value?: number }[] }): number {
	return col.commandStack.reduce((s, e) => s + (e.value ?? 0), 0);
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

function getHandCardKey(card: unknown, idx: number): string {
	if (card && typeof card === 'object' && 'hidden' in card) return `h-${idx}`;
	return (card && typeof card === 'object' && 'id' in card ? String((card as { id: string }).id) : `h-${idx}`);
}

function getHandCardLabel(card: unknown): string {
	if (!card || typeof card !== 'object') return '?';
	const c = card as { name?: string; id?: string };
	return c.name ?? c.id ?? '?';
}

function getHandCardValue(card: unknown): string | number {
	if (!card || typeof card !== 'object') return '?';
	const c = card as { value?: number };
	return c.value ?? '?';
}

const FAN_DEG_PER_CARD = 5;
const FAN_OVERLAP_PX = 44;

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
	<div class="w-full max-w-4xl mx-auto space-y-6">
		<p class="text-center text-slate-400 text-sm">
			Play command cards to columns. When a column total reaches 10+, your protocol there compiles.
			First to compile all 3 wins.
		</p>

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

		<!-- 3 lanes: bordered columns. Opponent cards above, protocol in center (stacked), your cards below. -->
		<div class="grid gap-4" :style="{ gridTemplateColumns: `repeat(${NUM_COLUMNS}, 1fr)` }">
			<div
				v-for="(col, colIdx) in columns"
				:key="colIdx"
				:ref="laneRefs[colIdx]"
				class="lane-column flex flex-col rounded-lg border-2 min-h-[360px] overflow-hidden transition-colors duration-150"
				style="background: var(--cyber-panel); border-color: rgba(34, 211, 238, 0.25);"
				:class="{ 'lane-drop-target': dragState.isDragging && dragState.overZoneId === `lane-${colIdx}` }"
			>
				<!-- Lane header -->
				<div class="flex items-center justify-between px-3 py-2 border-b shrink-0 font-display text-xs uppercase tracking-wider" style="border-color: rgba(34, 211, 238, 0.2); background: rgba(0,0,0,0.2);">
					<span class="text-cyan-400/90">{{ COLUMN_LABELS[colIdx] }}</span>
					<span
						class="text-xs tabular-nums font-medium"
						:class="
							columnTotal(col) >= COMPILE_THRESHOLD
								? 'text-amber-400'
								: 'text-slate-500'
						"
					>
						{{ columnTotal(col) }}/{{ COMPILE_THRESHOLD }}
					</span>
				</div>
				<!-- Lane body: opponent (top) → protocol (center) → you (bottom) -->
				<div class="flex flex-1 flex-col min-h-0 p-2">
					<!-- Opponent's command cards (above protocol; vertical 2.5:3.5) -->
					<div class="flex flex-col items-center gap-1.5 mb-2 min-h-[5.5rem]">
						<span class="text-[10px] text-slate-500 uppercase tracking-wide">Opponent</span>
						<div class="flex flex-col-reverse items-center gap-1">
							<div
								v-for="(entry, stackIdx) in partitionStack(col, myId).opponent"
								:key="`opp-${colIdx}-${stackIdx}`"
								class="card-vertical rounded-lg border-2 flex flex-col items-center justify-center text-sm font-medium shrink-0 px-0.5"
								:class="
									entry.faceUp
										? 'border-cyan-500/40 text-slate-200'
										: 'border-slate-600 text-slate-500'
								"
								:style="entry.faceUp ? { background: 'var(--cyber-panel)' } : {}"
							>
								<span>{{
									entry.faceUp ? cardLabel(entry.cardId) : '?'
								}}</span>
								<span
									v-if="entry.faceUp"
									class="text-xs text-slate-400 mt-0.5"
									>{{ entry.value }}</span
								>
							</div>
						</div>
					</div>
					<!-- Protocol cards: horizontal 3.5:2.5, stacked in the middle -->
					<div class="flex flex-col items-center gap-1.5 my-2 shrink-0">
						<span class="text-[10px] text-slate-500 uppercase tracking-wide">Protocol</span>
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
					<!-- Your command cards (below protocol; vertical 2.5:3.5) -->
					<div class="flex flex-col items-center gap-1.5 mt-auto min-h-[5.5rem]">
						<span class="text-[10px] text-slate-500 uppercase tracking-wide">You</span>
						<div class="flex flex-col items-center gap-1">
							<div
								v-for="(entry, stackIdx) in partitionStack(col, myId).mine"
								:key="`me-${colIdx}-${stackIdx}`"
								class="card-vertical rounded-lg border-2 flex flex-col items-center justify-center text-sm font-medium shrink-0 px-0.5"
								:class="
									entry.faceUp
										? 'border-cyan-500/50 text-slate-200'
										: 'border-slate-600 text-slate-500'
								"
								:style="entry.faceUp ? { background: 'var(--cyber-panel)' } : {}"
							>
								<span>{{ cardLabel(entry.cardId) }}</span>
								<span class="text-xs text-slate-400 mt-0.5">{{ entry.value }}</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Hand: teleported to fixed tray, fanned, hover-grow, drag to lane -->
		<Teleport to="#game-hand-tray">
			<div class="hand-tray flex flex-col items-center justify-end py-4 px-4 pointer-events-auto">
				<div class="flex items-center gap-2 mb-2">
					<span class="text-xs font-medium text-slate-500 uppercase tracking-wide">Your hand</span>
					<label class="flex items-center gap-1.5 text-xs text-slate-400">
						<input v-model="playFaceUp" type="checkbox" class="rounded border-slate-500" />
						Play face up
					</label>
				</div>
				<div class="hand-fan flex justify-center items-end">
					<div
						v-for="(card, idx) in myHandDisplay"
						:key="getHandCardKey(card, idx)"
						class="hand-card card-vertical-hand rounded-xl border-2 flex flex-col items-center justify-center text-sm font-medium shrink-0 px-1 transition-transform duration-150 cursor-grab active:cursor-grabbing"
						:class="[
							hoveredHandIndex === idx ? 'hand-card-hover' : '',
							isMyTurn ? 'border-cyan-500/50 text-slate-200' : 'border-cyan-500/20 text-slate-400',
						]"
						:style="{ background: 'var(--cyber-panel)' }"
						:style="hoveredHandIndex === idx ? fanStyleHover(idx) : fanStyle(idx)"
						@pointerdown="onHandPointerDown(idx, $event)"
						@pointermove="onHandPointerMove(idx, $event)"
						@pointerup="onHandPointerUp"
						@pointerleave="() => { onHandPointerUp(); hoveredHandIndex = null }"
						@pointercancel="onHandPointerUp"
						@mouseenter="hoveredHandIndex = idx"
						@mouseleave="hoveredHandIndex = null"
					>
						<template v-if="'hidden' in card">
							<span class="text-slate-500 text-lg">?</span>
						</template>
						<template v-else>
							<span class="text-center">{{ getHandCardLabel(card) }}</span>
							<span class="text-xs text-slate-400 mt-1">{{ getHandCardValue(card) }}</span>
						</template>
					</div>
				</div>
			</div>
		</Teleport>
	</div>
</template>

<style scoped>
.hand-tray {
	background: linear-gradient(to top, rgba(10, 14, 20, 0.98) 0%, rgba(10, 14, 20, 0.9) 60%, transparent 100%);
	border-top: 1px solid rgba(34, 211, 238, 0.15);
}
.hand-fan {
	min-height: 10rem;
}
.hand-card {
	will-change: transform;
}
.hand-card-hover {
	/* transform applied inline via fanStyleHover to preserve rotation */
}
.lane-drop-target {
	border-color: rgba(34, 211, 238, 0.7) !important;
	box-shadow: 0 0 20px rgba(34, 211, 238, 0.4);
}
</style>
