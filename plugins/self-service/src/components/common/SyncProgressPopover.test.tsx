import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@material-ui/core/styles';
import { SyncProgressPopover } from './SyncProgressPopover';
import type { SyncProgressEntry } from './types';

const theme = createTheme();

const renderPopover = (entries: SyncProgressEntry[]) =>
  render(
    <ThemeProvider theme={theme}>
      <SyncProgressPopover entries={entries} />
    </ThemeProvider>,
  );

describe('SyncProgressPopover', () => {
  it('shows "Syncing…" title and 0% while all entries are pending', () => {
    renderPopover([
      { sourceId: 'src-1', displayName: 'github.com:org1', outcome: 'pending' },
      { sourceId: 'src-2', displayName: 'github.com:org2', outcome: 'pending' },
    ]);

    expect(screen.getByText('Syncing\u2026')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('0 of 2 tasks completed')).toBeInTheDocument();
    expect(screen.getAllByText('In progress')).toHaveLength(2);
  });

  it('shows "Sync completed" and 100% when all entries succeeded', () => {
    renderPopover([
      { sourceId: 'src-1', displayName: 'github.com:org1', outcome: 'success' },
      { sourceId: 'src-2', displayName: 'github.com:org2', outcome: 'success' },
    ]);

    expect(screen.getByText('Sync completed')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('2 of 2 tasks completed')).toBeInTheDocument();
    expect(screen.getAllByText('Completed')).toHaveLength(2);
  });

  it('shows "Last sync completed with errors" when any entry failed', () => {
    renderPopover([
      { sourceId: 'src-1', displayName: 'github.com:org1', outcome: 'success' },
      { sourceId: 'src-2', displayName: 'github.com:org2', outcome: 'failure' },
    ]);

    expect(
      screen.getByText('Last sync completed with errors'),
    ).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('renders ambiguous outcome with "Finished" label', () => {
    renderPopover([
      {
        sourceId: 'src-1',
        displayName: 'gitlab.com:proj',
        outcome: 'ambiguous',
      },
    ]);

    expect(screen.getByText('Finished')).toBeInTheDocument();
    expect(screen.getByText('gitlab.com:proj')).toBeInTheDocument();
    // allDone is true, hasFailures is false — 'ambiguous' is not 'failure'
    expect(screen.getByText('Sync completed')).toBeInTheDocument();
  });

  it('uses singular "task" when there is exactly one entry', () => {
    renderPopover([
      { sourceId: 'src-1', displayName: 'github.com:org1', outcome: 'success' },
    ]);

    expect(screen.getByText('1 of 1 task completed')).toBeInTheDocument();
  });

  it('shows correct partial progress during an active sync', () => {
    renderPopover([
      { sourceId: 'src-1', displayName: 'github.com:org1', outcome: 'success' },
      { sourceId: 'src-2', displayName: 'github.com:org2', outcome: 'failure' },
      { sourceId: 'src-3', displayName: 'github.com:org3', outcome: 'pending' },
    ]);

    expect(screen.getByText('Syncing\u2026')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();
    expect(screen.getByText('2 of 3 tasks completed')).toBeInTheDocument();
  });
});
