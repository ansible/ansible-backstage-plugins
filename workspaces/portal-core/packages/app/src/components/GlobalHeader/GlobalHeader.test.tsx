import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- Mocks ---
// mock navigate function to assert navigation calls
const mockNavigate = jest.fn();

// simple Link mock that renders an <a> for the 'to' prop
const MockLink = ({ to, children, className }: any) => (
  // eslint-disable-next-line jsx-a11y/anchor-has-content
  <a href={to} className={className}>
    {children}
  </a>
);

jest.mock('react-router-dom', () => ({
  __esModule: true,
  Link: (props: any) => <MockLink {...props} />,
  useNavigate: () => mockNavigate,
}));

// mock identity API and useApi
const mockSignOut = jest.fn().mockResolvedValue(undefined);

const mockErrorPost = jest.fn();

jest.mock('@ansible/aap-app-auth', () => ({
  __esModule: true,
  rhAapAuthApiRef: Symbol('rhAapAuthApiRef'),
  performAapLogout: jest.requireActual(
    '../../../../../../aap/plugins/aap-app-auth/src/logout',
  ).performAapLogout,
}));

jest.mock('@backstage/core-plugin-api', () => ({
  __esModule: true,
  identityApiRef: Symbol('identityApiRef'),
  configApiRef: Symbol('configApiRef'),
  errorApiRef: Symbol('errorApiRef'),
  useApi: () => ({
    signOut: mockSignOut,
    post: mockErrorPost,
    getOptionalString: jest.fn().mockReturnValue(undefined),
  }),
}));

import { GlobalHeader } from './GlobalHeader';

describe('GlobalHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders contributed profile rows alongside the fallback logout action', async () => {
    const activate = jest.fn().mockResolvedValue(undefined);
    render(
      <GlobalHeader
        profileItems={[
          {
            id: 'preferences',
            title: 'Open preferences',
            type: 'action',
            activate,
          },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(
      screen.getByRole('menuitem', { name: 'Sign out' }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Open preferences' }),
    );
    await waitFor(() => expect(activate).toHaveBeenCalledTimes(1));
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'keeps logout usable when its contribution is missing (other rows: %s)',
    async hasOtherRows => {
      render(
        <GlobalHeader
          profileItems={
            hasOtherRows
              ? [
                  {
                    id: 'app-profile-menu-item:preferences/open',
                    title: 'Preferences',
                    type: 'navigation',
                    path: '/preferences',
                  },
                ]
              : []
          }
        />,
      );
      await userEvent.click(
        screen.getByRole('button', { name: 'Account menu' }),
      );
      await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
      await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(screen.getByText('Settings')).not.toBeVisible(),
      );
    },
  );

  it('replaces the fallback with the resolved AAP contribution without duplicating logout', async () => {
    const activate = jest.fn().mockResolvedValue(undefined);
    const { rerender } = render(<GlobalHeader profileItems={[]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.getAllByRole('menuitem', { name: 'Sign out' })).toHaveLength(
      1,
    );

    rerender(
      <GlobalHeader
        profileItems={[
          {
            id: 'app-profile-menu-item:app/aap-logout',
            title: 'Sign out',
            type: 'action',
            activate,
          },
        ]}
      />,
    );
    expect(screen.getAllByRole('menuitem', { name: 'Sign out' })).toHaveLength(
      1,
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(activate).toHaveBeenCalledTimes(1));
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('renders title, search input and action buttons', () => {
    render(<GlobalHeader />);

    // Title/link present
    expect(screen.getByText('Automation Portal')).toBeInTheDocument();

    // Search input - placeholder and aria-label
    const input = screen.getByPlaceholderText('Search...') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-label', 'search');

    expect(screen.queryByTitle('Create...')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account menu' })).toBeVisible();
  });

  it('submits search form and navigates to search results', async () => {
    render(<GlobalHeader />);

    const input = screen.getByPlaceholderText('Search...') as HTMLInputElement;

    await userEvent.type(input, 'hello world');

    // submit by submitting the form element (find nearest form)
    const form = input.closest('form')!;
    expect(form).toBeTruthy();

    // use fireEvent.submit to trigger the form submit handler
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/search?query=hello%20world');
    });
  });

  it('has no global Create button while keeping the account menu', () => {
    render(<GlobalHeader />);
    expect(screen.queryByTitle('Create...')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Account menu' }),
    ).toBeInTheDocument();
  });

  it('opens profile menu and logs out (calls identityApi.signOut) then closes menu', async () => {
    render(<GlobalHeader />);

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));

    // Menu should appear - look for Settings and Logout menu items
    expect(await screen.findByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Sign out')).toBeInTheDocument();

    // Click Logout and ensure signOut called
    await userEvent.click(screen.getByText('Sign out'));

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });

    // Instead of checking "not.toBeInTheDocument()", check visibility:
    await waitFor(() => {
      const settings = screen.queryByText('Settings');
      // if settings node exists but is hidden, this will pass
      expect(settings).not.toBeVisible();
    });
  });
});
