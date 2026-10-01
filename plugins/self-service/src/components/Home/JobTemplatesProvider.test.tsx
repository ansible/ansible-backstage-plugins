import { render, screen, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { identityApiRef } from '@backstage/core-plugin-api';
import { ansibleApiRef } from '../../apis';
import {
  AapSessionExpiredError,
  resetAapSessionLogoutStateForTests,
} from '../../utils/aapSessionExpired';
import { JobTemplatesProvider, useJobTemplates } from './JobTemplatesProvider';

const mockAnsibleApi = {
  getUserJobTemplates: jest.fn(),
};

const mockIdentityApi = {
  signOut: jest.fn().mockResolvedValue(undefined),
  getBackstageIdentity: jest.fn(),
  getCredentials: jest.fn(),
  getProfileInfo: jest.fn(),
};

function Probe() {
  const { jobTemplates, loadState } = useJobTemplates();
  return (
    <div>
      <span data-testid="load-state">{loadState}</span>
      <span data-testid="template-count">{jobTemplates.length}</span>
    </div>
  );
}

function renderProvider(children: React.ReactNode = <Probe />) {
  return render(
    <TestApiProvider
      apis={[
        [ansibleApiRef, mockAnsibleApi],
        [identityApiRef, mockIdentityApi],
      ]}
    >
      <JobTemplatesProvider>{children}</JobTemplatesProvider>
    </TestApiProvider>,
  );
}

describe('JobTemplatesProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAapSessionLogoutStateForTests();
    mockAnsibleApi.getUserJobTemplates.mockResolvedValue({
      items: [{ id: 1, name: 'Demo' }],
    });
  });

  it('keeps loaded job templates when the consumer remounts', async () => {
    const { rerender } = renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('load-state')).toHaveTextContent('ready');
      expect(screen.getByTestId('template-count')).toHaveTextContent('1');
    });

    expect(mockAnsibleApi.getUserJobTemplates).toHaveBeenCalledTimes(1);

    rerender(
      <TestApiProvider
        apis={[
          [ansibleApiRef, mockAnsibleApi],
          [identityApiRef, mockIdentityApi],
        ]}
      >
        <JobTemplatesProvider>
          <div />
        </JobTemplatesProvider>
      </TestApiProvider>,
    );

    rerender(
      <TestApiProvider
        apis={[
          [ansibleApiRef, mockAnsibleApi],
          [identityApiRef, mockIdentityApi],
        ]}
      >
        <JobTemplatesProvider>
          <Probe />
        </JobTemplatesProvider>
      </TestApiProvider>,
    );

    expect(screen.getByTestId('load-state')).toHaveTextContent('ready');
    expect(screen.getByTestId('template-count')).toHaveTextContent('1');
    expect(mockAnsibleApi.getUserJobTemplates).toHaveBeenCalledTimes(1);
  });

  it('keeps ready state during background refresh', async () => {
    mockAnsibleApi.getUserJobTemplates
      .mockResolvedValueOnce({ items: [{ id: 1, name: 'Demo' }] })
      .mockResolvedValueOnce({
        items: [
          { id: 1, name: 'Demo' },
          { id: 2, name: 'New' },
        ],
      });

    const refreshRef: {
      current?: ReturnType<typeof useJobTemplates>['refreshJobTemplates'];
    } = { current: undefined };

    function RefreshCapture() {
      refreshRef.current = useJobTemplates().refreshJobTemplates;
      return <Probe />;
    }

    renderProvider(<RefreshCapture />);

    await waitFor(() => {
      expect(screen.getByTestId('load-state')).toHaveTextContent('ready');
    });

    await refreshRef.current?.({ background: true });

    await waitFor(() => {
      expect(screen.getByTestId('template-count')).toHaveTextContent('2');
    });
    expect(screen.getByTestId('load-state')).toHaveTextContent('ready');
    expect(mockAnsibleApi.getUserJobTemplates).toHaveBeenCalledTimes(2);
  });

  it('sets error state when the initial fetch fails', async () => {
    mockAnsibleApi.getUserJobTemplates.mockRejectedValue(
      new Error('Controller unavailable'),
    );

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('load-state')).toHaveTextContent('error');
    });
    expect(mockIdentityApi.signOut).not.toHaveBeenCalled();
  });

  it('stringifies non-error rejections during the initial fetch', async () => {
    mockAnsibleApi.getUserJobTemplates.mockRejectedValue('plain failure');

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('load-state')).toHaveTextContent('error');
    });
  });

  it('keeps ready state but records an error during background refresh', async () => {
    mockAnsibleApi.getUserJobTemplates
      .mockResolvedValueOnce({ items: [{ id: 1, name: 'Demo' }] })
      .mockRejectedValueOnce(new Error('background refresh failed'));

    const refreshRef: {
      current?: ReturnType<typeof useJobTemplates>['refreshJobTemplates'];
    } = { current: undefined };

    function RefreshCapture() {
      const { refreshJobTemplates, errorMessage } = useJobTemplates();
      refreshRef.current = refreshJobTemplates;
      return (
        <div>
          <Probe />
          <span data-testid="error-message">{errorMessage ?? ''}</span>
        </div>
      );
    }

    renderProvider(<RefreshCapture />);

    await waitFor(() => {
      expect(screen.getByTestId('load-state')).toHaveTextContent('ready');
    });

    await refreshRef.current?.({ background: true });

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toHaveTextContent(
        'background refresh failed',
      );
    });
    expect(screen.getByTestId('load-state')).toHaveTextContent('ready');
  });

  it('signs out of the portal when AAP session is expired', async () => {
    mockAnsibleApi.getUserJobTemplates.mockRejectedValue(
      new AapSessionExpiredError(),
    );

    renderProvider();

    await waitFor(() => {
      expect(mockIdentityApi.signOut).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId('load-state')).toHaveTextContent('loading');
  });
});
