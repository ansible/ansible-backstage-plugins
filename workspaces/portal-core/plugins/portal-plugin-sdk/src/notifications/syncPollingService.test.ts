import { syncPollingService } from './syncPollingService';
import { FAST_POLL_INTERVAL_MS } from '../utils';

describe('SDK sync polling recovery', () => {
  const discoveryApi = { getBaseUrl: jest.fn().mockResolvedValue('/catalog') };
  const fetchApi = {
    fetch: jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: { providers: [] } }),
    }),
  };

  beforeEach(() => {
    jest.useFakeTimers();
    syncPollingService.clear();
  });

  afterEach(() => {
    syncPollingService.clear();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('retries a rejected poll instead of terminating the polling chain', async () => {
    const poll = jest
      .spyOn(syncPollingService as any, 'checkSyncStatus')
      .mockRejectedValueOnce(new Error('Unexpected poll failure'));

    syncPollingService.initialize(discoveryApi, fetchApi);
    await jest.advanceTimersByTimeAsync(0);
    expect(poll).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(FAST_POLL_INTERVAL_MS);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it('does not restart a cleared session when an earlier poll rejects', async () => {
    let rejectPoll!: (error: Error) => void;
    const poll = jest
      .spyOn(syncPollingService as any, 'checkSyncStatus')
      .mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectPoll = reject;
        }),
      );

    syncPollingService.initialize(discoveryApi, fetchApi);
    syncPollingService.clear();
    rejectPoll(new Error('Old session poll failed'));
    await jest.advanceTimersByTimeAsync(FAST_POLL_INTERVAL_MS * 2);

    expect(poll).toHaveBeenCalledTimes(1);
  });
});
