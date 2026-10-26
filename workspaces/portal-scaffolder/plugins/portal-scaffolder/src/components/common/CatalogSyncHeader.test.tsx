import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { useIsSuperuser } from '@ansible/portal-plugin-sdk';
import { CatalogSyncHeader } from './CatalogSyncHeader';
import type { CatalogSyncHeaderProps } from './CatalogSyncHeader';

jest.mock('@ansible/portal-plugin-sdk', () => ({
  ...jest.requireActual('@ansible/portal-plugin-sdk'),
  useIsSuperuser: jest.fn(),
}));

describe('CatalogSyncHeader', () => {
  const onSyncClick = jest.fn();
  const mount = (props: Partial<CatalogSyncHeaderProps> = {}) =>
    render(
      <CatalogSyncHeader
        title="Collections"
        tooltip="Browse content"
        description="Available collections"
        onSyncClick={onSyncClick}
        {...props}
      />,
    );
  const hoverSync = () => {
    const button = screen.getByRole('button', { name: 'Sync Now' });
    fireEvent.mouseOver(button.parentElement!);
    return button;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useIsSuperuser).mockReturnValue({
      isSuperuser: true,
      loading: false,
      error: null,
    });
  });

  it('renders the page content and invokes sync only on click', () => {
    mount({
      actions: <button>Publish</button>,
      descriptionExtra: <a href="/guide">Read the guide</a>,
    });
    expect(screen.getByRole('heading', { name: 'Collections' })).toBeVisible();
    expect(screen.getByText('Available collections')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Read the guide' }),
    ).toHaveAttribute('href', '/guide');
    expect(onSyncClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sync Now' }));
    expect(onSyncClick).toHaveBeenCalledTimes(1);
  });

  it('hides synchronization from a user without permission', () => {
    jest
      .mocked(useIsSuperuser)
      .mockReturnValue({ isSuperuser: false, loading: false, error: null });
    mount({ actions: <button>Publish</button> });
    expect(
      screen.queryByRole('button', { name: 'Sync Now' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeVisible();
  });

  it('does not offer synchronization when permission lookup fails', () => {
    jest.mocked(useIsSuperuser).mockReturnValue({
      isSuperuser: false,
      loading: false,
      error: new Error('Permission lookup failed'),
    });
    mount();
    expect(
      screen.queryByRole('button', { name: 'Sync Now' }),
    ).not.toBeInTheDocument();
  });

  it('disables synchronization while checking permissions', async () => {
    jest
      .mocked(useIsSuperuser)
      .mockReturnValue({ isSuperuser: false, loading: true, error: null });
    mount();
    expect(hoverSync()).toBeDisabled();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Checking permissions...',
    );
  });

  it('explains why synchronization is disabled and prevents a request', async () => {
    mount({ syncDisabled: true, syncDisabledReason: 'Source is unavailable' });
    const button = hoverSync();
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onSyncClick).not.toHaveBeenCalled();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Source is unavailable',
    );
  });

  it('can disable synchronization without an explanatory tooltip', () => {
    mount({ syncDisabled: true });
    expect(screen.getByRole('button', { name: 'Sync Now' })).toBeDisabled();
  });

  it('shows only sources with a recorded last sync while idle', async () => {
    mount({
      lastSyncTimes: [
        { label: 'Hub', time: new Date().toISOString() },
        { label: 'Never synced', time: null },
      ],
    });
    hoverSync();
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Last synced');
    expect(tooltip).toHaveTextContent('Hub');
    expect(tooltip).not.toHaveTextContent('Never synced');
  });

  it('shows in-flight progress instead of a previous successful sync', async () => {
    mount({
      syncInProgress: true,
      syncProgress: [
        { sourceId: 'hub', displayName: 'Hub', outcome: 'pending' },
      ],
      lastSyncTimes: [
        { label: 'Previous source', time: new Date().toISOString() },
      ],
    });
    hoverSync();
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Syncing');
    expect(tooltip).toHaveTextContent('In progress');
    expect(tooltip).not.toHaveTextContent('Previous source');
  });

  it('keeps failed progress visible when the sync is no longer running', async () => {
    mount({
      syncProgress: [
        { sourceId: 'hub', displayName: 'Hub', outcome: 'failure' },
      ],
    });
    hoverSync();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Last sync completed with errors',
    );
  });

  it('replaces successful progress with the last-sync summary', async () => {
    mount({
      syncProgress: [
        { sourceId: 'hub', displayName: 'Hub', outcome: 'success' },
      ],
      lastSyncTimes: [{ label: 'Hub', time: new Date().toISOString() }],
    });
    hoverSync();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Last synced');
  });
});
