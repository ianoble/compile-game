import { watch, onUnmounted, type Ref } from 'vue';
import { Client } from 'boardgame.io/client';
import { SocketIO } from 'boardgame.io/multiplayer';
import { gameDef, NUM_COLUMNS } from '../logic/game-logic';
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
		playCommandCard?: (columnIndex: number, handIndex: number, faceUp: boolean) => void;
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
			G?: { players?: Record<string, { hand?: unknown[] }> };
			ctx?: { phase?: string };
		};
		const hand = s.G?.players?.[botPlayerID]?.hand;
		const moves = (client as unknown as { moves?: ClientMoves }).moves;
		if (
			!hand?.length ||
			s.ctx?.phase !== 'play' ||
			!moves?.playCommandCard
		) return;
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
			client.subscribe((state) => {
				const ctx = state?.ctx as { phase?: string; currentPlayer: string; turn?: number; gameover?: unknown } | undefined;
				if (ctx?.gameover) return;
				const currentPlayer = ctx?.currentPlayer ?? '';
				const turn = ctx?.turn ?? -1;
				if (currentPlayer !== botPlayerID) return;
				if (turn === lastTurn && currentPlayer === lastCurrent) return;
				lastTurn = turn;
				lastCurrent = currentPlayer;
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
