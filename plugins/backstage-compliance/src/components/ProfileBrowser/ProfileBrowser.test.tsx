import '@testing-library/jest-dom';
import { screen, waitFor } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { complianceApiRef } from '../../api/complianceApiRef';
import { ProfileBrowser } from './ProfileBrowser';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ profileId: 'all' }),
}));

function createMockApi(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    getHealth: jest.fn().mockResolvedValue({ status: 'ok', dataSource: 'mock' }),
    getProfiles: jest.fn().mockResolvedValue([]),
    getRegisteredProfiles: jest.fn().mockResolvedValue([]),
    getScans: jest.fn().mockResolvedValue([]),
    getRegisteredProfile: jest.fn().mockResolvedValue(null),
    getInventories: jest.fn().mockResolvedValue([]),
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
    saveRemediationProfile: jest.fn().mockResolvedValue({ id: '1', name: 'test', description: '', complianceProfileId: '', targetInventory: '', selections: [], createdAt: '', updatedAt: '' }),
    saveRegisteredProfile: jest.fn().mockResolvedValue({}),
    deleteRegisteredProfile: jest.fn().mockResolvedValue(undefined),
    getControllerWorkflowTemplates: jest.fn().mockResolvedValue([]),
    getControllerExecutionEnvironments: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function renderWithApi(
  mockApi: ReturnType<typeof createMockApi> = createMockApi(),
) {
  return renderInTestApp(
    <TestApiProvider apis={[[complianceApiRef, mockApi]]}>
      <ProfileBrowser />
    </TestApiProvider>,
  );
}

describe('ProfileBrowser', () => {
  it('renders empty state when no profiles exist', async () => {
    await renderWithApi();

    await waitFor(() => {
      expect(
        screen.getByText('No compliance profiles registered'),
      ).toBeInTheDocument();
      expect(screen.getByText('Go to Settings')).toBeInTheDocument();
    });
  });

  it('shows profile cards when profiles exist', async () => {
    const mockApi = createMockApi({
      getRegisteredProfiles: jest.fn().mockResolvedValue([{
          id: 'cart-1',
          displayName: 'DISA STIG for RHEL 9',
          description: 'DoD Security Technical Implementation Guide',
          framework: 'DISA_STIG',
          version: 'V2R8',
          platform: 'RHEL 9',
          workflowTemplateId: 1,
          eeId: 2,
          remediationPlaybookPath: '/usr/share/scap-security-guide/ansible/rhel9-playbook-stig.yml',
          scanTags: '',
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
        {
          id: 'cart-2',
          displayName: 'CIS Benchmark RHEL 9',
          description: 'CIS Level 1 Server benchmark',
          framework: 'CIS',
          version: '1.0.0',
          platform: 'RHEL 9',
          workflowTemplateId: 3,
          eeId: 4,
          remediationPlaybookPath: '',
          scanTags: '',
          createdAt: '2025-02-01',
          updatedAt: '2025-02-01',
        },
      ]),
    });

    await renderWithApi(mockApi);

    await waitFor(() => {
      expect(screen.getByText('DISA STIG for RHEL 9')).toBeInTheDocument();
      expect(screen.getByText('CIS Benchmark RHEL 9')).toBeInTheDocument();
    });
  });

  it('shows "Registered" badge for registry profiles', async () => {
    const mockApi = createMockApi({
      getRegisteredProfiles: jest.fn().mockResolvedValue([{
          id: 'cart-1',
          displayName: 'DISA STIG for RHEL 9',
          description: 'DoD STIG',
          framework: 'DISA_STIG',
          version: 'V2R8',
          platform: 'RHEL 9',
          workflowTemplateId: null,
          eeId: null,
          remediationPlaybookPath: '',
          scanTags: '',
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      ]),
    });

    await renderWithApi(mockApi);

    await waitFor(() => {
      expect(screen.getByText('Registered')).toBeInTheDocument();
    });
  });

  it('shows "View Details" and "Launch Scan" buttons on profile cards', async () => {
    const mockApi = createMockApi({
      getRegisteredProfiles: jest.fn().mockResolvedValue([{
          id: 'cart-1',
          displayName: 'DISA STIG for RHEL 9',
          description: 'DoD STIG',
          framework: 'DISA_STIG',
          version: 'V2R8',
          platform: 'RHEL 9',
          workflowTemplateId: null,
          eeId: null,
          remediationPlaybookPath: '',
          scanTags: '',
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      ]),
    });

    await renderWithApi(mockApi);

    await waitFor(() => {
      expect(screen.getByText('View Details')).toBeInTheDocument();
      expect(screen.getByText('Launch Scan')).toBeInTheDocument();
    });
  });

  it('shows the Profiles breadcrumb', async () => {
    await renderWithApi();

    await waitFor(() => {
      expect(screen.getByText('Profiles')).toBeInTheDocument();
      expect(screen.getByText('Compliance')).toBeInTheDocument();
    });
  });
});
