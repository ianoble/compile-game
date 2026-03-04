<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useGame, useTurnNotifications, loadSession, clearSession } from '@engine/client/index';
import { gameDef, type CompileGameState } from '../logic/game-logic';
import { useBotPlayers } from '../composables/useBotPlayers';
import GameBoard from '../components/GameBoard.vue';
import DraftProtocol from '../components/DraftProtocol.vue';
import { SERVER_URL } from '../config';
import {
	deleteServerSession,
	voteToAbandon,
	cancelAbandonVote,
	getAbandonVoteStatus,
	type AbandonVoteStatus,
} from '../composables/useAuth';

const props = defineProps<{ matchID: string; playerID: string }>();
const router = useRouter();

const { isConnected, isMyTurn, state, gameover, reconnecting, connect, disconnect, playerID, ctx } =
	useGame();

const G = computed(() => state.value as unknown as CompileGameState | undefined);
// Use ctx.phase when present; infer from G when server doesn't send phase (e.g. some boardgame.io setups)
const phase = computed(() => {
	const p = ctx.value?.phase;
	if (p === 'draft' || p === 'play') return p;
	const g = G.value;
	if (!g || typeof g !== 'object') {
		// Connected but no G yet or G empty → show draft so UI isn't stuck on "Loading"
		if (isConnected.value) return 'draft';
		return '';
	}
	// Play: columns exist and have protocol cards placed (play phase has started)
	if (Array.isArray(g.columns) && g.columns.length === 3) {
		const col = g.columns[0];
		if (col && (col.protocol?.[0] != null || col.protocol?.[1] != null)) return 'play';
	}
	// Draft: we have game state but protocol slots not filled yet
	if (Array.isArray(g.protocolPool)) return 'draft';
	// Fallback: state has our shape (history) and columns not filled → assume draft
	if (Array.isArray((g as CompileGameState).history) && (!Array.isArray(g.columns) || g.columns.length === 0)) return 'draft';
	if (Array.isArray(g.columns) && g.columns.length === 3) return 'play';
	// Any other state shape when connected → show draft
	return 'draft';
});

const {
	requestPermission: requestTurnNotifications,
	permission: notificationPermission,
	supported: notificationsSupported,
} = useTurnNotifications({
	displayName: gameDef.displayName,
	icon: '/favicon.ico',
});

const headerEl = ref<HTMLElement | null>(null);
const headerHeight = ref(72);

function measureHeader() {
	if (headerEl.value) {
		headerHeight.value = headerEl.value.offsetHeight;
	}
}

const turnCueMessage = ref('');
const turnCueVisible = ref(false);
const prevIsMyTurn = ref(false);
let cueTimeout: ReturnType<typeof setTimeout> | null = null;
const CUE_DURATION_MS = 2500;

async function onEnableTurnNotifications() {
	const p = await requestTurnNotifications();
	if (p === 'granted') {
		try {
			const n = new Notification(gameDef.displayName, {
				body: "You'll get notified when it's your turn.",
				icon: '/favicon.ico',
				tag: 'notify-on',
			});
			setTimeout(() => n.close(), 4000);
		} catch {
			// ignore
		}
	}
	closeGameMenu();
}

watch(
	isMyTurn,
	newTurn => {
		if (gameover.value || reconnecting.value) return;
		const wasMyTurn = prevIsMyTurn.value;
		prevIsMyTurn.value = newTurn;
		if (cueTimeout) clearTimeout(cueTimeout);
		cueTimeout = null;
		if (!newTurn) {
			turnCueVisible.value = false;
			return;
		}
		if (newTurn && !wasMyTurn) {
			turnCueMessage.value = 'Your turn!';
			turnCueVisible.value = true;
			cueTimeout = setTimeout(() => {
				turnCueVisible.value = false;
				cueTimeout = null;
			}, CUE_DURATION_MS);
		}
	},
	{ immediate: true }
);

const confirmingAbandon = ref(false);
const gameMenuOpen = ref(false);

function closeGameMenu() {
	gameMenuOpen.value = false;
}

function onClickOutsideMenu(e: MouseEvent) {
	const target = e.target as HTMLElement;
	if (!target.closest('.game-menu-container')) {
		closeGameMenu();
	}
}

const abandonVoteStatus = ref<AbandonVoteStatus | null>(null);
const iHaveVoted = computed(() => {
	if (!abandonVoteStatus.value) return false;
	const myName = localStorage.getItem('bgf:playerName') ?? '';
	return abandonVoteStatus.value.voters.includes(myName);
});

const isMultiHuman = computed(() => {
	const botCredsKey = `bgf:bots:${gameDef.id}:${props.matchID}`;
	const botCreds = JSON.parse(localStorage.getItem(botCredsKey) || '{}');
	const numBots = Object.keys(botCreds).length;
	const totalPlayers = G.value ? Object.keys(G.value.players).length : 0;
	return totalPlayers - numBots >= 2;
});

let votePollTimer: ReturnType<typeof setInterval> | null = null;

function startVotePolling() {
	stopVotePolling();
	pollVoteStatus();
	votePollTimer = setInterval(pollVoteStatus, 3000);
}

function stopVotePolling() {
	if (votePollTimer) {
		clearInterval(votePollTimer);
		votePollTimer = null;
	}
}

async function pollVoteStatus() {
	const status = await getAbandonVoteStatus(gameDef.id, props.matchID);
	abandonVoteStatus.value = status;
	if (status?.allAgreed) {
		stopVotePolling();
		await abandonGame();
	}
}

const matchIDRef = computed(() => props.matchID);
const playerIDRef = computed(() => props.playerID);
useBotPlayers(matchIDRef, playerIDRef);

onMounted(() => {
	const session = loadSession(gameDef.id, props.matchID);
	const creds = session?.playerID === props.playerID ? session.credentials : undefined;
	connect(gameDef.id, props.matchID, props.playerID, creds);
	startVotePolling();
	document.addEventListener('click', onClickOutsideMenu);
	nextTick(measureHeader);
	setTimeout(() => requestTurnNotifications(), 2000);
});

watch(isMyTurn, () => nextTick(measureHeader));

onUnmounted(() => {
	if (cueTimeout) clearTimeout(cueTimeout);
	disconnect();
	stopVotePolling();
	document.removeEventListener('click', onClickOutsideMenu);
});

async function handleAbandonClick() {
	if (!isMultiHuman.value) {
		confirmingAbandon.value = true;
		return;
	}
	const status = await voteToAbandon(gameDef.id, props.matchID);
	if (status) {
		abandonVoteStatus.value = status;
		if (status.allAgreed) {
			await abandonGame();
		}
	}
}

async function handleAgreeVote() {
	const status = await voteToAbandon(gameDef.id, props.matchID);
	if (status) {
		abandonVoteStatus.value = status;
		if (status.allAgreed) {
			await abandonGame();
		}
	}
}

async function handleCancelVote() {
	await cancelAbandonVote(gameDef.id, props.matchID);
	abandonVoteStatus.value = null;
}

async function abandonGame() {
	stopVotePolling();
	const session = loadSession(gameDef.id, props.matchID);
	if (!session) return;

	try {
		await fetch(`${SERVER_URL}/games/${gameDef.id}/${props.matchID}/leave`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				playerID: session.playerID,
				credentials: session.credentials,
			}),
		});

		const botCredsKey = `bgf:bots:${gameDef.id}:${props.matchID}`;
		const botCreds = JSON.parse(localStorage.getItem(botCredsKey) || '{}');
		const botPlayerIDs = Object.keys(botCreds);
		if (botPlayerIDs.length > 0) {
			for (const botPid of botPlayerIDs) {
				try {
					await fetch(`${SERVER_URL}/games/${gameDef.id}/${props.matchID}/leave`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ playerID: botPid, credentials: botCreds[botPid] }),
					});
				} catch {
					/* best effort */
				}
			}
			localStorage.removeItem(botCredsKey);
		}
	} catch {
		// Clean up locally even if the server call fails
	}

	disconnect();
	clearSession(gameDef.id, props.matchID);
	await deleteServerSession(gameDef.id, props.matchID);
	router.push('/');
}
</script>

<template>
	<div class="min-h-screen flex flex-col items-center" style="background: var(--cyber-bg);">
		<div
			ref="headerEl"
			class="fixed top-0 left-0 right-0 z-40 border-b border-cyan-500/20"
			style="background: var(--cyber-surface);"
		>
			<div
				class="max-w-5xl mx-auto flex flex-wrap md:flex-nowrap items-center justify-between px-3 md:px-6 py-1.5 md:py-2 gap-x-3 gap-y-0.5"
			>
				<router-link
					to="/"
					class="text-xs md:text-sm text-cyan-400/80 hover:text-cyan-300 transition-colors shrink-0 font-display"
				>
					&larr; Back
				</router-link>

				<div class="flex flex-col items-center order-first md:order-none w-full md:w-auto">
					<div class="relative game-menu-container my-1 md:my-2">
						<button
							class="flex items-center gap-1 text-sm md:text-lg font-semibold text-cyan-100 leading-tight hover:text-cyan-300 transition-colors font-display"
							@click.stop="gameMenuOpen = !gameMenuOpen"
						>
							{{ gameDef.displayName }}
							<svg
								class="w-3 h-3 md:w-4 md:h-4 text-cyan-500/70 transition-transform"
								:class="gameMenuOpen ? 'rotate-180' : ''"
								viewBox="0 0 20 20"
								fill="currentColor"
							>
								<path
									fill-rule="evenodd"
									d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
									clip-rule="evenodd"
								/>
							</svg>
						</button>
						<div
							v-if="gameMenuOpen"
							class="absolute top-full mt-1 left-1/2 -translate-x-1/2 rounded-lg shadow-xl py-1 min-w-[180px] z-50 cyber-panel border-cyan-500/30"
							style="background: var(--cyber-panel);"
						>
							<button
								v-if="notificationsSupported && notificationPermission !== 'granted'"
								type="button"
								class="flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-200 transition-colors w-full text-left"
								@click="onEnableTurnNotifications"
							>
								<svg
									class="w-4 h-4 text-slate-400"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
									<path d="M13.73 21a2 2 0 0 1-3.46 0" />
								</svg>
								Notify when it's my turn
							</button>
							<p
								v-else-if="notificationsSupported && notificationPermission === 'granted'"
								class="flex items-center gap-2 px-4 py-2 text-sm text-green-400"
							>
								<svg
									class="w-4 h-4"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
									<polyline points="22 4 12 14.01 9 11.01" />
								</svg>
								Turn notifications on
							</p>
						</div>
					</div>
					<div
						v-if="G"
						class="flex items-center gap-2 md:gap-3 text-[10px] md:text-xs mb-0.5 md:mb-1 min-h-5 md:min-h-6"
					>
						<template v-if="isMyTurn">
							<span class="text-cyan-400 font-medium animate-pulse" style="text-shadow: 0 0 8px rgba(34, 211, 238, 0.6);">Your turn</span>
						</template>
						<template v-else>
							<span class="text-slate-500">Opponent's turn</span>
						</template>
					</div>
				</div>

				<div class="flex items-center gap-2 md:gap-3 shrink-0">
					<span
						class="px-2 md:px-2.5 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs border"
						:class="isConnected ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'"
						>{{ isConnected ? 'Connected' : 'Connecting...' }}</span
					>
					<button
						class="text-[10px] md:text-xs text-red-400/80 hover:text-red-300 transition-colors"
						@click="handleAbandonClick"
					>
						Abandon
					</button>
				</div>
			</div>
		</div>

		<div :style="{ height: headerHeight + 8 + 'px' }" />

		<Transition name="cue-fade">
			<div
				v-if="turnCueVisible && turnCueMessage"
				class="fixed left-0 right-0 z-20 flex justify-center pointer-events-none"
				:style="{ top: headerHeight + 12 + 'px' }"
			>
				<div
					class="px-6 py-2.5 rounded-lg font-semibold text-center text-sm md:text-base font-display text-cyan-100 border border-cyan-500/50"
					style="background: rgba(6, 78, 99, 0.9); box-shadow: 0 0 20px rgba(34, 211, 238, 0.4);"
				>
					{{ turnCueMessage }}
				</div>
			</div>
		</Transition>

		<div class="w-full flex flex-col min-h-0">
			<div
				class="w-full flex flex-col items-center p-2 md:p-6 flex-1"
				:class="{ 'pb-[200px]': !reconnecting && phase === 'play' }"
			>
				<div v-if="gameover" class="mb-6 text-center font-display">
				<p v-if="gameover.winner === playerID" class="text-2xl font-bold text-green-400" style="text-shadow: 0 0 12px rgba(74, 222, 128, 0.5);">
					You win!
				</p>
				<p v-else-if="gameover.winner !== undefined" class="text-2xl font-bold text-red-400" style="text-shadow: 0 0 12px rgba(248, 113, 113, 0.4);">
					You lose.
				</p>
				<p v-else class="text-2xl font-bold text-slate-400">It's a draw.</p>
			</div>

			<div v-if="reconnecting" class="text-center">
				<p class="text-cyan-400/80">Reconnecting...</p>
			</div>

			<DraftProtocol v-if="!reconnecting && phase === 'draft'" />
			<GameBoard
				v-else-if="!reconnecting && phase === 'play'"
				:header-height="headerHeight"
				@back-to-lobby="router.push('/')"
			/>
			<div v-else-if="!reconnecting && !isConnected" class="text-center text-slate-400 space-y-2">
				<p>Connecting to game...</p>
				<p class="text-xs">Make sure the game server is running (e.g. on port 8000).</p>
			</div>
			<div v-else-if="!reconnecting" class="text-center text-slate-400 space-y-3 max-w-md">
				<p>Loading game...</p>
				<p class="text-xs text-left">
					You should see the <strong>draft screen</strong>: 12 protocol cards to pick from, and &quot;Your protocols (0/3)&quot;.
					If this never loads, the server may not be sending game state. Ensure the backend is running and registered the Compile game with phases.
				</p>
			</div>
			</div>
			<div
				v-if="phase === 'play' && !reconnecting"
				id="game-hand-tray"
				class="game-hand-tray fixed bottom-0 left-0 right-0 z-10 min-h-[180px] pointer-events-none"
			/>
		</div>

		<Teleport to="body">
			<div
				v-if="abandonVoteStatus"
				class="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
			>
				<div
					class="rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl cyber-panel border-cyan-500/30"
					style="background: var(--cyber-panel);"
				>
					<h3 class="text-lg font-semibold text-cyan-100 mb-1 font-display">Abandon Vote</h3>
					<p class="text-sm text-slate-400 mb-5">
						{{ abandonVoteStatus.voters.length }} of {{ abandonVoteStatus.totalHumans }} players
						want to abandon.
					</p>
					<ul class="space-y-2 mb-6">
						<li
							v-for="voter in abandonVoteStatus.voters"
							:key="voter"
							class="flex items-center gap-2 text-sm"
						>
							<span
								class="w-4 h-4 rounded bg-red-600/30 border border-red-500/50 flex items-center justify-center text-[10px] text-red-400"
								>&#10003;</span
							>
							<span class="text-slate-300">{{ voter }}</span>
						</li>
					</ul>
					<div class="flex gap-3">
						<template v-if="iHaveVoted">
							<button
								class="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-cyan-200 hover:text-cyan-100 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 transition-colors"
								@click="handleCancelVote"
							>
								Cancel My Vote
							</button>
						</template>
						<template v-else>
							<button
								class="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-500 border border-red-500/50 transition-colors"
								@click="handleAgreeVote"
							>
								Agree to Abandon
							</button>
						</template>
					</div>
				</div>
			</div>
		</Teleport>

		<Teleport to="body">
			<div
				v-if="confirmingAbandon"
				class="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
				@click.self="confirmingAbandon = false"
			>
				<div
					class="rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl cyber-panel border-cyan-500/30"
					style="background: var(--cyber-panel);"
				>
					<h3 class="text-lg font-semibold text-cyan-100 mb-2 font-display">Abandon game?</h3>
					<p class="text-sm text-slate-400 mb-6">
						This will remove you from the game. This action cannot be undone.
					</p>
					<div class="flex justify-end gap-3">
						<button
							class="px-4 py-2 rounded-lg text-sm text-cyan-200 hover:text-cyan-100 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 transition-colors"
							@click="confirmingAbandon = false"
						>
							Cancel
						</button>
						<button
							class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-500 border border-red-500/50 transition-colors"
							@click="abandonGame"
						>
							Abandon
						</button>
					</div>
				</div>
			</div>
		</Teleport>
	</div>
</template>

<style scoped>
.cue-fade-enter-active,
.cue-fade-leave-active {
	transition: opacity 0.3s ease;
}
.cue-fade-enter-from,
.cue-fade-leave-to {
	opacity: 0;
}
</style>
