import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { identityApiRef, errorApiRef } from '@backstage/core-plugin-api';
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
});
