import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { screen, waitFor } from '@testing-library/react';
import {
  RemediationExecution,
  computeProgress,
  extractTasksFromEvents,
  groupTasksByRule,
  computeRuleProgress,
  computeRuleStatus,
} from './RemediationExecution';
import type { RuleGroup } from './RemediationExecution';
import { complianceApiRef } from '../../api';
import { createMockComplianceApi } from '../../__testutils__/mockComplianceApi';
import type { ComplianceApi } from '../../api';
import type { JobEvent, MultiHostFinding, RemediationSelection } from '@ansible/backstage-compliance-common/types';

const mockUseParams = jest.fn().mockReturnValue({ jobId: '99' });
const mockUseSearchParams = jest.fn().mockReturnValue([new URLSearchParams(), jest.fn()]);

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => mockUseParams(),
  useNavigate: () => jest.fn(),
  useSearchParams: () => mockUseSearchParams(),
}));

jest.mock('@backstage/plugin-permission-react', () => ({
  usePermission: () => ({ allowed: true, loading: false }),
}));

// ─── Utility function tests ─────────────────────────────────────────

describe('computeProgress', () => {
  it('returns 0 for empty nodes array', () => {
    expect(computeProgress([])).toBe(0);
  });

  it('returns 100 when all nodes are successful', () => {
    expect(computeProgress([{ status: 'successful' }, { status: 'successful' }])).toBe(100);
  });

  it('returns 50% for one successful and one pending', () => {
    expect(computeProgress([{ status: 'successful' }, { status: 'pending' }])).toBe(50);
  });

  it('counts running/waiting nodes at 50% weight', () => {
    const result = computeProgress([{ status: 'running' }, { status: 'waiting' }]);
    expect(result).toBe(50);
  });

  it('counts failed/error nodes at 100% weight', () => {
    expect(computeProgress([{ status: 'failed' }])).toBe(100);
    expect(computeProgress([{ status: 'error' }])).toBe(100);
  });
});

describe('extractTasksFromEvents', () => {
  const makeEvent = (task: string, event: string, host = 'web-01'): JobEvent => ({
    id: Math.random(),
    event,
    host_name: host,
    event_data: { task, host },
  } as unknown as JobEvent);

  it('extracts tasks from runner_on_ok events', () => {
    const events = [makeEvent('Install SSH config', 'runner_on_ok')];
    const tasks = extractTasksFromEvents(events, []);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].name).toBe('Install SSH config');
    expect(tasks[0].status).toBe('completed');
  });

  it('extracts tasks from runner_on_failed events', () => {
    const events = [makeEvent('Set timeout', 'runner_on_failed')];
    const tasks = extractTasksFromEvents(events, []);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe('failed');
  });

  it('tracks host status per task', () => {
    const events = [
      makeEvent('Configure SSH', 'runner_on_ok', 'host-a'),
      makeEvent('Configure SSH', 'runner_on_failed', 'host-b'),
    ];
    const tasks = extractTasksFromEvents(events, []);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].hosts).toHaveLength(2);
    expect(tasks[0].hosts[0].status).toBe('completed');
    expect(tasks[0].hosts[1].status).toBe('failed');
    expect(tasks[0].status).toBe('failed');
  });

  it('skips "Gathering Facts" tasks', () => {
    const events = [
      makeEvent('Gathering Facts', 'runner_on_ok'),
      makeEvent('Real task', 'runner_on_ok'),
    ];
    const tasks = extractTasksFromEvents(events, []);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].name).toBe('Real task');
  });

  it('skips "Gather the package facts" tasks', () => {
    const events = [makeEvent('Gather the package facts', 'runner_on_ok')];
    const tasks = extractTasksFromEvents(events, []);
    expect(tasks).toHaveLength(0);
  });

  it('skips events with no task name', () => {
    const events = [{ id: 1, event: 'runner_on_ok', host_name: 'h1', event_data: {} } as unknown as JobEvent];
    const tasks = extractTasksFromEvents(events, []);
    expect(tasks).toHaveLength(0);
  });

  it('deduplicates hosts per task, keeping terminal statuses', () => {
    const events = [
      makeEvent('Task A', 'runner_on_start', 'h1'),
      makeEvent('Task A', 'runner_on_ok', 'h1'),
    ];
    const tasks = extractTasksFromEvents(events, []);
    expect(tasks[0].hosts).toHaveLength(1);
    expect(tasks[0].hosts[0].status).toBe('completed');
  });

  it('matches task to ruleId via word-overlap', () => {
    const events = [makeEvent('sshd set idle timeout interval', 'runner_on_ok')];
    const tasks = extractTasksFromEvents(events, ['sshd_set_idle_timeout']);
    expect(tasks[0].ruleId).toBe('sshd_set_idle_timeout');
  });

  it('sets task status to completed when all hosts complete', () => {
    const events = [
      makeEvent('Task', 'runner_on_ok', 'h1'),
      makeEvent('Task', 'runner_on_ok', 'h2'),
    ];
    const tasks = extractTasksFromEvents(events, []);
    expect(tasks[0].status).toBe('completed');
  });
});

describe('groupTasksByRule', () => {
  const makeFinding = (ruleId: string, title: string): MultiHostFinding => ({
    ruleId,
    title,
    stigId: '',
    description: '',
    fixText: '',
    checkText: '',
    severity: 'CAT_II',
    category: '',
    disruption: 'low',
    aapImpact: 'safe' as const,
    aapImpactReason: '',
    parameters: [],
    hosts: [],
    passCount: 0,
    failCount: 0,
    naCount: 0,
    totalCount: 0,
    stateSummary: { new: 0, active: 0, fixed: 0, resurfaced: 0 },
  });

  it('handles empty tasks array', () => {
    const { groups } = groupTasksByRule([], [], new Map());
    expect(groups).toEqual([]);
  });

  it('creates pre-requisite group for tasks before first anchor', () => {
    const tasks = [
      { name: 'Gathering Facts', stigId: '', ruleId: '', status: 'completed' as const, hosts: [] },
      { name: 'Set SSH Client Alive Interval', stigId: '', ruleId: '', status: 'completed' as const, hosts: [] },
    ];
    const selections: RemediationSelection[] = [{ ruleId: 'sshd_set_idle_timeout', enabled: true, parameters: {} }];
    const findingsMap = new Map([
      ['sshd_set_idle_timeout', makeFinding('sshd_set_idle_timeout', 'Set SSH Client Alive Interval')],
    ]);
    const { groups } = groupTasksByRule(tasks, selections, findingsMap);
    expect(groups[0].ruleId).toBe('pre-requisite');
    expect(groups[0].title).toBe('Pre-Requisite Tasks');
  });

  it('groups tasks by rule using title prefix matching', () => {
    const tasks = [
      { name: 'Set SSH Client Alive Interval - config', stigId: '', ruleId: '', status: 'completed' as const, hosts: [] },
      { name: 'Set SSH Client Alive Interval - restart', stigId: '', ruleId: '', status: 'completed' as const, hosts: [] },
    ];
    const selections: RemediationSelection[] = [{ ruleId: 'sshd_set_idle_timeout', enabled: true, parameters: {} }];
    const findingsMap = new Map([
      ['sshd_set_idle_timeout', makeFinding('sshd_set_idle_timeout', 'Set SSH Client Alive Interval')],
    ]);
    const { groups } = groupTasksByRule(tasks, selections, findingsMap);
    const ruleGroup = groups.find(g => g.ruleId === 'sshd_set_idle_timeout');
    expect(ruleGroup?.tasks).toHaveLength(2);
  });

  it('builds groups in selection order', () => {
    const tasks = [
      { name: 'Set SSH Client Alive Interval', stigId: '', ruleId: '', status: 'completed' as const, hosts: [] },
      { name: 'Set Password Minimum Length', stigId: '', ruleId: '', status: 'completed' as const, hosts: [] },
    ];
    const selections: RemediationSelection[] = [
      { ruleId: 'sshd_set_idle_timeout', enabled: true, parameters: {} },
      { ruleId: 'accounts_password_minlen', enabled: true, parameters: {} },
    ];
    const findingsMap = new Map([
      ['sshd_set_idle_timeout', makeFinding('sshd_set_idle_timeout', 'Set SSH Client Alive Interval')],
      ['accounts_password_minlen', makeFinding('accounts_password_minlen', 'Set Password Minimum Length')],
    ]);
    const { groups } = groupTasksByRule(tasks, selections, findingsMap);
    expect(groups[0].ruleId).toBe('sshd_set_idle_timeout');
    expect(groups[1].ruleId).toBe('accounts_password_minlen');
  });
});

describe('computeRuleProgress', () => {
  it('returns 0 for group with no tasks when job not complete', () => {
    const group: RuleGroup = { ruleId: 'r1', stigId: '', title: 'T', tasks: [] };
    expect(computeRuleProgress(group, false)).toBe(0);
  });

  it('returns 100 for group with no tasks when job complete and not failed', () => {
    const group: RuleGroup = { ruleId: 'r1', stigId: '', title: 'T', tasks: [] };
    expect(computeRuleProgress(group, true, false)).toBe(100);
  });

  it('returns 0 for group with no tasks when job complete but failed', () => {
    const group: RuleGroup = { ruleId: 'r1', stigId: '', title: 'T', tasks: [] };
    expect(computeRuleProgress(group, true, true)).toBe(0);
  });

  it('returns percentage of completed/failed tasks', () => {
    const group: RuleGroup = {
      ruleId: 'r1', stigId: '', title: 'T',
      tasks: [
        { name: 't1', stigId: '', ruleId: '', status: 'completed', hosts: [] },
        { name: 't2', stigId: '', ruleId: '', status: 'pending', hosts: [] },
      ],
    };
    expect(computeRuleProgress(group)).toBe(50);
  });
});

describe('computeRuleStatus', () => {
  it('returns pending when no tasks and job not complete', () => {
    const group: RuleGroup = { ruleId: 'r1', stigId: '', title: 'T', tasks: [] };
    expect(computeRuleStatus(group, false)).toBe('pending');
  });

  it('returns completed when job complete and no tasks and not failed', () => {
    const group: RuleGroup = { ruleId: 'r1', stigId: '', title: 'T', tasks: [] };
    expect(computeRuleStatus(group, true)).toBe('completed');
  });

  it('returns failed when job complete, no tasks, but job failed', () => {
    const group: RuleGroup = { ruleId: 'r1', stigId: '', title: 'T', tasks: [] };
    expect(computeRuleStatus(group, true, true)).toBe('failed');
  });

  it('returns failed when any task failed', () => {
    const group: RuleGroup = {
      ruleId: 'r1', stigId: '', title: 'T',
      tasks: [
        { name: 't1', stigId: '', ruleId: '', status: 'completed', hosts: [] },
        { name: 't2', stigId: '', ruleId: '', status: 'failed', hosts: [] },
      ],
    };
    expect(computeRuleStatus(group, false)).toBe('failed');
  });

  it('returns completed when all tasks completed', () => {
    const group: RuleGroup = {
      ruleId: 'r1', stigId: '', title: 'T',
      tasks: [
        { name: 't1', stigId: '', ruleId: '', status: 'completed', hosts: [] },
        { name: 't2', stigId: '', ruleId: '', status: 'completed', hosts: [] },
      ],
    };
    expect(computeRuleStatus(group, false)).toBe('completed');
  });

  it('returns running when some tasks running', () => {
    const group: RuleGroup = {
      ruleId: 'r1', stigId: '', title: 'T',
      tasks: [
        { name: 't1', stigId: '', ruleId: '', status: 'running', hosts: [] },
        { name: 't2', stigId: '', ruleId: '', status: 'pending', hosts: [] },
      ],
    };
    expect(computeRuleStatus(group, false)).toBe('running');
  });

  it('returns running when some tasks completed and some pending', () => {
    const group: RuleGroup = {
      ruleId: 'r1', stigId: '', title: 'T',
      tasks: [
        { name: 't1', stigId: '', ruleId: '', status: 'completed', hosts: [] },
        { name: 't2', stigId: '', ruleId: '', status: 'pending', hosts: [] },
      ],
    };
    expect(computeRuleStatus(group, false)).toBe('running');
  });
});

// ─── Component tests ─────────────────────────────────────────────────

describe('RemediationExecution (view mode)', () => {
  let mockApi: jest.Mocked<ComplianceApi>;

  beforeEach(() => {
    mockApi = createMockComplianceApi();
  });

  const renderView = () =>
    renderInTestApp(
      <TestApiProvider apis={[[complianceApiRef, mockApi]]}>
        <RemediationExecution viewMode />
      </TestApiProvider>,
    );

  const baseExecution = {
    id: 'exec-base',
    remediationProfileId: 'rp-1',
    inventoryId: 1,
    informingScanId: null,
    allJobIds: [99],
    elapsedSeconds: 600,
    rulesFailed: 0,
    hostsSucceeded: 3,
    hostsFailed: 0,
    verificationScanId: null,
    createdBy: null,
    planSummary: null,
  };

  const makeExecution = (extra: object) => ({
    ...baseExecution,
    primaryJobId: 99,
    status: 'succeeded' as const,
    rulesApplied: 2,
    hostsTargeted: 3,
    startedAt: '2026-06-01T00:00:00Z',
    completedAt: '2026-06-01T00:10:00Z',
    ...extra,
  });

  it('shows "Plan snapshot" chip when execution has planSummary', async () => {
    mockApi.getAllRecentExecutions.mockResolvedValue([
      makeExecution({
        id: 'exec-snap-1',
        planSummary: {
          totalRules: 2,
          totalHosts: 3,
          groups: [{ tags: ['rule_a', 'rule_b'], limit: '', extraVars: {}, hostCount: 3, ruleCount: 2 }],
        },
      }),
    ]);

    await renderView();
    await waitFor(() => {
      expect(screen.getByText('Plan snapshot')).toBeInTheDocument();
    });
  });

  it('does not show "Plan snapshot" chip when execution has no planSummary', async () => {
    mockApi.getAllRecentExecutions.mockResolvedValue([
      makeExecution({ id: 'exec-legacy-1', planSummary: null }),
    ]);

    await renderView();
    await waitFor(() => {
      expect(mockApi.getAllRecentExecutions).toHaveBeenCalled();
    });
    expect(screen.queryByText('Plan snapshot')).not.toBeInTheDocument();
  });

  it('renders completion summary for succeeded execution', async () => {
    mockApi.getAllRecentExecutions.mockResolvedValue([
      makeExecution({ id: 'exec-ok', planSummary: null }),
    ]);
    mockApi.getJobStatus.mockResolvedValue({
      id: 99, status: 'successful', finished: '2026-06-01T00:10:00Z',
      failed: false, elapsed: 600, name: 'remediate', job_tags: '',
    } as any);

    await renderView();
    await waitFor(() => {
      expect(screen.getByText('Remediation Complete')).toBeInTheDocument();
    });
  });

  it('renders error message for failed execution', async () => {
    mockApi.getAllRecentExecutions.mockResolvedValue([
      makeExecution({ id: 'exec-fail', status: 'failed', planSummary: null }),
    ]);
    mockApi.getJobStatus.mockResolvedValue({
      id: 99, status: 'failed', finished: '2026-06-01T00:10:00Z',
      failed: true, elapsed: 60, name: 'remediate', job_tags: '',
      result_traceback: 'Host unreachable',
    } as any);

    await renderView();
    await waitFor(() => {
      expect(screen.getByText('Remediation Failed')).toBeInTheDocument();
    });
  });

  it('renders "Run Verification Scan" button on completion', async () => {
    mockApi.getAllRecentExecutions.mockResolvedValue([
      makeExecution({ id: 'exec-ok', planSummary: null }),
    ]);
    mockApi.getJobStatus.mockResolvedValue({
      id: 99, status: 'successful', finished: '2026-06-01T00:10:00Z',
      failed: false, elapsed: 600, name: 'remediate', job_tags: '',
    } as any);

    await renderView();
    await waitFor(() => {
      expect(screen.getByText('Run Verification Scan')).toBeInTheDocument();
    });
  });

  it('renders "Back to Dashboard" button on completion', async () => {
    mockApi.getAllRecentExecutions.mockResolvedValue([
      makeExecution({ id: 'exec-ok', planSummary: null }),
    ]);
    mockApi.getJobStatus.mockResolvedValue({
      id: 99, status: 'successful', finished: '2026-06-01T00:10:00Z',
      failed: false, elapsed: 600, name: 'remediate', job_tags: '',
    } as any);

    await renderView();
    await waitFor(() => {
      expect(screen.getByText('Back to Dashboard')).toBeInTheDocument();
    });
  });

  it('renders "Back to Profile Builder" button on failure', async () => {
    mockApi.getAllRecentExecutions.mockResolvedValue([
      makeExecution({ id: 'exec-fail', status: 'failed', planSummary: null }),
    ]);
    mockApi.getJobStatus.mockResolvedValue({
      id: 99, status: 'failed', finished: '2026-06-01T00:10:00Z',
      failed: true, elapsed: 60, name: 'remediate', job_tags: '',
    } as any);

    await renderView();
    await waitFor(() => {
      expect(screen.getByText('Back to Profile Builder')).toBeInTheDocument();
    });
  });

  it('renders task progress with rule groups when events available', async () => {
    mockApi.getAllRecentExecutions.mockResolvedValue([
      makeExecution({ id: 'exec-run', planSummary: null }),
    ]);
    mockApi.getJobStatus.mockResolvedValue({
      id: 99, status: 'running', finished: null,
      failed: false, elapsed: 30, name: 'remediate', job_tags: '',
    } as any);
    mockApi.getJobEvents.mockResolvedValue([
      { id: 1, event: 'runner_on_ok', host_name: 'web-01', event_data: { task: 'Set SSH timeout', host: 'web-01' } },
    ] as any);

    await renderView();
    await waitFor(() => {
      expect(screen.getByText('Remediation Progress')).toBeInTheDocument();
    });
  });

  it('shows error details toggle when errorDetails present', async () => {
    mockApi.getAllRecentExecutions.mockResolvedValue([
      makeExecution({ id: 'exec-fail', status: 'failed', planSummary: null }),
    ]);
    mockApi.getJobStatus.mockResolvedValue({
      id: 99, status: 'failed', finished: '2026-06-01T00:10:00Z',
      failed: true, elapsed: 60, name: 'remediate', job_tags: '',
    } as any);
    mockApi.getRemediationErrorDetails.mockResolvedValue('Host web-01 unreachable: Connection timed out');

    await renderView();
    await waitFor(() => {
      expect(screen.getByText(/Controller Error Details/)).toBeInTheDocument();
    });
  });

  it('PATCHes execution record on terminal state', async () => {
    const execId = 'exec-terminal';
    mockApi.getAllRecentExecutions.mockResolvedValue([
      makeExecution({ id: execId, planSummary: null }),
    ]);
    mockApi.getJobStatus.mockResolvedValue({
      id: 99, status: 'successful', finished: '2026-06-01T00:10:00Z',
      failed: false, elapsed: 600, name: 'remediate', job_tags: '',
    } as any);
    mockApi.getJobEvents.mockResolvedValue([
      { id: 1, event: 'runner_on_ok', host_name: 'web-01', event_data: { task: 'Fix SSH', host: 'web-01' } },
    ] as any);

    await renderView();
    await waitFor(() => {
      expect(mockApi.updateRemediationExecution).toHaveBeenCalledWith(
        execId,
        expect.objectContaining({ status: 'succeeded' }),
      );
    });
  });

  it('derives selections from job_tags when no planSummary (legacy)', async () => {
    mockApi.getAllRecentExecutions.mockResolvedValue([
      makeExecution({ id: 'exec-legacy', planSummary: null }),
    ]);
    mockApi.getJobStatus.mockResolvedValue({
      id: 99, status: 'successful', finished: '2026-06-01T00:10:00Z',
      failed: false, elapsed: 600, name: 'remediate',
      job_tags: 'sshd_set_idle_timeout,accounts_password_minlen',
    } as any);

    await renderView();
    await waitFor(() => {
      expect(mockApi.getFindings).toHaveBeenCalled();
    });
  });
});

// ─── Launch mode tests ───────────────────────────────────────────────

describe('RemediationExecution (launch mode)', () => {
  let mockApi: jest.Mocked<ComplianceApi>;

  beforeEach(() => {
    mockApi = createMockComplianceApi();
    mockUseParams.mockReturnValue({ jobId: '99' });
    mockUseSearchParams.mockReturnValue([
      new URLSearchParams('profileId=rp-1&inventoryId=5'),
      jest.fn(),
    ]);
  });

  const renderLaunch = () =>
    renderInTestApp(
      <TestApiProvider apis={[[complianceApiRef, mockApi]]}>
        <RemediationExecution />
      </TestApiProvider>,
    );

  it('calls launchRemediation with profile selections', async () => {
    mockApi.getRemediationProfile.mockResolvedValue({
      id: 'rp-1',
      name: 'test',
      description: '',
      complianceProfileId: 'rhel9-stig',
      creationScanId: 'scan-1',
      targetInventory: 'prod',
      status: 'saved',
      selections: [{ ruleId: 'sshd_set_idle_timeout', enabled: true, parameters: {} }],
      createdAt: '',
      updatedAt: '',
    });
    mockApi.launchRemediation.mockResolvedValue({
      remediationId: 'rem-1',
      workflowJobId: 200,
      status: 'pending',
      allJobIds: [200],
      executionId: 'exec-new',
    } as any);
    mockApi.getJobStatus.mockResolvedValue({
      id: 200, status: 'running', finished: null,
      failed: false, elapsed: 5, name: 'remediate', job_tags: 'sshd_set_idle_timeout',
    } as any);

    await renderLaunch();
    await waitFor(() => {
      expect(mockApi.launchRemediation).toHaveBeenCalled();
    });
  });

  it('shows error when no inventory selected', async () => {
    mockUseSearchParams.mockReturnValue([
      new URLSearchParams('profileId=rp-1'),
      jest.fn(),
    ]);
    mockApi.getRemediationProfile.mockResolvedValue({
      id: 'rp-1',
      name: 'test',
      description: '',
      complianceProfileId: 'rhel9-stig',
      creationScanId: 'scan-1',
      targetInventory: 'prod',
      status: 'saved',
      selections: [{ ruleId: 'r1', enabled: true, parameters: {} }],
      createdAt: '',
      updatedAt: '',
    });

    await renderLaunch();
    await waitFor(() => {
      expect(screen.getByText(/No inventory selected/)).toBeInTheDocument();
    });
  });

  it('shows error when no selections found', async () => {
    mockApi.getRemediationProfile.mockResolvedValue({
      id: 'rp-1',
      name: 'test',
      description: '',
      complianceProfileId: 'rhel9-stig',
      creationScanId: 'scan-1',
      targetInventory: 'prod',
      status: 'saved',
      selections: [],
      createdAt: '',
      updatedAt: '',
    });

    await renderLaunch();
    await waitFor(() => {
      expect(screen.getByText(/No rule selections found/)).toBeInTheDocument();
    });
  });
});
