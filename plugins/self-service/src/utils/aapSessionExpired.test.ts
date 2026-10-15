import {
  AAP_SESSION_EXPIRED_MESSAGE,
  AapSessionExpiredError,
  forceLogoutOnAapSessionDeath,
  isAapSessionExpiredError,
  resetAapSessionLogoutStateForTests,
} from './aapSessionExpired';

describe('aapSessionExpired', () => {
  beforeEach(() => {
    resetAapSessionLogoutStateForTests();
  });

  it('identifies AapSessionExpiredError instances', () => {
    expect(isAapSessionExpiredError(new AapSessionExpiredError())).toBe(true);
    expect(isAapSessionExpiredError(new Error('nope'))).toBe(false);
    expect(isAapSessionExpiredError('string')).toBe(false);
  });

  it('uses the standard session-expired message by default', () => {
    expect(new AapSessionExpiredError().message).toBe(
      AAP_SESSION_EXPIRED_MESSAGE,
    );
  });

  it('calls identityApi.signOut once for concurrent session deaths', async () => {
    let resolveSignOut!: () => void;
    const signOut = jest.fn(
      () =>
        new Promise<void>(resolve => {
          resolveSignOut = resolve;
        }),
    );

    const first = forceLogoutOnAapSessionDeath({ signOut });
    const second = forceLogoutOnAapSessionDeath({ signOut });

    expect(signOut).toHaveBeenCalledTimes(1);

    resolveSignOut();
    await Promise.all([first, second]);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('allows a new signOut after the previous one finishes', async () => {
    const signOut = jest.fn().mockResolvedValue(undefined);

    await forceLogoutOnAapSessionDeath({ signOut });
    await forceLogoutOnAapSessionDeath({ signOut });

    expect(signOut).toHaveBeenCalledTimes(2);
  });
});
