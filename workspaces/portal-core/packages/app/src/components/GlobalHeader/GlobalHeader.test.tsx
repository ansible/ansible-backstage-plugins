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
  performAapLogout: jest.fn(async ({ auth, identity }) => {
    await auth.signOut();
    await identity.signOut();
  }),
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
    expect(screen.getByText('Logout')).toBeInTheDocument();

    // Click Logout and ensure signOut called
    await userEvent.click(screen.getByText('Logout'));

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
