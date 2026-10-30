import { MockConfigApi } from '@backstage/test-utils';
import { performAapLogout } from './logout';

describe('performAapLogout', () => {
  const originalLocation = window.location;
  const auth = { signOut: jest.fn() };
  const identity = { signOut: jest.fn() };
  const errors = { post: jest.fn() };
  const settings = {
    app: { baseUrl: 'http://localhost:7007/' },
    auth: {
      environment: 'production',
      providers: {
        rhaap: {
          production: {
            host: 'https://aap.example.com/',
            clientId: 'portal-client',
          },
        },
      },
    },
  };
  beforeEach(() => {
    jest.resetAllMocks();
    auth.signOut.mockResolvedValue(undefined);
    identity.signOut.mockResolvedValue(undefined);
    delete (window as any).location;
    (window as any).location = { href: 'http://localhost:7007/' };
  });
  afterAll(() => {
    delete (window as any).location;
    (window as any).location = originalLocation;
  });
  async function logout(config = new MockConfigApi(settings)) {
    await performAapLogout({ auth, identity, errors, config });
  }
  it('uses the selected public OAuth host and exact Portal return URL', async () => {
    await logout();
    const url = new URL(window.location.href);
    expect(url.origin + url.pathname).toBe('https://aap.example.com/o/logout/');
    expect(url.searchParams.get('client_id')).toBe('portal-client');
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe(
      'http://localhost:7007/',
    );
    expect([...url.searchParams.keys()]).toEqual([
      'client_id',
      'post_logout_redirect_uri',
    ]);
  });
  it('supports source-app base paths, encoded client IDs, and the default environment', async () => {
    await logout(
      new MockConfigApi({
        app: { baseUrl: 'http://localhost:3000/portal/' },
        ansible: { rhaap: { baseUrl: 'https://aap.example.com' } },
        auth: {
          providers: { rhaap: { development: { clientId: 'client & one' } } },
        },
      }),
    );
    const url = new URL(window.location.href);
    expect(url.searchParams.get('client_id')).toBe('client & one');
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe(
      'http://localhost:3000/portal/',
    );
  });
  it('serializes an origin-only Portal URL with a trailing slash', async () => {
    await logout(
      new MockConfigApi({
        ...settings,
        app: { baseUrl: 'http://localhost:3000' },
      }),
    );
    expect(
      new URL(window.location.href).searchParams.get(
        'post_logout_redirect_uri',
      ),
    ).toBe('http://localhost:3000/');
  });
  it('waits for Portal identity cleanup before leaving for AAP', async () => {
    let resolve!: () => void;
    identity.signOut.mockImplementationOnce(
      () =>
        new Promise<void>(done => {
          resolve = done;
        }),
    );
    const pending = logout();
    await Promise.resolve();
    await Promise.resolve();
    expect(window.location.href).toBe('http://localhost:7007/');
    resolve();
    await pending;
    expect(new URL(window.location.href).pathname).toBe('/o/logout/');
  });
  it('still attempts browser logout when token revocation or identity cleanup fails', async () => {
    auth.signOut.mockRejectedValueOnce(new Error('revocation failed'));
    const failure = new Error('identity failed');
    identity.signOut.mockRejectedValueOnce(failure);
    await logout();
    expect(errors.post).toHaveBeenCalledWith(failure);
    expect(new URL(window.location.href).pathname).toBe('/o/logout/');
  });
  it.each([
    { ...settings, app: { baseUrl: 'data:text/plain,unsafe' } },
    {
      ...settings,
      app: { baseUrl: 'https://user:password@portal.example.com/' },
    },
    {
      ...settings,
      app: { baseUrl: 'https://portal.example.com/?return=elsewhere' },
    },
    { ...settings, app: { baseUrl: 'https://portal.example.com/#fragment' } },
    { ...settings, app: { baseUrl: '/relative' } },
    { ...settings, app: {} },
    {
      ...settings,
      auth: {
        providers: {
          rhaap: { development: { host: 'https://aap.example.com' } },
        },
      },
    },
    {
      ...settings,
      auth: {
        providers: {
          rhaap: {
            development: { host: 'file:///tmp/aap', clientId: 'client' },
          },
        },
      },
    },
  ])(
    'clears Portal auth but refuses unsafe or incomplete configuration %#',
    async invalid => {
      await logout(new MockConfigApi(invalid));
      expect(auth.signOut).toHaveBeenCalledTimes(1);
      expect(identity.signOut).toHaveBeenCalledTimes(1);
      expect(errors.post).toHaveBeenCalledTimes(1);
      expect(window.location.href).toBe('http://localhost:7007/');
      expect(errors.post.mock.calls[0][0].message).not.toContain('password');
    },
  );
  it('leaves navigation to identity sign-out when AAP is not configured', async () => {
    await logout(new MockConfigApi({}));
    expect(identity.signOut).toHaveBeenCalled();
    expect(errors.post).not.toHaveBeenCalled();
    expect(window.location.href).toBe('http://localhost:7007/');
  });
});
