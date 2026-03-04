<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import { useGame } from '../composables/useGame.js';
import { IconHistory, IconX } from '@tabler/icons-vue';
import type { LogEntry } from '../../types/index.js';

const { state, playerID } = useGame();
const mobileOpen = ref(false);
const scrollDesktop = ref<HTMLElement | null>(null);
const scrollMobile = ref<HTMLElement | null>(null);

const entries = computed<LogEntry[]>(() => {
  const G = state.value as { history?: LogEntry[] };
  return G.history ?? [];
});

watch(
  () => entries.value.length,
  async () => {
    await nextTick();
    scrollDesktop.value?.scrollTo({ top: scrollDesktop.value.scrollHeight, behavior: 'smooth' });
    scrollMobile.value?.scrollTo({ top: scrollMobile.value.scrollHeight, behavior: 'smooth' });
  },
);

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

function isMe(entry: LogEntry): boolean {
  return entry.playerID === playerID.value;
}

function argsLabel(args: unknown[]): string {
  if (args.length === 0) return '';
  return args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(', ');
}
</script>

<template>
  <!-- ========== Mobile: toggle button (shown <960px) ========== -->
  <button
    class="log-toggle"
    :class="{ active: mobileOpen }"
    @click="mobileOpen = !mobileOpen"
    aria-label="Toggle game log"
  >
    <IconHistory :size="18" />
    <span class="toggle-label">Log</span>
    <span v-if="entries.length" class="badge-count">{{ entries.length }}</span>
  </button>

  <!-- ========== Mobile: slide-in overlay ========== -->
  <Teleport to="body">
    <Transition name="log-slide">
      <aside v-if="mobileOpen" class="log-mobile-sidebar">
        <div class="log-header">
          <h3>Game Log</h3>
          <button class="log-close" aria-label="Close log" @click="mobileOpen = false">
            <IconX :size="16" />
          </button>
        </div>
        <div ref="scrollMobile" class="log-scroll">
          <p v-if="entries.length === 0" class="log-empty">No moves yet.</p>
          <ol class="log-list">
            <li
              v-for="entry in entries"
              :key="entry.seq"
              class="log-item"
              :class="{ me: isMe(entry) }"
            >
              <span class="log-seq">#{{ entry.seq }}</span>
              <span class="log-time">{{ formatTime(entry.timestamp) }}</span>
              <span class="log-player">{{ isMe(entry) ? 'You' : `P${entry.playerID}` }}</span>
              <span class="log-move">{{ entry.moveName }}</span>
              <span v-if="argsLabel(entry.args)" class="log-args">({{ argsLabel(entry.args) }})</span>
            </li>
          </ol>
        </div>
      </aside>
    </Transition>
  </Teleport>

  <!-- ========== Desktop: inline panel (shown >=960px) ========== -->
  <aside class="log-desktop">
    <div class="log-header">
      <h3>Game Log</h3>
    </div>
    <div ref="scrollDesktop" class="log-scroll">
      <p v-if="entries.length === 0" class="log-empty">No moves yet.</p>
      <TransitionGroup name="log-entry" tag="ol" class="log-list">
        <li
          v-for="entry in entries"
          :key="entry.seq"
          class="log-item"
          :class="{ me: isMe(entry) }"
        >
          <span class="log-seq">#{{ entry.seq }}</span>
          <span class="log-time">{{ formatTime(entry.timestamp) }}</span>
          <span class="log-player">{{ isMe(entry) ? 'You' : `P${entry.playerID}` }}</span>
          <span class="log-move">{{ entry.moveName }}</span>
          <span v-if="argsLabel(entry.args)" class="log-args">({{ argsLabel(entry.args) }})</span>
        </li>
      </TransitionGroup>
    </div>
  </aside>
</template>

<style scoped>
/* ---- Mobile toggle ---- */
.log-toggle {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.log-toggle.active {
  border-color: var(--accent);
  color: var(--accent-hover);
}

.log-toggle:hover {
  border-color: var(--accent);
  color: var(--text);
}

.badge-count {
  font-size: 0.65rem;
  font-weight: 600;
  background: var(--accent);
  color: #fff;
  padding: 0.05rem 0.35rem;
  border-radius: 999px;
  min-width: 1rem;
  text-align: center;
}

/* ---- Mobile overlay sidebar ---- */
.log-mobile-sidebar {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 300px;
  max-width: 85vw;
  z-index: 500;
  background: var(--surface);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.4);
}

/* ---- Desktop inline panel ---- */
.log-desktop {
  display: none;
  width: 260px;
  flex-shrink: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  max-height: 480px;
  flex-direction: column;
  overflow: hidden;
}

/* ---- Responsive ---- */
@media (min-width: 960px) {
  .log-toggle { display: none; }
  .log-mobile-sidebar { display: none !important; }
  .log-desktop { display: flex; }
}

@media (max-width: 959px) {
  .log-desktop { display: none !important; }
}

/* ---- Shared log styles ---- */
.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.log-header h3 {
  font-size: 0.85rem;
  font-weight: 600;
}

.log-close {
  display: flex;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px;
}

.log-close:hover { color: var(--text); }

.log-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0.25rem 0;
}

.log-empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.8rem;
  padding: 1.5rem 0;
}

.log-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.log-item {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  padding: 0.3rem 0.75rem;
  font-size: 0.72rem;
  line-height: 1.5;
  transition: background 0.15s;
  flex-wrap: wrap;
}

.log-item:hover { background: rgba(255, 255, 255, 0.03); }
.log-item.me { background: rgba(99, 102, 241, 0.05); }

.log-seq {
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.62rem;
  min-width: 1.6rem;
}

.log-time {
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.62rem;
}

.log-player {
  font-weight: 600;
  color: var(--accent-hover);
}

.log-move {
  color: var(--text);
  font-weight: 500;
}

.log-args {
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.62rem;
}

/* ---- Transitions ---- */
.log-slide-enter-active {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.log-slide-leave-active {
  transition: transform 0.25s cubic-bezier(0.5, 0, 1, 0.5);
}
.log-slide-enter-from,
.log-slide-leave-to {
  transform: translateX(100%);
}

.log-entry-enter-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.log-entry-enter-from {
  opacity: 0;
  transform: translateX(12px);
}
.log-entry-move {
  transition: transform 0.25s ease;
}
</style>
