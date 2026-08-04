import '@testing-library/jest-dom';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { complianceApiRef } from '../../api/complianceApiRef';
import { ScanHistory } from './ScanHistory';

function createMockApi(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    getHealth: jest
      .fn()
      .mockResolvedValue({ status: 'ok', dataSource: 'mock' }),
    getProfiles: jest.fn().mockResolvedValue([]),
    getRegisteredProfiles: jest.fn().mockResolvedValue([]),
    getScans: jest.fn().mockResolvedValue([]),
    getRegisteredProfile: jest.fn().mockResolvedValue(null),
    getInventories: jest.fn().mockResolvedValue([]),
    getFindings: jest.fn().mockResolvedValue([]),
    getWorkflowTemplates: jest.fn().mockResolvedValue([]),
    validateScan: jest.fn().mockResolvedValue({
      valid: true,
      matchedHosts: [],
      mismatchedHosts: [],
      factsAvailable: true,
    }),
    launchScan: jest.fn().mockResolvedValue({
      scanId: 'scan-1',
      workflowJobId: 1,
      status: 'pending',
    }),
    getWorkflowStatus: jest.fn().mockResolvedValue({
      id: 1,
      status: 'successful',
      finished: null,
      failed: false,
      elapsed: 0,
      name: '',
    }),
    getWorkflowNodes: jest.fn().mockResolvedValue([]),
    getJobEvents: jest.fn().mockResolvedValue([]),
    launchRemediation: jest.fn().mockResolvedValue({
      remediationId: 'r1',
      workflowJobId: 2,
      status: 'pending',
    }),
    getDashboardStats: jest.fn().mockResolvedValue({
      hostsScanned: 0,
      criticalFindings: 0,
      pendingRemediation: 0,
      activeProfiles: 0,
      recentScans: [],
      frameworkScores: [],
    }),
    getPostureHistory: jest.fn().mockResolvedValue([]),
    getRemediationProfiles: jest.fn().mockResolvedValue([]),
    getRemediationProfile: jest.fn().mockResolvedValue(null),
    saveRemediationProfile: jest.fn().mockResolvedValue({
      id: '1',
      name: 'test',
      description: '',
      complianceProfileId: '',
      targetInventory: '',
      selections: [],
      createdAt: '',
      updatedAt: '',
    }),
    saveRegisteredProfile: jest.fn().mockResolvedValue({}),
    deleteRegisteredProfile: jest.fn().mockResolvedValue(undefined),
    getControllerWorkflowTemplates: jest.fn().mockResolvedValue([]),
    getControllerExecutionEnvironments: jest.fn().mockResolvedValue([]),
    getAllRecentExecutions: jest.fn().mockResolvedValue([]),
    getBatchScanStats: jest.fn().mockResolvedValue({}),
    ...overrides,
  };
}

function renderWithApi(
  mockApi: ReturnType<typeof createMockApi> = createMockApi(),
) {
  return renderInTestApp(
    <TestApiProvider apis={[[complianceApiRef, mockApi]]}>
      <ScanHistory />
    </TestApiProvider>,
  );
}

describe('ScanHistory', () => {
  it('renders the "Scan History" title', async () => {
    await renderWithApi();

    await waitFor(() => {
      expect(screen.getByText('Scan History')).toBeInTheDocument();
    });
  });

  it('shows empty state when no scans exist', async () => {
    await renderWithApi();

    await waitFor(() => {
      expect(screen.getByText('No scans yet')).toBeInTheDocument();
      expect(screen.getByText('Launch a Scan')).toBeInTheDocument();
    });
  });

  it('shows the "New Scan" button', async () => {
    await renderWithApi();

    await waitFor(() => {
      expect(screen.getByText('New Scan')).toBeInTheDocument();
    });
  });

  it('shows grouped scan entries when data exists', async () => {
    const mockApi = createMockApi({
      getScans: jest.fn().mockResolvedValue([
        {
          id: 'scan-1',
          profileId: 'rhel9-stig',
          inventoryId: 1,
          status: 'completed',
          scanner: 'oscap',
          scanType: 'assessment',
          workflowJobId: 42,
          startedAt: '2025-10-01T10:00:00Z',
          completedAt: '2025-10-01T10:15:00Z',
          errorDetails: null,
        },
      ]),
      getRegisteredProfiles: jest.fn().mockResolvedValue([
        {
          id: 'rhel9-stig',
          displayName: 'DISA STIG RHEL 9',
          certification: null,
        },
      ]),
      getInventories: jest
        .fn()
        .mockResolvedValue([{ id: 1, name: 'test-inventory', hostCount: 5 }]),
    });

    await renderWithApi(mockApi);

    await waitFor(() => {
      expect(screen.getByText('DISA STIG RHEL 9')).toBeInTheDocument();
      expect(screen.getByText(/test-inventory/)).toBeInTheDocument();
      expect(screen.getByText('#42')).toBeInTheDocument();
    });
  });

  it('shows scan type chips', async () => {
    const mockApi = createMockApi({
      getScans: jest.fn().mockResolvedValue([
        {
          id: 'scan-1',
          profileId: 'rhel9-stig',
          inventoryId: 1,
          status: 'completed',
          scanner: 'oscap',
          scanType: 'assessment',
          workflowJobId: 42,
          startedAt: '2025-10-01T10:00:00Z',
          completedAt: '2025-10-01T10:15:00Z',
          errorDetails: null,
        },
      ]),
    });

    await renderWithApi(mockApi);

    await waitFor(() => {
      expect(screen.getByText('Assessment')).toBeInTheDocument();
    });
  });

  it('clicking a scan row navigates to results', async () => {
    const mockApi = createMockApi({
      getScans: jest.fn().mockResolvedValue([
        {
          id: 'scan-1',
          profileId: 'rhel9-stig',
          inventoryId: 1,
          status: 'completed',
          scanner: 'oscap',
          scanType: 'assessment',
          workflowJobId: 42,
          startedAt: '2025-10-01T10:00:00Z',
          completedAt: '2025-10-01T10:15:00Z',
          errorDetails: null,
        },
      ]),
    });

    await renderWithApi(mockApi);

    await waitFor(() => {
      expect(screen.getByText('#42')).toBeInTheDocument();
    });

    const row = screen.getByText('#42').closest('tr');
    expect(row).toBeTruthy();
    fireEvent.click(row!);
  });
});
