# TLS verification demo (AAP-96688)

Everything needed to show — and keep proving — that registry connections verify
TLS by default, in the real dev portal (`yarn start`), through the real content
plugins.

The demo relies on one local registry reachable through three doors, all
configured side by side in the portal, so the whole story is visible without
restarting anything mid-demo:

| Registry (portal config) | Door                     | What must happen                                                                            |
| ------------------------ | ------------------------ | ------------------------------------------------------------------------------------------- |
| `local-quay`             | `http://127.0.0.1:8080`  | Syncs only because of the explicit `insecure: true` opt-out; a startup warning names it     |
| `local-quay-tls`         | `https://127.0.0.1:8443` | Verified HTTPS against a CA bundle (`caFile`); syncs, discovery works                       |
| `local-quay-untrusted`   | `https://127.0.0.1:8444` | No CA, no opt-out — sync **fails**, naming the certificate, and the index keeps what it had |

Both TLS doors are the same proxy over the same registry; only the certificate
differs. That is the point: the only variable in the demo is trust.

## Prerequisites

- python3 with the `cryptography` package (certificate generation).
- A local plain-HTTP registry on `127.0.0.1:8080`, seeded with
  `demo/network-ee:dev`. This repo does not bundle one; use the standalone
  [automation-content-plugins][poc-repo] repo's `dev/quay`, or a disposable
  registry:

  ```bash
  podman run -d -p 8080:5000 --name demo-registry docker.io/library/registry:2
  podman pull quay.io/ansible/creator-ee:latest
  podman tag quay.io/ansible/creator-ee:latest localhost:8080/demo/network-ee:dev
  podman push localhost:8080/demo/network-ee:dev
  ```

- A portal token for the demo runner: mutating routes
  (`POST /api/automation-content/registries/:name/sync`) require an
  authenticated caller on this branch. Sign in to the dev portal in a browser
  and copy the token (the runner also accepts `PORTAL_TOKEN`).

## Bring it up

```bash
./workspaces/content/dev/tls/start-demo.sh
```

which, in order:

1. generates the demo certificates (trusted CA, untrusted CA — python
   `cryptography`, no openssl needed), including the host's LAN IP as a SAN;
2. starts the TLS proxy (`:8443` trusted, `:8444` untrusted, both bound on
   `0.0.0.0`) over the upstream registry (`UPSTREAM_REGISTRY`, default
   `http://127.0.0.1:8080`);
3. prints the `app-config.local.yaml` snippet for the three registries above.

Then start the dev portal (`yarn start`) and run the demo runner.

### When the portal runs in a container

The printed snippet uses loopback URLs, which work when the dev portal runs on
the host. From inside a container, loopback is the container itself — use the
host's LAN IP instead. The generated certificates already include it as a SAN
(`generate-certs.py` auto-detects it) and the proxy binds `0.0.0.0`, so only
the registry URLs in the config need changing:

```bash
HOST_IP=$(hostname -I | awk '{print $1}')
# then use in app-config.local.yaml:
#   local-quay:          http://$HOST_IP:8080
#   local-quay-tls:      https://$HOST_IP:8443
#   local-quay-untrusted: https://$HOST_IP:8444
```

The IP is DHCP-assigned, so re-check it when the network changes.

## Run the demo

Terminal — assertion-based, expected vs actual, exit non-zero on any surprise:

```bash
node workspaces/content/tools/demo-registry-tls.mjs --token <backstage-jwt>
```

Browser — the same results as the portal renders them:

```
http://localhost:3000/automation-content
```

A good five-minute shape:

1. Run the runner — case 1: **verified HTTPS syncs**. Point at the browser:
   the EE from `local-quay-tls`, contents known.
2. Case 3 in the terminal: **untrusted certificate refused** — read the error
   out loud, it names the certificate. In the browser the registry shows the
   failed sync; the already-discovered content is still there.
3. Case 2: **plain HTTP only through the opt-out**. Show the startup warning
   in the dev portal logs (`grep insecure` on the backend output).
4. Re-run the runner — same result, because the outcome is a property of the
   policy, not of the order of operations.

## Evidence trail

- Portal logs name the opt-out at startup and the certificate at failure.
- The catalog provider emits entities from the verified registry
  (`local-quay-tls emitted 3 entities`) and records the untrusted one as failed.
- The runner output is the artifact to paste into the ticket.

## Teardown

```bash
kill "$(cat workspaces/content/dev/tls/proxy.pid)"
podman rm -f demo-registry  # if a disposable registry was started
```

The certificates persist; they are regenerated only when missing. Deleting
`workspaces/content/dev/tls/certs/` starts the story fresh.

## What this is not

The untrusted door is not an attack simulation — the certificate is simply not
signed by anything the portal trusts. The point is the policy's behavior: which
connections are refused, what the refusal says, and what survives it.

[poc-repo]: https://github.com/ansible/automation-content-plugins
