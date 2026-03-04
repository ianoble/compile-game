import {
  ref,
  reactive,
  readonly,
  provide,
  inject,
  type InjectionKey,
  type DeepReadonly,
  type Ref,
} from 'vue';
import type { Card } from '../../types/index.js';

export interface DragPayload {
  card: Card;
  /** Index of the card within its source container. */
  sourceIndex: number;
  /** Identifier for the source container (e.g. 'hand'). */
  sourceId: string;
}

export interface DropZone {
  id: string;
  el: HTMLElement;
}

export interface DragState {
  isDragging: boolean;
  payload: DragPayload | null;
  /** Pointer position in viewport coordinates. */
  pointerX: number;
  pointerY: number;
  /** Original card position for snap-back. */
  originX: number;
  originY: number;
  /** ID of the drop zone currently under the pointer, or null. */
  overZoneId: string | null;
  /** True while the snap-back animation is playing. */
  snappingBack: boolean;
}

export interface CardDragContext {
  state: DeepReadonly<DragState>;
  isDragging: Ref<boolean>;
  startDrag: (payload: DragPayload, originRect: DOMRect, ev: PointerEvent) => void;
  registerDropZone: (zone: DropZone) => void;
  unregisterDropZone: (id: string) => void;
  /**
   * Called by the drop zone when a card is dropped on it.
   * Returns the payload so the zone can act on it.
   */
  onDrop: Ref<((zoneId: string, payload: DragPayload) => void) | null>;
}

const DRAG_KEY: InjectionKey<CardDragContext> = Symbol('card-drag');

const SNAP_BACK_MS = 300;

export function provideCardDrag(): CardDragContext {
  const dropZones = new Map<string, DropZone>();

  const dragState: DragState = reactive({
    isDragging: false,
    payload: null,
    pointerX: 0,
    pointerY: 0,
    originX: 0,
    originY: 0,
    overZoneId: null,
    snappingBack: false,
  });

  const isDragging = ref(false);
  const onDrop = ref<((zoneId: string, payload: DragPayload) => void) | null>(null);

  function hitTestZones(x: number, y: number): string | null {
    for (const [id, zone] of dropZones) {
      const rect = zone.el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return id;
      }
    }
    return null;
  }

  function onPointerMove(ev: PointerEvent) {
    dragState.pointerX = ev.clientX;
    dragState.pointerY = ev.clientY;
    dragState.overZoneId = hitTestZones(ev.clientX, ev.clientY);
  }

  function endDrag() {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerCancel);
  }

  function resetState() {
    dragState.isDragging = false;
    dragState.payload = null;
    dragState.overZoneId = null;
    dragState.snappingBack = false;
    isDragging.value = false;
  }

  function snapBack() {
    dragState.snappingBack = true;
    dragState.pointerX = dragState.originX + 36;
    dragState.pointerY = dragState.originY + 50;
    setTimeout(resetState, SNAP_BACK_MS);
  }

  function onPointerUp() {
    endDrag();

    if (dragState.overZoneId && dragState.payload && onDrop.value) {
      onDrop.value(dragState.overZoneId, dragState.payload);
      resetState();
    } else {
      snapBack();
    }
  }

  function onPointerCancel() {
    endDrag();
    snapBack();
  }

  function startDrag(payload: DragPayload, originRect: DOMRect, ev: PointerEvent) {
    if (dragState.isDragging) return;

    dragState.isDragging = true;
    dragState.payload = payload;
    dragState.pointerX = ev.clientX;
    dragState.pointerY = ev.clientY;
    dragState.originX = originRect.left;
    dragState.originY = originRect.top;
    dragState.overZoneId = null;
    dragState.snappingBack = false;
    isDragging.value = true;

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerCancel);
  }

  function registerDropZone(zone: DropZone) {
    dropZones.set(zone.id, zone);
  }

  function unregisterDropZone(id: string) {
    dropZones.delete(id);
  }

  const ctx: CardDragContext = {
    state: readonly(dragState) as DeepReadonly<DragState>,
    isDragging,
    startDrag,
    registerDropZone,
    unregisterDropZone,
    onDrop,
  };

  provide(DRAG_KEY, ctx);
  return ctx;
}

export function useCardDrag(): CardDragContext {
  const ctx = inject(DRAG_KEY);
  if (!ctx) {
    throw new Error('useCardDrag() requires an ancestor to call provideCardDrag()');
  }
  return ctx;
}
