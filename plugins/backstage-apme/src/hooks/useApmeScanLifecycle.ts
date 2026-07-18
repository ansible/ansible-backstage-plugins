/*
 * Copyright Red Hat
 */

import { useEffect, useRef } from 'react';
import type { Project } from '@ansible/backstage-apme-common/types';
import {
  formatOperationError,
  isTerminalOperationState,
  latestOperationProgressMessage,
  projectHasActiveOperation,
  shouldResumeScanUi,
} from '@ansible/backstage-apme-common/operationStatus';
import type { ApmeApi } from '../api/ApmeApi';

export interface ScanProgress {
  status: string;
  message?: string;
  progress?: number;
  violationsFound?: number;
}

export interface UseApmeScanLifecycleOptions {
  projectId: string | null | undefined;
  project: Project | null | undefined;
  apmeApi: Pick<ApmeApi, 'getOperationState'>;
  scanning: boolean;
  setScanning: (scanning: boolean) => void;
  expectActiveScan: boolean;
  setExpectActiveScan: (expectActiveScan: boolean) => void;
  trackedScanOperationId: string | null;
  setTrackedScanOperationId: (operationId: string | null) => void;
  scanProgress: ScanProgress | null;
  setScanProgress: React.Dispatch<React.SetStateAction<ScanProgress | null>>;
  scanError: Error | null;
  setScanError: (error: Error | null) => void;
  registering: boolean;
  scanProgressStatus?: string;
  onScanComplete?: () => void;
}

const MAX_POLLS = 180;
const POLL_INTERVAL_MS = 2000;

export function useApmeScanLifecycle({
  projectId,
  project,
  apmeApi,
  scanning,
  setScanning,
  expectActiveScan,
  setExpectActiveScan,
  trackedScanOperationId,
  setTrackedScanOperationId,
  setScanProgress,
  setScanError,
  registering,
  scanProgressStatus,
  onScanComplete,
}: UseApmeScanLifecycleOptions): void {
  const scanPollInFlightRef = useRef(false);

  useEffect(() => {
    if (!projectId) {
      return undefined;
    }
    if (project && projectHasActiveOperation(project)) {
      setExpectActiveScan(true);
      setScanning(true);
      setScanError(null);
      setScanProgress(prev =>
        prev?.status === 'running' || prev?.status === 'starting'
          ? prev
          : {
              status: 'running',
              message: 'Scan in progress…',
            },
      );
      return undefined;
    }
    let cancelled = false;
    void apmeApi.getOperationState(projectId).then(state => {
      if (cancelled) {
        return;
      }
      if (state?.status === 'failed') {
        setScanning(false);
        setExpectActiveScan(false);
        setTrackedScanOperationId(null);
        setScanProgress(null);
        setScanError(new Error(formatOperationError(state.error)));
        return;
      }
      if (!shouldResumeScanUi(state)) {
        if (
          !trackedScanOperationId &&
          !registering &&
          scanProgressStatus !== 'starting'
        ) {
          setScanning(false);
          setExpectActiveScan(false);
          setScanProgress(null);
        }
        return;
      }
      const progressMessage = latestOperationProgressMessage(state);
      setScanProgress({
        status: 'running',
        message: progressMessage ?? 'Scan in progress…',
      });
      setExpectActiveScan(true);
      setScanning(true);
      setScanError(null);
    });
    return () => {
      cancelled = true;
    };
  }, [
    project,
    projectId,
    apmeApi,
    trackedScanOperationId,
    registering,
    scanProgressStatus,
    setExpectActiveScan,
    setScanError,
    setScanProgress,
    setScanning,
    setTrackedScanOperationId,
  ]);

  useEffect(() => {
    if (!scanning || !projectId) {
      return undefined;
    }

    let cancelled = false;
    let pollCount = 0;

    const pollInterval = setInterval(async () => {
      if (cancelled || scanPollInFlightRef.current) return;
      scanPollInFlightRef.current = true;
      pollCount += 1;
      try {
        const state = await apmeApi.getOperationState(projectId);
        if (cancelled) return;

        if (
          trackedScanOperationId &&
          state?.operation_id !== trackedScanOperationId &&
          state?.scan_id !== trackedScanOperationId
        ) {
          return;
        }

        const progressMessage = latestOperationProgressMessage(state);
        setScanProgress({
          status: 'running',
          message: progressMessage ?? 'Scan in progress…',
          progress: Math.min(10 + pollCount * 1.5, 90),
        });
        const completed = isTerminalOperationState(
          state,
          pollCount,
          2,
          expectActiveScan || Boolean(trackedScanOperationId),
        );

        if (completed) {
          clearInterval(pollInterval);
          if (state?.status === 'failed') {
            setScanProgress(null);
            setScanError(new Error(formatOperationError(state.error)));
            setScanning(false);
            setExpectActiveScan(false);
            setTrackedScanOperationId(null);
          } else {
            onScanComplete?.();
            setScanProgress({
              status: 'completed',
              message: 'Scan complete',
              progress: 100,
              violationsFound: state?.result?.total_violations,
            });
            setScanning(false);
            setExpectActiveScan(false);
            setTrackedScanOperationId(null);
            setTimeout(() => {
              setScanProgress(null);
            }, 2500);
          }
        }
      } catch (pollErr) {
        if (cancelled) return;
        clearInterval(pollInterval);
        setScanning(false);
        setExpectActiveScan(false);
        setTrackedScanOperationId(null);
        setScanProgress(null);
        setScanError(
          pollErr instanceof Error
            ? pollErr
            : new Error('Scan polling failed'),
        );
      } finally {
        scanPollInFlightRef.current = false;
      }

      if (pollCount >= MAX_POLLS) {
        clearInterval(pollInterval);
        setScanning(false);
        setExpectActiveScan(false);
        setTrackedScanOperationId(null);
        setScanProgress(null);
        setScanError(new Error('Scan timed out. Try again in a moment.'));
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
    };
  }, [
    scanning,
    projectId,
    apmeApi,
    expectActiveScan,
    trackedScanOperationId,
    onScanComplete,
    setExpectActiveScan,
    setScanError,
    setScanProgress,
    setScanning,
    setTrackedScanOperationId,
  ]);
}
