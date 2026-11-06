import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApiProvider } from '@backstage/test-utils';
import { usePermission } from '@backstage/plugin-permission-react';
import { useNotifications } from '@ansible/portal-plugin-sdk';
import { automationContentSyncPermission } from '@ansible/automation-content-common/permissions';
import { automationContentApiRef } from '../../api';
import { RegistrySyncButton } from './RegistrySyncButton';

jest.mock('@backstage/plugin-permission-react', () => ({
  ...jest.requireActual('@backstage/plugin-permission-react'),
  usePermission: jest.fn(),
}));

jest.mock('@ansible/portal-plugin-sdk', () => ({
  useNotifications: jest.fn(),
}));

const mockUsePermission = jest.mocked(usePermission);
const syncAll = jest.fn();
const showNotification = jest.fn();
const onStatus = jest.fn();
const onSynced = jest.fn();

function renderButton() {
  return render(
    <TestApiProvider apis={[[automationContentApiRef, { syncAll }]]}>
      <RegistrySyncButton onStatus={onStatus} onSynced={onSynced} />
    </TestApiProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUsePermission.mockReturnValue({ allowed: true, loading: false });
  (useNotifications as jest.Mock).mockReturnValue({ showNotification });
  syncAll.mockResolvedValue({
    registries: [{ registry: 'primary', ok: true, discovered: 3 }],
  });
});

it('hides sync and makes no API call when permission is denied', () => {
  mockUsePermission.mockReturnValue({ allowed: false, loading: false });
  renderButton();
  expect(screen.queryByRole('button', { name: 'Sync' })).toBeNull();
  expect(mockUsePermission).toHaveBeenCalledWith({
    permission: automationContentSyncPermission,
  });
  expect(syncAll).not.toHaveBeenCalled();
});

it('keeps sync hidden while permission is loading', () => {
  mockUsePermission.mockReturnValue({ allowed: false, loading: true });
  renderButton();
  expect(screen.queryByRole('button', { name: 'Sync' })).toBeNull();
  expect(syncAll).not.toHaveBeenCalled();
});

it('syncs all registries and reports progress and per-registry results', async () => {
  renderButton();
  await userEvent.click(screen.getByRole('button', { name: 'Sync' }));
  await waitFor(() => expect(onSynced).toHaveBeenCalledTimes(1));
  expect(syncAll).toHaveBeenCalledTimes(1);
  expect(onStatus).toHaveBeenCalledWith('Syncing configured registries');
  expect(onStatus).toHaveBeenLastCalledWith('Sync completed');
  expect(showNotification).toHaveBeenCalledWith({
    title: 'primary: sync complete',
    description: '3 artifacts discovered',
    severity: 'success',
  });
});

it('reports registry failures and refreshes the inventory', async () => {
  const sensitiveError = 'https://user:secret-sync-marker@registry.internal';
  syncAll.mockResolvedValue({
    registries: [{ registry: 'primary', ok: false, error: sensitiveError }],
  });
  renderButton();
  await userEvent.click(screen.getByRole('button', { name: 'Sync' }));
  await waitFor(() => expect(onSynced).toHaveBeenCalled());
  expect(onStatus).toHaveBeenLastCalledWith(
    'Sync completed with registry failures',
  );
  expect(showNotification).toHaveBeenCalledWith({
    title: 'primary: sync failed',
    description: 'Registry reconciliation failed.',
    severity: 'error',
  });
  expect(
    showNotification.mock.calls
      .flat()
      .map(value => String(value.description))
      .join(' '),
  ).not.toContain(sensitiveError);
  expect(document.body.textContent).not.toContain(sensitiveError);
});

it('notifies on service errors without refreshing', async () => {
  syncAll.mockRejectedValue(new Error('Unavailable'));
  renderButton();
  await userEvent.click(screen.getByRole('button', { name: 'Sync' }));
  await waitFor(() =>
    expect(onStatus).toHaveBeenLastCalledWith(
      'Sync failed. Retry when the content service is available.',
    ),
  );
  expect(showNotification).toHaveBeenCalledWith({
    title: 'Content sync failed',
    description: 'The content service could not complete the sync.',
    severity: 'error',
  });
  expect(onSynced).not.toHaveBeenCalled();
});
