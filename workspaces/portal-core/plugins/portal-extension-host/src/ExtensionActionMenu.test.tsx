import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Entity } from '@backstage/catalog-model';
import { ExtensionActionMenu } from './ExtensionActionMenu';

jest.mock('@backstage/plugin-permission-react', () => ({
  usePermission: () => ({ allowed: true, loading: false }),
}));
jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApiHolder: () => ({ get: () => undefined }),
}));

it('keeps confirmation mounted after the parent closes its action menu', async () => {
  const execute = jest.fn().mockResolvedValue(undefined);
  function Host() {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    return (
      <>
        <button onClick={event => setAnchor(event.currentTarget)}>
          Actions
        </button>
        <ExtensionActionMenu
          anchorEl={anchor}
          onClose={() => setAnchor(null)}
          entity={{ kind: 'Component', metadata: { name: 'repo' } } as Entity}
          contributions={[
            {
              id: 'test.remove',
              label: 'Remove repository',
              onActivate: execute,
              confirmation: {
                title: 'Confirm removal',
                message: 'Remove registration?',
                confirmLabel: 'Remove',
              },
            },
          ]}
        />
      </>
    );
  }
  render(<Host />);
  fireEvent.click(screen.getByText('Actions'));
  fireEvent.click(screen.getByText('Remove repository'));
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(execute).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Remove'));
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
});
