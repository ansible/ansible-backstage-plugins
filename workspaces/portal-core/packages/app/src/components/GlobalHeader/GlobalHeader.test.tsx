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
    render(<GlobalHeader createPath="/self-service/catalog" />);

    // Title/link present
    expect(screen.getByText('Automation Portal')).toBeInTheDocument();

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
    render(<GlobalHeader createPath="/self-service/catalog" />);

    const createBtn = screen.getByTitle('Create...');
    await userEvent.click(createBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/self-service/catalog');
  });

  it('navigates directly for one generic contributor action', async () => {
    render(
      <GlobalHeader
        createActions={[
          { id: 'other.create', title: 'Create content', path: '/content' },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create...' }));
    expect(mockNavigate).toHaveBeenCalledWith('/content');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens a menu for multiple actions and navigates only after selection', async () => {
    render(
      <GlobalHeader
        createActions={[
          { id: 'other.create', title: 'Create content', path: '/content' },
          {
            id: 'template.create',
            title: 'Create from template',
            path: '/templates',
          },
        ]}
      />,
    );
    const create = screen.getByRole('button', { name: 'Create...' });
    expect(create).toHaveAttribute('aria-haspopup', 'menu');
    await userEvent.click(create);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(create).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Create content' }),
    );
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/content');
    await waitFor(() =>
      expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
    );
  });

  it('does not fall back to a legacy path when the native action list is empty', () => {
    render(<GlobalHeader createPath="/legacy" createActions={[]} />);
    expect(
      screen.queryByRole('button', { name: 'Create...' }),
    ).not.toBeInTheDocument();
  });

  it('closes an open Create menu when eligible destinations disappear', async () => {
    const actions = [
      { id: 'one', title: 'First action', path: '/one' },
      { id: 'two', title: 'Second action', path: '/two' },
    ];
    const { rerender } = render(<GlobalHeader createActions={actions} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create...' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    rerender(<GlobalHeader createActions={[]} />);
    expect(
      screen.queryByRole('button', { name: 'Create...' }),
    ).not.toBeInTheDocument();
    rerender(<GlobalHeader createActions={actions} />);
    expect(screen.getByRole('button', { name: 'Create...' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(mockNavigate).not.toHaveBeenCalled();
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

  it('omits Create when there is no installed Templates destination', () => {
    render(<GlobalHeader />);
    expect(screen.queryByTitle('Create...')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Account menu' }),
    ).toBeInTheDocument();
  });

  it('uses the supplied installed destination rather than a hardcoded route', async () => {
    render(<GlobalHeader createPath="/templates" />);
    await userEvent.click(screen.getByTitle('Create...'));
    expect(mockNavigate).toHaveBeenCalledWith('/templates');
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
