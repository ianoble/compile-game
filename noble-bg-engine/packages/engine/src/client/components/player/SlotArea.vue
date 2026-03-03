<script setup lang="ts">
import type { Slot } from '../../../types/player-board.js';

withDefaults(defineProps<{
  slot: Slot;
  direction?: 'row' | 'column';
}>(), {
  direction: 'row',
});

defineSlots<{
  item(props: { item: unknown; index: number }): unknown;
  empty(): unknown;
}>();
</script>

<template>
  <div class="slot-area" :class="direction">
    <span v-if="slot.label" class="slot-label">
      {{ slot.label }}
      <span v-if="slot.capacity !== undefined" class="slot-capacity">
        {{ slot.items.length }}/{{ slot.capacity }}
      </span>
    </span>

    <div class="slot-items" :class="direction">
      <template v-if="slot.items.length > 0">
        <div
          v-for="(it, idx) in slot.items"
          :key="idx"
          class="slot-item"
        >
          <slot name="item" :item="it" :index="idx">
            <span class="slot-item-default">{{ idx + 1 }}</span>
          </slot>
        </div>
      </template>
      <div v-else class="slot-empty">
        <slot name="empty">
          <span class="slot-empty-default">Empty</span>
        </slot>
      </div>
    </div>
  </div>
</template>

<style scoped>
.slot-area {
  display: flex;
  flex-direction: column;
  gap: 0.35em;
}

.slot-label {
  font-size: 0.8em;
  opacity: 0.7;
  text-transform: capitalize;
  white-space: nowrap;
}

.slot-capacity {
  font-variant-numeric: tabular-nums;
  opacity: 0.6;
  margin-left: 0.25em;
}

.slot-items {
  display: flex;
  gap: 0.4em;
  flex-wrap: wrap;
}

.slot-items.row {
  flex-direction: row;
}

.slot-items.column {
  flex-direction: column;
}

.slot-item {
  display: flex;
  align-items: center;
  justify-content: center;
}

.slot-item-default {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2em;
  height: 2em;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 0.8em;
  font-weight: 600;
}

.slot-empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.slot-empty-default {
  opacity: 0.35;
  font-size: 0.8em;
  font-style: italic;
}
</style>
