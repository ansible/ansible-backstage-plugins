import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { EmptyState, type EmptyStateProps } from '../../..';
import { useIsSuperuser } from '../../hooks';

jest.mock('../../hooks', () => ({ useIsSuperuser: jest.fn() }));

describe('deprecated SDK EmptyState compatibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(useIsSuperuser)
      .mockReturnValue({ isSuperuser: true, loading: false, error: null });
  });

  it('keeps the existing props, collection wording and sync callback', () => {
    const onSyncClick = jest.fn();
    const props: EmptyStateProps = { onSyncClick, hasConfiguredSources: true };
    render(<EmptyState {...props} />);
    expect(
      screen.getByRole('heading', { name: 'No Collections Found' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Sync Now' }));
    expect(onSyncClick).toHaveBeenCalledTimes(1);
  });

  it('keeps custom configuration documentation and the filtered-repository state', () => {
    const { rerender } = render(
      <EmptyState hasConfiguredSources={false} configDocsUrl="/setup" />,
    );
    expect(
      screen.getByRole('link', { name: 'View Documentation' }),
    ).toHaveAttribute('href', '/setup');
    rerender(<EmptyState repositoryFilter hasConfiguredSources={false} />);
    expect(
      screen.getByRole('heading', {
        name: 'No collections discovered from this repository',
      }),
    ).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('keeps administrator-only actions hidden from other users', () => {
    jest
      .mocked(useIsSuperuser)
      .mockReturnValue({ isSuperuser: false, loading: false, error: null });
    const { rerender } = render(<EmptyState onSyncClick={jest.fn()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    rerender(<EmptyState hasConfiguredSources={false} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Contact your organization administrator to add/),
    ).toBeVisible();
  });

  it('preserves legacy progress-first tooltip behavior and disabled sync', async () => {
    const sync = jest.fn();
    render(
      <EmptyState
        onSyncClick={sync}
        syncDisabled
        syncDisabledReason="Busy"
        syncInProgress
        syncProgress={[
          { sourceId: 'hub', displayName: 'Hub', outcome: 'pending' },
        ]}
      />,
    );
    const button = screen.getByRole('button', { name: 'Sync Now' });
    expect(button).toBeDisabled();
    fireEvent.mouseOver(button.parentElement!);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Syncing');
    fireEvent.click(button);
    expect(sync).not.toHaveBeenCalled();
  });
});
