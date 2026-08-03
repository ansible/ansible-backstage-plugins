import React from 'react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { RemediationProfileBuilder } from './RemediationProfileBuilder';
import { complianceApiRef } from '../../api';
import { createMockComplianceApi } from '../../__testutils__/mockComplianceApi';
import type { ComplianceApi } from '../../api';

// react-window: render all items directly in tests (JSDOM has no layout dimensions)
jest.mock('react-window', () => ({
  VariableSizeList: React.forwardRef(({ children: Row, itemCount }: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ resetAfterIndex: () => {} }));
    return (
      <div data-testid="virtualized-list">
        {Array.from({ length: itemCount }, (_, i) => (
          <Row key={i} index={i} style={{}} />
        ))}
      </div>
    );
  }),
}));

// Mock useParams to provide a jobId
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ jobId: '42' }),
}));

// Mock usePermission to allow remediation actions
jest.mock('@backstage/plugin-permission-react', () => ({
  usePermission: () => ({ allowed: true, loading: false }),
}));

describe('RemediationProfileBuilder', () => {
  let mockApi: jest.Mocked<ComplianceApi>;

  beforeEach(() => {
    mockApi = createMockComplianceApi();
  });

  const renderBuilder = () =>
    renderInTestApp(
      <TestApiProvider apis={[[complianceApiRef, mockApi]]}>
        <RemediationProfileBuilder />
      </TestApiProvider>,
    );

  it('renders breadcrumb with Remediation label', async () => {
    await renderBuilder();
    await waitFor(() => {
      expect(screen.getByText('Remediation')).toBeInTheDocument();
    });
  });

  it('displays the summary bar with rule counts including compliant', async () => {
    await renderBuilder();
    await waitFor(() => {
      expect(screen.getByText(/rules with failures/)).toBeInTheDocument();
    });
    // The summary bar shows a "compliant" count (text split across elements with <strong>)
    expect(screen.getByText((_, element) =>
      element?.tagName === 'P' && /\d+\s*compliant/.test(element.textContent || '') || false
    )).toBeInTheDocument();
    // "selected" and "skipped" text appear in summary bar and per-group headers
    expect(screen.getAllByText(/selected/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/skipped/)).toBeInTheDocument();
    expect(screen.getByText(/hosts affected/)).toBeInTheDocument();
  });

  it('displays bulk action buttons including Select All Failed', async () => {
    await renderBuilder();
    await waitFor(() => {
      expect(screen.getByText('Select Displayed')).toBeInTheDocument();
    });
    expect(screen.getByText('Select All Failed')).toBeInTheDocument();
    // Severity filter is now a FilterGroup accordion chip, not a ButtonGroup
    expect(screen.getByText('Severity')).toBeInTheDocument();
    expect(screen.getByText('Risk')).toBeInTheDocument();
    expect(screen.getByText('Deselect All')).toBeInTheDocument();
  });

  it('displays view toggle buttons defaulting to By Status', async () => {
    await renderBuilder();
    await waitFor(() => {
      expect(screen.getByTestId('view-by-status')).toBeInTheDocument();
    });
    expect(screen.getByTestId('view-by-category')).toBeInTheDocument();
  });

  it('shows failed rules section and collapsed passing rules section in status view', async () => {
    await renderBuilder();
    await waitFor(() => {
      expect(screen.getByTestId('failed-rules-header')).toBeInTheDocument();
    });
    expect(screen.getByTestId('passing-rules-header')).toBeInTheDocument();
    // Failed rules should be visible
    expect(screen.getByText('Set SSH Client Alive Interval')).toBeInTheDocument();
    expect(screen.getByText('Set Password Minimum Length')).toBeInTheDocument();
    // Passing rule is in the DOM but hidden (MUI Collapse uses CSS, not DOM removal).
    // Verify the collapse wrapper has height 0 / is not expanded.
    const passingRuleEl = screen.getByText('Disable SSH Root Login');
    const collapseWrapper = passingRuleEl.closest('.MuiCollapse-root');
    expect(collapseWrapper).toHaveClass('MuiCollapse-hidden');
  });

  it('expands passing rules section when clicked', async () => {
    await renderBuilder();
    await waitFor(() => {
      expect(screen.getByTestId('passing-rules-header')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('passing-rules-header'));

    await waitFor(() => {
      expect(screen.getByText('Disable SSH Root Login')).toBeInTheDocument();
    });
    // Shows the informational note
    expect(screen.getByText(/These rules are currently compliant/)).toBeInTheDocument();
  });

  it('switches to category view and shows severity group headers', async () => {
    await renderBuilder();
    await waitFor(() => {
      expect(screen.getByTestId('view-by-category')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('view-by-category'));

    await waitFor(() => {
      expect(screen.getByText('CAT I — Critical')).toBeInTheDocument();
    });
    expect(screen.getByText('CAT II — Medium')).toBeInTheDocument();
    // In category view, all rules should be visible (including passing)
    expect(screen.getByText('Disable SSH Root Login')).toBeInTheDocument();
  });

  it('displays the apply remediation button', async () => {
    await renderBuilder();
    await waitFor(() => {
      expect(screen.getByText(/Apply Remediation/)).toBeInTheDocument();
    });
  });

  it('displays inline name and description fields (Insights pattern)', async () => {
    await renderBuilder();
    await waitFor(() => {
      expect(screen.getByLabelText('Remediation profile name')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Remediation profile description')).toBeInTheDocument();
  });

  it('shows helper text when name is empty', async () => {
    await renderBuilder();
    await waitFor(() => {
      expect(screen.getByText('Name your remediation to enable auto-save')).toBeInTheDocument();
    });
  });

  it('toggles all rules when Select Displayed / Deselect All are clicked', async () => {
    await renderBuilder();
    await waitFor(() => {
      expect(screen.getByText('Deselect All')).toBeInTheDocument();
    });

    // After Deselect All, the skipped count should match total findings (3: 2 failed + 1 passing)
    fireEvent.click(screen.getByText('Deselect All'));
    await waitFor(() => {
      expect(screen.getByText(/skipped/)).toHaveTextContent('3');
    });

    // After Select Displayed, the skipped count should be 0 (all visible = all when no filter)
    fireEvent.click(screen.getByText('Select Displayed'));
    await waitFor(() => {
      expect(screen.getByText(/skipped/)).toHaveTextContent('0');
    });
  });

  it('Select All Failed only enables failed rules', async () => {
    await renderBuilder();
    await waitFor(() => {
      expect(screen.getByText('Select All Failed')).toBeInTheDocument();
    });

    // Clear all first
    fireEvent.click(screen.getByText('Deselect All'));
    await waitFor(() => {
      expect(screen.getByText(/skipped/)).toHaveTextContent('3');
    });

    // Select All Failed should enable only 2 (failed) rules
    fireEvent.click(screen.getByText('Select All Failed'));
    await waitFor(() => {
      // 2 failed rules selected + 1 passing rule still disabled = 1 skipped
      screen.getAllByText(/selected/).find(el => {
        const parent = el.closest('.MuiTypography-root');
        return parent && parent.textContent?.match(/^\d+ selected$/);
      });
      // We check the summary bar count
      expect(screen.getByText(/skipped/)).toHaveTextContent('1');
    });
  });

  it('passing rules are disabled by default for new remediations', async () => {
    await renderBuilder();
    await waitFor(() => {
      expect(screen.getByTestId('passing-rules-header')).toBeInTheDocument();
    });

    // The passing rules header should show 0 selected
    const passingHeader = screen.getByTestId('passing-rules-header');
    expect(within(passingHeader).getByText(/0\/1 selected/)).toBeInTheDocument();
  });

  it('persists selections when switching between views', async () => {
    await renderBuilder();
    await waitFor(() => {
      expect(screen.getByText('Select Displayed')).toBeInTheDocument();
    });

    // Select Displayed (all visible = all when no filter)
    fireEvent.click(screen.getByText('Select Displayed'));
    await waitFor(() => {
      expect(screen.getByText(/skipped/)).toHaveTextContent('0');
    });

    // Switch to category view
    fireEvent.click(screen.getByTestId('view-by-category'));
    await waitFor(() => {
      expect(screen.getByText('CAT I — Critical')).toBeInTheDocument();
    });

    // Selections should persist - still 0 skipped
    expect(screen.getByText(/skipped/)).toHaveTextContent('0');

    // Switch back to status view
    fireEvent.click(screen.getByTestId('view-by-status'));
    await waitFor(() => {
      expect(screen.getByTestId('failed-rules-header')).toBeInTheDocument();
    });

    // Selections should still persist
    expect(screen.getByText(/skipped/)).toHaveTextContent('0');
  });

  it('calls getFindings with the jobId from route params', async () => {
    await renderBuilder();
    await waitFor(() => {
      expect(mockApi.getFindings).toHaveBeenCalledWith('42');
    });
  });
});
