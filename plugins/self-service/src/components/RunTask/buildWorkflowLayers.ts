/*
 * Copyright 2026 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

/**
 * AWX may return related node ids as numbers, or `…/workflow_job_nodes/{id}/`
 * (runtime) or `…/workflow_job_template_nodes/{id}/` (template) URL strings.
 */
export function normalizeWorkflowEdgeTargets(raw: unknown): number[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: number[] = [];
  for (const item of raw) {
    if (typeof item === 'number' && Number.isFinite(item)) {
      out.push(item);
      continue;
    }
    if (typeof item === 'string') {
      const m = item.match(
        /(?:workflow_job_nodes|workflow_job_template_nodes)\/(\d+)\/?$/i,
      );
      if (m) {
        out.push(Number(m[1]));
      }
    }
  }
  return out;
}

export type WorkflowNodeViewModel = {
  id: number;
  level: number;
  label: string;
  statusLabel?: string;
};

/** Status string on the spawned unified job for a workflow node (if any). */
export function spawnedUnifiedJobStatus(
  node: Record<string, unknown>,
): string | undefined {
  const sf = node.summary_fields as Record<string, unknown> | undefined;
  const job = sf?.job as { status?: string } | undefined;
  if (job?.status) {
    return job.status;
  }
  const j = node.job as { status?: string } | number | null | undefined;
  if (
    j &&
    typeof j === 'object' &&
    'status' in j &&
    typeof j.status === 'string'
  ) {
    return j.status;
  }
  return undefined;
}

export function isTerminalUnifiedJobStatus(status: string): boolean {
  const s = status.toLowerCase();
  return ['successful', 'failed', 'error', 'canceled', 'cancelled'].includes(s);
}

function nodeLabel(node: Record<string, unknown>): string {
  const sf = node.summary_fields as Record<string, unknown> | undefined;
  const ujt = sf?.unified_job_template as { name?: string } | undefined;
  if (ujt?.name) {
    return ujt.name;
  }
  const ident = node.identifier;
  if (typeof ident === 'string' && ident.trim()) {
    return ident.trim();
  }
  return `Node ${node.id}`;
}

/**
 * Assigns each workflow job node a layer index for a simple left-to-right DAG layout
 * (longest path from any root). Roots have level 0.
 */
export function computeWorkflowLayers(
  nodes: Record<string, unknown>[],
): WorkflowNodeViewModel[] {
  const byId = new Map<number, Record<string, unknown>>();
  for (const n of nodes) {
    const id = Number(n.id);
    if (Number.isFinite(id)) {
      byId.set(id, n);
    }
  }

  const predecessors = new Map<number, number[]>();
  for (const id of byId.keys()) {
    predecessors.set(id, []);
  }

  for (const [fromId, node] of byId) {
    const targets = [
      ...normalizeWorkflowEdgeTargets(node.success_nodes),
      ...normalizeWorkflowEdgeTargets(node.failure_nodes),
      ...normalizeWorkflowEdgeTargets(node.always_nodes),
    ];
    for (const t of targets) {
      if (!byId.has(t)) {
        continue;
      }
      predecessors.get(t)!.push(fromId);
    }
  }

  const levelMemo = new Map<number, number>();

  function levelOf(id: number): number {
    if (levelMemo.has(id)) {
      return levelMemo.get(id)!;
    }
    const preds = predecessors.get(id) ?? [];
    if (preds.length === 0) {
      levelMemo.set(id, 0);
      return 0;
    }
    const L = Math.max(...preds.map(p => levelOf(p))) + 1;
    levelMemo.set(id, L);
    return L;
  }

  const vms: WorkflowNodeViewModel[] = [];
  for (const id of byId.keys()) {
    const node = byId.get(id)!;
    vms.push({
      id,
      level: levelOf(id),
      label: nodeLabel(node),
      statusLabel: spawnedUnifiedJobStatus(node),
    });
  }

  vms.sort((a, b) => a.level - b.level || a.id - b.id);
  return vms;
}

export function groupNodesIntoLayers(
  vms: WorkflowNodeViewModel[],
): WorkflowNodeViewModel[][] {
  if (vms.length === 0) {
    return [];
  }
  const maxL = Math.max(...vms.map(v => v.level));
  const layers: WorkflowNodeViewModel[][] = Array.from(
    { length: maxL + 1 },
    () => [],
  );
  for (const v of vms) {
    layers[v.level].push(v);
  }
  return layers;
}

export function resolveSpawnedJobId(
  node: Record<string, unknown>,
): number | undefined {
  const j = node.job;
  if (typeof j === 'number' && Number.isFinite(j)) {
    return j;
  }
  if (j && typeof j === 'object' && 'id' in j) {
    const id = Number((j as { id?: unknown }).id);
    if (Number.isFinite(id)) {
      return id;
    }
  }
  const sf = node.summary_fields as Record<string, unknown> | undefined;
  const sj = sf?.job as { id?: unknown } | undefined;
  if (sj && typeof sj.id === 'number' && Number.isFinite(sj.id)) {
    return sj.id;
  }
  return undefined;
}
