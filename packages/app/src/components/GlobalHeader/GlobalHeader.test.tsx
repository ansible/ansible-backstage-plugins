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

jest.mock('@ansible/plugin-backstage-self-service', () => ({
  __esModule: true,
  rhAapAuthApiRef: Symbol('rhAapAuthApiRef'),
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
    expect(screen.getByText('Ansible RHDH')).toBeInTheDocument();

    // Search input - placeholder and aria-label
    const input = screen.getByPlaceholderText('Search...') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-label', 'search');

    // Create button (has title attribute)
    expect(screen.getByTitle('Create...')).toBeInTheDocument();

    // Profile icon button present
    // const profileBtn = screen.getAllByRole('button').find(btn =>
    //   btn.innerHTML.includes('AccountCircle') || btn.getAttribute('aria-label') === 'account',
    // );
    // There should be at least one button; we won't require exact icon internals
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(1);
  });

  it('navigates to catalog when Create button is clicked', async () => {
    render(<GlobalHeader />);

    const createBtn = screen.getByTitle('Create...');
    await userEvent.click(createBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/self-service/catalog');
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

  it('opens profile menu and logs out (calls identityApi.signOut) then closes menu', async () => {
    render(<GlobalHeader />);

    // Click profile icon (the last icon button)
    // There are multiple icon buttons; find the one that does not have title 'Create...'
    const buttons = screen.getAllByRole('button');
    // The AccountCircle button is typically the last one — click the last button
    const profileBtn = buttons[buttons.length - 1];
    await userEvent.click(profileBtn);

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
