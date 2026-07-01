/**
 * SSE hook for real-time project operation state.
 *
 * Connects to GET /projects/{id}/operation/events and returns
 * the current ProjectOperationState. On initial connect receives a
 * full snapshot, then applies delta events. Auto-reconnects on error
 * with exponential back-off. Stops reconnecting when the operation
 * reaches a terminal status.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { apmeApiRef } from '../api/ApmeApi';
import type {
  OperationProgress,
  OperationProposal,
  OperationResultData,
  ProjectOperationState,
  ProjectOperationStatus,
} from '../types/api';

const TERMINAL_STATUSES = new Set<ProjectOperationStatus>([
  'completed',
  'pr_submitted',
  'failed',
  'expired',
  'cancelled',
]);

export function useProjectOperationState(projectId: string) {
  const api = useApi(apmeApiRef);
  const [state, setState] = useState<ProjectOperationState | null>(null);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const baseUrlRef = useRef<string | null>(null);
  const retryDelayRef = useRef(3000);

  const cleanup = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    setConnected(false);
  }, []);

  const connect = useCallback(async () => {
    cleanup();
    if (!baseUrlRef.current) {
      try {
        baseUrlRef.current = await api.getProxyBaseUrl();
      } catch {
        return;
      }
    }
    const base = baseUrlRef.current;
    const es = new EventSource(
      `${base}/projects/${projectId}/operation/events`,
    );
    esRef.current = es;

    es.addEventListener('snapshot', (e: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const parsed = JSON.parse(e.data) as ProjectOperationState;
        setState(parsed);
        setConnected(true);
        retryDelayRef.current = 3000;
        if (TERMINAL_STATUSES.has(parsed.status)) {
          es.close();
          esRef.current = null;
        }
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('status_changed', (e: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const d = JSON.parse(e.data) as { status: string; error?: string };
        const newStatus = d.status as ProjectOperationStatus;
        setState(prev =>
          prev
            ? {
                ...prev,
                status: newStatus,
                ...(d.error ? { error: d.error } : {}),
              }
            : prev,
        );
        if (TERMINAL_STATUSES.has(newStatus)) {
          es.close();
          esRef.current = null;
        }
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('progress', (e: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const entry = JSON.parse(e.data) as OperationProgress;
        setState(prev =>
          prev ? { ...prev, progress: [...prev.progress, entry] } : prev,
        );
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('proposals', (e: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const d = JSON.parse(e.data) as { proposals: OperationProposal[] };
        setState(prev => (prev ? { ...prev, proposals: d.proposals } : prev));
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('result', (e: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const r = JSON.parse(e.data) as OperationResultData;
        setState(prev => (prev ? { ...prev, result: r } : prev));
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('approval_ack', (e: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const d = JSON.parse(e.data) as { applied_count: number };
        setState(prev =>
          prev
            ? {
                ...prev,
                status: 'applying' as ProjectOperationStatus,
                result: prev.result
                  ? { ...prev.result, ai_accepted: d.applied_count }
                  : prev.result,
              }
            : prev,
        );
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('pr_created', (e: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const d = JSON.parse(e.data) as { pr_url: string };
        setState(prev => (prev ? { ...prev, pr_url: d.pr_url } : prev));
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('error_event', (e: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const d = JSON.parse(e.data) as { error: string };
        setState(prev => (prev ? { ...prev, error: d.error } : prev));
      } catch {
        /* ignore */
      }
    });
    es.onerror = () => {
      if (!mountedRef.current) return;
      es.close();
      esRef.current = null;
      setConnected(false);
      const delay = retryDelayRef.current;
      retryDelayRef.current = Math.min(delay * 2, 60000);
      reconnectTimer.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, delay);
    };
  }, [projectId, cleanup, api]);

  const poll = useCallback(async () => {
    try {
      const s = (await api.getProjectOperation(
        projectId,
      )) as ProjectOperationState | null;
      if (!mountedRef.current) return;
      if (!s) {
        setState(null);
        return;
      }
      setState(s);
      if (!TERMINAL_STATUSES.has(s.status)) {
        retryDelayRef.current = 3000;
        connect();
      }
    } catch {
      if (mountedRef.current) setState(null);
    }
  }, [projectId, connect, api]);

  useEffect(() => {
    mountedRef.current = true;
    poll();
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [poll, cleanup]);

  const refresh = useCallback(() => {
    poll();
  }, [poll]);
  const clear = useCallback(() => {
    cleanup();
    setState(null);
  }, [cleanup]);

  return { state, connected, refresh, clear };
}
