/*
 * Copyright Red Hat
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { PortalProjectWorkflowPanel } from './PortalProjectWorkflowPanel';

jest.mock('@apme/ui-workflow', () => ({
  OperationPanel: () => <div data-testid="operation-panel" />,
}));

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
});
