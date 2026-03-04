<script setup lang="ts">
import { computed } from 'vue';
import type { Track } from '../../../types/player-board.js';

const props = withDefaults(defineProps<{
  track: Track;
  orientation?: 'horizontal' | 'vertical';
}>(), {
  orientation: 'horizontal',
});

defineSlots<{
  marker(props: { position: number }): unknown;
}>();

const range = computed(() => props.track.max - props.track.min);

const pct = computed(() => {
  if (range.value === 0) return 100;
  return ((props.track.position - props.track.min) / range.value) * 100;
});

const ticks = computed(() => {
  const count = range.value;
  if (count <= 0 || count > 40) return [];
  const result: { value: number; pct: number }[] = [];
  for (let i = 0; i <= count; i++) {
    result.push({
      value: props.track.min + i,
      pct: (i / count) * 100,
    });
  }
  return result;
});
</script>

<template>
  <div class="track-meter" :class="orientation">
    <span v-if="track.label" class="track-label">{{ track.label }}</span>
    <div class="track-bar">
      <div class="track-fill" :style="orientation === 'horizontal'
        ? { width: `${pct}%` }
        : { height: `${pct}%` }
      " />
      <div
        v-for="tick in ticks"
        :key="tick.value"
        class="track-tick"
        :style="orientation === 'horizontal'
          ? { left: `${tick.pct}%` }
          : { bottom: `${tick.pct}%` }
        "
      />
      <div
        class="track-marker"
        :style="orientation === 'horizontal'
          ? { left: `${pct}%` }
          : { bottom: `${pct}%` }
        "
      >
        <slot name="marker" :position="track.position">
          <span class="track-marker-default">{{ track.position }}</span>
        </slot>
      </div>
    </div>
    <div class="track-bounds">
      <span>{{ track.min }}</span>
      <span>{{ track.max }}</span>
    </div>
  </div>
</template>

<style scoped>
.track-meter {
  display: flex;
  gap: 0.35em;
  user-select: none;
}

.track-meter.horizontal {
  flex-direction: column;
  min-width: 120px;
}

.track-meter.vertical {
  flex-direction: row;
  align-items: stretch;
  min-height: 120px;
}

.track-label {
  font-size: 0.8em;
  opacity: 0.7;
  text-transform: capitalize;
  white-space: nowrap;
}

.track-bar {
  position: relative;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  overflow: visible;
}

.horizontal .track-bar {
  height: 8px;
  width: 100%;
}

.vertical .track-bar {
  width: 8px;
  height: 100%;
}

.track-fill {
  position: absolute;
  background: rgba(100, 180, 255, 0.5);
  border-radius: 4px;
  transition: width 0.2s ease, height 0.2s ease;
}

.horizontal .track-fill {
  left: 0;
  top: 0;
  height: 100%;
}

.vertical .track-fill {
  left: 0;
  bottom: 0;
  width: 100%;
}

.track-tick {
  position: absolute;
  background: rgba(255, 255, 255, 0.15);
}

.horizontal .track-tick {
  width: 1px;
  top: 0;
  height: 100%;
}

.vertical .track-tick {
  height: 1px;
  left: 0;
  width: 100%;
}

.track-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 1;
  transition: left 0.2s ease, bottom 0.2s ease;
}

.horizontal .track-marker {
  top: 50%;
}

.vertical .track-marker {
  left: 50%;
  transform: translate(-50%, 50%);
}

.track-marker-default {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.6em;
  height: 1.6em;
  border-radius: 50%;
  background: rgba(100, 180, 255, 0.9);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

.track-bounds {
  display: flex;
  justify-content: space-between;
  font-size: 0.65rem;
  opacity: 0.4;
}

.vertical .track-bounds {
  flex-direction: column-reverse;
  align-items: center;
}
</style>
