/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import type { Entity } from '@backstage/catalog-model';
import { useAsyncRetry } from 'react-use';
import type { Project } from '@ansible/backstage-apme-common/types';
import {
  isTerminalOperationState,
  formatOperationError,
  latestOperationProgressMessage,
  projectHasActiveOperation,
} from '@ansible/backstage-apme-common/operationStatus';
import {
  normalizeRepoUrlFromEntity,
  defaultBranchFromEntity,
} from '@ansible/backstage-rhaap-common/catalogEntity';
import { apmeApiRef } from '../api';

export interface ScanProgress {
  status: string;
  message?: string;
  progress?: number;
  violationsFound?: number;
}

export interface ScanPollingState {
  project: Project | null | undefined;
  loading: boolean;
  error: Error | undefined;
  scanning: boolean;
  scanProgress: ScanProgress | null;
  scanError: Error | null;
  registering: boolean;
  registerError: Error | null;
  repoUrl: string | null;
  branch: string;
  retry: () => void;
  handleScan: () => Promise<void>;
  handleRegister: (entity: Entity) => Promise<void>;
  refreshKey: number;
  refreshViolations: () => void;
}

const MAX_POLLS = 180;
const POLL_INTERVAL_MS = 2000;

export function useScanPolling(entity: Entity): ScanPollingState {
  const apmeApi = useApi(apmeApiRef);

  const [scanning, setScanning] = useState(false);
  const [expectActiveScan, setExpectActiveScan] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [scanError, setScanError] = useState<Error | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const repoUrl = normalizeRepoUrlFromEntity(entity);
  const branch = defaultBranchFromEntity(entity);

  const {
    value: project,
    loading,
    error,
    retry,
  } = useAsyncRetry(async () => {
    if (!repoUrl) return null;
    return apmeApi.getProjectByRepoUrl(repoUrl, branch);
  }, [repoUrl, branch, apmeApi]);

  // Detect active operation on initial project load
  useEffect(() => {
    if (!project?.id) {
      return undefined;
    }
    if (projectHasActiveOperation(project)) {
      setExpectActiveScan(true);
      setScanning(true);
      setScanError(null);
      return undefined;
    }
    let cancelled = false;
    void apmeApi.getOperationState(project.id).then(state => {
      if (cancelled) return;
      if (state?.status === 'failed') {
        setScanning(false);
        setExpectActiveScan(false);
        setScanProgress(null);
        setScanError(new Error(formatOperationError(state.error)));
        return;
      }
      const progressMessage = latestOperationProgressMessage(state);
      if (progressMessage) {
        setScanProgress({ status: 'running', message: progressMessage });
      }
      const active = state && !isTerminalOperationState(state, 0);
      if (active) {
        setExpectActiveScan(true);
        setScanning(true);
        setScanError(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [project, apmeApi]);

  // Poll for scan completion
  const scanningRef = useRef(scanning);
  scanningRef.current = scanning;

  useEffect(() => {
    if (!scanning || !project?.id) {
      return undefined;
    }

    let cancelled = false;
    let pollCount = 0;
    const projectId = project.id;

    const pollInterval = setInterval(async () => {
      if (cancelled) return;
      pollCount += 1;
      try {
        const state = await apmeApi.getOperationState(projectId);
        if (cancelled) return;

        const progressMessage = latestOperationProgressMessage(state);
        if (progressMessage) {
          setScanProgress({
            status: 'running',
            message: progressMessage,
            progress: Math.min(10 + pollCount * 1.5, 90),
          });
        }
        const completed = isTerminalOperationState(
          state,
          pollCount,
          2,
          expectActiveScan,
        );

        if (completed) {
          clearInterval(pollInterval);
          setScanning(false);
          setExpectActiveScan(false);
          if (state?.status === 'failed') {
            setScanProgress(null);
            setScanError(new Error(formatOperationError(state.error)));
          } else {
            setScanProgress({
              status: 'completed',
              message: 'Scan complete',
              progress: 100,
              violationsFound: state?.result?.total_violations,
            });
            setTimeout(() => {
              if (cancelled) return;
              retry();
              setRefreshKey(k => k + 1);
              setScanProgress(null);
            }, 1500);
          }
          return;
        }
      } catch {
        if (cancelled) return;
        clearInterval(pollInterval);
        setScanning(false);
        setExpectActiveScan(false);
        setScanProgress(null);
        return;
      }

      if (pollCount >= MAX_POLLS) {
        clearInterval(pollInterval);
        setScanning(false);
        setExpectActiveScan(false);
        setScanProgress(null);
        setScanError(new Error('Scan timed out. Try again in a moment.'));
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
    };
  }, [scanning, project?.id, apmeApi, retry, expectActiveScan]);

  const handleScan = useCallback(async () => {
    if (!project) return;
    setScanError(null);
    if (projectHasActiveOperation(project)) {
      setExpectActiveScan(true);
      setScanning(true);
      return;
    }
    setScanning(true);
    setExpectActiveScan(true);
    setScanProgress({
      status: 'starting',
      message: `Starting scan for ${project.name}…`,
      progress: 0,
    });
    try {
      await apmeApi.triggerScan(project.id);
    } catch (err) {
      setScanError(err as Error);
      setScanning(false);
      setExpectActiveScan(false);
      setScanProgress(null);
    }
  }, [project, apmeApi]);

  const handleRegister = useCallback(
    async (entityArg: Entity) => {
      if (!repoUrl) return;
      setRegistering(true);
      setRegisterError(null);
      try {
        const name = entityArg.metadata.title || entityArg.metadata.name;
        const newProject = await apmeApi.createProject({
          name,
          repo_url: repoUrl,
          branch,
        });
        await apmeApi.triggerScan(newProject.id);
        setExpectActiveScan(true);
        setScanning(true);
        retry();
      } catch (err) {
        setRegisterError(err as Error);
      } finally {
        setRegistering(false);
      }
    },
    [apmeApi, repoUrl, branch, retry],
  );

  const refreshViolations = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return {
    project,
    loading,
    error,
    scanning,
    scanProgress,
    scanError,
    registering,
    registerError,
    repoUrl,
    branch,
    retry,
    handleScan,
    handleRegister,
    refreshKey,
    refreshViolations,
  };
}
