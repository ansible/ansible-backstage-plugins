import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { screen, waitFor } from '@testing-library/react';
import { ResultsViewer } from './ResultsViewer';
import { complianceApiRef } from '../../api';
import { createMockComplianceApi } from '../../__testutils__/mockComplianceApi';
import type { ComplianceApi } from '../../api';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ jobId: '42' }),
}));

describe('ResultsViewer', () => {
  let mockApi: jest.Mocked<ComplianceApi>;

  beforeEach(() => {
    mockApi = createMockComplianceApi();
  });

  const renderResults = () =>
    renderInTestApp(
      <TestApiProvider apis={[[complianceApiRef, mockApi]]}>
        <ResultsViewer />
      </TestApiProvider>,
    );

  it('renders findings table after loading', async () => {
    await renderResults();
    await waitFor(() => {
      expect(screen.getByText('Findings by Rule')).toBeInTheDocument();
    });
  });

  it('displays summary cards with computed values', async () => {
    await renderResults();
    await waitFor(() => {
      expect(screen.getByText(/overall.*compliance/i)).toBeInTheDocument();
    });
    expect(screen.getByText('Hosts Scanned')).toBeInTheDocument();
    expect(screen.getByText(/evaluated/i)).toBeInTheDocument();
    expect(screen.getByText(/with failures/i)).toBeInTheDocument();
  });

  it('displays the build remediation button', async () => {
    await renderResults();
    await waitFor(() => {
      expect(screen.getByText(/Build Remediation/)).toBeInTheDocument();
    });
  });

  it('displays finding table headers', async () => {
    await renderResults();
    await waitFor(() => {
      expect(screen.getByText('Rule ID')).toBeInTheDocument();
    });
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Hosts')).toBeInTheDocument();
    expect(screen.getByText('Pass Rate')).toBeInTheDocument();
    // "Severity" appears both as a table header and a FilterGroup label
    expect(screen.getAllByText('Severity').length).toBeGreaterThanOrEqual(1);
  });

  it('displays scan results title', async () => {
    await renderResults();
    await waitFor(() => {
      expect(screen.getByText('Assessment Results')).toBeInTheDocument();
    });
  });

  it('displays findings from mock data', async () => {
    await renderResults();
    await waitFor(() => {
      expect(
        screen.getByText('Set SSH Client Alive Interval'),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('V-257844')).toBeInTheDocument();
    expect(screen.getByText('Set Password Minimum Length')).toBeInTheDocument();
    expect(screen.getByText('V-257856')).toBeInTheDocument();
  });

  it('calls getFindingsPaginated with the jobId from route params', async () => {
    await renderResults();
    await waitFor(() => {
      expect(mockApi.getFindingsPaginated).toHaveBeenCalledWith(
        '42',
        expect.objectContaining({ limit: 100, offset: 0 }),
      );
    });
  });

  it('shows empty state when scan completed with no findings', async () => {
    mockApi.getFindingsPaginated.mockResolvedValue({
      findings: [],
      total: 0,
      limit: 100,
      offset: 0,
    });
    mockApi.getScan.mockResolvedValue({
      id: 'scan-1',
      profileId: 'rhel9-stig',
      inventoryId: 1,
      scanner: 'oscap',
      scanType: 'assessment',
      workflowJobId: 42,
      status: 'completed',
      startedAt: '2026-01-01',
      completedAt: '2026-01-01',
      errorDetails: null,
    });
    await renderResults();
    await waitFor(() => {
      expect(screen.getByText('No scan results yet')).toBeInTheDocument();
    });
  });

  it('shows scan not found when scan ID is invalid', async () => {
    mockApi.getFindingsPaginated.mockResolvedValue({
      findings: [],
      total: 0,
      limit: 100,
      offset: 0,
    });
    mockApi.getScan.mockResolvedValue(null);
    await renderResults();
    await waitFor(() => {
      expect(screen.getByText(/Scan not found/)).toBeInTheDocument();
    });
  });

  it('shows error state when API fails', async () => {
    mockApi.getFindingsPaginated.mockRejectedValue(
      new Error('Connection refused'),
    );
    await renderResults();
    await waitFor(() => {
      expect(screen.getByText(/Connection refused/)).toBeInTheDocument();
    });
  });

  it('shows N/A chip when getBatchScanStats returns naCount > 0', async () => {
    mockApi.getBatchScanStats.mockResolvedValue({
      'scan-1': { pass: 10, fail: 5, rules: 15, hosts: 3, naCount: 8 },
    });
    await renderResults();
    await waitFor(() => {
      expect(screen.getByText(/not applicable/)).toBeInTheDocument();
    });
  });

  it('lazily calls getNotApplicableRules on first N/A chip click', async () => {
    mockApi.getBatchScanStats.mockResolvedValue({
      'scan-1': { pass: 10, fail: 5, rules: 15, hosts: 3, naCount: 3 },
    });
    mockApi.getNotApplicableRules.mockResolvedValue([
      { ruleId: 'xccdf_rule_a', ruleTitle: 'Rule A', severity: 'CAT_II' },
    ]);
    await renderResults();
    const chip = await screen.findByText(/not applicable/);
    expect(mockApi.getNotApplicableRules).not.toHaveBeenCalled();
    chip.click();
    await waitFor(() => {
      expect(mockApi.getNotApplicableRules).toHaveBeenCalledWith('scan-1');
    });
  });
});
