import { useState } from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { TestApiProvider, renderInTestApp } from '@backstage/test-utils';
import { errorApiRef } from '@backstage/core-plugin-api';
import { ProfileMenuItems } from './ProfileMenuItems';

const post = jest.fn();
const wrap = (element: JSX.Element) =>
  renderInTestApp(
    <TestApiProvider apis={[[errorApiRef, { post }]]}>
      {element}
    </TestApiProvider>,
  );
beforeEach(() => jest.clearAllMocks());

it('renders no rows for an empty contribution set', async () => {
  await wrap(<ProfileMenuItems items={[]} />);
  expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
});

it('supports a UI action that opens a dialog and closes the parent menu', async () => {
  const close = jest.fn();
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <ProfileMenuItems
          onClose={close}
          items={[
            {
              id: 'preferences',
              title: 'Preferences',
              type: 'action',
              activate: async () => {
                setOpen(true);
              },
            },
          ]}
        />
        {open && (
          <div role="dialog" aria-label="Preferences">
            Your preferences
          </div>
        )}
      </>
    );
  }
  await wrap(<Harness />);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Preferences' }));
  expect(
    await screen.findByRole('dialog', { name: 'Preferences' }),
  ).toBeInTheDocument();
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
});

it('prevents duplicate submissions while pending and allows retry after a failure', async () => {
  let reject!: (error: Error) => void;
  const activate = jest.fn(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail;
      }),
  );
  await wrap(
    <ProfileMenuItems
      items={[{ id: 'a', title: 'Open', type: 'action', activate }]}
    />,
  );
  const row = screen.getByRole('menuitem', { name: 'Open' });
  fireEvent.click(row);
  fireEvent.click(row);
  expect(activate).toHaveBeenCalledTimes(1);
  expect(row).toHaveAttribute('aria-busy', 'true');
  await act(async () => {
    reject(new Error('private failure details'));
  });
  expect(post).toHaveBeenCalledWith(
    expect.objectContaining({
      message: 'Unable to complete profile action: Open',
    }),
  );
  fireEvent.click(row);
  expect(activate).toHaveBeenCalledTimes(2);
});

it('navigates to the resolved route and closes the menu', async () => {
  const close = jest.fn();
  await wrap(
    <ProfileMenuItems
      onClose={close}
      items={[
        {
          id: 'nav',
          title: 'Preferences',
          type: 'navigation',
          path: '/preferences',
        },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole('menuitem', { name: 'Preferences' }));
  expect(close).toHaveBeenCalledTimes(1);
});
