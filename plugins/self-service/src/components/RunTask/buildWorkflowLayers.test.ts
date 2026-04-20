/*
 * Copyright 2026 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import {
  computeWorkflowLayers,
  groupNodesIntoLayers,
  normalizeWorkflowEdgeTargets,
  resolveSpawnedJobId,
} from './buildWorkflowLayers';

describe('normalizeWorkflowEdgeTargets', () => {
  it('parses numeric ids and workflow_job_nodes URLs', () => {
    expect(normalizeWorkflowEdgeTargets([2, 3])).toEqual([2, 3]);
    expect(
      normalizeWorkflowEdgeTargets([
        '/api/controller/v2/workflow_job_nodes/9/',
      ]),
    ).toEqual([9]);
    expect(
      normalizeWorkflowEdgeTargets([
        '/api/controller/v2/workflow_job_template_nodes/11/',
      ]),
    ).toEqual([11]);
  });
});

describe('computeWorkflowLayers', () => {
  it('layers a simple chain', () => {
    const nodes = [
      {
        id: 1,
        success_nodes: [2],
        summary_fields: { unified_job_template: { name: 'A' } },
      },
      {
        id: 2,
        success_nodes: [],
        summary_fields: { unified_job_template: { name: 'B' } },
      },
    ] as Record<string, unknown>[];

    const flat = computeWorkflowLayers(nodes);
    expect(flat.find(n => n.id === 1)?.level).toBe(0);
    expect(flat.find(n => n.id === 2)?.level).toBe(1);
    const layers = groupNodesIntoLayers(flat);
    expect(layers).toHaveLength(2);
    expect(layers[0].map(x => x.id)).toEqual([1]);
    expect(layers[1].map(x => x.id)).toEqual([2]);
  });
});

describe('resolveSpawnedJobId', () => {
  it('reads numeric job id', () => {
    expect(resolveSpawnedJobId({ job: 55 })).toBe(55);
    expect(resolveSpawnedJobId({ job: { id: 66 } })).toBe(66);
    expect(
      resolveSpawnedJobId({
        summary_fields: { job: { id: 77 } },
      }),
    ).toBe(77);
  });
});
