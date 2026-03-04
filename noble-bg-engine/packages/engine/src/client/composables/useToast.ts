import { ref, provide, inject, type InjectionKey, type Ref } from 'vue';

export interface Toast {
  id: number;
  message: string;
  type: 'error' | 'info';
}

export interface ToastContext {
  toasts: Ref<Toast[]>;
  showToast: (message: string, type?: 'error' | 'info') => void;
  dismiss: (id: number) => void;
}

const TOAST_KEY: InjectionKey<ToastContext> = Symbol('toast-context');

let nextId = 0;

/**
 * Call once in App.vue to provide the toast system to
 * the entire component tree.
 */
export function provideToastContext(): ToastContext {
  const toasts = ref<Toast[]>([]);

  function showToast(message: string, type: 'error' | 'info' = 'error') {
    const id = nextId++;
    toasts.value.push({ id, message, type });
    setTimeout(() => dismiss(id), 3500);
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  const ctx: ToastContext = { toasts, showToast, dismiss };
  provide(TOAST_KEY, ctx);
  return ctx;
}

/** Inject the toast context from an ancestor. */
export function useToast(): ToastContext {
  const ctx = inject(TOAST_KEY);
  if (!ctx) {
    throw new Error('useToast() requires an ancestor to call provideToastContext()');
  }
  return ctx;
}
