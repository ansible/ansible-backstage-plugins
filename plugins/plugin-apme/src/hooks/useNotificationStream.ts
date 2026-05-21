/**
 * SSE notification hook for Backstage plugin.
 *
 * Connects to the notification SSE stream via the backend proxy and
 * surfaces real-time alerts via a simple callback.
 */
import { useEffect, useRef } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { apmeApiRef } from '../api/ApmeApi';
import type { NotificationItem } from '../types/api';

export interface UseNotificationStreamOptions {
  onNotification?: (item: NotificationItem) => void;
}

export function useNotificationStream(options?: UseNotificationStreamOptions) {
  const api = useApi(apmeApiRef);
  const onNotificationRef = useRef(options?.onNotification);
  onNotificationRef.current = options?.onNotification;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let es: EventSource | undefined;
    let cancelled = false;

    const connect = async () => {
      try {
        const base = await api.getProxyBaseUrl();
        if (cancelled) return;
        es = new EventSource(`${base}/notifications/stream`);
        es.onmessage = (event) => {
          if (!mountedRef.current) return;
          try {
            const item = JSON.parse(event.data as string) as NotificationItem;
            onNotificationRef.current?.(item);
          } catch { /* ignore parse errors */ }
        };
        es.onerror = () => { /* EventSource auto-reconnects */ };
      } catch { /* base URL resolution failed; retry handled by caller */ }
    };

    void connect();

    return () => {
      mountedRef.current = false;
      cancelled = true;
      es?.close();
    };
  }, [api]);
}
