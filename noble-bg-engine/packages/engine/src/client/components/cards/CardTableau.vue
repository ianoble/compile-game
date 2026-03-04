<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watchEffect } from 'vue';
import type { VisibleCard } from '../../../types/index.js';
import { useCardDrag, type DragPayload } from '../../composables/useCardDrag.js';
import { useGame } from '../../composables/useGame.js';
import CardComponent from './CardComponent.vue';

defineProps<{
  /** Face-up cards in the public play area. */
  cards: VisibleCard[];
  /** The move name dispatched when a card is dropped here. */
  dropMoveName?: string;
}>();

defineEmits<{
  (e: 'select', card: VisibleCard): void;
  (e: 'cardDropped', payload: DragPayload): void;
}>();

const { move } = useGame();
const { registerDropZone, unregisterDropZone, state: dragState, onDrop } = useCardDrag();
const tableauEl = ref<HTMLElement | null>(null);

const ZONE_ID = 'tableau';

onMounted(() => {
  if (tableauEl.value) {
    registerDropZone({ id: ZONE_ID, el: tableauEl.value });
  }
});

onBeforeUnmount(() => {
  unregisterDropZone(ZONE_ID);
});

watchEffect(() => {
  onDrop.value = (zoneId: string, payload: DragPayload) => {
    if (zoneId !== ZONE_ID) return;
    move('playCard', payload.sourceIndex);
  };
});

const isOverMe = ref(false);
watchEffect(() => {
  isOverMe.value = dragState.isDragging && dragState.overZoneId === ZONE_ID;
});
</script>

<template>
  <div
    ref="tableauEl"
    class="tableau-perspective"
    :class="{ 'drop-target': dragState.isDragging, 'drop-hover': isOverMe }"
  >
    <TransitionGroup name="tableau-card" tag="div" class="card-tableau">
      <div
        v-for="card in cards"
        :key="card.id"
        class="tableau-slot"
      >
        <CardComponent :card="card" @click="$emit('select', card)">
          <template #default="{ card: visibleCard }">
            <slot name="card" :card="visibleCard">
              <span class="fallback-label">{{ visibleCard.id }}</span>
            </slot>
          </template>
        </CardComponent>
      </div>
    </TransitionGroup>

    <div v-if="dragState.isDragging" class="drop-hint">
      {{ isOverMe ? 'Release to play' : 'Drop card here' }}
    </div>
  </div>
</template>

<style scoped>
.tableau-perspective {
  perspective: 800px;
  position: relative;
  border-radius: 12px;
  transition: background 0.25s ease,
              border-color 0.25s ease,
              box-shadow 0.25s ease;
}

.tableau-perspective.drop-target {
  background: rgba(99, 102, 241, 0.04);
  border: 2px dashed rgba(99, 102, 241, 0.25);
  min-height: 120px;
}

.tableau-perspective.drop-hover {
  background: rgba(99, 102, 241, 0.1);
  border-color: var(--accent);
  box-shadow: 0 0 24px rgba(99, 102, 241, 0.2);
}

.card-tableau {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  justify-content: center;
  padding: 0.5rem;
}

.tableau-slot {
  position: relative;
}

.drop-hint {
  text-align: center;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--accent-hover);
  padding: 0.25rem 0 0.5rem;
  letter-spacing: 0.02em;
}

.fallback-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
}

/* --- TransitionGroup --- */
.tableau-card-enter-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.tableau-card-leave-active {
  transition: all 0.3s cubic-bezier(0.5, 0, 1, 0.5);
  position: absolute;
}
.tableau-card-enter-from {
  opacity: 0;
  transform: scale(0.6) rotateY(-90deg);
}
.tableau-card-leave-to {
  opacity: 0;
  transform: scale(0.6) rotateY(90deg);
}
.tableau-card-move {
  transition: transform 0.35s ease;
}
</style>
