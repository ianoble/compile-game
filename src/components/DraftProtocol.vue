<script setup lang="ts">
import { computed } from 'vue';
import { useGame } from '@engine/client/index';
import type { CompileGameState } from '../logic/game-logic';
import { getProtocolDetails } from '../logic/compile-cards';
import { isCardHidden } from '@engine/client/index';
import type { Card } from '@engine/client/index';

const { state, move, isMyTurn, playerID, ctx } = useGame();
const G = computed(() => state.value as unknown as CompileGameState | undefined);
const phase = computed(() => ctx.value?.phase ?? '');
const myId = computed(() => playerID.value ?? null);

const protocolPool = computed(() => G.value?.protocolPool ?? []);

/** Pool entries sorted by card id (protocol-1 … protocol-12), with original index for the move. */
const protocolPoolSorted = computed(() => {
	const pool = protocolPool.value;
	return pool
		.map((card, originalIndex) => ({ card, originalIndex }))
		.sort((a, b) => {
			const idA = typeof a.card === 'object' && a.card && 'id' in a.card ? String((a.card as { id: string }).id) : '';
			const idB = typeof b.card === 'object' && b.card && 'id' in b.card ? String((b.card as { id: string }).id) : '';
			return idA.localeCompare(idB, undefined, { numeric: true });
		});
});

const myProtocols = computed(() => {
	const pid = myId.value;
	if (!pid || !G.value?.players) return [];
	return G.value.players[pid]?.protocolCards ?? [];
});

/** Your drafted protocols sorted by card id. */
const myProtocolsSorted = computed(() => {
	return [...myProtocols.value].sort((a, b) => {
		const idA = typeof a === 'object' && a && 'id' in a ? String((a as { id: string }).id) : '';
		const idB = typeof b === 'object' && b && 'id' in b ? String((b as { id: string }).id) : '';
		return idA.localeCompare(idB, undefined, { numeric: true });
	});
});

const draftOrderLabel = computed(() => {
	if (!isMyTurn.value) return "Opponent's pick";
	const n = myProtocols.value.length;
	if (n < 1) return 'Pick 1 protocol card';
	if (n < 3) return 'Pick 2 protocol cards';
	return 'Pick 1 protocol card';
});

function getCardKey(card: unknown, idx: number): string {
	return isCardHidden(card as Card) ? `hidden-${idx}` : (card && typeof card === 'object' && 'id' in card ? String((card as { id: string }).id) : `hidden-${idx}`);
}

function getCardLabel(card: unknown): string {
	if (!card || typeof card !== 'object') return '?';
	const c = card as { name?: string; id?: string };
	return c.name ?? c.id ?? '?';
}

function getProtocolId(card: unknown): string | null {
	if (!card || typeof card !== 'object' || !('id' in card)) return null;
	return String((card as { id: string }).id);
}

function protocolDetailsForCard(card: unknown): { name: string; top: string; bottom: string } {
	const id = getProtocolId(card);
	return id ? getProtocolDetails(id) : { name: getCardLabel(card), top: '', bottom: '' };
}
</script>

<template>
	<div class="w-full max-w-2xl mx-auto space-y-6">
		<p class="text-center text-slate-400 text-sm">
			Draft protocol cards (1-2-2-1). You need 3 total. Click a card to draft it.
		</p>
		<div v-if="phase === 'draft'" class="flex items-center justify-center gap-2 text-sm">
			<span
				class="px-2 py-1 rounded font-medium border font-display"
				:class="isMyTurn ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50' : 'bg-slate-800/50 text-slate-500 border-slate-600'"
			>
				{{ draftOrderLabel }}
			</span>
		</div>
		<!-- Pool: full-width 4×3 grid so cards don't overlap -->
		<div class="w-full">
			<h3 class="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Pool</h3>
			<div
				v-if="protocolPoolSorted.length === 0"
				class="flex flex-wrap gap-2 min-h-[80px] rounded-lg border border-dashed p-4 items-center justify-center"
				style="border-color: rgba(34, 211, 238, 0.3); background: var(--cyber-panel);"
			>
				<p class="text-slate-500 text-sm text-center">
					No cards in pool. Create a new game from the lobby so the draft loads correctly.
				</p>
			</div>
			<div v-else class="grid grid-cols-4 gap-3">
				<button
					v-for="(entry, idx) in protocolPoolSorted"
					:key="getCardKey(entry.card, idx)"
					type="button"
					class="draft-pool-card card-protocol rounded-xl border-2 flex flex-col items-center justify-between text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-0 w-full px-1.5 py-1"
					style="background: var(--cyber-panel); border-color: rgba(34, 211, 238, 0.35);"
					:class="isMyTurn ? 'hover:border-cyan-400/60 cursor-pointer hover:shadow-[0_0_14px_rgba(34,211,238,0.35)]' : 'cursor-default'"
					:disabled="!isMyTurn"
					@click="move('draftProtocol', entry.originalIndex)"
				>
					<template v-if="!isCardHidden(entry.card)">
						<template v-if="getProtocolId(entry.card)">
							<span v-if="protocolDetailsForCard(entry.card).top" class="protocol-card-top w-full truncate">{{ protocolDetailsForCard(entry.card).top }}</span>
							<span v-else class="flex-1 min-h-[0.5rem]"></span>
							<span class="protocol-card-name text-center truncate w-full flex-shrink-0">{{ protocolDetailsForCard(entry.card).name }}</span>
							<span v-if="protocolDetailsForCard(entry.card).bottom" class="protocol-card-bottom w-full truncate">{{ protocolDetailsForCard(entry.card).bottom }}</span>
							<span v-else class="flex-1 min-h-[0.5rem]"></span>
						</template>
						<template v-else>
							<span class="text-slate-200 px-1 text-center truncate w-full">{{ getCardLabel(entry.card) }}</span>
						</template>
					</template>
					<template v-else>
						<span class="text-slate-500 text-lg">?</span>
					</template>
				</button>
			</div>
		</div>
		<!-- Your protocols -->
		<div class="w-full">
			<h3 class="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide mt-6">
Your protocols ({{ myProtocols.length }}/3)
				</h3>
				<div class="flex flex-wrap gap-3 min-h-[8.5rem]">
					<div
						v-for="(card, idx) in myProtocolsSorted"
						:key="getCardKey(card, idx)"
						class="card-protocol rounded-xl border-2 flex flex-col items-center justify-between text-sm font-medium text-slate-200 shrink-0 px-1.5 py-1"
						style="background: var(--cyber-panel); border-color: rgba(34, 211, 238, 0.5); box-shadow: 0 0 10px rgba(34, 211, 238, 0.15);"
					>
						<template v-if="!isCardHidden(card)">
							<template v-if="getProtocolId(card)">
								<span v-if="protocolDetailsForCard(card).top" class="protocol-card-top w-full truncate">{{ protocolDetailsForCard(card).top }}</span>
								<span v-else class="flex-1 min-h-[0.5rem]"></span>
								<span class="protocol-card-name text-center truncate w-full flex-shrink-0">{{ protocolDetailsForCard(card).name }}</span>
								<span v-if="protocolDetailsForCard(card).bottom" class="protocol-card-bottom w-full truncate">{{ protocolDetailsForCard(card).bottom }}</span>
								<span v-else class="flex-1 min-h-[0.5rem]"></span>
							</template>
							<template v-else>
								<span class="text-center">{{ getCardLabel(card) }}</span>
							</template>
						</template>
						<template v-else>
							<span class="text-slate-500 text-lg">?</span>
						</template>
					</div>
				</div>
		</div>
	</div>
</template>

<style scoped>
.draft-pool-card {
	aspect-ratio: 3.5 / 2.5;
	height: auto;
}
</style>
