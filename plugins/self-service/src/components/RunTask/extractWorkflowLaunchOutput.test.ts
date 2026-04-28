/*
 * Copyright 2026 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { extractWorkflowLaunchOutput } from './extractWorkflowLaunchOutput';

describe('extractWorkflowLaunchOutput', () => {
  it('reads output.data', () => {
    expect(
      extractWorkflowLaunchOutput({
        output: { data: { id: 7, url: 'https://aap/wf/7' } },
      }),
    ).toEqual({ id: 7, url: 'https://aap/wf/7' });
  });

  it('reads output.body.data', () => {
    expect(
      extractWorkflowLaunchOutput({
        output: {
          body: { data: { id: 8, status: 'successful' } },
        },
      }),
    ).toEqual({ id: 8, status: 'successful' });
  });

  it('returns null when missing id', () => {
    expect(extractWorkflowLaunchOutput({ output: {} })).toBeNull();
  });
});
