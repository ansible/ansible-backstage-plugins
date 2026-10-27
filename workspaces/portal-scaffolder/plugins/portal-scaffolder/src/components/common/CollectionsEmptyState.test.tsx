import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useIsSuperuser } from '@ansible/portal-plugin-sdk';
import {
  CollectionsEmptyState,
  type CollectionsEmptyStateProps,
} from './CollectionsEmptyState';

jest.mock('@ansible/portal-plugin-sdk', () => ({
  ...jest.requireActual('@ansible/portal-plugin-sdk'),
  useIsSuperuser: jest.fn(),
}));

describe('CollectionsEmptyState', () => {
  const sync = jest.fn();
  const mount = (props: CollectionsEmptyStateProps = {}) =>
    render(<CollectionsEmptyState onSyncClick={sync} {...props} />);

  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(useIsSuperuser)
      .mockReturnValue({ isSuperuser: true, loading: false, error: null });
  });

  it('keeps collection messaging and invokes sync only on activation', () => {
    mount();
    expect(
      screen.getByRole('heading', { name: 'No Collections Found' }),
    ).toBeVisible();
    expect(
      screen.getByText(/Sync the catalog to fetch the latest contents/),
    ).toBeVisible();
    expect(sync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sync Now' }));
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('provides configuration guidance and a contributor-owned documentation link', () => {
    mount({
      hasConfiguredSources: false,
      configDocsUrl: '/configuration-guide',
    });
    expect(
      screen.getByRole('heading', { name: 'No content sources configured' }),
    ).toBeVisible();
    const link = screen.getByRole('link', { name: 'View Documentation' });
    expect(link).toHaveAttribute('href', '/configuration-guide');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(
      screen.queryByRole('button', { name: 'Sync Now' }),
    ).not.toBeInTheDocument();
  });

  it('uses the existing documentation destination by default', () => {
    mount({ hasConfiguredSources: false });
    expect(
      screen.getByRole('link', { name: 'View Documentation' }),
    ).toHaveAttribute('href', 'https://red.ht/self-service-config-docs');
  });

  it.each([
    { loading: false, error: null },
    { loading: true, error: null },
    { loading: false, error: new Error('Unavailable') },
  ])(
    'does not expose admin actions without confirmed superuser access: %j',
    state => {
      jest
        .mocked(useIsSuperuser)
        .mockReturnValue({ isSuperuser: false, ...state });
      const { rerender } = mount();
      expect(
        screen.getByText(/Contact your organization administrator to sync/),
      ).toBeVisible();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      rerender(
        <CollectionsEmptyState
          hasConfiguredSources={false}
          onSyncClick={sync}
        />,
      );
      expect(
        screen.getByText(/Contact your organization administrator to add/),
      ).toBeVisible();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    },
  );

  it('preserves repository-filter guidance without offering global configuration or sync', () => {
    mount({ repositoryFilter: true, hasConfiguredSources: false });
    expect(
      screen.getByRole('heading', {
        name: 'No collections discovered from this repository',
      }),
    ).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each([
    { outcome: 'pending' as const, running: true, text: 'Syncing' },
    {
      outcome: 'failure' as const,
      running: false,
      text: 'Last sync completed with errors',
    },
    { outcome: 'ambiguous' as const, running: false, text: 'Finished' },
  ])(
    'retains source progress for $outcome without enabling another sync',
    async ({ outcome, running, text }) => {
      mount({
        syncDisabled: true,
        syncInProgress: running,
        syncProgress: [{ sourceId: 'hub', displayName: 'Hub', outcome }],
      });
      const button = screen.getByRole('button', { name: 'Sync Now' });
      expect(button).toHaveAttribute('aria-disabled', 'true');
      fireEvent.mouseOver(button);
      const tooltip = await screen.findByRole('tooltip');
      expect(tooltip).toHaveTextContent(text);
      expect(tooltip).toHaveTextContent('Hub');
      fireEvent.click(button);
      expect(sync).not.toHaveBeenCalled();
    },
  );

  it('prioritizes a blocking explanation and makes it reachable using the keyboard', async () => {
    const user = userEvent.setup();
    mount({
      syncDisabled: true,
      syncDisabledReason: 'Source is unavailable',
      syncInProgress: true,
      syncProgress: [
        { sourceId: 'hub', displayName: 'Hub', outcome: 'pending' },
      ],
    });
    await user.tab();
    const wrapper = screen.getByRole('button', {
      name: 'Sync Now',
    });
    expect(wrapper).toHaveFocus();
    expect(wrapper).toHaveAttribute('aria-disabled', 'true');
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Source is unavailable');
    expect(tooltip).not.toHaveTextContent('Hub');
    await user.keyboard('{Enter} ');
    expect(sync).not.toHaveBeenCalled();
  });

  it('adds no keyboard target around an enabled sync action', async () => {
    const user = userEvent.setup();
    mount();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Sync Now' })).toHaveFocus();
    expect(
      screen.queryByRole('button', { name: 'Synchronization unavailable' }),
    ).not.toBeInTheDocument();
  });

  it('does not invent a sync action when no handler is supplied', () => {
    mount({ onSyncClick: undefined });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
