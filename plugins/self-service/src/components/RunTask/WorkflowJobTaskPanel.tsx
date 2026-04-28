/*
 * Copyright 2026 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import {
  Box,
  Chip,
  CircularProgress,
  Link,
  Paper,
  Tab,
  Tabs,
  Typography,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import {
  computeWorkflowLayers,
  groupNodesIntoLayers,
  isTerminalUnifiedJobStatus,
  resolveSpawnedJobId,
  spawnedUnifiedJobStatus,
} from './buildWorkflowLayers';

/** Poll workflow job + nodes while the workflow is non-terminal. */
const POLL_INTERVAL_MS = 8000;
/** Tail stdout while the spawned unified job is still running. */
const STDOUT_POLL_WHILE_RUNNING_MS = 4000;

function isTerminalWorkflowStatus(status: string): boolean {
  const s = status.toLowerCase();
  return ['successful', 'failed', 'error', 'canceled'].includes(s);
}

function statusChipColor(status: string): 'default' | 'primary' | 'secondary' {
  const s = status.toLowerCase();
  if (s === 'successful') {
    return 'primary';
  }
  if (s === 'running' || s === 'pending' || s === 'waiting') {
    return 'default';
  }
  if (s === 'failed' || s === 'error' || s === 'canceled') {
    return 'secondary';
  }
  return 'default';
}

export type WorkflowJobTaskPanelProps = {
  /** Omitted until the launch step returns — template topology only from catalog WFJT id. */
  workflowJobId?: number;
  aapToken: string;
  /** WFJT catalog id (`metadata.aapWorkflowJobTemplateId`). */
  workflowJobTemplateId?: number;
  openInAapUrl?: string;
  initialStatus?: string;
  /** When showing template-only preview before `workflowJobId` exists. */
  previewBanner?: string;
};

export function WorkflowJobTaskPanel(props: WorkflowJobTaskPanelProps) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  const hasLiveWorkflowJob = useMemo(() => {
    const id = props.workflowJobId;
    return id !== undefined && Number.isFinite(Number(id)) && Number(id) > 0;
  }, [props.workflowJobId]);

  const [tab, setTab] = useState(0);
  const [workflowJob, setWorkflowJob] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [nodes, setNodes] = useState<Record<string, unknown>[]>([]);
  const [templateNodes, setTemplateNodes] = useState<Record<string, unknown>[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [stdout, setStdout] = useState<string | null>(null);
  const [stdoutLoading, setStdoutLoading] = useState(false);

  const fetchLiveState = useCallback(async () => {
    const base = await discoveryApi.getBaseUrl('catalog');
    const headers = { 'X-AAP-Bearer-Token': props.aapToken };

    if (!hasLiveWorkflowJob) {
      let wfjtId =
        props.workflowJobTemplateId !== undefined &&
        Number.isFinite(Number(props.workflowJobTemplateId))
          ? Number(props.workflowJobTemplateId)
          : undefined;

      if (!(wfjtId !== undefined && wfjtId > 0)) {
        throw new Error(
          'Workflow template id missing — cannot load workflow preview.',
        );
      }

      setWorkflowJob(null);
      setNodes([]);

      const templateRes = await fetchApi.fetch(
        `${base}/ansible/aap/workflow-job-templates/${wfjtId}/workflow_nodes`,
        { headers },
      );
      if (!templateRes.ok) {
        const t = await templateRes.text();
        throw new Error(t || templateRes.statusText);
      }
      const templateJson = await templateRes.json();
      setTemplateNodes(
        Array.isArray(templateJson.results)
          ? (templateJson.results as Record<string, unknown>[])
          : [],
      );
      setError(null);
      return;
    }

    const wfJobId = Number(props.workflowJobId);

    const wfRes = await fetchApi.fetch(
      `${base}/ansible/aap/workflow-jobs/${wfJobId}`,
      { headers },
    );
    const nodeRes = await fetchApi.fetch(
      `${base}/ansible/aap/workflow-jobs/${wfJobId}/workflow_nodes`,
      { headers },
    );

    if (!wfRes.ok) {
      const t = await wfRes.text();
      throw new Error(t || wfRes.statusText);
    }
    if (!nodeRes.ok) {
      const t = await nodeRes.text();
      throw new Error(t || nodeRes.statusText);
    }

    const wfJson = (await wfRes.json()) as Record<string, unknown>;
    const nodeJson = await nodeRes.json();

    setWorkflowJob(wfJson);

    let wfjtId =
      props.workflowJobTemplateId !== undefined &&
      Number.isFinite(Number(props.workflowJobTemplateId))
        ? Number(props.workflowJobTemplateId)
        : undefined;

    const sf = wfJson.summary_fields as Record<string, unknown> | undefined;
    const wjt = sf?.workflow_job_template as { id?: unknown } | undefined;
    if (wjt?.id !== undefined) {
      const n = Number(wjt.id);
      if (Number.isFinite(n) && n > 0) {
        wfjtId = wfjtId ?? n;
      }
    }

    const runtimeResults = Array.isArray(nodeJson.results)
      ? (nodeJson.results as Record<string, unknown>[])
      : [];
    setNodes(runtimeResults);

    if (wfjtId !== undefined && wfjtId > 0) {
      const templateRes = await fetchApi.fetch(
        `${base}/ansible/aap/workflow-job-templates/${wfjtId}/workflow_nodes`,
        { headers },
      );
      if (templateRes.ok) {
        const templateJson = await templateRes.json();
        setTemplateNodes(
          Array.isArray(templateJson.results)
            ? (templateJson.results as Record<string, unknown>[])
            : [],
        );
      } else {
        setTemplateNodes([]);
      }
    } else {
      setTemplateNodes([]);
    }

    setError(null);
  }, [
    discoveryApi,
    fetchApi,
    props.aapToken,
    props.workflowJobId,
    props.workflowJobTemplateId,
    hasLiveWorkflowJob,
  ]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        await fetchLiveState();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchLiveState]);

  const wfStatusRaw = String(workflowJob?.status ?? '').trim();
  const wfStatus =
    wfStatusRaw ||
    (props.initialStatus ? String(props.initialStatus) : '') ||
    (!hasLiveWorkflowJob ? 'pending launch' : 'unknown');
  const terminal = wfStatusRaw !== '' && isTerminalWorkflowStatus(wfStatusRaw);

  useEffect(() => {
    if (!hasLiveWorkflowJob || workflowJob === null || terminal) {
      return undefined;
    }
    const id = window.setInterval(() => {
      void fetchLiveState().catch(e =>
        setError(e instanceof Error ? e.message : String(e)),
      );
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [hasLiveWorkflowJob, workflowJob, terminal, fetchLiveState]);

  const graphNodesForWorkflow = useMemo(() => {
    if (nodes.length > 0) {
      return nodes;
    }
    return templateNodes;
  }, [nodes, templateNodes]);

  const skeletonTemplateTopology =
    nodes.length === 0 && templateNodes.length > 0;

  const workflowFlatNodes = useMemo(
    () => computeWorkflowLayers(graphNodesForWorkflow),
    [graphNodesForWorkflow],
  );

  const layers = useMemo(
    () => groupNodesIntoLayers(workflowFlatNodes),
    [workflowFlatNodes],
  );

  const runtimeFlatNodesForLogs = useMemo(
    () => computeWorkflowLayers(nodes),
    [nodes],
  );

  const selectedNode = useMemo(
    () => nodes.find(n => Number(n.id) === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const selectedSpawnedJobStatus = selectedNode
    ? spawnedUnifiedJobStatus(selectedNode)
    : undefined;

  useEffect(() => {
    if (tab !== 1 || !selectedNode) {
      setStdout(null);
      setStdoutLoading(false);
      return undefined;
    }

    const jobId = resolveSpawnedJobId(selectedNode);
    if (!jobId) {
      setStdout(null);
      return undefined;
    }

    let cancelled = false;
    let pollTimer: number | undefined;
    let firstFetch = true;

    const loadStdout = async () => {
      const jid = resolveSpawnedJobId(selectedNode);
      if (!jid) {
        return;
      }
      if (firstFetch) {
        setStdoutLoading(true);
      }
      try {
        const base = await discoveryApi.getBaseUrl('catalog');
        const r = await fetchApi.fetch(
          `${base}/ansible/aap/jobs/${jid}/stdout`,
          { headers: { 'X-AAP-Bearer-Token': props.aapToken } },
        );
        const text = await r.text();
        if (!cancelled) {
          setStdout(text);
        }
      } catch {
        if (!cancelled) {
          setStdout(
            'Could not load job output from Ansible Automation Platform.',
          );
        }
      } finally {
        if (!cancelled && firstFetch) {
          setStdoutLoading(false);
          firstFetch = false;
        }
      }
    };

    void loadStdout();

    const st = spawnedUnifiedJobStatus(selectedNode);
    const pollStdout = st !== undefined && !isTerminalUnifiedJobStatus(st);

    if (pollStdout) {
      pollTimer = window.setInterval(() => {
        void loadStdout();
      }, STDOUT_POLL_WHILE_RUNNING_MS);
    }

    return () => {
      cancelled = true;
      if (pollTimer !== undefined) {
        window.clearInterval(pollTimer);
      }
    };
  }, [
    tab,
    selectedNode,
    selectedSpawnedJobStatus,
    discoveryApi,
    fetchApi,
    props.aapToken,
  ]);

  return (
    <Paper style={{ padding: 16, marginBottom: 24 }}>
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        style={{ gap: 8 }}
        marginBottom={2}
      >
        <Typography variant="h6">
          Automation workflow (Ansible Automation Platform)
        </Typography>
        <Box display="flex" alignItems="center" style={{ gap: 8 }}>
          <Chip
            size="small"
            label={
              hasLiveWorkflowJob
                ? `Workflow job ${props.workflowJobId}`
                : 'Workflow job pending'
            }
            variant="outlined"
          />
          <Chip
            size="small"
            label={wfStatus || 'unknown'}
            color={statusChipColor(wfStatus)}
          />
          {props.openInAapUrl ? (
            <Link href={props.openInAapUrl} target="_blank" rel="noopener">
              Open in AAP
            </Link>
          ) : null}
        </Box>
      </Box>

      {props.previewBanner ? (
        <Alert severity="info" style={{ marginBottom: 12 }}>
          {props.previewBanner}
        </Alert>
      ) : null}

      <Typography variant="body2" color="textSecondary" paragraph>
        {hasLiveWorkflowJob
          ? 'The workflow graph refreshes from Ansible Automation Platform while the job runs. Template topology may appear first; node status updates when runtime workflow nodes are available.'
          : 'Template topology from the catalog workflow job template. Live status appears after the launch step creates a workflow job.'}
      </Typography>

      {loading ? (
        <Box display="flex" justifyContent="center" padding={2}>
          <CircularProgress size={28} />
        </Box>
      ) : null}

      {error ? (
        <Alert severity="error" style={{ marginBottom: 12 }}>
          {error}
        </Alert>
      ) : null}

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        indicatorColor="primary"
        textColor="primary"
      >
        <Tab label="Workflow" />
        <Tab label="Node logs" />
      </Tabs>

      {tab === 0 ? (
        <Box marginTop={2}>
          {skeletonTemplateTopology ? (
            <Alert severity="info" style={{ marginBottom: 12 }}>
              Showing <strong>template</strong> topology until Controller
              creates runtime nodes for this run.
            </Alert>
          ) : null}
          {layers.length === 0 ? (
            <Typography variant="body2" color="textSecondary">
              No workflow nodes returned yet. If the job is waiting on approval,
              refresh after approvers act in Ansible Automation Platform.
            </Typography>
          ) : (
            layers.map((layer, idx) => (
              <Box
                key={`layer-${idx}`}
                display="flex"
                flexWrap="wrap"
                style={{ gap: 8 }}
                marginBottom={1}
              >
                {layer.map(n => (
                  <Paper
                    key={n.id}
                    variant="outlined"
                    style={{ padding: '8px 12px', maxWidth: 280 }}
                  >
                    <Typography variant="subtitle2">{n.label}</Typography>
                    {n.statusLabel ? (
                      <Typography variant="caption" color="textSecondary">
                        {n.statusLabel}
                      </Typography>
                    ) : (
                      <Typography variant="caption" color="textSecondary">
                        —
                      </Typography>
                    )}
                  </Paper>
                ))}
              </Box>
            ))
          )}
        </Box>
      ) : (
        <Box marginTop={2}>
          <Typography variant="body2" paragraph color="textSecondary">
            Select a node that spawned a playbook job to load stdout. Output
            refreshes while the job runs and stops polling when the job
            finishes. Approval and inventory update nodes may not expose
            playbook output here.
          </Typography>
          <Box display="flex" flexWrap="wrap" style={{ gap: 8 }}>
            {nodes.length === 0 ? (
              <Typography variant="body2" color="textSecondary">
                {hasLiveWorkflowJob
                  ? 'Runtime nodes will appear here as jobs start. Open the Workflow tab to see template topology meanwhile.'
                  : 'Node logs are available after the workflow job is created. Open the Workflow tab for template topology meanwhile.'}
              </Typography>
            ) : (
              runtimeFlatNodesForLogs.map(n => (
                <Chip
                  key={n.id}
                  label={`${n.label}${n.statusLabel ? ` (${n.statusLabel})` : ''}`}
                  onClick={() => setSelectedNodeId(n.id)}
                  color={selectedNodeId === n.id ? 'primary' : 'default'}
                  variant={selectedNodeId === n.id ? 'default' : 'outlined'}
                />
              ))
            )}
          </Box>
          <Box marginTop={2}>
            {selectedNode && !resolveSpawnedJobId(selectedNode) ? (
              <Typography variant="body2">
                This node does not have a playbook job yet (for example approval
                or blocked downstream). Check status in Ansible Automation
                Platform.
              </Typography>
            ) : null}
            {stdoutLoading ? (
              <CircularProgress size={24} />
            ) : stdout ? (
              <Box
                component="pre"
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: 12,
                  maxHeight: 420,
                  overflow: 'auto',
                  padding: 12,
                  background: 'rgba(0,0,0,0.04)',
                  borderRadius: 4,
                }}
              >
                {stdout}
              </Box>
            ) : selectedNode ? (
              <Typography variant="body2" color="textSecondary">
                No stdout loaded.
              </Typography>
            ) : (
              <Typography variant="body2" color="textSecondary">
                Select a node above.
              </Typography>
            )}
          </Box>
        </Box>
      )}
    </Paper>
  );
}
