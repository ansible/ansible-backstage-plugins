import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { SyncProgressPopover } from './SyncProgressPopover';

describe('SDK SyncProgressPopover', () => {
  it('handles an empty sync without an invalid percentage', () => {
    render(<SyncProgressPopover entries={[]} />);
    expect(screen.getByText('Sync completed')).toBeVisible();
    expect(screen.getByText('0 of 0 tasks completed')).toBeVisible();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
  });

  it('renders pending, successful, failed and ambiguous sources separately', () => {
    render(
      <SyncProgressPopover
        entries={[
          { sourceId: 'pending', displayName: 'Git', outcome: 'pending' },
          { sourceId: 'success', displayName: 'Hub', outcome: 'success' },
          { sourceId: 'failure', displayName: 'Registry', outcome: 'failure' },
          { sourceId: 'ambiguous', displayName: 'Other', outcome: 'ambiguous' },
        ]}
      />,
    );
    expect(screen.getByText('Syncing…')).toBeVisible();
    expect(screen.getByText('3 of 4 tasks completed')).toBeVisible();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '75',
    );
    for (const status of ['In progress', 'Completed', 'Failed', 'Finished']) {
      expect(screen.getByText(status)).toBeVisible();
    }
  });

  it('shows completion with errors after the last task fails', () => {
    render(
      <SyncProgressPopover
        entries={[{ sourceId: 'hub', displayName: 'Hub', outcome: 'failure' }]}
      />,
    );
    expect(screen.getByText('Last sync completed with errors')).toBeVisible();
    expect(screen.getByText('1 of 1 task completed')).toBeVisible();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
  });

  it('shows the relative timestamp for successful sources when provided', () => {
    render(
      <SyncProgressPopover
        entries={[
          {
            sourceId: 'hub',
            displayName: 'Hub',
            outcome: 'success',
            lastSyncTime: new Date().toISOString(),
          },
        ]}
      />,
    );
    expect(screen.getByText('Sync completed')).toBeVisible();
    expect(screen.getByText(/just now/i)).toBeVisible();
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  });
});
