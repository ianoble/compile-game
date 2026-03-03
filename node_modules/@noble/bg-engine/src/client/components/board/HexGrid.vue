<script setup lang="ts" generic="P extends GamePiece">
import { computed } from 'vue';
import type { GamePiece, HexBoard, HexCoord, BoardCell } from '../../../types/board.js';
import { parseHexKey } from '../../../utils/board-utils.js';

const props = withDefaults(defineProps<{
  board: HexBoard<P>;
  hexSize?: number;
  validCells?: HexCoord[];
}>(), {
  hexSize: 40,
});

const emit = defineEmits<{
  (e: 'cell-click', q: number, r: number): void;
}>();

defineSlots<{
  cell(props: { q: number; r: number; cell: BoardCell<P> }): unknown;
}>();

/** Pointy-top hex corner offsets. */
function hexCorners(size: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    points.push(`${size * Math.cos(angle)},${size * Math.sin(angle)}`);
  }
  return points.join(' ');
}

/** Convert axial (q, r) to pixel (x, y) for pointy-top hexagons. */
function axialToPixel(q: number, r: number, size: number): { x: number; y: number } {
  const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = size * (1.5 * r);
  return { x, y };
}

const hexPoints = computed(() => hexCorners(props.hexSize));

const hexEntries = computed(() => {
  return Object.keys(props.board.cells).map((key) => {
    const { q, r } = parseHexKey(key);
    const { x, y } = axialToPixel(q, r, props.hexSize);
    return { key, q, r, x, y, cell: props.board.cells[key] as BoardCell<P> };
  });
});

const validSet = computed(() => {
  const s = new Set<string>();
  if (props.validCells) {
    for (const { q, r } of props.validCells) {
      s.add(`${q},${r}`);
    }
  }
  return s;
});

function isValid(q: number, r: number): boolean {
  return validSet.value.has(`${q},${r}`);
}

const viewBox = computed(() => {
  if (hexEntries.value.length === 0) return '0 0 0 0';
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { x, y } of hexEntries.value) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const pad = props.hexSize * 1.2;
  return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
});
</script>

<template>
  <svg class="hex-grid" :viewBox="viewBox">
    <g
      v-for="entry in hexEntries"
      :key="entry.key"
      class="hex-cell"
      :class="{ 'valid-target': isValid(entry.q, entry.r) }"
      :transform="`translate(${entry.x}, ${entry.y})`"
      @click="emit('cell-click', entry.q, entry.r)"
    >
      <polygon
        :points="hexPoints"
        class="hex-bg"
      />
      <foreignObject
        :x="-hexSize * 0.75"
        :y="-hexSize * 0.75"
        :width="hexSize * 1.5"
        :height="hexSize * 1.5"
      >
        <div class="hex-content">
          <slot name="cell" :q="entry.q" :r="entry.r" :cell="entry.cell" />
        </div>
      </foreignObject>
    </g>
  </svg>
</template>

<style scoped>
.hex-grid {
  display: block;
  width: 100%;
  height: auto;
}

.hex-cell {
  cursor: pointer;
}

.hex-bg {
  fill: transparent;
  stroke: rgba(255, 255, 255, 0.15);
  stroke-width: 1;
  transition: fill 0.15s ease;
}

.hex-cell:hover .hex-bg {
  fill: rgba(255, 255, 255, 0.05);
}

.hex-cell.valid-target .hex-bg {
  fill: rgba(100, 200, 100, 0.2);
  stroke: rgba(100, 200, 100, 0.4);
}

.hex-content {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
}
</style>
