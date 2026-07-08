/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  isActiveOperationStatus,
  isTerminalOperationState,
  latestOperationProgressPercent,
  isCheckOperation,
  isRemediateOperation,
  formatScanProgressMessage,
  formatGenerateProgressMessage,
} from './operationStatus';

describe('operationStatus', () => {
  it('treats gateway in-flight statuses as active', () => {
    expect(isActiveOperationStatus('scanning')).toBe(true);
    expect(isActiveOperationStatus('cloning')).toBe(true);
    expect(isActiveOperationStatus('applying')).toBe(true);
    expect(isActiveOperationStatus('awaiting_approval')).toBe(true);
    expect(isActiveOperationStatus('completed')).toBe(false);
  });

  it('does not treat cloning as terminal during polling', () => {
    expect(
      isTerminalOperationState(
        {
          operation_id: 'op',
          project_id: 'p',
          status: 'cloning',
        },
        1,
      ),
    ).toBe(false);
  });

  it('terminal when null after min polls', () => {
    expect(isTerminalOperationState(null, 1)).toBe(false);
    expect(isTerminalOperationState(null, 3)).toBe(true);
  });

  it('waits for explicit state when requested', () => {
    expect(isTerminalOperationState(null, 10, 2, true)).toBe(false);
  });

  it('terminal when status is failed or completed', () => {
    expect(
      isTerminalOperationState(
        {
          operation_id: 'op',
          project_id: 'p',
          status: 'failed',
          progress_pct: 0,
        },
        1,
      ),
    ).toBe(true);
    expect(
      isTerminalOperationState(
        {
          operation_id: 'op',
          project_id: 'p',
          status: 'awaiting_approval',
        },
        1,
      ),
    ).toBe(true);
  });

  it('reads progress percent from gateway progress log', () => {
    expect(
      latestOperationProgressPercent({
        operation_id: 'op',
        project_id: 'p',
        status: 'scanning',
        progress: [
          { phase: 'scan', message: 'Starting', timestamp: 't1' },
          { phase: 'scan', message: 'Halfway', timestamp: 't2', progress: 42 },
        ],
      }),
    ).toBe(42);
  });

  it('classifies check vs remediate operations', () => {
    expect(
      isCheckOperation({
        operation_id: 'op',
        project_id: 'p',
        status: 'scanning',
        scan_type: 'check',
      }),
    ).toBe(true);
    expect(
      isRemediateOperation({
        operation_id: 'op',
        project_id: 'p',
        status: 'generating',
        scan_type: 'remediate',
      }),
    ).toBe(true);
  });

  it('qualifies engine fixed messages for generate progress', () => {
    expect(
      formatGenerateProgressMessage(
        'Graph Tier 1 converged: 1 pass(es), 12 fixed, 12 nodes modified',
      ),
    ).toBe('12 fixes proposed — review and include before pushing');
    expect(formatScanProgressMessage(null)).toBe('Scanning…');
  });
});
