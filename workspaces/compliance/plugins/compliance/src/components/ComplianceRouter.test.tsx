import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { usePermission } from '@backstage/plugin-permission-react';
import { screen, waitFor } from '@testing-library/react';
import { scanLaunchPermission } from '@ansible/compliance-common';
import {
  ComplianceRouter,
  NewScanRoute,
  complianceTabIdFromPath,
  visibleCoreTabs,
} from './ComplianceRouter';
import { complianceApiRef } from '../api';
import { createMockComplianceApi } from '../__testutils__/mockComplianceApi';

jest.mock('@backstage/plugin-permission-react', () => ({
  usePermission: jest.fn(() => ({ allowed: true, loading: false })),
}));

jest.mock('../hooks/useComplianceEnabled', () => ({
  useComplianceEnabled: () => true,
}));

const mockedUsePermission = usePermission as jest.Mock;

describe('compliance tab visibility', () => {
  const labels = (canLaunchScan: boolean) =>
    visibleCoreTabs(canLaunchScan).map(tab => tab.label);

  it('keeps New Scan for users who can launch scans', () => {
    expect(labels(true)).toEqual([
      'Overview',
      'New Scan',
      'Results',
      'Remediations',
      'Inventories',
      'Settings',
    ]);
  });

  it('keeps the view tabs for a user with no compliance permissions', () => {
    expect(labels(false)).toEqual([
      'Overview',
      'Results',
      'Remediations',
      'Inventories',
      'Settings',
    ]);
  });

  it('renders those tabs when compliance.scan.launch is denied', async () => {
    mockedUsePermission.mockReturnValue({ allowed: false, loading: false });
    const mockApi = createMockComplianceApi();

    await renderInTestApp(
      <TestApiProvider apis={[[complianceApiRef, mockApi]]}>
        <ComplianceRouter />
      </TestApiProvider>,
    );

    for (const label of [
      'Overview',
      'Results',
      'Remediations',
      'Inventories',
      'Settings',
    ]) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole('tab', { name: 'New Scan' }),
    ).not.toBeInTheDocument();
  });

  it('highlights Results after New Scan is removed', () => {
    const tabs = visibleCoreTabs(false);
    const id = complianceTabIdFromPath('/compliance/results', []);
    expect(tabs.findIndex(tab => tab.id === id)).toBe(1);
    expect(tabs[1].label).toBe('Results');
  });

  it('highlights a dynamic profile tab from its path', () => {
    const dynamic = [{ id: 'profile-stig', profileId: 'rhel9-stig' }];
    expect(
      complianceTabIdFromPath('/compliance/profile-tab/rhel9-stig', dynamic),
    ).toBe('profile-stig');
  });
});

describe('NewScanRoute', () => {
  beforeEach(() => {
    mockedUsePermission.mockReturnValue({ allowed: true, loading: false });
  });

  it('blocks the launcher without compliance.scan.launch', async () => {
    mockedUsePermission.mockReturnValue({ allowed: false, loading: false });

    await renderInTestApp(<NewScanRoute />);

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(
      screen.getByText(
        'You do not have permission to launch scans. Contact your administrator if you need access.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Select Profile')).not.toBeInTheDocument();
    expect(mockedUsePermission).toHaveBeenCalledWith({
      permission: scanLaunchPermission,
    });
  });

  it('renders the launcher when compliance.scan.launch is allowed', async () => {
    const mockApi = createMockComplianceApi();
    mockApi.getRegisteredProfiles.mockResolvedValue([]);

    await renderInTestApp(
      <TestApiProvider apis={[[complianceApiRef, mockApi]]}>
        <NewScanRoute />
      </TestApiProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Select Profile')).toBeInTheDocument();
    });
  });
});
