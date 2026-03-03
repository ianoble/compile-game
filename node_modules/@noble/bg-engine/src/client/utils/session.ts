/** Persisted player session for a specific match. */
export interface PlayerSession {
  playerID: string;
  credentials: string;
  playerName: string;
  /** Optional player color chosen when creating or joining (e.g. 'red', 'blue'). */
  playerColor?: string;
}

const PREFIX = 'bgf:session:';

function key(gameId: string, matchID: string): string {
  return `${PREFIX}${gameId}:${matchID}`;
}

export function saveSession(
  gameId: string,
  matchID: string,
  session: PlayerSession,
): void {
  localStorage.setItem(key(gameId, matchID), JSON.stringify(session));
}

export function loadSession(
  gameId: string,
  matchID: string,
): PlayerSession | null {
  const raw = localStorage.getItem(key(gameId, matchID));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlayerSession;
  } catch {
    return null;
  }
}

export function clearSession(gameId: string, matchID: string): void {
  localStorage.removeItem(key(gameId, matchID));
}
