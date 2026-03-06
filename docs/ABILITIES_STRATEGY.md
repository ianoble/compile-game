# Ability Implementation Strategy

## Recommended approach: **keyword-first (by effect type)**

Implement by **effect type / keyword**, not protocol-by-protocol.

### Why keyword-first?

1. **One implementation, many cards** – e.g. "Flip 1 card" with targeting covers every card that says "flip 1 …" across Spirit, Death, Fire, etc. Protocol-by-protocol would implement the same flip logic multiple times.
2. **Clear gaps** – You can list "flip: 15 cards, delete: 12, shift: 8" and implement in order of card count or gameplay impact.
3. **Easier testing** – "All flip effects work" is one test surface; "All Death cards work" mixes discard, delete, flip, etc.
4. **Matches the engine** – `applyEffect` and `EffectType` are already keyword-based (draw, discard, delete, return, shift, flip).

### When to use protocol

- **QA / regression** – After adding a keyword, test one card per protocol that uses it.
- **Prioritization** – If you care about a specific protocol (e.g. Fire), implement the keywords that protocol uses first.
- **Draft balance** – Protocol order doesn't affect ability coverage; it's for draft UX only.

### Current implementation status (effect types)

| Effect type            | Server + client | Notes |
|------------------------|-----------------|--------|
| `draw`                 | Yes             | Mandatory and optional ("may draw") |
| `discard`              | Yes             | You / opponent, single or multi |
| `discardThenDraw`      | Yes             | "Discard 1 or more. Draw amount + 1." |
| `drawThenDiscard`      | Yes             | "Draw N. Your opponent discards M." |
| `discardThenReturn`    | Yes             | "Discard 1. If you do, return 1." |
| `discardThenDelete`    | Yes             | "Discard 1. If you do, delete 1." |
| `delete`               | Partial         | In EffectType; targeting UI not wired for all cases |
| `return`               | Partial         | Same |
| `shift`                | Partial         | Same |
| `flip`                 | Partial         | Same |
| Play from deck / reveal / refresh / rearrange | No | Not implemented |

### How to cover everything

Use the **keyword-by-keyword plan** in [ABILITIES_PLAN.md](./ABILITIES_PLAN.md). It lists keywords in implementation order with a standard checklist per keyword (trigger → effect mapping → server → client UI → bot).

1. **Run the audit** – `npm run audit-abilities` to see MN01 abilities grouped by keyword.
2. **Pick the next keyword** from the plan table (e.g. delete, then return, then flip, then shift).
3. **Follow the checklist** in the plan for that keyword (compile-cards, game-logic if needed, GameBoard.vue, useBotPlayers).
4. **Mark the keyword Done** in the plan and re-run the audit; repeat for the next keyword.

Group **similar keywords** when they share UI: e.g. do delete, return, and flip together (all "choose one target on the board"); shift is similar but needs from-column + to-column.
