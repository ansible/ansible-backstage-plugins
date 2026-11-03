# ADR-006: TLS Verification by Default, One Auditable Opt-Out

**Status**: Accepted (amended 2026-10-22)
**Date**: 2026-10-16
**Deciders**: Content management team
**Scope**: Every network request `OCIClient` issues on behalf of a registry connection.

## Context

AAP-96688, from Product Security's review of ANSTRAT-1758 (PSIRTSUPT-25321, finding 3:
transport trust), requires registry connections to verify TLS certificates by default,
and any insecure override to be explicit, gated, auditable, and off by default.

The client exchanges credentials with registries the operator configured at install
time: basic-auth headers on token exchanges, bearer tokens on every request. An
unverified transport turns anyone between the portal and the registry into the
registry — credentials and artifact metadata both flow over it. Plain HTTP has the
same property with no certificate to check at all.

Before this decision, the transport was whatever `fetch` did by default: HTTPS
verification was on by accident rather than by policy, plain HTTP was always allowed,
and the `insecure` config field was read but never enforced.

## Alternatives Considered

| Alternative                                            | Why rejected                                                                                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `NODE_TLS_REJECT_UNAUTHORIZED=0`                       | Process-global and ungated: disables verification for every connection, not just the registry that needed it.                 |
| Separate flags for plain HTTP and certificate skipping | Two opt-outs to audit and misconfigure, for one intent. A registry on plain HTTP is already opting out of transport trust.    |
| No override at all                                     | Local development against a plain-HTTP Quay or `registry:2` becomes impossible without standing up TLS for a throwaway setup. |
| Verify only when credentials are configured            | Anonymous registries would silently get unverified metadata flows, and "is this registry real" is not a credential concern.   |

## Decision

**Verified HTTPS is the only default transport. `insecure: true` on a registry
connection is the single, explicit, auditable opt-out.**

1. Omitted or false — the default — every request goes out over HTTPS with certificate
   verification against the process trust store. A registry presenting an untrusted,
   expired or wrong-host certificate fails the connection.
2. Plain HTTP is refused outright, client-side, before any request leaves the process —
   including token-exchange realms and pagination links a registry may point at.
3. `insecure: true` skips certificate verification and admits plain HTTP for **that
   registry only**, through a per-client undici dispatcher. Neighbouring connections
   are unaffected.
4. The opt-out is auditable: a client created with it logs a warning naming the
   registry only — no URL data, which can carry credentials or name private
   hosts — and `/config/validate` flags it. Only an explicit boolean or a
   Backstage-recognized truthy string enables it; unparseable values fail
   config reading.
5. The scheme check reads the URL through the URL parser, not a string pattern —
   `http:\\host` and other spellings parse to plain HTTP and are refused as such.
6. Redirects are followed by hand, hop by hop, in every transport — injected
   fetch functions included, which receive `redirect: 'manual'` so they cannot
   follow a hop the policy has not seen: an HTTPS endpoint cannot downgrade a
   request to plain HTTP inside the transport, credentials are dropped when a
   redirect crosses origin (the fetch-specification rule), and the chain is
   capped.
7. Verification is **pinned** per connection: the dispatcher sets
   `rejectUnauthorized` explicitly, so a process-wide
   `NODE_TLS_REJECT_UNAUTHORIZED=0` set for unrelated reasons cannot silently
   disable it.
8. A connection may instead name a `caFile`: a PEM bundle the registry's
   certificate is verified against, **in addition to** the process trust
   store. Verification stays on — this is how a registry behind a private CA
   is trusted without the opt-out — and trust is additive on purpose: a
   registry behind a private CA can redirect to, or authenticate through, a
   host whose certificate chains to the default roots (a CDN in front of the
   registry, a separate auth host), and requiring operators to duplicate
   public roots into every bundle is exactly the trap additive trust closes.
   The connection attempts the process trust store first and retries
   chain-of-trust failures against the bundle; both attempts verify the
   certificate and the hostname, and neither admits plain HTTP. `caFile` and
   `insecure` together are a configuration error — refused at startup, by
   `/config/validate`, and by the client itself.

## Amendment (2026-10-22)

Review of the first implementation found a compatibility trap in point 8: a
`caFile` bundle that _replaced_ the process trust store also replaced it for
every host a registry delegates to — redirect targets, bearer-token realms —
so a registry behind a private CA that redirected to a publicly-trusted host
failed verification through no misconfiguration of its own. Point 8 now
specifies additive trust: the process store first, the bundle as a fallback
for chain-of-trust failures, both verifying in full.

The same review tightened public diagnostics: the registry listing reports a
failed reconciliation as a fixed summary, because the detailed cause can quote
internal hostnames (a TLS rejection names the certificate's subject
alternative names). The detail stays in the backend log and in the sync
responses. No route leaks it to anonymous callers: every route except the
`GET /health` liveness probe — which answers a bare status — sits behind the
platform's sign-in barrier. See the registry TLS guide for the operator-facing
wording.

## Consequences

- Operators with internal CAs have two standard ways to trust them — the
  process trust store (`NODE_EXTRA_CA_CERTS` at startup) or a per-registry
  `caFile` — and the two compose: a certificate chains to the bundle or to
  the process's default roots. A registry connection pins its own dispatcher
  either way and does not inherit dispatcher customizations from elsewhere in
  the process.
- A connection whose registry is trusted only through its bundle pays one
  extra TLS handshake per new socket (the default store is tried first and
  refuses); connection pooling keeps that per-connection, not per-request.
- `caFile` adds trust rather than pinning a certificate or issuer. A valid
  certificate for the registry hostname that chains to any process-trusted CA
  is accepted even when the bundle does not cover it. This includes corporate
  inspection CAs installed in the process trust store. Bundle-only trust and
  certificate pinning are not supported; reversing the handshake order with a
  fallback would not provide either guarantee.
- Local development must set `insecure: true` for the plain-HTTP Quay — the
  commented `automationContent` block in the bundled `app-config.yaml` notes the
  opt-out. The full portal demo, including the trusted and untrusted HTTPS
  cases, lives in the standalone content repository
  ([ansible/automation-content-plugins](https://github.com/ansible/automation-content-plugins),
  `dev/tls/`).
- Real-TLS tests are the only proof of this policy; `MockRegistry` never opens a
  socket, so certificate validation is tested against loopback HTTPS servers
  whose fixtures are generated at runtime by `src/testing/tlsCertificates.ts` —
  no private keys are committed — and the consumers are additionally driven
  over real TLS in `ContentIndexTransport.test.ts`. The default-store branch
  is proven in a subprocess (`OCIProcessTrust.test.ts`), because
  `NODE_EXTRA_CA_CERTS` is read at startup and cannot be installed by a test
  that is already running.
- undici is loaded lazily by the default transport, because this package also runs
  under jsdom and in bundles that must never see a node-only HTTP client. In jest's
  VM (no dynamic-import callback) the load falls back to `require`, which is what
  every CommonJS context uses anyway.
