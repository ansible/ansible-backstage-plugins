import '@testing-library/jest-dom';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { alertApiRef } from '@backstage/core-plugin-api';
import { complianceApiRef } from '../../api/complianceApiRef';
import { RemediationsList } from './RemediationsList';
import type { RemediationProfile, RemediationExecution } from '@ansible/backstage-compliance-common/types';

let mockPermissionAllowed = true;
jest.mock('@backstage/plugin-permission-react', () => ({
  usePermission: () => ({ allowed: mockPermissionAllowed, loading: false }),
}));

const SAVED_PROFILE: RemediationProfile = {
  id: 'rem-1',
  name: 'STIG SSH Hardening',
  description: 'Fix SSH-related STIG findings',
  complianceProfileId: 'rhel9-stig',
  targetInventory: '',
  status: 'saved',
  selections: [
    { ruleId: 'sshd_set_idle_timeout', enabled: true, parameters: {} },
    { ruleId: 'accounts_tmout', enabled: true, parameters: {} },
    { ruleId: 'sshd_disable_root_login', enabled: false, parameters: {} },
  ],
  createdAt: '2025-10-01T10:00:00Z',
  updatedAt: '2025-10-02T08:00:00Z',
  executionCount: 3,
  lastExecutedAt: '2025-10-05T14:00:00Z',
  latestExecution: {
    id: 'exec-1',
    remediationProfileId: 'rem-1',
    inventoryId: 1,
    informingScanId: null,
    primaryJobId: 42,
    allJobIds: [42],
    status: 'succeeded',
    startedAt: '2025-10-05T14:00:00Z',
    completedAt: '2025-10-05T14:05:00Z',
    elapsedSeconds: 300,
    rulesApplied: 2,
    rulesFailed: 0,
    hostsTargeted: 5,
    hostsSucceeded: 5,
    hostsFailed: 0,
    planSummary: null,
    verificationScanId: null,
    createdBy: null,
  },
};

const DRAFT_PROFILE: RemediationProfile = {
  id: 'rem-2',
  name: 'Audit Rules Baseline',
  description: '',
  complianceProfileId: 'rhel9-stig',
  targetInventory: '',
  status: 'draft',
  selections: [
    { ruleId: 'audit_rules_privileged_commands', enabled: true, parameters: {} },
  ],
  createdAt: '2025-10-03T12:00:00Z',
  updatedAt: '2025-10-03T12:00:00Z',
  executionCount: 0,
  lastExecutedAt: null,
};

const MOCK_EXECUTIONS: RemediationExecution[] = [
  {
    id: 'exec-1',
    remediationProfileId: 'rem-1',
    inventoryId: 1,
    informingScanId: null,
    primaryJobId: 42,
    allJobIds: [42],
    status: 'succeeded',
    startedAt: '2025-10-05T14:00:00Z',
    completedAt: '2025-10-05T14:05:00Z',
    elapsedSeconds: 300,
    rulesApplied: 2,
    rulesFailed: 0,
    hostsTargeted: 5,
    hostsSucceeded: 5,
    hostsFailed: 0,
    planSummary: null,
    verificationScanId: null,
    createdBy: null,
  },
];

function createMockApi(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    getHealth: jest.fn().mockResolvedValue({ status: 'ok', dataSource: 'mock' }),
    getProfiles: jest.fn().mockResolvedValue([]),
    getRegisteredProfiles: jest.fn().mockResolvedValue([
      { id: 'rhel9-stig', displayName: 'DISA STIG V2R8' },
    ]),
    getScans: jest.fn().mockResolvedValue([]),
    getRegisteredProfile: jest.fn().mockResolvedValue(null),
    getInventories: jest.fn().mockResolvedValue([
      { id: 1, name: 'prod-webservers', hostCount: 5 },
    ]),
    getFindings: jest.fn().mockResolvedValue([]),
    getWorkflowTemplates: jest.fn().mockResolvedValue([]),
    validateScan: jest.fn().mockResolvedValue({ valid: true, matchedHosts: [], mismatchedHosts: [], factsAvailable: true }),
    launchScan: jest.fn().mockResolvedValue({ scanId: 'scan-1', workflowJobId: 1, status: 'pending' }),
    getWorkflowStatus: jest.fn().mockResolvedValue({ id: 1, status: 'successful', finished: null, failed: false, elapsed: 0, name: '' }),
    getWorkflowNodes: jest.fn().mockResolvedValue([]),
    getJobEvents: jest.fn().mockResolvedValue([]),
    launchRemediation: jest.fn().mockResolvedValue({ remediationId: 'r1', workflowJobId: 2, status: 'pending' }),
    getDashboardStats: jest.fn().mockResolvedValue({ hostsScanned: 0, criticalFindings: 0, pendingRemediation: 0, activeProfiles: 0, recentScans: [], frameworkScores: [] }),
    getPostureHistory: jest.fn().mockResolvedValue([]),
    getRemediationProfiles: jest.fn().mockResolvedValue([]),
    getRemediationProfile: jest.fn().mockResolvedValue(null),
    saveRemediationProfile: jest.fn().mockResolvedValue({ id: '1', name: 'test', description: '', complianceProfileId: '', targetInventory: '', status: 'saved', selections: [], createdAt: '', updatedAt: '' }),
    deleteRemediationProfile: jest.fn().mockResolvedValue(undefined),
    updateRemediationProfileStatus: jest.fn().mockImplementation((_id: string, status: string) =>
      Promise.resolve({ id: _id, name: 'test', status }),
    ),
    getRemediationExecutions: jest.fn().mockResolvedValue([]),
    getRemediationExecution: jest.fn().mockResolvedValue(null),
    updateRemediationExecution: jest.fn().mockResolvedValue({}),
    saveRegisteredProfile: jest.fn().mockResolvedValue({}),
    deleteRegisteredProfile: jest.fn().mockResolvedValue(undefined),
    getControllerWorkflowTemplates: jest.fn().mockResolvedValue([]),
    getControllerExecutionEnvironments: jest.fn().mockResolvedValue([]),
    getBaselineTargets: jest.fn().mockResolvedValue([]),
    getAuthoritativeScan: jest.fn().mockResolvedValue(null),
    getBaselineScores: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

const mockAlertApi = { post: jest.fn() };

function renderWithApi(
  mockApi: ReturnType<typeof createMockApi> = createMockApi(),
) {
  return renderInTestApp(
    <TestApiProvider apis={[[complianceApiRef, mockApi], [alertApiRef, mockAlertApi]]}>
      <RemediationsList />
    </TestApiProvider>,
  );
}

describe('RemediationsList', () => {
  beforeEach(() => {
    mockPermissionAllowed = true;
    mockAlertApi.post.mockClear();
  });

  it('renders the title and filter dropdown', async () => {
    await renderWithApi();
    await waitFor(() => {
      expect(screen.getByText('Remediations')).toBeInTheDocument();
    });
  });

  it('shows empty state when no remediations exist', async () => {
    await renderWithApi();
    await waitFor(() => {
      expect(screen.getByText('No active remediations')).toBeInTheDocument();
      expect(screen.getByText('Launch a Scan')).toBeInTheDocument();
    });
  });

  it('shows remediation rows with lifecycle columns', async () => {
    const mockApi = createMockApi({
      getRemediationProfiles: jest.fn().mockResolvedValue([SAVED_PROFILE, DRAFT_PROFILE]),
    });
    await renderWithApi(mockApi);
    await waitFor(() => {
      expect(screen.getByText('STIG SSH Hardening')).toBeInTheDocument();
      expect(screen.getByText('Audit Rules Baseline')).toBeInTheDocument();
    });
  });

  it('shows the compliance profile display name', async () => {
    const mockApi = createMockApi({
      getRemediationProfiles: jest.fn().mockResolvedValue([SAVED_PROFILE]),
    });
    await renderWithApi(mockApi);
    await waitFor(() => {
      expect(screen.getByText('DISA STIG V2R8')).toBeInTheDocument();
    });
  });

  it('shows enabled rule count', async () => {
    const mockApi = createMockApi({
      getRemediationProfiles: jest.fn().mockResolvedValue([SAVED_PROFILE]),
    });
    await renderWithApi(mockApi);
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('renders profile status chips', async () => {
    const mockApi = createMockApi({
      getRemediationProfiles: jest.fn().mockResolvedValue([SAVED_PROFILE, DRAFT_PROFILE]),
    });
    await renderWithApi(mockApi);
    await waitFor(() => {
      expect(screen.getByText('saved')).toBeInTheDocument();
      expect(screen.getByText('draft')).toBeInTheDocument();
    });
  });

  it('renders latest execution status chip with inventory name', async () => {
    const mockApi = createMockApi({
      getRemediationProfiles: jest.fn().mockResolvedValue([SAVED_PROFILE]),
    });
    await renderWithApi(mockApi);
    await waitFor(() => {
      expect(screen.getByText('succeeded · prod-webservers')).toBeInTheDocument();
    });
  });

  it('shows "Never" for profiles with no executions', async () => {
    const mockApi = createMockApi({
      getRemediationProfiles: jest.fn().mockResolvedValue([DRAFT_PROFILE]),
    });
    await renderWithApi(mockApi);
    await waitFor(() => {
      expect(screen.getByText('Never')).toBeInTheDocument();
    });
  });

  it('shows archive option in overflow menu and calls API on confirm', async () => {
    const mockApi = createMockApi({
      getRemediationProfiles: jest.fn().mockResolvedValue([SAVED_PROFILE]),
    });
    await renderWithApi(mockApi);
    await waitFor(() => {
      expect(screen.getByText('STIG SSH Hardening')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('More actions'));
    await waitFor(() => {
      expect(screen.getByText('Archive')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Archive'));
    await waitFor(() => {
      expect(screen.getByText('Archive Profile')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => {
      expect(mockApi.updateRemediationProfileStatus).toHaveBeenCalledWith('rem-1', 'archived');
    });
  });

  it('shows delete confirmation for draft profiles', async () => {
    const mockApi = createMockApi({
      getRemediationProfiles: jest.fn().mockResolvedValue([DRAFT_PROFILE]),
    });
    await renderWithApi(mockApi);
    await waitFor(() => {
      expect(screen.getByText('Audit Rules Baseline')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('More actions'));
    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => {
      expect(screen.getByText('Delete Draft')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(mockApi.deleteRemediationProfile).toHaveBeenCalledWith('rem-2');
    });
  });

  it('passes "all" to backend when All filter is selected', async () => {
    const mockApi = createMockApi({
      getRemediationProfiles: jest.fn().mockResolvedValue([SAVED_PROFILE]),
    });
    await renderWithApi(mockApi);
    await waitFor(() => {
      expect(screen.getByText('STIG SSH Hardening')).toBeInTheDocument();
    });

    // MUI Select: mouseDown on the select element opens the listbox
    const selectInput = screen.getByLabelText('Status');
    fireEvent.mouseDown(selectInput);
    await waitFor(() => {
      const listbox = screen.getByRole('listbox');
      expect(listbox).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('option', { name: 'All' }));
    await waitFor(() => {
      expect(mockApi.getRemediationProfiles).toHaveBeenCalledWith('all');
    });
  });

  it('posts alert when API rejects', async () => {
    const mockApi = createMockApi({
      getRemediationProfiles: jest.fn().mockRejectedValue(new Error('API down')),
    });
    await renderWithApi(mockApi);
    await waitFor(() => {
      expect(mockAlertApi.post).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'error', message: expect.stringContaining('API down') }),
      );
    });
  });

  it('hides archive and disables delete for non-admin users', async () => {
    mockPermissionAllowed = false;
    const mockApi = createMockApi({
      getRemediationProfiles: jest.fn().mockResolvedValue([SAVED_PROFILE, DRAFT_PROFILE]),
    });
    await renderWithApi(mockApi);
    await waitFor(() => {
      expect(screen.getByText('STIG SSH Hardening')).toBeInTheDocument();
    });
    // Open overflow menu for saved profile — archive and delete should not appear for non-admin
    const kebabButtons = screen.getAllByLabelText('More actions');
    fireEvent.click(kebabButtons[0]);
    await waitFor(() => {
      expect(screen.getByText('Edit Selections')).toBeInTheDocument();
    });
    expect(screen.queryByText('Archive')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('fetches execution history when row is expanded', async () => {
    const mockApi = createMockApi({
      getRemediationProfiles: jest.fn().mockResolvedValue([SAVED_PROFILE]),
      getRemediationExecutions: jest.fn().mockResolvedValue(MOCK_EXECUTIONS),
    });
    await renderWithApi(mockApi);
    await waitFor(() => {
      expect(screen.getByText('STIG SSH Hardening')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('expand-rem-1'));
    await waitFor(() => {
      expect(screen.getByText('Execution History')).toBeInTheDocument();
      expect(mockApi.getRemediationExecutions).toHaveBeenCalledWith('rem-1', 10);
    });
  });
});
