<script setup lang="ts">
import { computed } from 'vue';
import { useCardDrag } from '../../composables/useCardDrag.js';
import { isCardHidden } from '../../../types/index.js';
import type { VisibleCard } from '../../../types/index.js';

const { state } = useCardDrag();

const ghostStyle = computed(() => ({
  left: `${state.pointerX - 36}px`,
  top: `${state.pointerY - 50}px`,
  transition: state.snappingBack
    ? 'left 0.3s cubic-bezier(0.16, 1, 0.3, 1), top 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease'
    : 'none',
  opacity: state.snappingBack ? 0 : 1,
}));

const cardData = computed(() => {
  if (!state.payload) return null;
  const c = state.payload.card;
  return isCardHidden(c) ? null : (c as VisibleCard);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="state.isDragging || state.snappingBack" class="drag-overlay">
      <div
        class="drag-ghost"
        :class="{ 'over-zone': !!state.overZoneId }"
        :style="ghostStyle"
      >
        <div class="ghost-face" :class="{ 'card-back': !cardData }">
          <template v-if="cardData">
            <slot :card="cardData">
              <span class="ghost-label">{{ cardData.id }}</span>
            </slot>
          </template>
          <div v-else class="ghost-back-pattern" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.drag-overlay {
  position: fixed;
  inset: 0;
  z-index: 9500;
  pointer-events: none;
}

.drag-ghost {
  position: absolute;
  width: 72px;
  height: 100px;
  pointer-events: none;
  transform: scale(1.15) rotate(-3deg);
  filter: drop-shadow(0 16px 32px rgba(0, 0, 0, 0.55));
  will-change: left, top, transform, opacity;
}

.drag-ghost.over-zone {
  transform: scale(1.2) rotate(0deg);
  filter: drop-shadow(0 20px 40px rgba(99, 102, 241, 0.4));
}

.ghost-face {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--surface);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.ghost-face.card-back {
  background: linear-gradient(135deg, var(--accent) 0%, #4f46e5 100%);
}

.ghost-back-pattern {
  position: absolute;
  inset: 5px;
  border-radius: 4px;
  border: 1.5px solid rgba(255, 255, 255, 0.12);
  background: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 4px,
    rgba(255, 255, 255, 0.04) 4px,
    rgba(255, 255, 255, 0.04) 8px
  );
}

.ghost-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
}
</style>
