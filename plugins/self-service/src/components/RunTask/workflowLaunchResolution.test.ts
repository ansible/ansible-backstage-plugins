/*
 * Copyright 2026 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import {
  deepFindWorkflowLaunchPayload,
  parseWorkflowLaunchFromMarkerLine,
  resolveWorkflowLaunchForTask,
} from './workflowLaunchResolution';

describe('deepFindWorkflowLaunchPayload', () => {
  it('finds id+url in nested output', () => {
    expect(
      deepFindWorkflowLaunchPayload({
        output: {
          body: {
            data: {
              id: 7,
              url: 'https://aap.example.com/execution/workflows/7/output',
            },
          },
        },
      }),
    ).toEqual({
      id: 7,
      url: 'https://aap.example.com/execution/workflows/7/output',
    });
  });
});

describe('parseWorkflowLaunchFromMarkerLine', () => {
  it('parses RHAAP_WORKFLOW_LAUNCH_DATA JSON line', () => {
    expect(
      parseWorkflowLaunchFromMarkerLine(
        'prefix RHAAP_WORKFLOW_LAUNCH_DATA {"id":404,"url":"https://aap/execution/workflows/404/output"}',
      ),
    ).toEqual({
      id: 404,
      url: 'https://aap/execution/workflows/404/output',
    });
  });
});

describe('resolveWorkflowLaunchForTask', () => {
  it('resolves from catalog step id and deep output', () => {
    const hit = resolveWorkflowLaunchForTask({
      allSteps: [
        {
          id: 'launch-workflow',
          action: 'rhaap:launch-workflow-job-template',
          output: {
            body: {
              data: {
                id: 9,
                url: 'https://aap/execution/workflows/9/output',
                status: 'running',
              },
            },
          },
        },
      ] as Record<string, unknown>[],
      catalogStepIds: ['launch-workflow'],
    });
    expect(hit).toMatchObject({ id: 9, status: 'running' });
  });

  it('resolves from stepLogs launch marker while step is running', () => {
    const hit = resolveWorkflowLaunchForTask({
      allSteps: [] as Record<string, unknown>[],
      catalogStepIds: [],
      stepLogs: {
        'launch-workflow': [
          'RHAAP_WORKFLOW_LAUNCH_DATA {"id":77,"url":"https://x/execution/workflows/77/output"}',
        ],
      },
    });
    expect(hit).toMatchObject({
      id: 77,
      url: 'https://x/execution/workflows/77/output',
    });
  });

  it('falls back to markdown in stream output', () => {
    const hit = resolveWorkflowLaunchForTask({
      allSteps: [] as Record<string, unknown>[],
      streamOutput: {
        text: [{ content: '**Workflow job ID:** 55 \n**Status:** successful' }],
      },
      catalogStepIds: [],
    });
    expect(hit).toEqual({ id: 55 });
  });
});
