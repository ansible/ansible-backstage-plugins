/*
 * Copyright 2026 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type { WorkflowLaunchOutputData } from './extractWorkflowLaunchOutput';
import { extractWorkflowLaunchOutput } from './extractWorkflowLaunchOutput';

/** Logged by `rhaap:launch-workflow-job-template` as soon as Controller returns a workflow job id (before wait). */
const WORKFLOW_LAUNCH_LOG_MARKER = 'RHAAP_WORKFLOW_LAUNCH_DATA ';

/** Parses {@link WORKFLOW_LAUNCH_LOG_MARKER} + JSON from a single log line or text blob. */
export function parseWorkflowLaunchFromMarkerLine(
  line: string,
): WorkflowLaunchOutputData | null {
  const i = line.indexOf(WORKFLOW_LAUNCH_LOG_MARKER);
  if (i === -1) {
    return null;
  }
  const jsonPart = line.slice(i + WORKFLOW_LAUNCH_LOG_MARKER.length).trim();
  try {
    const parsed = JSON.parse(jsonPart) as {
      id?: unknown;
      url?: unknown;
    };
    const id = Number(parsed.id);
    if (!Number.isFinite(id) || id <= 0) {
      return null;
    }
    const url =
      typeof parsed.url === 'string' &&
      parsed.url.includes('/execution/workflows/')
        ? parsed.url
        : undefined;
    return url ? { id, url } : { id };
  } catch {
    return null;
  }
}

/** Scaffolder `stepLogs` map: step id -> log lines (Markdown). */
export function parseWorkflowLaunchFromStepLogs(
  stepLogs: unknown,
): WorkflowLaunchOutputData | null {
  if (!stepLogs || typeof stepLogs !== 'object' || Array.isArray(stepLogs)) {
    return null;
  }
  for (const logs of Object.values(stepLogs as Record<string, unknown>)) {
    if (!Array.isArray(logs)) {
      continue;
    }
    for (const line of logs) {
      if (typeof line !== 'string') {
        continue;
      }
      const hit = parseWorkflowLaunchFromMarkerLine(line);
      if (hit) {
        return hit;
      }
    }
  }
  return null;
}

/** Walk nested step / event payloads for the shape returned after `launchWorkflowJobTemplate`. */
export function deepFindWorkflowLaunchPayload(
  root: unknown,
): WorkflowLaunchOutputData | null {
  const seen = new Set<unknown>();

  function walk(x: unknown): WorkflowLaunchOutputData | null {
    if (!x || typeof x !== 'object') {
      return null;
    }
    if (seen.has(x)) {
      return null;
    }
    seen.add(x);

    if (Array.isArray(x)) {
      for (const item of x) {
        const r = walk(item);
        if (r) {
          return r;
        }
      }
      return null;
    }

    const o = x as Record<string, unknown>;
    const id = o.id;
    const url = o.url;
    if (
      typeof id === 'number' &&
      Number.isFinite(id) &&
      id > 0 &&
      typeof url === 'string' &&
      url.includes('/execution/workflows/')
    ) {
      return {
        id,
        url,
        status: typeof o.status === 'string' ? o.status : undefined,
        waitSkipped:
          typeof o.waitSkipped === 'boolean' ? o.waitSkipped : undefined,
      };
    }

    for (const v of Object.values(o)) {
      const r = walk(v);
      if (r) {
        return r;
      }
    }
    return null;
  }

  return walk(root);
}

export function parseWorkflowJobIdFromMarkdown(
  content: string,
): number | undefined {
  const patterns = [
    /\*\*Workflow job ID:\*\*\s*(\d+)/i,
    /Workflow job ID[:\s*]+\*?\*?\s*(\d+)/i,
    /Workflow job\s*#?\s*(\d+)/i,
  ];
  for (const re of patterns) {
    const m = content.match(re);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) {
        return n;
      }
    }
  }
  return undefined;
}

export function catalogWorkflowLaunchStepIds(
  entity: { spec?: unknown } | null | undefined,
): string[] {
  const steps = (entity?.spec as { steps?: unknown } | undefined)?.steps;
  if (!Array.isArray(steps)) {
    return [];
  }
  const ids: string[] = [];
  for (const s of steps) {
    if (!s || typeof s !== 'object') {
      continue;
    }
    const step = s as { id?: string; action?: string };
    if (
      step.action === 'rhaap:launch-workflow-job-template' &&
      typeof step.id === 'string'
    ) {
      ids.push(step.id);
    }
  }
  return ids;
}

export function isWorkflowJobTemplateEntity(
  entity: { spec?: unknown; metadata?: unknown } | null | undefined,
): boolean {
  const specType = (entity?.spec as { type?: string } | undefined)?.type;
  if (specType === 'workflow-job-template') {
    return true;
  }
  const ann = (
    entity?.metadata as { annotations?: Record<string, string> } | undefined
  )?.annotations;
  return ann?.['ansible.redhat.com/template-kind'] === 'workflow-job-template';
}

export type ResolveWorkflowLaunchArgs = {
  /** Merged runtime steps (`spec.steps` + stream `steps[id]`). */
  allSteps: Record<string, unknown>[];
  /** Raw `steps` map from `useTaskEventStream` before merge. */
  stepsMap?: Record<string, unknown>;
  /** `stepLogs` from `useTaskEventStream` — includes early launch marker while the step is still running. */
  stepLogs?: Record<string, string[]>;
  /** `output` from `useTaskEventStream` (template output / links). */
  streamOutput?: { text?: Array<{ content?: string; title?: string }> };
  catalogStepIds: string[];
};

export function resolveWorkflowLaunchForTask(
  args: ResolveWorkflowLaunchArgs,
): WorkflowLaunchOutputData | null {
  const { allSteps, stepsMap, stepLogs, streamOutput, catalogStepIds } = args;

  const fromLogs = parseWorkflowLaunchFromStepLogs(stepLogs);
  if (fromLogs) {
    return fromLogs;
  }

  const tryStep = (step: Record<string, unknown> | undefined) => {
    if (!step) {
      return null;
    }
    return (
      extractWorkflowLaunchOutput(step) ?? deepFindWorkflowLaunchPayload(step)
    );
  };

  for (const sid of catalogStepIds) {
    const step = allSteps.find(s => s.id === sid) as
      | Record<string, unknown>
      | undefined;
    const hit = tryStep(step);
    if (hit) {
      return hit;
    }
  }

  for (const s of allSteps) {
    const step = s as Record<string, unknown>;
    if (
      step.action === 'rhaap:launch-workflow-job-template' ||
      step.id === 'launch-workflow'
    ) {
      const hit = tryStep(step);
      if (hit) {
        return hit;
      }
    }
  }

  for (const s of allSteps) {
    const hit = tryStep(s as Record<string, unknown>);
    if (hit) {
      return hit;
    }
  }

  if (stepsMap) {
    const hit = deepFindWorkflowLaunchPayload(stepsMap);
    if (hit) {
      return hit;
    }
  }

  for (const t of streamOutput?.text ?? []) {
    const content = t.content ?? '';
    const early = parseWorkflowLaunchFromMarkerLine(content);
    if (early) {
      return early;
    }
    const id = parseWorkflowJobIdFromMarkdown(content);
    if (id !== undefined) {
      return { id };
    }
  }

  return null;
}
