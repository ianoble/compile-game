import { ref, watch, type Ref } from 'vue';
import { useGame } from './useGame.js';

export interface TurnNotificationOptions {
  displayName: string;
  icon?: string;
  /** Text shown in the notification body. Defaults to `"It's your turn!"`. */
  body?: string;
}

export interface TurnNotificationReturn {
  /**
   * Calls `Notification.requestPermission()` and updates {@link permission}
   * with the result.  Should be called from a user gesture (button click,
   * etc.) so the browser shows the permission prompt.
   */
  requestPermission: () => Promise<NotificationPermission>;
  /** Reactive mirror of `Notification.permission`. Updated after {@link requestPermission} resolves. */
  permission: Ref<NotificationPermission>;
  /** `true` when the Notification API is available in this environment. */
  supported: Ref<boolean>;
}

/**
 * Shows a browser notification when it becomes the local player's turn and the
 * tab is in the background.
 *
 * Must be called inside a component `setup` (or `<script setup>`) where
 * `provideGameContext` is available higher in the tree.
 *
 * @example
 * ```ts
 * const { requestPermission, permission, supported } = useTurnNotifications({
 *   displayName: gameDef.displayName,
 * });
 *
 * // Wire a button to request permission on user gesture:
 * // <button v-if="supported && permission !== 'granted'" @click="requestPermission">
 * //   Enable turn notifications
 * // </button>
 * ```
 *
 * @param options - At minimum, pass `{ displayName }`. Optionally provide
 *   `icon` (URL) and `body` (notification text).
 */
export function useTurnNotifications(options: TurnNotificationOptions): TurnNotificationReturn {
  const isSupported = typeof window !== 'undefined' && 'Notification' in window;

  const supported = ref(isSupported);
  const permission = ref<NotificationPermission>(
    isSupported ? Notification.permission : 'default',
  );

  const { isMyTurn } = useGame();

  async function requestPermission(): Promise<NotificationPermission> {
    if (!isSupported) return 'default';
    const result = await Notification.requestPermission();
    permission.value = result;
    return result;
  }

  watch(isMyTurn, (myTurn, wasPreviouslyMyTurn) => {
    if (!myTurn || wasPreviouslyMyTurn) return;
    if (!isSupported) return;
    if (permission.value !== 'granted') return;
    if (!document.hidden) return;

    const n = new Notification(options.displayName, {
      body: options.body ?? "It's your turn!",
      icon: options.icon,
      tag: 'bg-engine-turn',
    });

    n.onclick = () => {
      window.focus();
      n.close();
    };
  });

  return { requestPermission, permission, supported };
}
