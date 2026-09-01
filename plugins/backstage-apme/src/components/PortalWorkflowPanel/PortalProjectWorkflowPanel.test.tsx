/*
 * Copyright Red Hat
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import {
  findPullRequestControl,
  PortalProjectWorkflowPanel,
} from './PortalProjectWorkflowPanel';

jest.mock('@apme/ui-workflow', () => ({
  OperationPanel: () => (
    <div data-testid="operation-panel">
      <a href="https://github.com/acme/repo/pull/12">View pull request</a>
    </div>
  ),
}));

describe('findPullRequestControl', () => {
  it('prefers a pull request href over button copy', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <button type="button">View pull request</button>
      <a href="https://github.com/acme/repo/pull/12">Open PR</a>
    `;

    expect(findPullRequestControl(root)?.getAttribute('href')).toBe(
      'https://github.com/acme/repo/pull/12',
    );
  });

  it('falls back to English button copy when no PR href exists', () => {
    const root = document.createElement('div');
    root.innerHTML = `<button type="button">View pull request</button>`;

    expect(findPullRequestControl(root)?.textContent).toBe('View pull request');
  });
});

describe('PortalProjectWorkflowPanel', () => {
  it('renders the starting spinner when the workflow session is not active', () => {
    render(
      <PortalProjectWorkflowPanel
        workflow={{
          operationActive: false,
          opState: null,
          approve: jest.fn(),
          beginRemediate: jest.fn(),
          escalateAi: jest.fn(),
          patchProposals: jest.fn(),
          cancel: jest.fn(),
          createPR: jest.fn(),
          dismiss: jest.fn(),
        }}
        enableAi={false}
        feedbackEnabled={false}
      />,
    );

    expect(screen.getByText('Starting scan…')).toBeInTheDocument();
  });

  it('renders OperationPanel when the workflow session is active', () => {
    render(
      <PortalProjectWorkflowPanel
        workflow={{
          operationActive: true,
          opState: {
            operation_id: 'op-1',
            project_id: 'proj-1',
            scan_id: 'scan-1',
            status: 'scanning',
            scan_type: 'check',
            started_at: '2026-01-01T00:00:00Z',
            progress: [],
          },
          approve: jest.fn(),
          beginRemediate: jest.fn(),
          escalateAi: jest.fn(),
          patchProposals: jest.fn(),
          cancel: jest.fn(),
          createPR: jest.fn(),
          dismiss: jest.fn(),
        }}
        enableAi={false}
        feedbackEnabled={false}
      />,
    );

    expect(screen.getByTestId('operation-panel')).toBeInTheDocument();
  });

  it('removes the injected host-action slot on unmount', async () => {
    const { unmount } = render(
      <PortalProjectWorkflowPanel
        workflow={{
          operationActive: true,
          opState: {
            operation_id: 'op-1',
            project_id: 'proj-1',
            scan_id: 'scan-1',
            status: 'pr_submitted',
            scan_type: 'remediate',
            started_at: '2026-01-01T00:00:00Z',
            progress: [],
            pr_url: 'https://github.com/acme/repo/pull/12',
          },
          approve: jest.fn(),
          beginRemediate: jest.fn(),
          escalateAi: jest.fn(),
          patchProposals: jest.fn(),
          cancel: jest.fn(),
          createPR: jest.fn(),
          dismiss: jest.fn(),
        }}
        enableAi={false}
        feedbackEnabled={false}
        hostShipActions={<button type="button">Open in Dev Spaces</button>}
      />,
    );

    await waitFor(() => {
      expect(
        document.querySelector('[data-apme-host-ship-actions]'),
      ).toBeInTheDocument();
    });

    unmount();

    expect(
      document.querySelector('[data-apme-host-ship-actions]'),
    ).not.toBeInTheDocument();
  });
});
