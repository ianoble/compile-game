# Noble Board Game Template

This folder is a **generic app scaffold** for building games with the [@noble/bg-engine](https://github.com/your-org/noble-bg-engine) framework. Copy this template (e.g. via a `create-noble-game` script in the engine repo) to start a new game with lobby, join flow, auth, session persistence, and a minimal runnable game.

## What's included

- **App shell**: Vue 3 + Pinia + Vue Router, `NobleProvider`, engine styles.
- **Views**: Lobby (create game, list your games, open games, join with color), Join (claim seat + color), Game (header, turn cue, abandon vote, board area).
- **Auth**: `useAuth` (register/login, session sync to server, abandon voting). Works with a dev fallback when the server returns 501.
- **Stub game**: A minimal Golden-Ages–style game in `src/logic/game-logic.ts`: 4×4 board, claim territory with `placePiece(row, col)` or `takeGold()`; when the board is full, scoring uses Territory (1 VP per cell) and Gold (1 VP per 3). Exports `gameDef`, `PLAYER_COLORS`, `PlayerColor`, `setPlayerColor`, `getPlayerRankings`, and end-game breakdown for the score table.
- **Stub board**: `src/components/GameBoard.vue` — 4×4 grid, "Your gold" and "Take 3 gold" button, plus the same game-over score table and count-up animation as Golden Ages. Replace with your game’s board.
- **Stub bots**: `useBotPlayers` in composables is a no-op; replace with real bot logic if your game needs AI players.

## Using this template

### Option A: Template inside the-golden-ages repo

From the **the-golden-ages** repo root:

1. Install and run from the template folder:
   ```bash
   cd template
   npm install
   npm run dev
   ```
2. The template’s `vite.config.ts` and `tsconfig.json` point `@engine` at `../noble-bg-engine/packages/engine/src`. Ensure the engine is built (`npm run build` in the engine package if needed).

### Option B: Copy into the noble-bg-engine repo

When you copy this folder into the engine repo (e.g. `noble-bg-engine/packages/my-game/` or a standalone app that depends on the engine):

1. **Engine dependency**  
   In `package.json`, set the engine dependency to your workspace or local path, e.g.:
   - `"@noble/bg-engine": "file:../engine"` (if the engine package is at `packages/engine`).

2. **Vite alias**  
   In `vite.config.ts`, set the `@engine` alias to the engine source:
   ```ts
   '@engine': path.resolve(__dirname, '../engine/src'),
   ```
   (or the path to wherever the engine package lives relative to the template copy).

3. **TypeScript paths**  
   In `tsconfig.json`, update the `paths` so `@engine/client` and `@engine/*` resolve to the engine’s `src` directory (same relative path as in Vite).

4. Run:
   ```bash
   npm install
   npm run dev
   ```

## Extension points: building your game

1. **Game logic**  
   Replace `src/logic/game-logic.ts` (or split into `types.ts`, `game.ts`, `index.ts` and re-export from one entry). Keep exporting:
   - `gameDef` — your `defineGame(...)` result (id, displayName, description, min/max players, setupOptions, boardgame.io Game).
   - `PLAYER_COLORS` — array of player colors for the lobby/join color picker.
   - `PlayerColor` — type for those colors.

2. **Board UI**  
   Replace `src/components/GameBoard.vue` with your game’s board. It receives `headerHeight` and can emit `back-to-lobby` if needed. Use `useGame()` from `@engine/client` for state and moves.

3. **Bots (optional)**  
   If your game supports AI players, replace `src/composables/useBotPlayers.ts` with an implementation that connects bot clients and performs moves. The signature is `(matchID: Ref<string>, humanPlayerID: Ref<string>)`.

4. **Branding**  
   Update `index.html` title and favicon, and any app name references.

## Contract: what the shell expects from the game

| Export           | Used by              | Purpose                                                                 |
|------------------|----------------------|-------------------------------------------------------------------------|
| `gameDef`        | main, Lobby, Join, GameView | id, displayName, description, min/max players, setupOptions, game (boardgame.io) |
| `PLAYER_COLORS`  | LobbyView, JoinView  | Color picker for join/host (e.g. `['red','blue','green','yellow']`)     |
| `PlayerColor`    | LobbyView, JoinView  | Type for selected color                                                 |

Session, abandon vote, and API calls use `gameDef.id` and `gameDef.displayName`. Setup options are driven by `gameDef.setupOptions`. The game’s boardgame.io `setup` receives `setupData` built from those options.

## create-noble-game

If the engine repo provides a `create-noble-game` (or similar) script, it can copy this template into a new directory and optionally replace placeholders (game id, display name). The template is self-contained; no engine code is duplicated, only the Vue app that consumes the engine.
