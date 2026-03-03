<script setup lang="ts">
import { useCardInspect } from '../../composables/useCardInspect.js';
import { IconX } from '@tabler/icons-vue';

const { inspectedCard, dismiss } = useCardInspect();

function onOverlayClick(ev: MouseEvent) {
  if ((ev.target as HTMLElement).classList.contains('inspector-overlay')) {
    dismiss();
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="inspector">
      <div
        v-if="inspectedCard"
        class="inspector-overlay"
        @click="onOverlayClick"
        @contextmenu.prevent="dismiss"
      >
        <div class="inspector-card">
          <button class="inspector-close" aria-label="Close" @click="dismiss">
            <IconX :size="18" />
          </button>
          <div class="inspector-content">
            <slot :card="inspectedCard">
              <div class="inspector-default">
                <span class="inspector-id">{{ inspectedCard.id }}</span>
                <dl class="inspector-fields">
                  <template v-for="(value, key) in inspectedCard" :key="key">
                    <template v-if="key !== 'id'">
                      <dt>{{ key }}</dt>
                      <dd>{{ value }}</dd>
                    </template>
                  </template>
                </dl>
              </div>
            </slot>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.inspector-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
}

.inspector-card {
  position: relative;
  width: 240px;
  min-height: 340px;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6),
              0 0 0 1px rgba(255, 255, 255, 0.06);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.inspector-close {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 2;
  background: rgba(0, 0, 0, 0.4);
  border: none;
  border-radius: 6px;
  color: var(--text-muted);
  padding: 4px;
  cursor: pointer;
  display: flex;
  transition: color 0.15s, background 0.15s;
}

.inspector-close:hover {
  color: var(--text);
  background: rgba(0, 0, 0, 0.6);
}

.inspector-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.5rem;
}

.inspector-default {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
  width: 100%;
}

.inspector-id {
  font-size: 2rem;
  font-weight: 700;
  color: var(--accent-hover);
}

.inspector-fields {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.35rem 0.75rem;
  font-size: 0.8rem;
  width: 100%;
}

.inspector-fields dt {
  color: var(--text-muted);
  text-transform: capitalize;
  font-weight: 500;
}

.inspector-fields dd {
  color: var(--text);
  word-break: break-word;
}

/* --- transition --- */
.inspector-enter-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.inspector-leave-active {
  transition: all 0.2s cubic-bezier(0.5, 0, 1, 0.5);
}
.inspector-enter-from {
  opacity: 0;
}
.inspector-leave-to {
  opacity: 0;
}
.inspector-enter-from .inspector-card {
  transform: scale(0.8);
}
.inspector-leave-to .inspector-card {
  transform: scale(0.8);
}
</style>
