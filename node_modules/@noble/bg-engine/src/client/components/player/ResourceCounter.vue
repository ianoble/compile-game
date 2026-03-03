<script setup lang="ts">
withDefaults(defineProps<{
  name: string;
  amount: number;
  limit?: number;
  size?: 'sm' | 'md' | 'lg';
}>(), {
  size: 'md',
});

defineSlots<{
  icon(): unknown;
}>();
</script>

<template>
  <div class="resource-counter" :class="size">
    <span class="resource-icon">
      <slot name="icon">
        <span class="resource-icon-default">{{ name.charAt(0).toUpperCase() }}</span>
      </slot>
    </span>
    <span class="resource-value">
      {{ amount }}<span v-if="limit !== undefined" class="resource-limit">/{{ limit }}</span>
    </span>
    <span class="resource-name">{{ name }}</span>
  </div>
</template>

<style scoped>
.resource-counter {
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  padding: 0.25em 0.5em;
  font-variant-numeric: tabular-nums;
  user-select: none;
}

.resource-counter.sm { font-size: 0.75rem; }
.resource-counter.md { font-size: 0.9rem; }
.resource-counter.lg { font-size: 1.1rem; }

.resource-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.resource-icon-default {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5em;
  height: 1.5em;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  font-weight: 700;
  font-size: 0.85em;
  line-height: 1;
}

.resource-value {
  font-weight: 600;
}

.resource-limit {
  opacity: 0.5;
  font-weight: 400;
}

.resource-name {
  opacity: 0.6;
  font-size: 0.85em;
  text-transform: capitalize;
}
</style>
