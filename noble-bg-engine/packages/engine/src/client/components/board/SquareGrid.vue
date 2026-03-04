<script setup lang="ts" generic="P extends GamePiece">
import { computed } from 'vue';
import type { GamePiece, SquareBoard, BoardCell } from '../../../types/board.js';

const props = withDefaults(defineProps<{
  board: SquareBoard<P>;
  cellSize?: number;
  validCells?: [number, number][];
}>(), {
  cellSize: 64,
});

const emit = defineEmits<{
  (e: 'cell-click', row: number, col: number): void;
}>();

defineSlots<{
  cell(props: { row: number; col: number; cell: BoardCell<P> }): unknown;
}>();

const gridStyle = computed(() => ({
  display: 'inline-grid',
  gridTemplateColumns: `repeat(${props.board.cols}, ${props.cellSize}px)`,
  gridTemplateRows: `repeat(${props.board.rows}, ${props.cellSize}px)`,
}));

const flatCells = computed(() => {
  const result: { row: number; col: number; cell: BoardCell<P> }[] = [];
  for (let r = 0; r < props.board.rows; r++) {
    for (let c = 0; c < props.board.cols; c++) {
      result.push({ row: r, col: c, cell: props.board.cells[r][c] });
    }
  }
  return result;
});

const validSet = computed(() => {
  const s = new Set<string>();
  if (props.validCells) {
    for (const [r, c] of props.validCells) {
      s.add(`${r},${c}`);
    }
  }
  return s;
});

function isValid(row: number, col: number): boolean {
  return validSet.value.has(`${row},${col}`);
}
</script>

<template>
  <div class="square-grid" :style="gridStyle">
    <div
      v-for="item in flatCells"
      :key="`${item.row},${item.col}`"
      class="square-cell"
      :class="{ 'valid-target': isValid(item.row, item.col) }"
      :style="{ width: `${cellSize}px`, height: `${cellSize}px` }"
      @click="emit('cell-click', item.row, item.col)"
    >
      <slot name="cell" :row="item.row" :col="item.col" :cell="item.cell" />
    </div>
  </div>
</template>

<style scoped>
.square-grid {
  gap: 0;
}

.square-cell {
  position: relative;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s ease;
}

.square-cell:hover {
  background-color: rgba(255, 255, 255, 0.05);
}

.square-cell.valid-target {
  background-color: rgba(100, 200, 100, 0.2);
  border-color: rgba(100, 200, 100, 0.4);
}
</style>
