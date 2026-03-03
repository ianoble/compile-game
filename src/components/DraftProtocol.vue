<script setup lang="ts">
import { computed } from "vue";
import { useGame } from "@engine/client/index";
import type { CompileGameState } from "../logic/game-logic";
import { isCardHidden } from "@engine/client/index";

const { state, move, isMyTurn, playerID, ctx } = useGame();
const G = computed(() => state.value as unknown as CompileGameState | undefined);
const phase = computed(() => ctx.value?.phase ?? "");
const myId = computed(() => playerID.value ?? null);

const protocolPool = computed(() => G.value?.protocolPool ?? []);
const myProtocols = computed(() => {
	const pid = myId.value;
	if (!pid || !G.value?.players) return [];
	return G.value.players[pid]?.protocolCards ?? [];
});

const draftOrderLabel = computed(() => {
	if (!isMyTurn.value) return "Opponent's pick";
	const n = myProtocols.value.length;
	if (n < 1) return "Pick 1 protocol card";
	if (n < 3) return "Pick 2 protocol cards";
	return "Pick 1 protocol card";
});
</script>

<template>
	<div class="w-full max-w-2xl mx-auto space-y-6">
		<p class="text-center text-slate-400 text-sm">
			Draft protocol cards (1-2-2-1). You need 3 total. Click a card to draft it.
		</p>
		<div v-if="phase === 'draft'" class="flex items-center justify-center gap-2 text-sm">
			<span
				class="px-2 py-1 rounded font-medium"
				:class="isMyTurn ? 'bg-emerald-900/50 text-emerald-300' : 'bg-slate-700/50 text-slate-400'"
			>
				{{ draftOrderLabel }}
			</span>
		</div>
		<div class="grid grid-cols-2 md:grid-cols-3 gap-4">
			<div>
				<h3 class="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Pool</h3>
				<div class="flex flex-wrap gap-2 min-h-[80px]">
					<button
						v-for="(card, idx) in protocolPool"
						:key="isCardHidden(card) ? `hidden-${idx}` : (card as { id: string }).id"
						type="button"
						class="w-14 h-20 rounded-lg border-2 bg-slate-800 border-slate-600 hover:border-slate-500 flex flex-col items-center justify-center text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						:class="isMyTurn ? 'hover:bg-slate-700 cursor-pointer' : 'cursor-default'"
						:disabled="!isMyTurn"
						@click="move('draftProtocol', idx)"
					>
						<template v-if="!isCardHidden(card)">
							<span class="text-slate-200">{{ (card as { name?: string }).name ?? (card as { id: string }).id }}</span>
						</template>
						<template v-else>
							<span class="text-slate-500">?</span>
						</template>
					</button>
				</div>
			</div>
			<div class="md:col-span-2">
				<h3 class="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Your protocols ({{ myProtocols.length }}/3)</h3>
				<div class="flex flex-wrap gap-2 min-h-[80px]">
					<div
						v-for="(card, idx) in myProtocols"
						:key="(card as { id: string }).id"
						class="w-14 h-20 rounded-lg border-2 bg-slate-700 border-slate-500 flex flex-col items-center justify-center text-xs font-medium text-slate-200"
					>
						<template v-if="!isCardHidden(card)">
							{{ (card as { name?: string }).name ?? (card as { id: string }).id }}
						</template>
						<template v-else>?</template>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>
