/*
 * Copyright Red Hat
 */

import { useCallback, useEffect, useRef } from 'react';

const POST_SCAN_FOLLOW_UP_MS = 3500;

/** Debounced project/violation refresh after scan completion. */
export function usePostScanRefresh(
  retry: () => void,
  setRefreshKey: React.Dispatch<React.SetStateAction<number>>,
): () => void {
  const followUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedulePostScanRefresh = useCallback(() => {
    if (followUpTimerRef.current) {
      clearTimeout(followUpTimerRef.current);
      followUpTimerRef.current = null;
    }

    retry();
    setRefreshKey(k => k + 1);
    followUpTimerRef.current = setTimeout(() => {
      followUpTimerRef.current = null;
      retry();
      setRefreshKey(k => k + 1);
    }, POST_SCAN_FOLLOW_UP_MS);
  }, [retry, setRefreshKey]);

  useEffect(() => {
    return () => {
      if (followUpTimerRef.current) {
        clearTimeout(followUpTimerRef.current);
        followUpTimerRef.current = null;
      }
    };
  }, []);

  return schedulePostScanRefresh;
}
