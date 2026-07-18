/*
 * Copyright Red Hat
 */

import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { TestApiProvider } from '@backstage/test-utils';
import type { Activity } from '@ansible/backstage-apme-common/types';
import { ScanHistoryView } from './ScanHistoryView';
import { apmeApiRef } from '../../api';

const theme = createTheme();

const remediateBase: Activity = {
  scan_id: 'scan-rem-1',
  session_id: 'sess-1',
  project_path: 'demo',
  source: 'manual',
  created_at: '2026-07-18T00:00:00Z',
  scan_type: 'remediate',
  total_violations: 10,
  fixable: 5,
  ai_candidate: 0,
  ai_proposed: 0,
  ai_declined: 0,
  ai_accepted: 0,
  manual_review: 0,
  remediated_count: 5,
};

const analyzeBase: Activity = {
  scan_id: 'scan-analyze-1',
  session_id: 'sess-2',
  project_path: 'demo',
  source: 'manual',
  created_at: '2026-07-18T00:00:00Z',
  scan_type: 'check',
  total_violations: 3,
  fixable: 1,
  ai_candidate: 0,
  ai_proposed: 0,
  ai_declined: 0,
  ai_accepted: 0,
  manual_review: 0,
  remediated_count: 0,
};

describe('ScanHistoryView', () => {
  const mockApmeApi = {
    getActivityDetail: jest.fn(),
  };

  const renderView = (activity: Activity[]) =>
    render(
      <TestApiProvider apis={[[apmeApiRef, mockApmeApi]]}>
        <ThemeProvider theme={theme}>
          <ScanHistoryView
            activity={activity}
            onBack={jest.fn()}
            repoUrl="https://github.com/acme/demo"
          />
        </ThemeProvider>
      </TestApiProvider>,
    );

  const getColumnCell = (columnHeader: string, rowIndex = 0) => {
    const headers = screen.getAllByRole('columnheader');
    const headerIndex = headers.findIndex(
      h => h.textContent?.trim() === columnHeader,
    );
    expect(headerIndex).toBeGreaterThanOrEqual(0);
    const rows = screen.getAllByRole('row').slice(1);
    const cells = within(rows[rowIndex]).getAllByRole('cell');
    return cells[headerIndex];
  };

  it('shows branch name as a link in the Branch column', () => {
    renderView([
      {
        ...remediateBase,
        branch_name: 'apme/remediate-abc',
        pr_url: null,
      },
    ]);

    const branchCell = getColumnCell('Branch');
    expect(
      within(branchCell).getByRole('link', { name: 'apme/remediate-abc' }),
    ).toHaveAttribute(
      'href',
      'https://github.com/acme/demo/tree/apme/remediate-abc',
    );
  });

  it('shows only branch link in Branch column when branch pushed without PR', () => {
    renderView([
      {
        ...remediateBase,
        branch_name: 'apme/remediate-abc',
        pr_url: null,
      },
    ]);

    const branchCell = getColumnCell('Branch');
    expect(
      within(branchCell).getByRole('link', { name: 'apme/remediate-abc' }),
    ).toHaveAttribute(
      'href',
      'https://github.com/acme/demo/tree/apme/remediate-abc',
    );
    expect(
      within(branchCell).queryByRole('link', { name: 'View changes' }),
    ).not.toBeInTheDocument();

    const prCell = getColumnCell('PR');
    expect(within(prCell).getByText('—')).toBeInTheDocument();
  });

  it('shows PR link in PR column without View changes when pr_url is set', () => {
    renderView([
      {
        ...remediateBase,
        branch_name: 'apme/remediate-abc',
        pr_url: 'https://github.com/acme/demo/pull/42',
      },
    ]);

    const prCell = getColumnCell('PR');
    expect(within(prCell).getByRole('link', { name: '#42' })).toHaveAttribute(
      'href',
      'https://github.com/acme/demo/pull/42',
    );

    expect(
      screen.queryByRole('link', { name: 'View changes' }),
    ).not.toBeInTheDocument();
  });

  it('shows em dash in Branch and PR columns for analyze rows', () => {
    renderView([analyzeBase]);

    const branchCell = getColumnCell('Branch');
    const prCell = getColumnCell('PR');
    expect(within(branchCell).getByText('—')).toBeInTheDocument();
    expect(within(prCell).getByText('—')).toBeInTheDocument();
  });

  it('shows trailing expand chevron for remediate rows without Details label', () => {
    renderView([remediateBase]);

    expect(screen.queryByText('Details')).not.toBeInTheDocument();

    const row = screen.getAllByRole('row').slice(1)[0];
    const cells = within(row).getAllByRole('cell');
    const expandCell = cells[cells.length - 1];
    expect(
      within(expandCell).getByRole('button', { name: 'Expand scan details' }),
    ).toBeInTheDocument();
  });

  it('shows no expand chevron for non-expandable analyze rows', () => {
    renderView([analyzeBase]);

    const row = screen.getAllByRole('row').slice(1)[0];
    const cells = within(row).getAllByRole('cell');
    const expandCell = cells[cells.length - 1];
    expect(
      within(expandCell).queryByRole('button', { name: 'Expand scan details' }),
    ).not.toBeInTheDocument();
  });
});
