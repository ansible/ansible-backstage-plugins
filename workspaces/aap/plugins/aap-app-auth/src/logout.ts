import type {
  ConfigApi,
  ErrorApi,
  IdentityApi,
  SessionApi,
} from '@backstage/core-plugin-api';

/** Keep AAP session behavior in the auth package, independent of menu placement. */
export async function performAapLogout({
  auth,
  identity,
  config,
  errors,
}: {
  auth: Pick<SessionApi, 'signOut'>;
  identity: Pick<IdentityApi, 'signOut'>;
  config: Pick<ConfigApi, 'getOptionalString'>;
  errors: Pick<ErrorApi, 'post'>;
}) {
  try {
    await auth.signOut();
  } catch {
    // Continue local and browser-session logout even if token revocation fails.
  }
  await identity.signOut().catch(error => errors.post(error));
  const aapHost = config
    .getOptionalString('ansible.rhaap.baseUrl')
    ?.replace(/\/$/, '');
  if (aapHost) {
    try {
      const host = new URL(aapHost);
      globalThis.location.href = `${host.origin}/api/gateway/v1/logout/`;
    } catch {
      globalThis.location.href = '/';
    }
  }
}
