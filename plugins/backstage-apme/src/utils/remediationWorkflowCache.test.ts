/*
 * Copyright Red Hat
 */

import type { OperationState } from '@ansible/backstage-apme-common/types';
import {
  clearRemediationWorkflowCache,
  extractTier1FromOperationState,
  isRemediationWorkflowCacheValid,
  loadRemediationWorkflowCache,
  restoreRemediationFromOperationState,
  saveRemediationWorkflowCache,
} from './remediationWorkflowCache';

const project = {
  id: 'proj-1',
  last_scanned_at: '2026-07-08T12:00:00Z',
  scan_count: 3,
};

describe('remediationWorkflowCache', () => {
  beforeEach(() => {
    sessionStorage.clear();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-08T13:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('saves and loads workflow state for a project', () => {
    saveRemediationWorkflowCache(project, {
      remediationStep: 'review',
      remediationActivityId: 'scan-1',
      proposals: [],
      tier1Result: null,
      includeAiInBulk: false,
      approvedProposalIds: [],
      branchPushed: false,
    });

    const loaded = loadRemediationWorkflowCache('proj-1');
    expect(loaded?.remediationStep).toBe('review');
    expect(loaded?.remediationActivityId).toBe('scan-1');
    expect(loaded?.projectId).toBe('proj-1');
  });

  it('invalidates cache after TTL', () => {
    saveRemediationWorkflowCache(project, {
      remediationStep: 'review',
      remediationActivityId: 'scan-1',
      proposals: [],
      tier1Result: null,
      includeAiInBulk: false,
      approvedProposalIds: [],
      branchPushed: false,
    });

    jest.setSystemTime(new Date('2026-07-10T13:00:00Z'));
    expect(loadRemediationWorkflowCache('proj-1')).toBeNull();
  });

  it('clears cache explicitly', () => {
    saveRemediationWorkflowCache(project, {
      remediationStep: 'review',
      remediationActivityId: 'scan-1',
      proposals: [],
      tier1Result: null,
      includeAiInBulk: false,
      approvedProposalIds: [],
      branchPushed: false,
    });
    clearRemediationWorkflowCache('proj-1');
    expect(loadRemediationWorkflowCache('proj-1')).toBeNull();
  });

  it('rejects cache when scan metadata changed', () => {
    const cache = {
      savedAt: new Date().toISOString(),
      projectId: 'proj-1',
      lastScannedAt: '2026-07-08T11:00:00Z',
      scanCount: 2,
      remediationStep: 'review' as const,
      remediationActivityId: 'scan-1',
      proposals: [],
      tier1Result: null,
      includeAiInBulk: false,
      approvedProposalIds: [],
      branchPushed: false,
    };

    expect(
      isRemediationWorkflowCacheValid(cache, {
        last_scanned_at: '2026-07-08T12:00:00Z',
        scan_count: 3,
      }),
    ).toBe(false);
    expect(
      isRemediationWorkflowCacheValid(cache, {
        last_scanned_at: '2026-07-08T11:00:00Z',
        scan_count: 2,
      }),
    ).toBe(true);
  });
});

describe('extractTier1FromOperationState', () => {
  it('returns null when no remediate result is present', () => {
    expect(extractTier1FromOperationState(null)).toBeNull();
    expect(
      extractTier1FromOperationState({
        operation_id: 'op',
        project_id: 'p',
        status: 'completed',
      }),
    ).toBeNull();
  });

  it('extracts tier-1 patches and fixed violations', () => {
    const state: OperationState = {
      operation_id: 'op',
      project_id: 'p',
      status: 'completed',
      result: {
        total_violations: 1,
        fixable: 1,
        remediated: 2,
        remediated_count: 2,
        fixed_violations: [{ rule_id: 'L001', file: 'a.yml', line: 1 }],
        patches: [{ file: 'a.yml', diff: 'diff' }],
      },
    };

    expect(extractTier1FromOperationState(state)).toEqual({
      remediatedCount: 2,
      fixedViolations: [{ rule_id: 'L001', file: 'a.yml', line: 1 }],
      patches: [{ file: 'a.yml', diff: 'diff' }],
    });
  });
});

describe('restoreRemediationFromOperationState', () => {
  it('returns generate step for in-flight remediate operations', () => {
    const restored = restoreRemediationFromOperationState({
      operation_id: 'op',
      project_id: 'p',
      scan_type: 'remediate',
      scan_id: 'scan-1',
      status: 'scanning',
      proposals: [{ id: 'p1' } as never],
    });

    expect(restored).toEqual({
      remediationStep: 'generate',
      remediationActivityId: 'scan-1',
      proposals: [{ id: 'p1' }],
      tier1Result: null,
    });
  });

  it('returns review step when proposals or tier-1 results exist', () => {
    const restored = restoreRemediationFromOperationState({
      operation_id: 'op',
      project_id: 'p',
      scan_type: 'remediate',
      scan_id: 'scan-2',
      status: 'awaiting_approval',
      proposals: [{ id: 'p1' } as never],
    });

    expect(restored?.remediationStep).toBe('generate');

    const completed = restoreRemediationFromOperationState({
      operation_id: 'op',
      project_id: 'p',
      scan_type: 'remediate',
      scan_id: 'scan-3',
      status: 'completed',
      proposals: [{ id: 'p1' } as never],
    });

    expect(completed?.remediationStep).toBe('review');
  });

  it('ignores non-remediate and failed operations', () => {
    expect(
      restoreRemediationFromOperationState({
        operation_id: 'op',
        project_id: 'p',
        scan_type: 'check',
        status: 'completed',
      }),
    ).toBeNull();
    expect(
      restoreRemediationFromOperationState({
        operation_id: 'op',
        project_id: 'p',
        scan_type: 'remediate',
        status: 'failed',
      }),
    ).toBeNull();
  });
});
