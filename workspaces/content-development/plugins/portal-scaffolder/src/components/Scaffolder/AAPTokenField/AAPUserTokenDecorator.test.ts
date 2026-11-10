import { addAAPUserTokenToSecrets } from './AAPUserTokenDecorator';

describe('addAAPUserTokenToSecrets', () => {
  it('adds the signed-in user token while preserving other task secrets', async () => {
    const secrets: Record<string, string> = { SCM_TOKEN: 'scm-secret' };
    const setSecrets = jest.fn(
      (update: (current: typeof secrets) => typeof secrets) => {
        Object.assign(secrets, update(secrets));
      },
    );

    await addAAPUserTokenToSecrets(
      { getAccessToken: async () => 'user-token' },
      setSecrets,
    );

    expect(secrets).toEqual({
      SCM_TOKEN: 'scm-secret',
      aapToken: 'user-token',
    });
  });

  it('requests a fresh token each time the form is submitted', async () => {
    const getAccessToken = jest
      .fn<Promise<string>, []>()
      .mockResolvedValueOnce('old-token')
      .mockResolvedValueOnce('refreshed-token');
    let secrets: Record<string, string> = {};
    const setSecrets = jest.fn(
      (update: (current: typeof secrets) => typeof secrets) => {
        secrets = update(secrets);
      },
    );

    await addAAPUserTokenToSecrets({ getAccessToken }, setSecrets);
    await addAAPUserTokenToSecrets({ getAccessToken }, setSecrets);

    expect(getAccessToken).toHaveBeenCalledTimes(2);
    expect(secrets.aapToken).toBe('refreshed-token');
  });

  it.each([undefined, ''])(
    'rejects a missing token value (%p)',
    async token => {
      await expect(
        addAAPUserTokenToSecrets(
          { getAccessToken: async () => token },
          jest.fn(),
        ),
      ).rejects.toThrow(/AAP user authentication did not return a token/);
    },
  );

  it('propagates a cancelled or rejected authentication request', async () => {
    await expect(
      addAAPUserTokenToSecrets(
        {
          getAccessToken: async () => {
            throw new Error('Login cancelled');
          },
        },
        jest.fn(),
      ),
    ).rejects.toThrow('Login cancelled');
  });

  it('rejects an unavailable authentication contributor', async () => {
    await expect(
      addAAPUserTokenToSecrets(undefined, jest.fn()),
    ).rejects.toThrow(/AAP authentication API is unavailable/);
  });
});
