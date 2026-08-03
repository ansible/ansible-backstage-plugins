import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { InventoriesList } from './InventoriesList';
import { complianceApiRef } from '../../api';
import {
  createMockComplianceApi,
  MOCK_DASHBOARD_STATS,
} from '../../__testutils__/mockComplianceApi';
import type { DashboardStats } from '@ansible/backstage-compliance-common/types';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// ─── Fixture factories ──────────────────────────────────────────────

function makeStats(overrides?: Partial<DashboardStats>): DashboardStats {
  return { ...MOCK_DASHBOARD_STATS, ...overrides };
}

function makeStatsWithBaseline(): DashboardStats {
  return makeStats({
    byInventory: [
      {
        inventoryId: 1,
        inventoryName: 'prod-servers',
        profileScores: [
          {
            profileId: 'rhel9-stig',
            name: 'DISA STIG V2R8',
            rate: 78,
            passCount: 285,
            failCount: 81,
            baseline: {
              remediationProfileId: 'rp-1',
              remediationProfileName: 'Prod STIG Baseline',
              rate: 85,
              passCount: 61,
              ruleCount: 72,
              pinnedAt: '2026-06-04T00:00:00Z',
            },
          },
        ],
      },
      {
        inventoryId: 2,
        inventoryName: 'staging-servers',
        profileScores: [
          { profileId: 'rhel9-cis-l1', name: 'CIS Benchmark L1', rate: 92, passCount: 174, failCount: 15 },
        ],
      },
    ],
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────

function renderInventoriesList(mockApi: ReturnType<typeof createMockComplianceApi>) {
  return renderInTestApp(
    <TestApiProvider apis={[[complianceApiRef, mockApi]]}>
      <InventoriesList />
    </TestApiProvider>,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('InventoriesList', () => {
  let mockApi: ReturnType<typeof createMockComplianceApi>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApi = createMockComplianceApi();
  });

  it('renders empty state when no inventories have scan data', async () => {
    mockApi.getDashboardStats.mockResolvedValue(makeStats({ byInventory: [] }));
    await renderInventoriesList(mockApi);
    await waitFor(() => {
      expect(screen.getByText('No inventories with scan data')).toBeInTheDocument();
    });
    expect(screen.getByText(/Run a compliance scan/)).toBeInTheDocument();
  });

  it('renders inventory table with inventory names', async () => {
    mockApi.getDashboardStats.mockResolvedValue(makeStats());
    await renderInventoriesList(mockApi);
    await waitFor(() => {
      expect(screen.getByText('prod-servers')).toBeInTheDocument();
    });
    expect(screen.getByText('staging-servers')).toBeInTheDocument();
  });

  it('shows inventory count', async () => {
    mockApi.getDashboardStats.mockResolvedValue(makeStats());
    await renderInventoriesList(mockApi);
    await waitFor(() => {
      expect(screen.getByText('2 inventories')).toBeInTheDocument();
    });
  });

  it('shows singular "inventory" for single item', async () => {
    mockApi.getDashboardStats.mockResolvedValue(makeStats({
      byInventory: [MOCK_DASHBOARD_STATS.byInventory[0]],
    }));
    await renderInventoriesList(mockApi);
    await waitFor(() => {
      expect(screen.getByText('1 inventory')).toBeInTheDocument();
    });
  });

  it('renders profile chips in "Active Scans" column', async () => {
    mockApi.getDashboardStats.mockResolvedValue(makeStats());
    await renderInventoriesList(mockApi);
    await waitFor(() => {
      expect(screen.getByText('DISA STIG V2R8')).toBeInTheDocument();
    });
    expect(screen.getByText('CIS Benchmark L1')).toBeInTheDocument();
    expect(screen.getByText('PCI-DSS v4.0')).toBeInTheDocument();
  });

  it('renders compliance score chips with percentages', async () => {
    mockApi.getDashboardStats.mockResolvedValue(makeStats());
    await renderInventoriesList(mockApi);
    await waitFor(() => {
      expect(screen.getByText('78%')).toBeInTheDocument();
    });
    expect(screen.getByText('92%')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('renders baseline chip with name and rate when baseline is pinned', async () => {
    mockApi.getDashboardStats.mockResolvedValue(makeStatsWithBaseline());
    await renderInventoriesList(mockApi);
    await waitFor(() => {
      expect(screen.getByText('Prod STIG Baseline')).toBeInTheDocument();
    });
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('renders empty slots when no baseline is pinned', async () => {
    mockApi.getDashboardStats.mockResolvedValue(makeStats());
    await renderInventoriesList(mockApi);
    await waitFor(() => {
      expect(screen.getByText('prod-servers')).toBeInTheDocument();
    });
    expect(screen.queryByText('Prod STIG Baseline')).not.toBeInTheDocument();
  });

  it('renders table headers', async () => {
    mockApi.getDashboardStats.mockResolvedValue(makeStats());
    await renderInventoriesList(mockApi);
    await waitFor(() => {
      expect(screen.getByText('Inventory')).toBeInTheDocument();
    });
    expect(screen.getByText('Active Scans')).toBeInTheDocument();
    expect(screen.getByText('Baseline')).toBeInTheDocument();
    expect(screen.getByText('Baseline Compliance')).toBeInTheDocument();
    expect(screen.getByText('Standard Compliance')).toBeInTheDocument();
  });

  it('navigates to inventory detail on row click', async () => {
    mockApi.getDashboardStats.mockResolvedValue(makeStats());
    await renderInventoriesList(mockApi);
    await waitFor(() => {
      expect(screen.getByText('prod-servers')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('prod-servers'));
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/compliance/inventories/1'));
  });

  it('handles API error gracefully (renders empty)', async () => {
    mockApi.getDashboardStats.mockRejectedValue(new Error('API error'));
    await renderInventoriesList(mockApi);
    await waitFor(() => {
      expect(screen.getByText('No inventories with scan data')).toBeInTheDocument();
    });
  });

  it('filters inventories by selected profile', async () => {
    mockApi.getDashboardStats.mockResolvedValue(makeStats());
    await renderInventoriesList(mockApi);
    await waitFor(() => {
      expect(screen.getByText('2 inventories')).toBeInTheDocument();
    });

    // MUI Select: mouseDown on the labelled select opens the listbox
    const selectInput = screen.getByLabelText('Profile');
    fireEvent.mouseDown(selectInput);

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('option', { name: 'CIS Benchmark L1' }));

    await waitFor(() => {
      expect(screen.getByText('1 inventory')).toBeInTheDocument();
    });
    expect(screen.getByText('staging-servers')).toBeInTheDocument();
    expect(screen.queryByText('prod-servers')).not.toBeInTheDocument();
  });

  it('shows all inventories when "All Profiles" is selected', async () => {
    mockApi.getDashboardStats.mockResolvedValue(makeStats());
    await renderInventoriesList(mockApi);
    await waitFor(() => {
      expect(screen.getByText('2 inventories')).toBeInTheDocument();
    });
    expect(screen.getByText('prod-servers')).toBeInTheDocument();
    expect(screen.getByText('staging-servers')).toBeInTheDocument();
  });
});
