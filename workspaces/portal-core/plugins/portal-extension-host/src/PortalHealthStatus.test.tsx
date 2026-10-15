import '@testing-library/jest-dom';
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { TestApiProvider } from '@backstage/test-utils';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import {
  PortalHealthStatus,
  usePortalHealthStatus,
} from './PortalHealthStatus';

describe('Portal health status', () => {
  const discovery = { getBaseUrl: jest.fn() };
  const fetchApi = { fetch: jest.fn() };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestApiProvider
      apis={[
        [discoveryApiRef, discovery],
        [fetchApiRef, fetchApi],
      ]}
    >
      {children}
    </TestApiProvider>
  );
  const response = (data: unknown) => ({ ok: true, json: async () => data });
  beforeEach(() => {
    jest.clearAllMocks();
    discovery.getBaseUrl.mockResolvedValue('/health');
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows loading, sorted plugin rows, and every state label', async () => {
    fetchApi.fetch.mockResolvedValue(
      response({
        z: { state: 'UNAVAILABLE', message: 'Offline' },
        a: { state: 'READY', message: 'Connected' },
        b: { state: 'DEGRADED', message: 'Partial' },
        c: { state: 'UNKNOWN', message: 'No data' },
        d: { state: 'FUTURE_STATE', message: 'New state' },
      }),
    );
    render(<PortalHealthStatus />, { wrapper });
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    const table = await screen.findByRole('table', {
      name: 'Portal plugin health status',
    });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(
      rows.map(row => within(row).getAllByRole('cell')[0].textContent),
    ).toEqual(['a', 'b', 'c', 'd', 'z']);
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Degraded')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getAllByText('Unknown')).toHaveLength(2);
    expect(fetchApi.fetch).toHaveBeenCalledWith('/health/status');
    expect(discovery.getBaseUrl).toHaveBeenCalledWith('portal-health');
  });

  it('shows an honest empty snapshot', async () => {
    fetchApi.fetch.mockResolvedValue(response({}));
    render(<PortalHealthStatus />, { wrapper });
    expect(
      await screen.findByText(
        'No portal plugins have reported health status yet.',
      ),
    ).toBeInTheDocument();
  });

  it.each(['http', 'network', 'unknown'] as const)(
    'reports a %s failure',
    async failure => {
      if (failure === 'http')
        fetchApi.fetch.mockResolvedValue({
          ok: false,
          status: 503,
          statusText: 'Unavailable',
        });
      else
        fetchApi.fetch.mockRejectedValue(
          failure === 'network' ? new Error('Connection lost') : 'unreachable',
        );
      render(<PortalHealthStatus />, { wrapper });
      const messages = {
        http: 'HTTP 503: Unavailable',
        network: 'Connection lost',
        unknown: 'Failed to fetch health status',
      };
      expect(
        await screen.findByText(/Failed to load plugin health:/),
      ).toHaveTextContent(messages[failure]);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    },
  );

  it('polls at the configured interval, recovers after an error, and clears its timer on unmount', async () => {
    jest.useFakeTimers();
    fetchApi.fetch
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValue(
        response({ apme: { state: 'READY', message: 'Recovered' } }),
      );
    const { result, unmount } = renderHook(() => usePortalHealthStatus(1000), {
      wrapper,
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(result.current.error?.message).toBe('Offline');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.snapshot?.apme.message).toBe('Recovered');
    unmount();
    const calls = fetchApi.fetch.mock.calls.length;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5000);
    });
    expect(fetchApi.fetch).toHaveBeenCalledTimes(calls);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([true, false])(
    'ignores a pending %s response after unmount',
    async success => {
      let resolve!: (value: unknown) => void;
      let reject!: (reason: unknown) => void;
      fetchApi.fetch.mockReturnValue(
        new Promise((yes, no) => {
          resolve = yes;
          reject = no;
        }),
      );
      const { unmount } = renderHook(() => usePortalHealthStatus(), {
        wrapper,
      });
      await waitFor(() => expect(fetchApi.fetch).toHaveBeenCalledTimes(1));
      unmount();
      await act(async () => {
        if (success) resolve(response({}));
        else reject(new Error('late failure'));
      });
    },
  );
});
