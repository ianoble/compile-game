<script setup lang="ts">
import { ref } from 'vue';
import { isCardHidden } from '../../../types/index.js';
import { useCardInspect } from '../../composables/useCardInspect.js';
import { useCardDrag } from '../../composables/useCardDrag.js';
import type { Card, VisibleCard } from '../../../types/index.js';

const props = withDefaults(defineProps<{
  card: Card;
  /** Disable the hover magnification effect. */
  disableHover?: boolean;
  /** Enable pointer-event drag. Requires a sourceId and sourceIndex. */
  draggable?: boolean;
  /** Identifier for the source container (e.g. 'hand'). */
  sourceId?: string;
  /** Index of this card in its source container. */
  sourceIndex?: number;
}>(), {
  disableHover: false,
  draggable: false,
  sourceId: '',
  sourceIndex: 0,
});

defineEmits<{
  (e: 'click'): void;
}>();

const { inspect } = useCardInspect();
const { startDrag, state: dragState } = useCardDrag();
const isHovered = ref(false);
const cardEl = ref<HTMLElement | null>(null);

const DRAG_THRESHOLD = 5;
let pointerStartX = 0;
let pointerStartY = 0;
let pointerDown = false;

function onPointerDown(ev: PointerEvent) {
  if (!props.draggable || ev.button !== 0) return;
  pointerDown = true;
  pointerStartX = ev.clientX;
  pointerStartY = ev.clientY;
  (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
}

function onPointerMove(ev: PointerEvent) {
  if (!pointerDown) return;
  const dx = ev.clientX - pointerStartX;
  const dy = ev.clientY - pointerStartY;
  if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;

  pointerDown = false;
  isHovered.value = false;
  (ev.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId);

  const rect = cardEl.value?.getBoundingClientRect();
  if (!rect) return;

  startDrag(
    { card: props.card, sourceIndex: props.sourceIndex, sourceId: props.sourceId },
    rect,
    ev,
  );
}

function onPointerUp() {
  pointerDown = false;
}

function onContextMenu(ev: MouseEvent) {
  if (isCardHidden(props.card)) return;
  ev.preventDefault();
  inspect(props.card as VisibleCard);
}

function isBeingDragged(): boolean {
  if (!dragState.isDragging || !dragState.payload) return false;
  const p = dragState.payload;
  return p.sourceId === props.sourceId && p.sourceIndex === props.sourceIndex;
}
</script>

<template>
  <div
    ref="cardEl"
    class="card-component"
    :class="{
      hovered: isHovered && !disableHover && !dragState.isDragging,
      hidden: isCardHidden(card),
      dragging: isBeingDragged(),
    }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @click="$emit('click')"
    @contextmenu="onContextMenu"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <div class="card-flipper" :class="{ flipped: isCardHidden(card) }">
      <div class="card-face card-front">
        <template v-if="!isCardHidden(card)">
          <slot :card="(card as VisibleCard)">
            <span class="card-label">{{ (card as VisibleCard).id }}</span>
          </slot>
        </template>
      </div>
      <div class="card-face card-back">
        <div class="card-back-pattern" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.card-component {
  width: 72px;
  height: 100px;
  flex-shrink: 0;
  cursor: pointer;
  position: relative;
  z-index: 0;
  touch-action: none;
  user-select: none;
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
              z-index 0s 0.3s,
              opacity 0.2s ease;
}

.card-component.hovered {
  transform: translateY(-18px) scale(1.25);
  z-index: 50;
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
              z-index 0s 0s,
              opacity 0.2s ease;
}

.card-component.dragging {
  opacity: 0.3;
  transform: scale(0.92);
}

/* --- 3D flip --- */
.card-flipper {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.card-flipper.flipped {
  transform: rotateY(180deg);
}

.card-face {
  position: absolute;
  inset: 0;
  border-radius: 8px;
  border: 1px solid var(--border);
  backface-visibility: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.card-front {
  background: var(--surface);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  transition: box-shadow 0.3s ease;
}

.card-component.hovered .card-front {
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.45);
}

.card-back {
  background: linear-gradient(135deg, var(--accent) 0%, #4f46e5 100%);
  transform: rotateY(180deg);
}

.card-back-pattern {
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

.card-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
}
</style>
