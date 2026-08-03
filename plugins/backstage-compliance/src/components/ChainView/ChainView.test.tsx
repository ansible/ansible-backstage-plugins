import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { screen, waitFor } from '@testing-library/react';
import { ChainView } from './ChainView';
import { complianceApiRef } from '../../api';
import { createMockComplianceApi } from '../../__testutils__/mockComplianceApi';
import type { ChainResponse } from '@ansible/backstage-compliance-common/types';

const mockNavigate = jest.fn();
const mockUseParams = jest.fn().mockReturnValue({ executionId: 'exec-abc123' });

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => mockUseParams(),
  useNavigate: () => mockNavigate,
}));

// ─── Fixture factories ──────────────────────────────────────────────

function makeFullChain(overrides?: Partial<ChainResponse>): ChainResponse {
  return {
    execution: {
      id: 'exec-abc123',
      remediationProfileId: 'rp-1',
      inventoryId: 1,
      informingScanId: 'scan-1',
      primaryJobId: 100,
      allJobIds: [100],
      status: 'succeeded',
      startedAt: '2026-06-01T20:00:00Z',
      completedAt: '2026-06-01T20:04:00Z',
      elapsedSeconds: 240,
      rulesApplied: 5,
      rulesFailed: 0,
      hostsTargeted: 10,
      hostsSucceeded: 10,
      hostsFailed: 0,
      planSummary: null,
      verificationScanId: 'scan-2',
      createdBy: 'admin',
    },
    assessmentScan: {
      id: 'scan-1',
      profileId: 'rhel9-stig',
      inventoryId: 1,
      scanner: 'oscap',
      scanType: 'assessment',
      workflowJobId: 42,
      status: 'completed',
      startedAt: '2026-06-01T19:50:00Z',
      completedAt: '2026-06-01T19:55:00Z',
      errorDetails: null,
    },
    assessmentStats: { pass: 280, fail: 86, rules: 366, hosts: 10 },
    verificationScan: {
      id: 'scan-2',
      profileId: 'rhel9-stig',
      inventoryId: 1,
      scanner: 'oscap',
      scanType: 'verification',
      workflowJobId: 43,
      status: 'completed',
      startedAt: '2026-06-01T20:05:00Z',
      completedAt: '2026-06-01T20:10:00Z',
      errorDetails: null,
    },
    verificationStats: { pass: 285, fail: 81, rules: 366, hosts: 10 },
    delta: { fixed: 5, regressed: 0, unchanged: 361 },
    ...overrides,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function renderChainView(mockApi: ReturnType<typeof createMockComplianceApi>) {
  return renderInTestApp(
    <TestApiProvider apis={[[complianceApiRef, mockApi]]}>
      <ChainView />
    </TestApiProvider>,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('ChainView', () => {
  let mockApi: ReturnType<typeof createMockComplianceApi>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApi = createMockComplianceApi();
  });

  // ─── Loading / Error / Not Found ─────────────────────────────────

  it('renders error state when API fails', async () => {
    mockApi.getChain.mockRejectedValue(new Error('Network error'));
    await renderChainView(mockApi);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
    expect(screen.getByText('Back to Results')).toBeInTheDocument();
  });

  it('renders "Execution not found" when chain is null', async () => {
    mockApi.getChain.mockResolvedValue(null as any);
    await renderChainView(mockApi);
    await waitFor(() => {
      expect(screen.getByText('Execution not found')).toBeInTheDocument();
    });
  });

  it('calls getChain with executionId from URL params', async () => {
    mockApi.getChain.mockResolvedValue(makeFullChain());
    await renderChainView(mockApi);
    await waitFor(() => {
      expect(mockApi.getChain).toHaveBeenCalledWith('exec-abc123');
    });
  });

  // ─── Stepper step labels (always visible) ────────────────────────

  it('renders all three stepper step labels for a full chain', async () => {
    mockApi.getChain.mockResolvedValue(makeFullChain());
    await renderChainView(mockApi);
    await waitFor(() => {
      expect(screen.getByText('Assessment Scan')).toBeInTheDocument();
    });
    expect(screen.getByText('Remediation')).toBeInTheDocument();
    expect(screen.getByText('Verification')).toBeInTheDocument();
  });

  // ─── Breadcrumbs and header ──────────────────────────────────────

  it('renders breadcrumbs with Results link', async () => {
    mockApi.getChain.mockResolvedValue(makeFullChain());
    await renderChainView(mockApi);
    await waitFor(() => {
      expect(screen.getByText('Results')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Assessment Chain').length).toBeGreaterThan(0);
  });

  it('renders info card subheader with truncated executionId', async () => {
    mockApi.getChain.mockResolvedValue(makeFullChain());
    await renderChainView(mockApi);
    await waitFor(() => {
      expect(screen.getByText('Remediation execution exec-abc...')).toBeInTheDocument();
    });
  });

  // ─── Verification step content (activeStep=2, always visible) ────

  it('displays verification scan stats', async () => {
    mockApi.getChain.mockResolvedValue(makeFullChain());
    await renderChainView(mockApi);
    await waitFor(() => {
      expect(screen.getByText('285 pass')).toBeInTheDocument();
    });
    expect(screen.getByText('81 fail')).toBeInTheDocument();
  });

  it('displays delta metrics (fixed)', async () => {
    mockApi.getChain.mockResolvedValue(makeFullChain());
    await renderChainView(mockApi);
    await waitFor(() => {
      expect(screen.getByText('+5 fixed')).toBeInTheDocument();
    });
  });

  it('displays both fixed and regressed deltas', async () => {
    const chain = makeFullChain();
    chain.delta = { fixed: 2, regressed: 3, unchanged: 361 };
    mockApi.getChain.mockResolvedValue(chain);
    await renderChainView(mockApi);
    await waitFor(() => {
      expect(screen.getByText('+2 fixed')).toBeInTheDocument();
    });
    expect(screen.getByText('-3 regressed')).toBeInTheDocument();
  });

  it('shows "No changes detected" when delta is zero', async () => {
    const chain = makeFullChain();
    chain.delta = { fixed: 0, regressed: 0, unchanged: 366 };
    mockApi.getChain.mockResolvedValue(chain);
    await renderChainView(mockApi);
    await waitFor(() => {
      expect(screen.getByText('No changes detected')).toBeInTheDocument();
    });
  });

  it('shows view verification results button', async () => {
    mockApi.getChain.mockResolvedValue(makeFullChain());
    await renderChainView(mockApi);
    await waitFor(() => {
      expect(screen.getByText('View verification results')).toBeInTheDocument();
    });
  });

  // ─── No verification scan (activeStep=1, remediation step active) ──

  it('renders "No verification scan yet" when remediation succeeded but no verification', async () => {
    const chain = makeFullChain();
    chain.verificationScan = null;
    chain.verificationStats = null;
    chain.delta = null;
    mockApi.getChain.mockResolvedValue(chain);
    await renderChainView(mockApi);
    await waitFor(() => {
      expect(screen.getByText('No verification scan yet')).toBeInTheDocument();
    });
  });

  it('shows remediation status when remediation step is active', async () => {
    const chain = makeFullChain();
    chain.verificationScan = null;
    chain.verificationStats = null;
    chain.delta = null;
    mockApi.getChain.mockResolvedValue(chain);
    await renderChainView(mockApi);
    await waitFor(() => {
      expect(screen.getByText('succeeded')).toBeInTheDocument();
    });
    expect(screen.getByText('10 hosts succeeded')).toBeInTheDocument();
    expect(screen.getByText('5 rules applied')).toBeInTheDocument();
  });

  it('displays failed hosts chip when hostsFailed > 0', async () => {
    const chain = makeFullChain();
    chain.verificationScan = null;
    chain.verificationStats = null;
    chain.delta = null;
    chain.execution.hostsFailed = 2;
    chain.execution.hostsSucceeded = 8;
    mockApi.getChain.mockResolvedValue(chain);
    await renderChainView(mockApi);
    await waitFor(() => {
      expect(screen.getByText('2 hosts failed')).toBeInTheDocument();
    });
    expect(screen.getByText('8 hosts succeeded')).toBeInTheDocument();
  });

  it('hides failed hosts chip when hostsFailed is 0', async () => {
    const chain = makeFullChain();
    chain.verificationScan = null;
    chain.verificationStats = null;
    chain.delta = null;
    mockApi.getChain.mockResolvedValue(chain);
    await renderChainView(mockApi);
    await waitFor(() => {
      expect(screen.getByText('10 hosts succeeded')).toBeInTheDocument();
    });
    expect(screen.queryByText(/hosts failed/)).not.toBeInTheDocument();
  });

  it('shows view execution details button', async () => {
    const chain = makeFullChain();
    chain.verificationScan = null;
    chain.verificationStats = null;
    chain.delta = null;
    mockApi.getChain.mockResolvedValue(chain);
    await renderChainView(mockApi);
    await waitFor(() => {
      expect(screen.getByText('View execution details')).toBeInTheDocument();
    });
  });

  it('shows connector with rules and hosts counts (step 0 active)', async () => {
    const chain = makeFullChain();
    chain.execution.status = 'running';
    chain.verificationScan = null;
    chain.verificationStats = null;
    chain.delta = null;
    mockApi.getChain.mockResolvedValue(chain);
    await renderChainView(mockApi);
    await waitFor(() => {
      expect(screen.getByText('5 rules selected on 10 hosts')).toBeInTheDocument();
    });
  });

  // ─── Remediation running (activeStep=0, assessment step active) ──

  it('renders assessment scan stats when assessment step is active', async () => {
    const chain = makeFullChain();
    chain.execution.status = 'running';
    chain.verificationScan = null;
    chain.verificationStats = null;
    chain.delta = null;
    mockApi.getChain.mockResolvedValue(chain);
    await renderChainView(mockApi);
    await waitFor(() => {
      expect(screen.getByText('366 rules')).toBeInTheDocument();
    });
    expect(screen.getByText('10 hosts')).toBeInTheDocument();
    expect(screen.getByText('280 pass')).toBeInTheDocument();
    expect(screen.getByText('86 fail')).toBeInTheDocument();
  });

  it('displays assessment pass rate', async () => {
    const chain = makeFullChain();
    chain.execution.status = 'running';
    chain.verificationScan = null;
    chain.verificationStats = null;
    chain.delta = null;
    mockApi.getChain.mockResolvedValue(chain);
    await renderChainView(mockApi);
    await waitFor(() => {
      expect(screen.getByText('76.5%')).toBeInTheDocument();
    });
  });

  it('shows view full results button', async () => {
    const chain = makeFullChain();
    chain.execution.status = 'running';
    chain.verificationScan = null;
    chain.verificationStats = null;
    chain.delta = null;
    mockApi.getChain.mockResolvedValue(chain);
    await renderChainView(mockApi);
    await waitFor(() => {
      expect(screen.getByText('View full results')).toBeInTheDocument();
    });
  });

  it('renders "Assessment scan not linked" when no assessment scan', async () => {
    const chain = makeFullChain();
    chain.assessmentScan = null;
    chain.assessmentStats = null;
    chain.execution.status = 'running';
    chain.verificationScan = null;
    chain.verificationStats = null;
    chain.delta = null;
    mockApi.getChain.mockResolvedValue(chain);
    await renderChainView(mockApi);
    await waitFor(() => {
      expect(screen.getByText('Assessment scan not linked')).toBeInTheDocument();
    });
  });

  it('shows verification step label even when awaiting', async () => {
    const chain = makeFullChain();
    chain.execution.status = 'running';
    chain.verificationScan = null;
    chain.verificationStats = null;
    chain.delta = null;
    mockApi.getChain.mockResolvedValue(chain);
    await renderChainView(mockApi);
    await waitFor(() => {
      expect(screen.getByText('Verification')).toBeInTheDocument();
    });
  });

  it('pass rate returns — for zero total', async () => {
    const chain = makeFullChain();
    chain.execution.status = 'running';
    chain.assessmentStats = { pass: 0, fail: 0, rules: 0, hosts: 0 };
    chain.verificationScan = null;
    chain.verificationStats = null;
    chain.delta = null;
    mockApi.getChain.mockResolvedValue(chain);
    await renderChainView(mockApi);
    await waitFor(() => {
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  // ─── Remediation status (step 1 active — succeeded, no verification) ──

  it('shows status text with textTransform capitalize', async () => {
    const chain = makeFullChain();
    chain.verificationScan = null;
    chain.verificationStats = null;
    chain.delta = null;
    mockApi.getChain.mockResolvedValue(chain);
    await renderChainView(mockApi);
    await waitFor(() => {
      expect(screen.getByText('succeeded')).toBeInTheDocument();
    });
  });
});
