import { ref, provide, inject, readonly, type InjectionKey, type DeepReadonly, type Ref } from 'vue';
import type { VisibleCard } from '../../types/index.js';

export interface CardInspectContext {
  inspectedCard: DeepReadonly<Ref<VisibleCard | null>>;
  inspect: (card: VisibleCard) => void;
  dismiss: () => void;
}

const INSPECT_KEY: InjectionKey<CardInspectContext> = Symbol('card-inspect');

export function provideCardInspect(): CardInspectContext {
  const inspectedCard = ref<VisibleCard | null>(null);

  function inspect(card: VisibleCard) {
    inspectedCard.value = card;
  }

  function dismiss() {
    inspectedCard.value = null;
  }

  const ctx: CardInspectContext = {
    inspectedCard: readonly(inspectedCard),
    inspect,
    dismiss,
  };

  provide(INSPECT_KEY, ctx);
  return ctx;
}

export function useCardInspect(): CardInspectContext {
  const ctx = inject(INSPECT_KEY);
  if (!ctx) {
    throw new Error('useCardInspect() requires an ancestor to call provideCardInspect()');
  }
  return ctx;
}
