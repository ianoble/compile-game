# @noble/bg-engine

A multiplayer board game engine built on top of [boardgame.io](https://boardgame.io) with Vue 3 composables, reusable components, and TypeScript-first design.

## Installation

This package lives inside the monorepo and is consumed via npm workspaces. No publishing required.

```jsonc
// consumer package.json
{
  "dependencies": {
    "@noble/bg-engine": "*"
  }
}
```

## Subpath Imports

| Import path              | What you get                                               |
| ------------------------ | ---------------------------------------------------------- |
| `@noble/bg-engine`       | Core types, `defineGame`, `prepareGame`, game registry      |
| `@noble/bg-engine/client`| Vue composables, components, Pinia store, session utils    |
| `@noble/bg-engine/styles`| Base CSS with design tokens and mobile-friendly defaults   |

## Creating a New Game

### 1. Define your state type

Create `packages/engine/src/games/<name>/types.ts`:

```ts
import type { BaseGameState } from '../../types/index.js';

export interface MyGameState extends BaseGameState {
  board: string[];
  score: number;
}
```

### 2. Create the boardgame.io Game object

Create `packages/engine/src/games/<name>/game.ts`:

```ts
import type { Game } from 'boardgame.io';
import type { MyGameState } from './types.js';

export const MyGame: Game<MyGameState> = {
  name: 'my-game',

  setup: (): MyGameState => ({
    board: Array(9).fill(''),
    score: 0,
    history: [],
  }),

  moves: {
    placePiece: ({ G, playerID }, position: number) => {
      G.board[position] = playerID ?? '';
    },
  },
};
```

### 3. Wrap with `defineGame`

Create `packages/engine/src/games/<name>/index.ts`:

```ts
import { defineGame } from '../../types/index.js';
import type { MyGameState } from './types.js';
import { MyGame } from './game.js';

export type { MyGameState };

export const myGameDef = defineGame<MyGameState>({
  id: 'my-game',
  displayName: 'My Game',
  minPlayers: 2,
  maxPlayers: 4,
  game: MyGame,

  // Optional: pre-move validation
  validateMove: (ctx, moveName, ...args) => {
    if (moveName === 'placePiece' && ctx.playerID !== ctx.currentPlayer) {
      return 'Not your turn';
    }
    return true;
  },

  // Optional: hide information from opponents
  stripSecretInfo: (G, playerID) => {
    return { ...G, secretField: undefined };
  },
});
```

### 4. Register the game

Add your definition to `packages/engine/src/games/registry.ts`:

```ts
import { myGameDef } from './my-game/index.js';

export const gameRegistry: GameDefinition[] = [
  myGameDef,  // games are also registered at runtime (e.g. server in-repo games)
];
```

### 5. Create a Board component

Create `packages/client/src/games/<name>/Board.vue`:

```vue
<script setup lang="ts">
import { useGame } from '@noble/bg-engine/client';
import type { MyGameState } from '@noble/bg-engine';

const { state, move, isMyTurn } = useGame<MyGameState>();
</script>

<template>
  <div>{{ state.board }}</div>
</template>
```

Register it in `packages/client/src/games/registry.ts`:

```ts
import Board from './my-game/Board.vue';

export const boardComponents: Record<string, Component> = {
  'my-game': Board,
};
```

### 6. Export from the engine barrel

Add your game's types and definition to `packages/engine/src/index.ts`:

```ts
export type { MyGameState } from './games/my-game/index.js';
export { myGameDef } from './games/my-game/index.js';
```

## Key Exports

### Core (`@noble/bg-engine`)

| Export                | Description                                      |
| --------------------- | ------------------------------------------------ |
| `BaseGameState`       | Base interface all game states must extend        |
| `GameDefinition`      | Metadata wrapper around a boardgame.io Game       |
| `defineGame<S>()`     | Type-safe factory for creating `GameDefinition`s  |
| `prepareGame(def)`    | Wraps a definition with validation and history    |
| `gameRegistry`        | Array of all registered game definitions          |
| `gameMap`             | `Record<id, GameDefinition>` for quick lookup     |
| `LogEntry`            | Type for game history log entries                 |
| `Card`, `VisibleCard` | Card types for hidden information system          |
| `isCardHidden(card)`  | Type guard for hidden vs visible cards            |
| `redactCards(cards)`  | Utility to strip card data for opponents          |

### Client (`@noble/bg-engine/client`)

| Export                   | Description                                    |
| ------------------------ | ---------------------------------------------- |
| `provideGameContext()`   | Call in App.vue to set up game state injection  |
| `useGame<S>()`           | Inject typed game state, moves, and helpers     |
| `provideToastContext()`  | Set up the toast notification system            |
| `useToast()`             | Show error/info toasts programmatically         |
| `provideCardDrag()`      | Set up drag-and-drop for cards                  |
| `useCardDrag()`          | Access drag state and register drop zones       |
| `provideCardInspect()`   | Set up card inspection overlay                  |
| `useCardInspect()`       | Inspect a card on right-click                   |
| `useGameStore()`         | Low-level Pinia store (prefer `useGame`)        |
| `saveSession()` / `loadSession()` | Persist player credentials to localStorage |
| `GameLog`                | Scrollable game history sidebar component       |
| `ToastOverlay`           | Global toast notification renderer              |
| `CardComponent`          | Base card with 3D flip, hover, drag support     |
| `CardDeck`               | Face-down deck display                          |
| `CardHand`               | Fan-layout hand with drag-to-play               |
| `CardTableau`            | Drop zone grid for played cards                 |
| `CardInspector`          | Full-screen card preview overlay                |
| `DragOverlay`            | Ghost card following pointer during drag        |

### Styles (`@noble/bg-engine/styles`)

Base CSS including:
- Box-model reset
- CSS custom properties (`--bg`, `--surface`, `--border`, `--text`, `--accent`, etc.)
- `touch-action: none` and `user-select: none` for interactive game surfaces
- `overscroll-behavior: contain` for game views
