import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { screen, waitFor } from '@testing-library/react';
import { ComplianceDashboard } from './ComplianceDashboard';
import { complianceApiRef } from '../../api';
import {
  createMockComplianceApi,
  MOCK_DASHBOARD_STATS,
} from '../../__testutils__/mockComplianceApi';
import type { ComplianceApi } from '../../api';

describe('ComplianceDashboard', () => {
  let mockApi: jest.Mocked<ComplianceApi>;

  beforeEach(() => {
    mockApi = createMockComplianceApi();
  });

  const renderDashboard = () =>
    renderInTestApp(
      <TestApiProvider apis={[[complianceApiRef, mockApi]]}>
        <ComplianceDashboard />
      </TestApiProvider>,
    );

  it('renders compliance posture heading after loading', async () => {
    await renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Compliance Posture')).toBeInTheDocument();
    });
  });

  it('displays key metric cards with mock values', async () => {
    await renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Hosts Scanned')).toBeInTheDocument();
    });
    expect(screen.getByText('Critical (CAT I)')).toBeInTheDocument();
    expect(screen.getByText('Pending Remediation')).toBeInTheDocument();
    expect(screen.getByText('Active Profiles')).toBeInTheDocument();
    // Verify the actual stat values from mock data
    expect(
      screen.getByText(String(MOCK_DASHBOARD_STATS.hostsScanned)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(String(MOCK_DASHBOARD_STATS.criticalFindings)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(String(MOCK_DASHBOARD_STATS.activeProfiles)),
    ).toBeInTheDocument();
  });

  it('displays quick action buttons', async () => {
    await renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('New Scan')).toBeInTheDocument();
    });
    expect(screen.getByText('Browse Profiles')).toBeInTheDocument();
  });

  it('displays recent activity from mock data', async () => {
    await renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    });
    expect(
      screen.getAllByText('RHEL 9 STIG V2R8').length,
    ).toBeGreaterThanOrEqual(1);
    // "CIS Benchmark L1" appears in both Recent Activity and Active Profiles
    expect(
      screen.getAllByText('CIS Benchmark L1').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('displays Remediation badge for remediation scanner entries', async () => {
    await renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Remediation')).toBeInTheDocument();
    });
  });

  it('displays active compliance profiles section', async () => {
    await renderDashboard();
    await waitFor(() => {
      expect(
        screen.getByText('Active Compliance Profiles'),
      ).toBeInTheDocument();
    });
    // Framework names come from MOCK_DASHBOARD_STATS.frameworkScores.
    // Some names appear in multiple sections so we use getAllByText.
    expect(screen.getAllByText('DISA STIG V2R8').length).toBeGreaterThanOrEqual(
      1,
    );
    expect(
      screen.getAllByText('CIS Benchmark L1').length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('PCI-DSS v4.0').length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it('displays trend deltas on stat cards', async () => {
    await renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();
    });
  });

  it('shows welcome state when dashboard stats are empty', async () => {
    mockApi.getDashboardStats.mockResolvedValue({
      hostsScanned: 0,
      criticalFindings: 0,
      pendingRemediation: 0,
      activeProfiles: 0,
      recentScans: [],
      frameworkScores: [],
      postureStatus: [],
      byInventory: [],
    });

    await renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Welcome to AAP Compliance')).toBeInTheDocument();
    });
    expect(
      screen.getByText('Get Started with Compliance Scanning'),
    ).toBeInTheDocument();
  });

  it('shows welcome state when API errors', async () => {
    mockApi.getDashboardStats.mockRejectedValue(new Error('Network error'));

    await renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Welcome to AAP Compliance')).toBeInTheDocument();
    });
  });

  it('calls getDashboardStats on mount', async () => {
    await renderDashboard();
    await waitFor(() => {
      expect(mockApi.getDashboardStats).toHaveBeenCalledTimes(1);
    });
  });
});
