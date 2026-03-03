<script setup lang="ts">
import { computed } from 'vue';
import type { GamePiece } from '../../../types/board.js';

const props = withDefaults(defineProps<{
  piece: GamePiece;
  size?: number;
}>(), {
  size: 32,
});

defineSlots<{
  default(props: { piece: GamePiece }): unknown;
}>();

const OWNER_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#34495e',
];

const color = computed(() => {
  if (props.piece.owner === null) return '#95a5a6';
  const idx = parseInt(props.piece.owner, 10);
  if (Number.isNaN(idx)) return '#95a5a6';
  return OWNER_COLORS[idx % OWNER_COLORS.length];
});
</script>

<template>
  <div
    class="piece-token"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      backgroundColor: color,
    }"
  >
    <slot :piece="piece">
      <span class="piece-label">{{ piece.type.charAt(0).toUpperCase() }}</span>
    </slot>
  </div>
</template>

<style scoped>
.piece-token {
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 0.75em;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  user-select: none;
  flex-shrink: 0;
}

.piece-label {
  line-height: 1;
  text-transform: uppercase;
}
</style>
