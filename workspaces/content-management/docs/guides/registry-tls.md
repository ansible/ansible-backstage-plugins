# Registry TLS verification

Registry connections verify TLS by default and refuse plain HTTP. This guide
covers what that means for each kind of setup, the one opt-out, and how to
trust a private CA with verification fully on. The decision record behind the
policy is [ADR-006](../adrs/006-tls-verification-by-default.md).

## What the default does

Omitted or false — the default — every request a registry connection issues
goes out over HTTPS with certificate verification:

- a registry presenting an untrusted, expired, or wrong-host certificate fails
  the connection
- plain HTTP is refused outright, client-side, before any request leaves the
  process — including bearer-token realms and pagination links a registry may
  point at
- redirects are followed by hand, hop by hop: an HTTPS endpoint cannot
  downgrade a request to plain HTTP inside the transport, credentials are
  dropped when a redirect crosses origin, and the chain is capped
- verification is pinned per connection, so a process-wide
  `NODE_TLS_REJECT_UNAUTHORIZED=0` set for unrelated reasons cannot silently
  disable it

A sync that fails on these grounds reports the real TLS reason (the error
chain is unwrapped), and `/config/validate` flags configured opt-outs.

## The opt-out: `insecure: true`

```yaml
catalog:
  providers:
    automationContent:
      registries:
        - name: local-registry
          url: http://localhost:5000
          insecure: true # local development only
```

`insecure: true` admits plain HTTP and skips certificate verification for
**that registry only**; neighbouring connections are unaffected. It is the
single, explicit, auditable opt-out:

- the client logs a warning naming the registry when it is created — naming
  the registry only, since a URL can carry credentials or name private hosts
- `/config/validate` flags it with "local development only"
- only an explicit boolean or a Backstage-recognized truthy string enables it;
  unparseable values fail config reading

Local registries speaking plain HTTP — the e2e pipeline's `registry:2`, a
local Quay — need this flag. A real registry over HTTPS needs no flag.

## Trusting a private CA: `caFile`

A registry behind a certificate your process does not trust does not need the
opt-out. Give the entry a `caFile` pointing at a PEM bundle, and verification
stays on — a certificate chains to the bundle **or** to the process's default
root store:

```yaml
catalog:
  providers:
    automationContent:
      registries:
        - name: corporate-registry
          url: https://registry.corp.example.com
          caFile: /etc/pki/ca-trust/registry-ca.pem
```

The bundle is read at startup, not lazily: an unreadable file, a file with no
PEM certificate, or a certificate Node's parser rejects fails the process at
boot with the registry named, rather than failing a sync later. Every block in
a multi-certificate bundle is validated.

Trust is additive on purpose: a registry behind a private CA can redirect to,
or authenticate through, a host whose certificate chains to the default roots
— a CDN in front of the registry, a separate token endpoint — and the
connection follows both. The client attempts the process's default roots
first and retries chain-of-trust failures against the bundle; both attempts
verify the certificate and the hostname. The cost is one extra handshake per
new connection to a registry only the bundle trusts, which connection pooling
keeps negligible.

`caFile` adds trusted CAs; it does **not** pin a certificate or restrict trust to
that bundle. A valid certificate for the registry's hostname is also accepted
when it chains to any process-trusted CA, including a corporate inspection CA,
even if the configured bundle does not cover it. There is no bundle-only or
certificate-pinning mode. Trying the bundle first and falling back to process
trust would still accept those certificates.

Setting `caFile` and `insecure` together is a configuration error and is
rejected at startup — by `/config/validate` before it reaches startup — and
by the client itself.

The process-wide alternative — `NODE_EXTRA_CA_CERTS` at startup — remains
available and composes with everything here.

## Errors, redaction, and visibility

- Failed syncs walk the fetch cause chain (bounded, cycle-safe), so a TLS
  rejection surfaces as the certificate error it is, not as a bare
  `fetch failed`
- Every route except the `GET /health` liveness probe sits behind the
  platform's sign-in barrier, and `GET /health` answers a bare status — so no
  route leaks diagnostics to anonymous callers. The registry listing reports a
  failed reconciliation as a fixed summary: the detailed cause can quote
  internal hostnames — a TLS rejection names the certificate's subject
  alternative names — and it stays in the backend log and in the sync
  responses, where the caller explicitly asked for a refresh
- `POST /sync` carries the detailed failure cause to its verified user/service
  caller; the per-registry sync and poll routes require authentication too
- Refusals and warnings name the registry, never URL data: a URL that reaches
  an error is reduced to its scheme, host, and path — userinfo is masked and
  query and fragment dropped, since each can carry a secret
- A failed sync retains what was already indexed rather than emptying the
  catalog

## Testing and the demo

The policy is proven against real TLS: `OCITransportPolicy.test.ts` stands up
loopback HTTPS servers (certificates generated at runtime by
`src/testing/tlsCertificates.ts` — no private keys are committed), and
`ContentIndexTransport.test.ts` drives the index itself over the real
transport. The process-trust branch — `NODE_EXTRA_CA_CERTS` installed before
startup — is proven by `OCIProcessTrust.test.ts`, which runs the client in a
subprocess, since a test that is already running cannot install a process
root. The full portal demo — one Quay behind three doors: plain HTTP,
trusted HTTPS, untrusted HTTPS — lives in the standalone repository,
[ansible/automation-content-plugins](https://github.com/ansible/automation-content-plugins)
(`dev/tls/`).
