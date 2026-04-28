/*
 * Copyright 2026 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { rhAapAuthApiRef } from '../../apis';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import type { Entity } from '@backstage/catalog-model';
import {
  Box,
  CircularProgress,
  Link,
  Paper,
  Typography,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { useTaskEventStream } from '@backstage/plugin-scaffolder-react';
import { WorkflowJobTaskPanel } from './WorkflowJobTaskPanel';
import {
  catalogWorkflowLaunchStepIds,
  isWorkflowJobTemplateEntity,
  resolveWorkflowLaunchForTask,
} from './workflowLaunchResolution';
import { pickAapTokenFromParameters } from './runTaskParameters';

function taskSpecHasWorkflowLaunchStep(
  task: { spec?: unknown } | undefined,
): boolean {
  const steps = (task?.spec as { steps?: unknown[] } | undefined)?.steps;
  if (!Array.isArray(steps)) {
    return false;
  }
  return steps.some(
    s =>
      s &&
      typeof s === 'object' &&
      (s as { action?: string }).action ===
        'rhaap:launch-workflow-job-template',
  );
}

/**
 * Workflow graph + node logs for catalog workflow job templates. Mount on any
 * scaffolder task route; returns null for non-workflow templates (after load).
 */
export function WorkflowJobTaskSection() {
  const { taskId } = useParams<{ taskId: string }>();
  const catalogApi = useApi(catalogApiRef);
  const aapAuth = useApi(rhAapAuthApiRef);
  const [templateEntity, setTemplateEntity] = useState<Entity | null>(null);

  const {
    task,
    loading,
    output,
    steps: stepsMap,
    stepLogs,
  } = useTaskEventStream(taskId ?? '');

  useEffect(() => {
    const ref = task?.spec?.templateInfo?.entityRef;
    if (!ref) {
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const entity = await catalogApi.getEntityByRef(ref);
        if (!cancelled && entity) {
          setTemplateEntity(entity);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [task?.spec?.templateInfo?.entityRef, catalogApi]);

  const allSteps = useMemo(
    () =>
      task?.spec.steps.map(step => ({
        ...step,
        ...stepsMap?.[step.id],
      })) ?? [],
    [task, stepsMap],
  );

  const catalogIds = useMemo(
    () => catalogWorkflowLaunchStepIds(templateEntity),
    [templateEntity],
  );

  const launchWorkflowOutput = useMemo(
    () =>
      resolveWorkflowLaunchForTask({
        allSteps: allSteps as Record<string, unknown>[],
        stepsMap: stepsMap as Record<string, unknown> | undefined,
        stepLogs: stepLogs as Record<string, string[]> | undefined,
        streamOutput: output as
          | { text?: Array<{ content?: string }> }
          | undefined,
        catalogStepIds: catalogIds,
      }),
    [allSteps, stepsMap, stepLogs, output, catalogIds],
  );

  const isWfTemplate =
    isWorkflowJobTemplateEntity(templateEntity) ||
    taskSpecHasWorkflowLaunchStep(task);

  const workflowJobTemplateIdFromCatalog = useMemo(() => {
    const raw = (
      templateEntity?.metadata as
        | { aapWorkflowJobTemplateId?: unknown }
        | undefined
    )?.aapWorkflowJobTemplateId;
    if (raw === undefined || raw === null) {
      return undefined;
    }
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [templateEntity]);

  const paramToken = pickAapTokenFromParameters(
    task?.spec?.parameters as Record<string, unknown> | undefined,
  );

  /** OAuth token when parameters do not contain a PAT (Launch flow puts `aapToken` only in secrets). */
  const [oauthToken, setOauthToken] = useState<string | undefined>(undefined);
  const [oauthResolved, setOauthResolved] = useState(false);

  useEffect(() => {
    if (paramToken) {
      setOauthResolved(true);
      return undefined;
    }
    let cancelled = false;
    setOauthResolved(false);
    setOauthToken(undefined);
    aapAuth
      .getAccessToken()
      .then(token => {
        if (!cancelled) {
          setOauthToken(
            typeof token === 'string' && token.trim()
              ? token.trim()
              : undefined,
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOauthToken(undefined);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setOauthResolved(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [paramToken, aapAuth, taskId]);

  const aapToken = paramToken ?? oauthToken;

  const showSection = isWfTemplate || launchWorkflowOutput !== null;

  if (!taskId || !task || loading) {
    return null;
  }

  if (!showSection) {
    return null;
  }

  return (
    <Box data-testid="ansible-workflow-job-section" marginBottom={2}>
      <Typography variant="subtitle1" style={{ marginBottom: 8 }}>
        Ansible Automation Platform workflow
      </Typography>

      {!oauthResolved && !paramToken ? (
        <Paper style={{ padding: 16 }}>
          <Box display="flex" alignItems="center" style={{ gap: 12 }}>
            <CircularProgress size={22} />
            <Typography variant="body2" color="textSecondary">
              Connecting to Ansible Automation Platform for live workflow data…
            </Typography>
          </Box>
        </Paper>
      ) : aapToken ? (
        launchWorkflowOutput ? (
          <WorkflowJobTaskPanel
            key={`wf-job-${launchWorkflowOutput.id}`}
            workflowJobId={launchWorkflowOutput.id}
            workflowJobTemplateId={workflowJobTemplateIdFromCatalog}
            openInAapUrl={launchWorkflowOutput.url}
            initialStatus={launchWorkflowOutput.status}
            aapToken={aapToken}
          />
        ) : workflowJobTemplateIdFromCatalog ? (
          <WorkflowJobTaskPanel
            key="wf-preview"
            workflowJobTemplateId={workflowJobTemplateIdFromCatalog}
            aapToken={aapToken}
            previewBanner="Scaffolder is still running earlier steps or the launch action has not returned yet. Showing template topology from the catalog; live workflow status appears as soon as the workflow job id is available."
          />
        ) : (
          <Paper style={{ padding: 16 }}>
            <Box display="flex" alignItems="center" style={{ gap: 12 }}>
              <CircularProgress size={22} />
              <Typography variant="body2" color="textSecondary">
                Waiting for the workflow launch step to return a job id, or for
                catalog metadata <code>aapWorkflowJobTemplateId</code> so we can
                show template topology…
              </Typography>
            </Box>
          </Paper>
        )
      ) : launchWorkflowOutput ? (
        <Alert severity="info">
          <Typography variant="body2">
            Workflow job <strong>{launchWorkflowOutput.id}</strong> was started.
            To load the visualizer and node logs here, sign in to Ansible
            Automation Platform (OAuth) or include an AAP token in template
            parameters. Open the run in Ansible Automation Platform
            {launchWorkflowOutput.url ? (
              <>
                {' '}
                (
                <Link
                  href={launchWorkflowOutput.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  workflow job
                </Link>
                ).
              </>
            ) : (
              '.'
            )}
          </Typography>
        </Alert>
      ) : (
        <Alert severity="info">
          <Typography variant="body2">
            Sign in to Ansible Automation Platform (OAuth) or include an AAP
            token in template parameters to load the workflow visualizer and
            node logs once the workflow job is created.
          </Typography>
        </Alert>
      )}
    </Box>
  );
}
