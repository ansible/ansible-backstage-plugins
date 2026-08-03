import React from 'react';
import '@testing-library/jest-dom';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { complianceApiRef } from '../../api/complianceApiRef';
import { ProfileSettings } from './ProfileSettings';

// Mock permission module — default to admin allowed
jest.mock('@backstage/plugin-permission-react', () => ({
  usePermission: () => ({ allowed: true, loading: false }),
  RequirePermission: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
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
      <ProfileSettings />
    </TestApiProvider>,
  );
}

describe('ProfileSettings', () => {
  it('renders the "Compliance Profiles" title', async () => {
    await renderWithApi();

    await waitFor(() => {
      expect(screen.getByText('Compliance Profiles')).toBeInTheDocument();
    });
  });

  it('shows empty state when no profiles are configured', async () => {
    await renderWithApi();

    await waitFor(() => {
      expect(
        screen.getByText('No compliance profiles configured'),
      ).toBeInTheDocument();
    });
  });

  it('shows "Add Profile" button in the header', async () => {
    await renderWithApi();

    await waitFor(() => {
      expect(screen.getByText('Add Profile')).toBeInTheDocument();
    });
  });

  it('shows "Add Compliance Profile" button in the empty state', async () => {
    await renderWithApi();

    await waitFor(() => {
      expect(
        screen.getByText('Add Compliance Profile'),
      ).toBeInTheDocument();
    });
  });

  it('shows profile rows when profiles exist', async () => {
    const mockApi = createMockApi({
      getRegisteredProfiles: jest.fn().mockResolvedValue([
        {
          id: 'cart-1',
          displayName: 'STIG for RHEL 9',
          description: 'DoD STIG profile',
          framework: 'DISA_STIG',
          version: 'V2R8',
          platform: 'RHEL 9',
          platformSpec: null,
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
      expect(screen.getByText('STIG for RHEL 9')).toBeInTheDocument();
      expect(screen.getByText('DISA STIG')).toBeInTheDocument();
      expect(screen.getByText('V2R8')).toBeInTheDocument();
      expect(screen.getByText('RHEL 9')).toBeInTheDocument();
    });
  });

  it('shows "Access Denied" when user is not admin', async () => {
    // Override the permission mock to deny access
    const permissionMock = jest.requireMock(
      '@backstage/plugin-permission-react',
    );
    permissionMock.usePermission = () => ({ allowed: false, loading: false });

    await renderWithApi();

    await waitFor(() => {
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
      expect(
        screen.getByText(
          'You do not have permission to manage compliance profiles. Contact your administrator if you need access.',
        ),
      ).toBeInTheDocument();
    });

    // Restore the default
    permissionMock.usePermission = () => ({ allowed: true, loading: false });
  });

  it('shows edit button for each profile row', async () => {
    const mockApi = createMockApi({
      getRegisteredProfiles: jest.fn().mockResolvedValue([
        {
          id: 'cart-1',
          displayName: 'STIG for RHEL 9',
          description: '',
          framework: 'DISA_STIG',
          version: 'V2R8',
          platform: 'RHEL 9',
          platformSpec: null,
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
      expect(screen.getByLabelText('edit compliance profile')).toBeInTheDocument();
    });
  });

  it('opens edit dialog with pre-populated form on edit click', async () => {
    const profile = {
      id: 'cart-1',
      displayName: 'STIG for RHEL 9',
      description: 'DoD profile',
      framework: 'DISA_STIG',
      version: 'V2R8',
      platform: 'RHEL 9',
      platformSpec: null,
      workflowTemplateId: null,
      eeId: null,
      remediationPlaybookPath: '/usr/share/ssg/rhel9.yml',
      scanTags: '',
      createdAt: '2025-01-01',
      updatedAt: '2025-01-01',
    };
    const mockApi = createMockApi({
      getRegisteredProfiles: jest.fn().mockResolvedValue([profile]),
      getRegisteredProfile: jest.fn().mockResolvedValue(profile),
    });

    await renderWithApi(mockApi);

    await waitFor(() => {
      expect(screen.getByLabelText('edit compliance profile')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('edit compliance profile'));

    await waitFor(() => {
      expect(screen.getByText('Edit Compliance Profile')).toBeInTheDocument();
      expect(screen.getByDisplayValue('STIG for RHEL 9')).toBeInTheDocument();
      expect(screen.getByDisplayValue('DoD profile')).toBeInTheDocument();
      expect(screen.getByDisplayValue('V2R8')).toBeInTheDocument();
      expect(screen.getByDisplayValue('/usr/share/ssg/rhel9.yml')).toBeInTheDocument();
    });
  });

  it('calls saveProfile with id when updating an existing profile', async () => {
    const profile = {
      id: 'cart-1',
      displayName: 'STIG for RHEL 9',
      description: '',
      framework: 'DISA_STIG',
      version: 'V2R8',
      platform: 'RHEL 9',
      platformSpec: null,
      workflowTemplateId: null,
      eeId: null,
      remediationPlaybookPath: '',
      scanTags: '',
      createdAt: '2025-01-01',
      updatedAt: '2025-01-01',
    };
    const saveMock = jest.fn().mockResolvedValue({});
    const mockApi = createMockApi({
      getRegisteredProfiles: jest.fn().mockResolvedValue([profile]),
      getRegisteredProfile: jest.fn().mockResolvedValue(profile),
      saveRegisteredProfile: saveMock,
    });

    await renderWithApi(mockApi);

    await waitFor(() => {
      expect(screen.getByLabelText('edit compliance profile')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('edit compliance profile'));

    await waitFor(() => {
      expect(screen.getByText('Update')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Update'));

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'cart-1' }),
      );
    });
  });

  it('shows "Save" button when adding a new profile', async () => {
    const mockApi = createMockApi({
      getRegisteredProfiles: jest.fn().mockResolvedValue([
        {
          id: 'cart-1',
          displayName: 'Existing',
          description: '',
          framework: 'DISA_STIG',
          version: '',
          platform: '',
          platformSpec: null,
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
      expect(screen.getByText('Add Profile')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Profile'));

    await waitFor(() => {
      expect(screen.getByText('Add Compliance Profile')).toBeInTheDocument();
      expect(screen.getAllByText('Save').length).toBeGreaterThanOrEqual(1);
    });
  });
});
