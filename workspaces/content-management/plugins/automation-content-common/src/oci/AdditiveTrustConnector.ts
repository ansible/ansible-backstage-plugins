import type { buildConnector } from 'undici';

/**
 * OpenSSL verify codes that mean chain-of-trust failure — the only failures a
 * second trust store could fix (AAP-96688).
 *
 * Expiry, hostname mismatch and protocol errors are properties of the
 * certificate or the endpoint, not of the trust store; retrying those against
 * the bundle would only duplicate the failure. Node surfaces these codes on
 * the error a rejected handshake produces (`error.code`), and has done so
 * across every Node version this package supports.
 */
const TRUST_CHAIN_ERROR_CODES = new Set([
  // No issuer for some certificate in the chain was found in the store.
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  // The leaf's signature could not be verified against any store certificate.
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  // The chain terminates in a self-signed certificate the store does not trust.
  'SELF_SIGNED_CERT_IN_CHAIN',
  // The leaf itself is self-signed and the store does not trust it.
  'DEPTH_ZERO_SELF_SIGNED_CERT',
]);

function isTrustChainRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code } = error as { code?: unknown };
  return typeof code === 'string' && TRUST_CHAIN_ERROR_CODES.has(code);
}

export interface AdditiveTrustConnectorOptions {
  /** The PEM bundle from the connection's `ca` — trust added on top of the defaults. */
  ca: string;
}

/**
 * A TLS connector that trusts the process's default root store *and* a
 * configured PEM bundle.
 *
 * A bundle that replaced the default store (Node's behaviour when `ca` is
 * passed to a single handshake) also replaced it for every host the registry
 * delegates to: redirect targets, bearer-token realms. A registry behind a
 * private CA that redirects to, or authenticates through, a host with a
 * publicly-trusted certificate then failed verification through no
 * misconfiguration of its own — a CDN in front of the registry, a separate
 * auth host. Additive trust closes that trap.
 *
 * Handshakes are attempted against the process's default store first, and a
 * chain-of-trust failure there — the only kind of failure a different store
 * could fix — is retried against the bundle. Both attempts verify in full:
 * certificate chain and hostname, `rejectUnauthorized` pinned explicitly.
 * The retry happens inside the connector, before any HTTP bytes are written,
 * so no request — credential-bearing or not — is replayed.
 *
 * The cost is one extra handshake per new socket for servers trusted only
 * through the bundle; connection pooling keeps that per-connection, not
 * per-request.
 *
 * Built on undici's supported connector API, which is stable across the Node
 * versions this package supports — no version-conditional TLS APIs involved.
 */
export function createAdditiveTrustConnector(
  undici: { buildConnector: typeof buildConnector },
  options: AdditiveTrustConnectorOptions,
): buildConnector.connector {
  // Two independent connectors, each with its own TLS session cache — undici
  // scopes the cache per buildConnector() call, so the two stores cannot
  // exchange sessions.
  const trustProcessDefaults = undici.buildConnector({
    rejectUnauthorized: true,
  });
  const trustBundle = undici.buildConnector({
    rejectUnauthorized: true,
    ca: options.ca,
  });

  return (target, callback) => {
    trustProcessDefaults(target, (defaultError, socket) => {
      if (!defaultError) {
        callback(null, socket);
        return;
      }
      if (!isTrustChainRejection(defaultError)) {
        callback(defaultError, null);
        return;
      }
      trustBundle(target, (bundleError, bundleSocket) => {
        if (bundleError) {
          // The bundle is the trust the operator configured for this
          // registry, so its verdict is the actionable one when both stores
          // refuse the certificate.
          callback(bundleError, null);
        } else {
          callback(null, bundleSocket);
        }
      });
    });
  };
}
