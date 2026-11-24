import type {
  ConfigApi,
  ErrorApi,
  IdentityApi,
  SessionApi,
} from '@backstage/core-plugin-api';

/**
 * Build the AAP OIDC end-session URL, or return undefined when no AAP host is configured.
 * Throws when a host resolves but the client ID, Portal URL, or URL safety checks fail.
 */
function logoutDestination(config: Pick<ConfigApi, 'getOptionalString'>) {
  const environment =
    config.getOptionalString('auth.environment') ?? 'development';
  const provider = `auth.providers.rhaap.${environment}`;
  const host =
    config.getOptionalString(`${provider}.host`) ??
    config.getOptionalString('ansible.rhaap.baseUrl');
  if (!host) return undefined;
  const clientId = config.getOptionalString(`${provider}.clientId`);
  const appBaseUrl = config.getOptionalString('app.baseUrl');
  if (!clientId || !appBaseUrl) {
    throw new Error('AAP logout requires the OAuth client ID and app.baseUrl');
  }
  const aap = new URL(host);
  const portal = new URL(appBaseUrl);
  for (const url of [aap, portal]) {
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        'AAP logout requires HTTP(S) application URLs without credentials, query, or fragment',
      );
    }
  }
  const destination = new URL('/o/logout/', aap);
  destination.searchParams.set('client_id', clientId);
  destination.searchParams.set('post_logout_redirect_uri', portal.href);
  return destination.href;
}

/** AAP validates the registered return URI and owns the logout confirmation. */
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
  let destination: string | undefined;
  try {
    destination = logoutDestination(config);
  } catch {
    // Clear Portal auth even when browser-session logout cannot be configured safely.
    errors.post(
      new Error(
        'AAP browser logout is unavailable: check the OAuth client and Portal URLs',
      ),
    );
  }
  try {
    await auth.signOut();
  } catch {
    // Continue local and browser-session logout even if token revocation fails.
  }
  await identity.signOut().catch(error => errors.post(error));
  if (destination) globalThis.location.href = destination;
}
