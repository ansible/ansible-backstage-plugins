import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import {
  identityApiRef,
  configApiRef,
  errorApiRef,
} from '@backstage/core-plugin-api';
import { rhAapAuthApiRef } from '../../apis';
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
    getOptionalString: jest.fn().mockReturnValue('https://aap.example.com'),
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
    delete (window as any).location;
    (window as any).location = { href: '', origin: 'http://localhost:3000' };
  });

  it('should render sign out menu item', async () => {
    await renderComponent();
    expect(screen.getByText('Sign out')).toBeInTheDocument();
  });

  it('should render a divider before the sign out item', async () => {
    await renderComponent();
    expect(document.querySelector('hr')).toBeInTheDocument();
  });

  it('should render a logout icon', async () => {
    await renderComponent();
    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('should revoke AAP token first, then sign out of identity', async () => {
    const callOrder: string[] = [];
    mockRhAapAuthApi.signOut.mockImplementation(async () => {
      callOrder.push('rhaap');
    });
    mockIdentityApi.signOut.mockImplementation(async () => {
      callOrder.push('identity');
    });

    await renderComponent();
    await userEvent.click(screen.getByText('Sign out'));

    await waitFor(() => {
      expect(callOrder).toEqual(['rhaap', 'identity']);
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

  it('should redirect to AAP gateway logout endpoint', async () => {
    await renderComponent();
    await userEvent.click(screen.getByText('Sign out'));

    await waitFor(() => {
      expect(window.location.href).toBe(
        'https://aap.example.com/api/gateway/v1/logout/',
      );
    });
  });

  it('should strip trailing slash from AAP base URL before building logout URL', async () => {
    mockConfigApi.getOptionalString.mockReturnValueOnce(
      'https://aap.example.com/',
    );

    await renderComponent();
    await userEvent.click(screen.getByText('Sign out'));

    await waitFor(() => {
      expect(window.location.href).toBe(
        'https://aap.example.com/api/gateway/v1/logout/',
      );
    });
  });

  it('should skip AAP redirect when baseUrl is not configured', async () => {
    mockConfigApi.getOptionalString.mockReturnValueOnce(undefined);

    await renderComponent();
    await userEvent.click(screen.getByText('Sign out'));

    await waitFor(() => {
      expect(mockIdentityApi.signOut).toHaveBeenCalled();
    });
    expect(window.location.href).toBe('');
  });

  it('should read baseUrl from ansible.rhaap.baseUrl config key', async () => {
    await renderComponent();
    await userEvent.click(screen.getByText('Sign out'));

    await waitFor(() => {
      expect(mockConfigApi.getOptionalString).toHaveBeenCalledWith(
        'ansible.rhaap.baseUrl',
      );
    });
  });

  it('should complete full logout flow: revoke token, sign out, redirect', async () => {
    await renderComponent();
    await userEvent.click(screen.getByText('Sign out'));

    await waitFor(() => {
      expect(mockRhAapAuthApi.signOut).toHaveBeenCalledTimes(1);
      expect(mockIdentityApi.signOut).toHaveBeenCalledTimes(1);
      expect(window.location.href).toBe(
        'https://aap.example.com/api/gateway/v1/logout/',
      );
    });
  });
});
