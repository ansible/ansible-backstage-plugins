import { jest as esmJest } from '@jest/globals';

const mockBackend = { add: jest.fn(), start: jest.fn() };

jest.mock('@backstage/backend-defaults', () => ({
  createBackend: () => mockBackend,
}));
esmJest.unstable_mockModule('@backstage/plugin-auth-backend', () => ({
  default: {},
}));
esmJest.unstable_mockModule('./index', () => ({ default: {} }));

describe('AAP auth development backend startup', () => {
  let stderr: jest.SpyInstance;
  let previousExitCode: typeof process.exitCode;

  beforeEach(() => {
    jest.resetAllMocks();
    previousExitCode = process.exitCode;
    process.exitCode = undefined;
    stderr = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    process.exitCode = previousExitCode;
    jest.restoreAllMocks();
  });

  async function startDevelopmentBackend() {
    await jest.isolateModulesAsync(async () => {
      await import('../dev');
    });
    await Promise.all(mockBackend.add.mock.calls.map(([feature]) => feature));
  }

  it('starts the auth backend without reporting an error on success', async () => {
    mockBackend.start.mockResolvedValue(undefined);
    await startDevelopmentBackend();
    expect(mockBackend.add).toHaveBeenCalledTimes(2);
    expect(mockBackend.start).toHaveBeenCalledTimes(1);
    expect(stderr).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it.each([
    new Error('clientSecret=private-value at https://internal.example.com'),
    'clientSecret=private-value at https://internal.example.com',
  ])(
    'reports a fixed message without exposing the startup rejection (%p)',
    async error => {
      mockBackend.start.mockRejectedValue(error);
      await startDevelopmentBackend();
      expect(stderr).toHaveBeenCalledTimes(1);
      expect(stderr).toHaveBeenCalledWith(
        'Failed to start the development backend.\n',
      );
      expect(process.exitCode).toBe(1);
    },
  );

  it('does not stringify or inspect an arbitrary startup rejection', async () => {
    const toString = jest.fn(() => 'private-value');
    const message = jest.fn(() => 'private-value');
    const error = Object.defineProperty({ toString }, 'message', {
      get: message,
    });
    mockBackend.start.mockRejectedValue(error);
    await startDevelopmentBackend();
    expect(toString).not.toHaveBeenCalled();
    expect(message).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(
      'Failed to start the development backend.\n',
    );
    expect(process.exitCode).toBe(1);
  });
});
