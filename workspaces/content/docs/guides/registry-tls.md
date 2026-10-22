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
stays on — checked against that bundle exactly:

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
a multi-certificate bundle is validated. When set, the bundle is the complete
trust store for that connection — the default roots are not merged in. Setting
`caFile` and `insecure` together is a configuration error and is rejected at
startup — and by `/config/validate` before it reaches startup.

The process-wide alternative — `NODE_EXTRA_CA_CERTS` at startup — remains
available and composes with everything here.

## Errors, redaction, and visibility

- Failed syncs walk the fetch cause chain, so a TLS rejection surfaces as the
  certificate error it is, not as a bare `fetch failed`
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
transport. The full portal demo — one Quay behind three doors: plain HTTP,
trusted HTTPS, untrusted HTTPS — lives in the standalone repository,
[ansible/automation-content-plugins](https://github.com/ansible/automation-content-plugins)
(`dev/tls/`).
