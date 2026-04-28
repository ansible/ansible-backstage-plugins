/*
 * Copyright 2026 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

/** Data emitted by `rhaap:launch-workflow-job-template` (`ctx.output('data', …)`). */
export type WorkflowLaunchOutputData = {
  id: number;
  url?: string;
  status?: string;
  waitSkipped?: boolean;
};

function isLaunchPayload(data: unknown): data is WorkflowLaunchOutputData {
  return (
    !!data &&
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    typeof (data as { id: unknown }).id === 'number'
  );
}

/**
 * Pulls launch result from a merged scaffolder step. Handles both direct
 * `output.data` and newer shapes that nest under `output.body.data`.
 */
export function extractWorkflowLaunchOutput(
  step: Record<string, unknown> | undefined,
): WorkflowLaunchOutputData | null {
  if (!step?.output || typeof step.output !== 'object') {
    return null;
  }
  const out = step.output as Record<string, unknown>;
  const body = out.body;
  const fromBody =
    body && typeof body === 'object'
      ? (body as Record<string, unknown>).data
      : undefined;

  const candidates: unknown[] = [fromBody, out.data, out.output, out];

  for (const c of candidates) {
    if (isLaunchPayload(c)) {
      return c;
    }
    if (
      c &&
      typeof c === 'object' &&
      'data' in c &&
      isLaunchPayload((c as { data: unknown }).data)
    ) {
      return (c as { data: WorkflowLaunchOutputData }).data;
    }
  }

  return null;
}
