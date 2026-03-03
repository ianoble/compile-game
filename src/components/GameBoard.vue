<script setup lang="ts">
import { ref, computed } from 'vue';
import { useGame } from '@engine/client/index';
import type { CompileGameState } from '../logic/game-logic';
import { NUM_COLUMNS } from '../logic/game-logic';

defineProps<{ headerHeight: number }>();
const emit = defineEmits<{ 'back-to-lobby': [] }>();

const { state, move, isMyTurn, playerID } = useGame();
const G = computed(() => state.value as unknown as CompileGameState | undefined);

const columns = computed(() => G.value?.columns ?? []);
const myId = computed(() => playerID.value ?? null);
const myHand = computed(() => {
	const pid = myId.value;
	if (!pid || !G.value?.players) return [];
	return G.value.players[pid]?.hand ?? [];
});

const COLUMN_LABELS = ['Left', 'Center', 'Right'] as const;

// Play flow: select card from hand, then choose column and face up/down
const selectedHandIndex = ref<number | null>(null);
const playFaceUp = ref(true);

function playToColumn(columnIndex: number) {
	const idx = selectedHandIndex.value;
	if (idx == null || !isMyTurn.value) return;
	move('playCommandCard', columnIndex, idx, playFaceUp.value);
	selectedHandIndex.value = null;
}

function cardLabel(cardId: string): string {
	if (cardId === '[hidden]') return '?';
	const m = cardId.match(/command-(\d+)/);
	return m ? `Command ${m[1]}` : cardId;
}

function protocolLabel(protocolId: string | null): string {
	if (!protocolId) return '—';
	const m = protocolId.match(/protocol-(\d+)/);
	return m ? `Protocol ${m[1]}` : protocolId;
}

const COMPILE_THRESHOLD = 10;

function columnTotal(col: { commandStack: { value?: number }[] }): number {
	return col.commandStack.reduce((s, e) => s + (e.value ?? 0), 0);
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
				<strong class="text-emerald-400">{{ myCompiledCount }}/3</strong></span
			>
			<span class="text-slate-500">|</span>
			<span class="text-slate-400"
				>Opponent: <strong>{{ opponentCompiledCount }}/3</strong></span
			>
		</div>

		<!-- 3 columns: protocol row + command stack -->
		<div class="grid gap-6" :style="{ gridTemplateColumns: `repeat(${NUM_COLUMNS}, 1fr)` }">
			<div
				v-for="(col, colIdx) in columns"
				:key="colIdx"
				class="rounded-xl border border-slate-600 bg-slate-800/60 p-4 min-h-[140px] flex flex-col"
			>
				<div class="flex items-center justify-between mb-2">
					<span class="text-xs font-medium text-slate-500 uppercase tracking-wide">{{
						COLUMN_LABELS[colIdx]
					}}</span>
					<span
						class="text-xs tabular-nums"
						:class="
							columnTotal(col) >= COMPILE_THRESHOLD
								? 'text-amber-400 font-semibold'
								: 'text-slate-500'
						"
					>
						{{ columnTotal(col) }}/{{ COMPILE_THRESHOLD }}
					</span>
				</div>
				<!-- Protocol row: two slots back-to-back (player 0 vs player 1) -->
				<div class="flex gap-2 mb-3">
					<div
						class="flex-1 min-h-[52px] rounded-lg border flex flex-col items-center justify-center text-xs"
						:class="
							col.protocolCompiled?.[myId === '0' ? 0 : 1]
								? 'bg-amber-900/40 border-amber-600 text-amber-200'
								: 'border-slate-600 bg-slate-700/50 text-slate-300'
						"
					>
						{{ myId === '0' ? protocolLabel(col.protocol[0]) : protocolLabel(col.protocol[1]) }}
						<span
							v-if="col.protocolCompiled?.[myId === '0' ? 0 : 1]"
							class="text-[10px] text-amber-400 mt-0.5"
							>Compiled</span
						>
					</div>
					<div class="text-slate-500 self-center text-xs">vs</div>
					<div
						class="flex-1 min-h-[52px] rounded-lg border flex flex-col items-center justify-center text-xs"
						:class="
							col.protocolCompiled?.[myId === '0' ? 1 : 0]
								? 'bg-amber-900/40 border-amber-600 text-amber-200'
								: 'border-slate-600 bg-slate-700/50 text-slate-300'
						"
					>
						{{ myId === '0' ? protocolLabel(col.protocol[1]) : protocolLabel(col.protocol[0]) }}
						<span
							v-if="col.protocolCompiled?.[myId === '0' ? 1 : 0]"
							class="text-[10px] text-amber-400 mt-0.5"
							>Compiled</span
						>
					</div>
				</div>
				<!-- Command stack -->
				<div class="flex flex-wrap gap-1.5 flex-1">
					<div
						v-for="(entry, stackIdx) in col.commandStack"
						:key="`${colIdx}-${stackIdx}`"
						class="w-12 h-16 rounded border flex flex-col items-center justify-center text-[10px] font-medium"
						:class="
							entry.faceUp
								? 'bg-slate-600 border-slate-500 text-slate-200'
								: 'bg-slate-700 border-slate-600 text-slate-500'
						"
					>
						<span>{{
							entry.owner === myId
								? cardLabel(entry.cardId)
								: entry.faceUp
									? cardLabel(entry.cardId)
									: '?'
						}}</span>
						<span
							v-if="entry.faceUp || entry.owner === myId"
							class="text-[9px] text-slate-400 mt-0.5"
							>{{ entry.value }}</span
						>
					</div>
				</div>
			</div>
		</div>

		<!-- Play controls: face up/down + column choice when card selected -->
		<div v-if="isMyTurn && myHand.length > 0" class="space-y-3">
			<div v-if="selectedHandIndex === null" class="text-center text-slate-400 text-sm">
				Select a card from your hand, then choose a column below.
			</div>
			<div v-else class="flex flex-wrap items-center justify-center gap-3">
				<label class="flex items-center gap-2 text-sm text-slate-300">
					<input v-model="playFaceUp" type="checkbox" class="rounded border-slate-500" />
					Play face up
				</label>
				<span class="text-slate-500">→</span>
				<div class="flex gap-2">
					<button
						v-for="(label, colIdx) in COLUMN_LABELS"
						:key="colIdx"
						type="button"
						class="px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-slate-100 font-medium text-sm transition-colors"
						@click="playToColumn(colIdx)"
					>
						{{ label }}
					</button>
				</div>
				<button
					type="button"
					class="px-3 py-1.5 rounded text-sm text-slate-500 hover:text-slate-300"
					@click="selectedHandIndex = null"
				>
					Cancel
				</button>
			</div>
		</div>

		<!-- Hand -->
		<div class="mt-6">
			<h3 class="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Your hand</h3>
			<div class="flex flex-wrap justify-center gap-2 min-h-[100px]">
				<button
					v-for="(card, idx) in myHand"
					:key="'hidden' in card ? `h-${idx}` : (card as { id: string }).id"
					type="button"
					class="w-14 h-20 rounded-lg border-2 flex flex-col items-center justify-center text-xs font-medium transition-all"
					:class="
						selectedHandIndex === idx
							? 'bg-emerald-800/60 border-emerald-500 ring-2 ring-emerald-400/50'
							: isMyTurn
								? 'bg-slate-700 border-slate-500 hover:border-slate-400 text-slate-200'
								: 'bg-slate-800 border-slate-600 text-slate-400'
					"
					:disabled="!isMyTurn"
					@click="
						isMyTurn &&
						(selectedHandIndex === idx ? (selectedHandIndex = null) : (selectedHandIndex = idx))
					"
				>
					<template v-if="'hidden' in card">
						<span class="text-slate-500">?</span>
					</template>
					<template v-else>
						<span>{{ (card as { name?: string }).name ?? (card as { id: string }).id }}</span>
						<span class="text-[10px] text-slate-400 mt-0.5">{{
							(card as { value?: number }).value ?? '?'
						}}</span>
					</template>
				</button>
			</div>
		</div>
	</div>
</template>
