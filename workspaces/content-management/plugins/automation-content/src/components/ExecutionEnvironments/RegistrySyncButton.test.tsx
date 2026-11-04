import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApiProvider } from '@backstage/test-utils';
import { useIsSuperuser, useNotifications } from '@ansible/portal-plugin-sdk';
import { automationContentApiRef } from '../../api';
import { RegistrySyncButton } from './RegistrySyncButton';

jest.mock('@ansible/portal-plugin-sdk', () => ({
  useIsSuperuser: jest.fn(),
  useNotifications: jest.fn(),
}));

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
  (useIsSuperuser as jest.Mock).mockReturnValue({ isSuperuser: true });
  (useNotifications as jest.Mock).mockReturnValue({ showNotification });
  syncAll.mockResolvedValue({
    registries: [{ registry: 'primary', ok: true, discovered: 3 }],
  });
});

it('hides sync from non-superusers', () => {
  (useIsSuperuser as jest.Mock).mockReturnValue({ isSuperuser: false });
  renderButton();
  expect(screen.queryByRole('button', { name: 'Sync' })).toBeNull();
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
