<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from "vue";
import { useGame } from "@engine/client";
import { getPlayerRankings, BOARD_SIZE, type TemplateGameState } from "../logic/game-logic";

defineProps<{ headerHeight: number }>();
const emit = defineEmits<{ "back-to-lobby": [] }>();

const { state, move, isMyTurn, playerID } = useGame();
const G = computed(() => state.value as unknown as TemplateGameState | undefined);
const board = computed(() => G.value?.board ?? []);

function cellOwner(row: number, col: number): string | null {
	const b = board.value;
	if (!b[row]) return null;
	return b[row][col] ?? null;
}

// Game over overlay: score table with count-up animation (same pattern as Golden Ages)
const gameIsOver = computed(() => G.value?.endGameScored === true);
const gameOverDismissed = ref(false);

const finalRankings = computed(() => {
	if (!gameIsOver.value || !G.value) return [];
	return getPlayerRankings(G.value);
});

const finalScoreTableRows = computed(() => {
	if (!G.value?.endGameScoreBreakdown || !finalRankings.value.length) return [];
	const breakdown = G.value.endGameScoreBreakdown;
	const playerIds = finalRankings.value.map((r) => r.playerId);
	const firstPid = playerIds[0];
	const labels = (breakdown[firstPid] ?? []).map((item) => item.label);
	const rows: { label: string; vpsByPlayer: Record<string, number> }[] = [];
	for (const label of labels) {
		const vpsByPlayer: Record<string, number> = {};
		for (const pid of playerIds) {
			const item = (breakdown[pid] ?? []).find((e) => e.label === label);
			vpsByPlayer[pid] = item?.vp ?? 0;
		}
		rows.push({ label, vpsByPlayer });
	}
	return rows;
});

const scoreRevealCurrentIndex = ref(0);
const scoreRevealDisplayValue = ref(0);
const scoreTableRevealComplete = ref(false);
const SCORE_CELL_DURATION_MS = 420;
const SCORE_CELL_MIN_MS = 180;
const SCORE_CELL_MAX_MS = 700;

function getScoreCellIndex(rowIdx: number, colIdx: number): number {
	return rowIdx * finalRankings.value.length + colIdx;
}

let scoreRevealRaf = 0;
let scoreRevealStartTime = 0;

function tickScoreReveal(timestamp: number) {
	if (!scoreRevealStartTime) scoreRevealStartTime = timestamp;
	const elapsed = timestamp - scoreRevealStartTime;
	const rows = finalScoreTableRows.value;
	const numPlayers = finalRankings.value.length;
	const totalCells = rows.length * numPlayers;
	const currentIdx = scoreRevealCurrentIndex.value;
	if (currentIdx >= totalCells) {
		scoreTableRevealComplete.value = true;
		return;
	}
	const rowIdx = Math.floor(currentIdx / numPlayers);
	const colIdx = currentIdx % numPlayers;
	const targetValue = rows[rowIdx]?.vpsByPlayer[finalRankings.value[colIdx]?.playerId ?? ""] ?? 0;
	const duration = Math.min(
		SCORE_CELL_MAX_MS,
		Math.max(SCORE_CELL_MIN_MS, SCORE_CELL_DURATION_MS + targetValue * 12)
	);
	const progress = Math.min(1, elapsed / duration);
	const easeOut = 1 - (1 - progress) * (1 - progress);
	scoreRevealDisplayValue.value = Math.round(easeOut * targetValue);
	if (progress >= 1) {
		scoreRevealCurrentIndex.value = currentIdx + 1;
		scoreRevealStartTime = timestamp;
		scoreRevealDisplayValue.value = 0;
		if (currentIdx + 1 < totalCells) {
			scoreRevealRaf = requestAnimationFrame(tickScoreReveal);
		} else {
			scoreTableRevealComplete.value = true;
		}
		return;
	}
	scoreRevealRaf = requestAnimationFrame(tickScoreReveal);
}

function startScoreTableReveal() {
	scoreRevealCurrentIndex.value = 0;
	scoreRevealDisplayValue.value = 0;
	scoreTableRevealComplete.value = false;
	scoreRevealStartTime = 0;
	if (finalScoreTableRows.value.length && finalRankings.value.length) {
		scoreRevealRaf = requestAnimationFrame(tickScoreReveal);
	} else {
		scoreTableRevealComplete.value = true;
	}
}

watch(
	[gameIsOver, gameOverDismissed],
	([over, dismissed]) => {
		if (!over || dismissed) return;
		const t = setTimeout(() => startScoreTableReveal(), 320);
		return () => clearTimeout(t);
	}
);

onUnmounted(() => {
	if (scoreRevealRaf) cancelAnimationFrame(scoreRevealRaf);
});

const PLAYER_COLOR_CLASSES: Record<string, string> = {
	red: "bg-red-500",
	blue: "bg-blue-500",
	green: "bg-green-500",
	yellow: "bg-yellow-400",
};

const myGold = computed(() => {
	const pid = playerID?.value;
	if (!G.value?.players || pid == null) return 0;
	return G.value.players[pid]?.gold ?? 0;
});

const boardIndices = Array.from({ length: BOARD_SIZE }, (_, i) => i);
</script>

<template>
	<div class="w-full max-w-lg mx-auto space-y-6">
		<p class="text-center text-slate-400 text-sm">
			Claim cells or take gold. When the board is full, territory and gold score like Golden Ages.
		</p>
		<div v-if="G?.players" class="flex justify-center gap-4 text-sm">
			<span class="text-slate-400">Your gold: <strong class="text-amber-300 tabular-nums">{{ myGold }}</strong></span>
			<button
				v-if="!gameIsOver && isMyTurn"
				type="button"
				class="px-3 py-1 rounded bg-amber-700 hover:bg-amber-600 text-amber-100 font-medium transition-colors"
				@click="move('takeGold')"
			>
				Take 3 gold (skip placing)
			</button>
		</div>
		<div
			class="grid gap-1.5 w-fit mx-auto"
			:style="{ gridTemplateColumns: `repeat(${BOARD_SIZE}, 56px)`, gridTemplateRows: `repeat(${BOARD_SIZE}, 56px)` }"
		>
			<template v-for="row in boardIndices" :key="'r' + row">
				<template v-for="col in boardIndices" :key="'c' + row + '-' + col">
					<button
						type="button"
						class="w-full h-full rounded-lg border-2 transition-colors flex items-center justify-center text-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed"
						:class="
							cellOwner(row, col)
								? [PLAYER_COLOR_CLASSES[G?.players[cellOwner(row, col)!]?.color ?? ''] ?? 'bg-slate-600', 'border-slate-500 text-white']
								: isMyTurn && !gameIsOver
									? 'bg-slate-800 border-slate-600 hover:bg-slate-700 hover:border-slate-500 text-slate-400'
									: 'bg-slate-800/60 border-slate-700 text-slate-500'
						"
						:disabled="!isMyTurn || gameIsOver || cellOwner(row, col) !== null"
						@click="move('placePiece', row, col)"
					>
						{{ cellOwner(row, col) !== null ? (G?.players[cellOwner(row, col)!]?.color?.charAt(0) ?? '') : '' }}
					</button>
				</template>
			</template>
		</div>
	</div>

	<!-- Game Over: score table with count-up animation -->
	<div
		v-if="gameIsOver && !gameOverDismissed"
		class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center"
	>
		<div class="bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl p-8 max-w-2xl w-full mx-4">
			<h2 class="text-2xl font-bold text-amber-300 text-center mb-2">Game Over</h2>
			<p class="text-amber-200/90 text-sm text-center mb-6 font-medium">Final score</p>
			<div class="overflow-x-auto">
				<table class="w-full text-sm border-collapse min-w-[280px]">
					<thead>
						<tr class="border-b border-slate-600">
							<th class="text-left py-2 pr-3 text-slate-400 font-medium">Score</th>
							<th
								v-for="(r, idx) in finalRankings"
								:key="r.playerId"
								class="py-2 px-2 text-center font-medium"
								:class="idx === 0 ? 'text-amber-300' : 'text-slate-300'"
							>
								<div class="flex items-center justify-center gap-1.5">
									<span
										class="w-3 h-3 rounded-full shrink-0"
										:class="PLAYER_COLOR_CLASSES[G?.players[r.playerId]?.color ?? '']"
									/>
									<span class="capitalize">{{ G?.players[r.playerId]?.color ?? '' }}</span>
									<span v-if="idx === 0" class="text-amber-400">★</span>
								</div>
							</th>
						</tr>
					</thead>
					<tbody>
						<tr
							v-for="(row, rowIdx) in finalScoreTableRows"
							:key="row.label"
							class="border-b border-slate-700/60"
							:class="row.label === 'Final score' ? 'border-t-2 border-amber-600/50 bg-slate-800/50' : ''"
						>
							<td class="py-1.5 pr-3 text-slate-400 font-medium">{{ row.label }}</td>
							<td
								v-for="(r, colIdx) in finalRankings"
								:key="r.playerId"
								class="py-1.5 px-2 text-center tabular-nums transition-all duration-150 rounded"
								:class="[
									row.label === 'Final score' ? 'text-amber-200 font-bold' : 'text-slate-200',
									getScoreCellIndex(rowIdx, colIdx) === scoreRevealCurrentIndex && !scoreTableRevealComplete
										? 'score-cell-active bg-amber-500/25 text-amber-100'
										: '',
								]"
							>
								<template v-if="getScoreCellIndex(rowIdx, colIdx) < scoreRevealCurrentIndex">
									{{ row.vpsByPlayer[r.playerId] ?? 0 }}
								</template>
								<template v-else-if="getScoreCellIndex(rowIdx, colIdx) === scoreRevealCurrentIndex && !scoreTableRevealComplete">
									{{ scoreRevealDisplayValue }}
								</template>
								<template v-else>
									{{ scoreTableRevealComplete ? (row.vpsByPlayer[r.playerId] ?? 0) : 0 }}
								</template>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
			<div class="flex justify-center gap-3 mt-6">
				<button
					class="px-5 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 text-white font-medium transition-colors cursor-pointer"
					@click="emit('back-to-lobby')"
				>
					Back to Lobby
				</button>
				<button
					class="px-5 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium transition-colors cursor-pointer"
					@click="gameOverDismissed = true"
				>
					View Board
				</button>
			</div>
		</div>
	</div>
</template>

<style scoped>
.score-cell-active {
	animation: score-cell-pulse 0.6s ease-in-out infinite;
}
@keyframes score-cell-pulse {
	0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.25); }
	50% { box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.15); }
}
</style>
