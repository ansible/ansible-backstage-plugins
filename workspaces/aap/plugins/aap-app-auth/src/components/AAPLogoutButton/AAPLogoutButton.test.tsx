import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import {
  identityApiRef,
  configApiRef,
  errorApiRef,
} from '@backstage/core-plugin-api';
import { rhAapAuthApiRef } from '../../api';
import { AAPLogoutButton } from './AAPLogoutButton';

describe('AAPLogoutButton', () => {
  const mockIdentityApi = {
    signOut: jest.fn().mockResolvedValue(undefined),
    getBackstageIdentity: jest.fn(),
    getCredentials: jest.fn(),
    getProfileInfo: jest.fn(),
  };

  const mockErrorApi = {
    post: jest.fn(),
    error$: jest.fn(),
  };

  const mockConfigApi = {
    getOptionalString: jest.fn(),
    has: jest.fn(),
    keys: jest.fn(),
    get: jest.fn(),
    getBoolean: jest.fn(),
    getConfig: jest.fn(),
    getConfigArray: jest.fn(),
    getNumber: jest.fn(),
    getOptional: jest.fn(),
    getOptionalBoolean: jest.fn(),
    getOptionalConfig: jest.fn(),
    getOptionalConfigArray: jest.fn(),
    getOptionalNumber: jest.fn(),
    getOptionalStringArray: jest.fn(),
    getString: jest.fn(),
    getStringArray: jest.fn(),
  };

  const mockRhAapAuthApi = {
    signOut: jest.fn().mockResolvedValue(undefined),
    signIn: jest.fn(),
    getAccessToken: jest.fn(),
    getBackstageIdentity: jest.fn(),
    getCredentials: jest.fn(),
    getProfileInfo: jest.fn(),
    getIdToken: jest.fn(),
    sessionState$: jest.fn(),
  };

  const renderComponent = () => {
    return renderInTestApp(
      <TestApiProvider
        apis={[
          [identityApiRef, mockIdentityApi],
          [configApiRef, mockConfigApi],
          [errorApiRef, mockErrorApi],
          [rhAapAuthApiRef, mockRhAapAuthApi],
        ]}
      >
        <AAPLogoutButton />
      </TestApiProvider>,
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfigApi.getOptionalString.mockImplementation(
      (key: string) =>
        ({
          'auth.environment': 'development',
          'auth.providers.rhaap.development.host': 'https://aap.example.com',
          'auth.providers.rhaap.development.clientId': 'portal',
          'app.baseUrl': 'http://localhost:3000/',
        })[key],
    );
    delete (window as any).location;
    (window as any).location = { href: '', origin: 'http://localhost:3000' };
  });

  it('should render sign out menu item', async () => {
    await renderComponent();
    expect(screen.getByText('Sign out')).toBeInTheDocument();
  });

  it('should revoke AAP token and sign out on click', async () => {
    await renderComponent();

    await userEvent.click(screen.getByText('Sign out'));

    await waitFor(() => {
      expect(mockRhAapAuthApi.signOut).toHaveBeenCalled();
      expect(mockIdentityApi.signOut).toHaveBeenCalled();
    });
  });

  it('should still sign out from identity provider if AAP signOut fails', async () => {
    mockRhAapAuthApi.signOut.mockRejectedValueOnce(new Error('Not logged in'));

    await renderComponent();

    await userEvent.click(screen.getByText('Sign out'));

    await waitFor(() => {
      expect(mockRhAapAuthApi.signOut).toHaveBeenCalled();
      expect(mockIdentityApi.signOut).toHaveBeenCalled();
    });
  });

  it('should post error if identity signOut fails', async () => {
    const signOutError = new Error('Sign out failed');
    mockIdentityApi.signOut.mockRejectedValueOnce(signOutError);

    await renderComponent();

    await userEvent.click(screen.getByText('Sign out'));

    await waitFor(() => {
      expect(mockErrorApi.post).toHaveBeenCalledWith(signOutError);
    });
  });

  it('should redirect to AAP logout endpoint to end browser session', async () => {
    await renderComponent();

    await userEvent.click(screen.getByText('Sign out'));

    await waitFor(() => {
      expect(window.location.href).toBe(
        'https://aap.example.com/o/logout/?client_id=portal&post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A3000%2F',
      );
    });
  });

  it('should skip AAP redirect when baseUrl is not configured', async () => {
    mockConfigApi.getOptionalString.mockReturnValue(undefined);

    await renderComponent();

    await userEvent.click(screen.getByText('Sign out'));

    await waitFor(() => {
      expect(mockIdentityApi.signOut).toHaveBeenCalled();
    });
    expect(window.location.href).toBe('');
  });

  it('waits for the identity redirect before choosing the AAP logout destination', async () => {
    let completeIdentitySignOut!: () => void;
    mockIdentityApi.signOut.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          completeIdentitySignOut = () => {
            window.location.href = '/';
            resolve();
          };
        }),
    );
    await renderComponent();
    await userEvent.click(screen.getByText('Sign out'));
    await waitFor(() => expect(mockIdentityApi.signOut).toHaveBeenCalled());
    expect(window.location.href).toBe('');

    completeIdentitySignOut();

    await waitFor(() => {
      expect(window.location.href).toBe(
        'https://aap.example.com/o/logout/?client_id=portal&post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A3000%2F',
      );
    });
  });
});
