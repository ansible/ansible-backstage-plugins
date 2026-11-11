import type { ScaffolderFormDecoratorContext } from '@backstage/plugin-scaffolder-react/alpha';
import { applyAapUserToken } from './aapUserTokenDecorator';

function createContext() {
  let secrets: Record<string, string> = {
    SCM_TOKEN: 'existing-scm-secret',
    aapToken: 'stale-aap-token',
  };
  const context: ScaffolderFormDecoratorContext = {
    input: {},
    formState: { inventory: { id: 42, name: 'Production' } },
    setFormState: jest.fn(),
    setSecrets: jest.fn(update => {
      secrets = update(secrets);
    }),
  };
  return { context, getSecrets: () => secrets };
}

it('acquires the current token for every submission and preserves unrelated secrets', async () => {
  const auth = {
    getAccessToken: jest
      .fn()
      .mockResolvedValueOnce('first-user-token')
      .mockResolvedValueOnce('refreshed-user-token'),
  };
  const { context, getSecrets } = createContext();

  await applyAapUserToken(context, auth);
  expect(getSecrets()).toEqual({
    SCM_TOKEN: 'existing-scm-secret',
    aapToken: 'first-user-token',
  });
  await applyAapUserToken(context, auth);
  expect(getSecrets()).toEqual({
    SCM_TOKEN: 'existing-scm-secret',
    aapToken: 'refreshed-user-token',
  });
  expect(auth.getAccessToken).toHaveBeenCalledTimes(2);
  expect(context.formState).toEqual({
    inventory: { id: 42, name: 'Production' },
  });
  expect(context.setFormState).not.toHaveBeenCalled();
});

it('waits for authentication before setting secrets', async () => {
  let resolveToken!: (token: string) => void;
  const auth = {
    getAccessToken: () =>
      new Promise<string>(resolve => {
        resolveToken = resolve;
      }),
  };
  const { context, getSecrets } = createContext();
  const pending = applyAapUserToken(context, auth);
  expect(context.setSecrets).not.toHaveBeenCalled();
  resolveToken('fresh-user-token');
  await pending;
  expect(getSecrets().aapToken).toBe('fresh-user-token');
});

it.each(['', '   ', '\t\n'])(
  'rejects an empty token (%j) before changing secrets',
  async token => {
    const auth = { getAccessToken: jest.fn().mockResolvedValue(token) };
    const { context } = createContext();
    await expect(applyAapUserToken(context, auth)).rejects.toThrow(
      /empty token.*Sign in to AAP/,
    );
    expect(context.setSecrets).not.toHaveBeenCalled();
  },
);

it.each(['Login cancelled', 'Refresh rejected', 'Provider unavailable'])(
  'rejects %s without exposing provider errors',
  async reason => {
    const auth = {
      getAccessToken: jest
        .fn()
        .mockRejectedValue(new Error(`${reason}: private-provider-details`)),
    };
    const { context } = createContext();
    const failure = applyAapUserToken(context, auth);
    await expect(failure).rejects.toThrow(/Sign in to AAP/);
    await expect(failure).rejects.not.toThrow(/private-provider-details/);
    expect(context.setSecrets).not.toHaveBeenCalled();
  },
);
