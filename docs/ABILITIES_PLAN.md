# Ability Implementation Plan (keyword-by-keyword)

This plan follows [ABILITIES_STRATEGY.md](./ABILITIES_STRATEGY.md): implement by **effect type / keyword**, then verify with the audit script.

## How to use this plan

1. **Before starting** – Run `npm run audit-abilities` to see MN01 ability counts per keyword.
2. **Pick the next keyword** – Work through the table below in order (or by priority).
3. **Per keyword** – Complete the 4 steps: trigger detection → effect mapping → server (if needed) → client UI → bot.
4. **After each keyword** – Re-run the audit; optionally test one card per protocol that uses it (see "By protocol" in audit output).
5. **Update the table** – Mark the keyword row as Done and move to the next.

---

## Implementation order and status

| # | Keyword   | MN01 rows | Status   | Notes |
|---|-----------|-----------|----------|--------|
| — | **draw**  | 21        | **Done** | Mandatory, optional ("may draw"), opponent draws. |
| — | **discard** | 21     | **Done** | You/opponent, single & multi; compound discardThenDraw, drawThenDiscard, discardThenReturn, discardThenDelete. |
| 1 | **delete** | 8       | **Done** | Trigger + getEffectForAbility, client "choose target" (column buttons), bot random uncovered target. |
| 2 | **return** | 3       | **Done** | Trigger + getEffectForAbility, client "choose target", bot random uncovered target. |
| 3 | **flip**  | 7         | **Done** | Trigger + getEffectForAbility, client "choose target", bot random uncovered target. ("Flip this card" = choose that card as target.) |
| 4 | **shift** | 8         | **Done** | Single: two-step UI (card → destination). **shiftAllInLine** (Light 3): "Shift all face-down cards in this line to another line" – choose source column (with face-down) then destination. |
| 5 | **play**  | 7         | **Done** | 7 effects: play from hand face-down another line (Darkness 3); play top of deck under this card (Gravity 0); opponent plays top of deck in line (Gravity 6); play top in each line where you have a card (Life 0); play top in another line (Life 3 when covered); play 1 card (Speed 0); play top in each other line (Water 1). Restrictions (Metal 2, Plague 0, Psychic 1, Spirit 1) not yet implemented. |
| 6 | **reveal** | 3        | **Done** | "Your opponent reveals their hand"; "Draw 2, opponent discards 2, then reveal hand" (Psychic 0); "Reveal 1 face-down card. You may shift or flip that card." (Light 2). Overlay for hand/card; cleared when turn ends. |
| 7 | **refresh** | 1        | **Done** | "Refresh. Draw 1 card." (Spirit 0) – draw to 5 (refresh), then draw N more. Effect type refreshThenDraw. |
| 8 | **rearrange** | 1      | **Done** | "Swap the positions of 2 of your protocols" (Spirit 4). Effect type rearrange; client picks 2 columns to swap; uses existing protocol permutation logic. |
| 9 | **Speed (after clear cache)** | 1 | **Done** | "After you clear cache: Draw 1 card." (Speed 1). Trigger: pushed in Check Cache when player discards down to 5; effect = draw. Only face-up uncovered cards trigger. |
| 10 | **other**  | 3         | **Done** | Skip check cache (Spirit 0 bottom); face-down value 4 in stack (Darkness 2 top); play face-up without matching (Spirit 1 top). skipCheckCache effect + UI; value 4 and play-without-matching are passive (server already uses setup data). |

---

## Standard checklist per keyword (targeting: delete, return, flip)

Use this for **delete**, **return**, and **flip** (single target = one uncovered card).

- [ ] **compile-cards.ts – trigger**  
  Ensure `rowHasTrigger()` returns true for this ability text (e.g. "delete 1", "flip 1", "return 1").
- [ ] **compile-cards.ts – effect**  
  In `getEffectForAbility()`, add a branch that returns `{ type: 'delete'|'return'|'flip', params: {} }`. Params can be empty; client will send `columnIndex` + `stackIndex` after player picks target.
- [ ] **game-logic.ts**  
  No change if `applyEffect` and `validateMove` already support the effect type (they do for delete/return/flip).
- [ ] **GameBoard.vue – target UI**  
  When `pendingAbilityEffect.type` is `delete` / `return` / `flip`, show "Choose a card to delete/return/flip" and a row of buttons (one per column that has an uncovered card). On click, call `move('applyEffect', type, { columnIndex, stackIndex })` with the uncovered card’s column and stack index.
- [ ] **GameBoard.vue – resolve button**  
  For these types, either hide the generic "Resolve ability" button and only use the target buttons, or show one "Choose target…" prompt and then send the move with chosen target.
- [ ] **useBotPlayers.ts**  
  When the top of the ability stack is delete/return/flip, bot picks a random valid uncovered card (random column that has a stack, use top of stack), then `move('applyEffect', type, { columnIndex, stackIndex })`.

---

## Checklist for shift

- [ ] **compile-cards.ts – trigger**  
  Add trigger for "shift" ability text.
- [ ] **compile-cards.ts – effect**  
  `getEffectForAbility()` returns `{ type: 'shift', params: {} }` (client fills from/to).
- [ ] **GameBoard.vue**  
  UI to choose: from-column (and stack index, usually uncovered = top) and to-column. Then `move('applyEffect', 'shift', { fromColumnIndex, fromStackIndex, toColumnIndex })`.
- [ ] **useBotPlayers.ts**  
  Bot picks random from-column (with an uncovered card) and random to-column ≠ from-column.

---

## Checklist for play / reveal / refresh / rearrange

Define when you reach them:

- **play** – Decide if new move(s) or effect type(s); implement "play top of deck face-down" first, then variants.
- **reveal** – Likely client-only (show opponent hand temporarily); confirm no server state.
- **refresh** – Either "draw until 5" as a single effect or draw + phase skip; align with rules.
- **rearrange** – Server already has protocol permutation move; wire to "rearrange" ability text and add client UI to choose new order.

---

## Quick reference: files to touch per keyword

| Layer        | File                 | What to do |
|-------------|----------------------|------------|
| Trigger     | `src/logic/compile-cards.ts` | `rowHasTrigger()` – add phrase for keyword. |
| Effect map  | `src/logic/compile-cards.ts` | `getEffectForAbility()` – return `{ type, params }`. |
| Server      | `src/logic/game-logic.ts`    | Only if new effect type or param shape. |
| Client UI   | `src/components/GameBoard.vue` | Target choice, buttons, `move('applyEffect', …)`. |
| Bot         | `src/composables/useBotPlayers.ts` | Resolve effect with valid random choices. |

When a keyword is fully done, mark it **Done** in the table above and move to the next.

---

## Gaps (post-audit 2)

These items were identified in the second abilities audit. Implement in priority order as needed.

### 1. Compound / multi-step effects

| Card | Text | Gap |
|------|------|-----|
| Plague 2 | Discard 1 or more. Opponent discards amount discarded + 1. | No effect type for discard N then opponent discards N+1. |
| Psychic 2 | Opponent discards 2. Rearrange **their** protocols. | Only discard applied; rearrange opponent's protocols not implemented. |
| Psychic 3 | Opponent discards 1. Shift 1 of their cards. | Only discard; shift opponent's card not in same effect. |
| Water 2 | Draw 2. Rearrange your protocols. | No single compound; could be two resolutions. |

### 2. Scoped delete / return (server does single-target only)

| Card | Text | Gap |
|------|------|-----|
| Death 0 | Delete 1 card from each other line. | Need delete one per other column. |
| Death 2 | Delete all cards in 1 line with values of 1 or 2. | No delete all in column with value filter. |
| Metal 3 | Draw 1. Delete all in 1 other line with 8+ cards. | No delete all in line with count filter. |
| Water 3 | Return all cards with value 2 in 1 line. | No return all in column / by value. |

### 3. Multi-step Start/End and when-covered

| Card | Text | Gap |
|------|------|-----|
| Death 1 (Start) | You may draw 1. If you do, delete 1 other. Then delete this card. | Multi-step; no single effect type. |
| Fire 0 (when covered) | First draw 1. Then flip 1 other card. | When-covered pushed; need draw then flip compound. |
| Life 3 (when covered) | First play top of deck face-down in another line. | Implemented (playTopOfDeckFaceDownAnotherLine). |

### 4. Triggers not implemented

| Trigger | Example | Gap |
|---------|---------|-----|
| When this card is covering a card | Life 4 – If this card is covering a card, draw 1. | No push when card becomes covering. |
| When this card would be covered **or flipped** | Metal 6 – When covered or flipped: First delete this card. | When-covered pushed; when-flipped not. |

### 5. Passives not implemented

| Text | Gap |
|------|-----|
| Your total value in this line increased by 1 per face-down card. | Not in column total modifiers. |
| Ignore all middle commands of cards in this line. | No server support for ignoring middle row. |
