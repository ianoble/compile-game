<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  /** Number of cards remaining in the deck. */
  count: number;
}>();

const layers = computed(() => Math.min(props.count, 4));
</script>

<template>
  <div class="deck-root" :aria-label="`Deck: ${count} cards remaining`">
    <div class="deck-perspective">
      <div class="deck-stack">
        <Transition name="deck-pop">
          <div
            v-if="count > 0"
            :key="count"
            class="deck-top"
          >
            <div class="card-back">
              <div class="card-back-pattern" />
            </div>
          </div>
        </Transition>

        <div
          v-for="i in layers"
          :key="`layer-${i}`"
          class="deck-layer"
          :style="{
            transform: `translate3d(${i * 1.5}px, ${i * 1.5}px, ${-i * 2}px)`,
            opacity: 1 - i * 0.15,
          }"
        />
      </div>
    </div>
    <span class="deck-count">{{ count }}</span>
  </div>
</template>

<style scoped>
.deck-root {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.deck-perspective {
  perspective: 600px;
}

.deck-stack {
  position: relative;
  width: 72px;
  height: 100px;
  transform-style: preserve-3d;
}

.deck-top {
  position: absolute;
  inset: 0;
  z-index: 10;
  transform-style: preserve-3d;
}

.deck-layer {
  position: absolute;
  inset: 0;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--accent) 0%, #4f46e5 100%);
  border: 1px solid var(--border);
}

.card-back {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--accent) 0%, #4f46e5 100%);
  border: 1px solid var(--border);
  overflow: hidden;
  position: relative;
}

.card-back-pattern {
  position: absolute;
  inset: 6px;
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

.deck-count {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

/* --- draw animation --- */
.deck-pop-enter-active {
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.deck-pop-leave-active {
  transition: all 0.3s cubic-bezier(0.5, 0, 1, 0.5);
  position: absolute;
}
.deck-pop-enter-from {
  opacity: 0;
  transform: scale(1.1) translateY(-12px);
}
.deck-pop-leave-to {
  opacity: 0;
  transform: rotateY(90deg) translateX(30px);
}
</style>
