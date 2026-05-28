import { waitFor } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import {
  identityApiRef,
  configApiRef,
  discoveryApiRef,
} from '@backstage/core-plugin-api';
import { AAPLogoutHandler } from './AAPLogoutHandler';

describe('AAPLogoutHandler', () => {
  const originalSignOut = jest.fn().mockResolvedValue(undefined);

  const mockIdentityApi = {
    signOut: originalSignOut,
    getBackstageIdentity: jest.fn(),
    getCredentials: jest.fn(),
    getProfileInfo: jest.fn(),
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

  const mockDiscoveryApi = {
    getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/auth'),
  };

  const mockFetch = jest.fn().mockResolvedValue({ ok: true });

  const renderComponent = () => {
    return renderInTestApp(
      <TestApiProvider
        apis={[
          [identityApiRef, mockIdentityApi],
          [configApiRef, mockConfigApi],
          [discoveryApiRef, mockDiscoveryApi],
        ]}
      >
        <AAPLogoutHandler />
      </TestApiProvider>,
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIdentityApi.signOut = originalSignOut;
    delete (window as any).location;
    (window as any).location = { href: '', origin: 'http://localhost:3000' };
    global.fetch = mockFetch;
  });

  afterEach(() => {
    delete (global as any).fetch;
  });

  it('should render nothing', async () => {
    const { container } = await renderComponent();
    expect(container.innerHTML).toBe('');
  });

  it('should patch identityApi.signOut on mount', async () => {
    await renderComponent();
    expect(mockIdentityApi.signOut).not.toBe(originalSignOut);
  });

  it('should call auth backend logout then redirect when signOut is called', async () => {
    await renderComponent();

    await mockIdentityApi.signOut();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:7007/api/auth/rhaap/logout',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        }),
      );
      expect(originalSignOut).toHaveBeenCalledTimes(1);
      expect(window.location.href).toBe(
        'https://aap.example.com/api/gateway/v1/logout/',
      );
    });
  });

  it('should call auth backend before original signOut', async () => {
    const callOrder: string[] = [];
    mockFetch.mockImplementation(async () => {
      callOrder.push('auth-backend');
      return { ok: true };
    });
    originalSignOut.mockImplementation(async () => {
      callOrder.push('identity');
    });

    await renderComponent();
    await mockIdentityApi.signOut();

    await waitFor(() => {
      expect(callOrder[0]).toBe('auth-backend');
    });
  });

  it('should still sign out and redirect if auth backend logout fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await renderComponent();
    await mockIdentityApi.signOut();

    await waitFor(() => {
      expect(originalSignOut).toHaveBeenCalled();
      expect(window.location.href).toBe(
        'https://aap.example.com/api/gateway/v1/logout/',
      );
    });
  });

  it('should strip trailing slash from AAP base URL', async () => {
    mockConfigApi.getOptionalString.mockReturnValue(
      'https://aap.example.com/',
    );

    await renderComponent();
    await mockIdentityApi.signOut();

    await waitFor(() => {
      expect(window.location.href).toBe(
        'https://aap.example.com/api/gateway/v1/logout/',
      );
    });
  });

  it('should fall back to standard signOut when AAP is not configured', async () => {
    mockConfigApi.getOptionalString.mockReturnValue(undefined);

    await renderComponent();
    await mockIdentityApi.signOut();

    await waitFor(() => {
      expect(mockFetch).not.toHaveBeenCalled();
      expect(originalSignOut).toHaveBeenCalled();
    });
    expect(window.location.href).toBe('');
  });

  it('should read baseUrl from ansible.rhaap.baseUrl config key', async () => {
    await renderComponent();
    await mockIdentityApi.signOut();

    await waitFor(() => {
      expect(mockConfigApi.getOptionalString).toHaveBeenCalledWith(
        'ansible.rhaap.baseUrl',
      );
    });
  });

  it('should restore original signOut on unmount', async () => {
    const { unmount } = await renderComponent();
    expect(mockIdentityApi.signOut).not.toBe(originalSignOut);

    unmount();

    await mockIdentityApi.signOut();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(window.location.href).not.toContain('/api/gateway/v1/logout/');
  });
});
