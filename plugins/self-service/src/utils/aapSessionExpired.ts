import type { IdentityApi } from '@backstage/core-plugin-api';

export const AAP_SESSION_EXPIRED_MESSAGE =
  'Your AAP sign-in session expired. Sign out and sign in again.';

/**
 * Thrown when a user-token AAP path indicates the OAuth session is dead
 * (empty token, 401, invalid_grant). Callers should force portal logout.
 */
export class AapSessionExpiredError extends Error {
  readonly name = 'AapSessionExpiredError';

  constructor(message: string = AAP_SESSION_EXPIRED_MESSAGE) {
    super(message);
    Object.setPrototypeOf(this, AapSessionExpiredError.prototype);
  }
}

export function isAapSessionExpiredError(
  error: unknown,
): error is AapSessionExpiredError {
  return error instanceof AapSessionExpiredError;
}

let inFlightLogout: Promise<void> | undefined;

/**
 * Clears the portal session via identityApi.signOut().
 * Concurrent calls share one in-flight signOut to avoid logout storms.
 *
 * Explicit profile logout still uses AAPLogoutButton (portal + AAP gateway).
 * This path only clears the portal session so local AAP port-forwards
 * (e.g. localhost:44927) are not forced through gateway logout URLs.
 */
export async function forceLogoutOnAapSessionDeath(
  identityApi: Pick<IdentityApi, 'signOut'>,
): Promise<void> {
  if (!inFlightLogout) {
    inFlightLogout = identityApi.signOut().finally(() => {
      inFlightLogout = undefined;
    });
  }
  await inFlightLogout;
}

/** @internal test helper — resets logout dedupe between tests */
export function resetAapSessionLogoutStateForTests(): void {
  inFlightLogout = undefined;
}
