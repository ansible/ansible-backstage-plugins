This guide validates one claim: **the Automation Content plugin verifies TLS on registry connections, and refuses registries it cannot verify.**

Two checks prove it:

1. A sync over verified TLS completes and returns real content.
2. The same registry with no trust configured is refused at certificate verification.

Check 2 is what gives check 1 meaning. A single successful sync proves nothing on its own -- it could be accepting anything.

**Time:** about 15 minutes to set up, about 10 to run the validation.

## What this validates -- and what it doesn't

Validated: certificate verification against a private CA, refusal when trust is absent, and sync behavior over verified TLS.

Not validated: mutual TLS (not supported in this build), performance, high availability, or production hardening.

## Build under test

| Item              | Value                                                                       |
| ----------------- | --------------------------------------------------------------------------- |
| Change under test | PR #945 (pre-merge build)                                                   |
| Repository        | https://github.com/ansible/ansible-backstage-plugins                        |
| Obtain            | `git fetch origin pull/945/head && git switch -c tls-validation FETCH_HEAD` |
| Commit SHA        | Record the output of `git rev-parse HEAD` here                              |
| Fetched on        | Record the fetch date here                                                  |

This is a pre-merge build, not a supported release. Record the SHA you actually ran: results apply only to that commit. If the branch advances, re-fetch, record the new SHA, and expect to re-run the validation.

## 1. Before you start

You need: podman, node 22 or 24, corepack/yarn 4, openssl 3, curl, jq, skopeo.

You also need a checkout of `automation-portal-local` -- only for its `aap-mock/`, which provides sign-in for the portal.

Ports 3000, 7007, 8099 and 8443 must be free.

```bash
node --version && yarn --version && openssl version && skopeo --version
ss -tln | grep -E ':(3000|7007|8099|8443)\b' || echo "ports free"
```

Settings used throughout this guide:

```bash
export LAB="$HOME/tls-validation"
export MONO="$LAB/ansible-backstage-plugins"
export PORTAL="$LAB/automation-portal-local"
export REGISTRY=https://localhost:8443
export CA_FILE="$LAB/certs/ca.pem"

mkdir -p "$LAB/certs"
cd "$LAB"

git clone https://github.com/ansible/ansible-backstage-plugins.git "$MONO"
git -C "$MONO" fetch origin pull/945/head
git -C "$MONO" switch -c tls-validation FETCH_HEAD
git -C "$MONO" rev-parse HEAD          # record this SHA above

git clone --depth 1 \
  https://github.com/ansible-automation-platform/automation-portal-local.git "$PORTAL"
```

## 2. Why certificates are needed

TLS gives you two things: the traffic is encrypted, and the server proves who it is.

The proof is a certificate. A certificate is believed only if it was signed by an authority the client already trusts.

Your machine ships with the public authorities -- that's why `quay.io` works with no configuration.

A local registry can't get a public certificate, so it signs its own. That means the portal must be told to trust that signer. `caFile` is exactly that: **"trust this signer."**

Without it, the connection is refused -- not because encryption is missing, but because the identity can't be established.

Two details that cause most failures:

- **The certificate names the host you connect to** (the SANs). Trusting the CA does not skip that check. A certificate for `localhost` fails for `host.containers.internal`.
- **The private key must match the certificate.** A mismatch looks like a TLS error but is a file-pairing mistake.

## 3. Generate the certificates

One CA and one server certificate. Nothing else is needed.

```bash
cd "$LAB"

# The signer. Its key stays here; only ca.pem goes into the portal.
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout certs/ca-key.pem -out certs/ca.pem \
  -subj "/CN=validation registry CA" \
  -addext "basicConstraints=critical,CA:TRUE"

# The server certificate, signed by the CA above, valid for the hostnames
# this guide actually connects to.
openssl req -newkey rsa:2048 -nodes \
  -keyout certs/server-key.pem -out certs/server.csr \
  -subj "/CN=localhost"
openssl x509 -req -in certs/server.csr \
  -CA certs/ca.pem -CAkey certs/ca-key.pem -CAcreateserial \
  -out certs/server.pem -days 365 \
  -extfile <(printf "subjectAltName=DNS:localhost,IP:127.0.0.1")
rm certs/server.csr
```

Verify before continuing:

```bash
openssl x509 -in certs/server.pem -noout -ext subjectAltName
openssl verify -CAfile certs/ca.pem -verify_hostname localhost certs/server.pem
```

Expect the SAN list above and `certs/server.pem: OK`.

## 4. Start a local registry

Zot serves TLS natively, so no proxy and no database are needed.

```bash
mkdir -p "$LAB/zot/data"
chmod -R a+rX "$LAB/zot"

cat > "$LAB/zot/config.json" <<'EOF'
{
  "http": {
    "address": "0.0.0.0",
    "port": 8443,
    "tls": {
      "cert": "/etc/zot/tls/server.pem",
      "key": "/etc/zot/tls/server-key.pem"
    }
  },
  "storage": { "rootDirectory": "/var/lib/zot", "dedupe": false },
  "log": { "level": "info" }
}
EOF

podman run -d --name tls-validation-zot -p 127.0.0.1:8443:8443 \
  -v "$LAB/zot/config.json:/etc/zot/config.json:ro,Z" \
  -v "$LAB/certs/server.pem:/etc/zot/tls/server.pem:ro,Z" \
  -v "$LAB/certs/server-key.pem:/etc/zot/tls/server-key.pem:ro,Z" \
  -v "$LAB/zot/data:/var/lib/zot:Z" \
  ghcr.io/project-zot/zot-linux-amd64:latest
```

The `:Z` on each mount is required on SELinux hosts; without it the container cannot read the files.

The published port is restricted to host loopback because this fixture has no
registry authentication. Zot's `0.0.0.0` listener is inside its container.
Only the server certificate and matching key are mounted; the CA signing key
stays on the host and is not needed by the registry.

Check that TLS works before the portal is involved:

```bash
(
  set -eu
  http_status="$(curl -q --noproxy '*' --fail --silent --show-error --max-time 10 \
    --cacert "$CA_FILE" "$REGISTRY/v2/" -o /dev/null -w '%{http_code}')"
  if [ "$http_status" != 200 ]; then
    printf 'FAIL: expected HTTP 200 with the CA, received %s.\n' "$http_status" >&2
    exit 1
  fi
  printf 'With CA: HTTP 200.\n'

  if curl -q --noproxy '*' --fail --silent --show-error --max-time 10 \
    "$REGISTRY/v2/" -o /dev/null; then
    printf 'FAIL: the request unexpectedly verified without the lab CA.\n' >&2
    exit 1
  else
    result=$?
    if [ "$result" -ne 60 ]; then
      printf 'FAIL: expected certificate rejection (60), received curl exit %s.\n' "$result" >&2
      exit 1
    fi
    printf 'Without CA: expected certificate-verification rejection (curl exit 60).\n'
  fi
)
```

Expect `With CA: HTTP 200.`, a visible certificate diagnostic, and then
`Without CA: expected certificate-verification rejection (curl exit 60).`
The subshell fails on unexpected success, timeout, connection refusal, or any
other exit code. Keep the lab CA out of global trust and curl CA overrides;
otherwise the no-CA request will correctly be reported as an unexpected success.

The second result is the point: the certificate is valid, but the client does
not trust its signer without the explicit CA. `-q` ignores user curl config,
and `--noproxy '*'` keeps these localhost checks off configured proxies.

## 5. Publish a test image

An empty registry proves nothing -- a sync with nothing to find looks the same whether it worked or failed. Publish one real execution environment so a successful sync has visible content.

```bash
podman pull quay.io/ansible/creator-ee:latest

skopeo copy --dest-tls-verify=false \
  docker://quay.io/ansible/creator-ee:latest \
  docker://localhost:8443/demo/network-ee:dev

curl -q --noproxy '*' --fail --silent --show-error --max-time 10 \
  --cacert "$CA_FILE" "$REGISTRY/v2/demo/network-ee/tags/list" | jq .
# expect: {"name":"demo/network-ee","tags":["dev"]}
```

`--dest-tls-verify=false` is acceptable here because this is a local publish step; the validation itself does verify.

## 6. Configure the portal

The portal reads registry settings at startup, so all entries are added now.

Create `$MONO/.env` for the fresh checkout. The file is published only after
both signing secrets are generated, with permissions `0600`. An existing file
is never overwritten by this block.

`validation-secret`, `validation-token`, and the mock login password
`validation` are disposable local-fixture credentials. They are not production
credentials and should not be reused for an installed AAP environment.

```bash
(
  set -eu
  : "${MONO:?Set MONO to the plugin checkout first}"
  if [ ! -e "$MONO/.git" ]; then
    printf 'Expected a plugin checkout at %s.\n' "$MONO" >&2
    exit 1
  fi
  if ! command -v openssl >/dev/null 2>&1; then
    printf 'Install OpenSSL before generating the environment file.\n' >&2
    exit 1
  fi
  if [ -e "$MONO/.env" ] || [ -L "$MONO/.env" ]; then
    printf 'Existing .env kept. Reuse it and check its permissions instead of regenerating secrets.\n' >&2
    exit 1
  fi

  umask 077
  backend_secret="$(openssl rand -base64 32)"
  signing_key="$(openssl rand -base64 32)"
  temporary_env="$(mktemp "$MONO/.env.XXXXXX")"
  trap 'rm -f -- "$temporary_env"' EXIT
  chmod 600 "$temporary_env"
  cat > "$temporary_env" <<EOF
BACKEND_SECRET=$backend_secret
AUTH_SIGNING_KEY=$signing_key
AAP_HOST=http://localhost:8099
AAP_AUTH_CLIENT_ID=portal-local-mock
AAP_AUTH_CLIENT_SECRET=validation-secret
AAP_API_TOKEN=validation-token
EOF
  ln "$temporary_env" "$MONO/.env"
  printf 'Created .env with permissions 0600.\n'
)
```

If you are resuming an existing lab, keep its configured values and restrict
access before continuing:

```bash
chmod 600 "$MONO/.env"
stat -c '%a %n' "$MONO/.env"
# expect: 600 followed by the .env path
```

Create `$MONO/app-config.local.yaml`. Three registries: a real public one, the local one with trust configured, and the same local one without it.

```bash
cat > "$MONO/app-config.local.yaml" <<'EOF'
backend:
  listen:
    host: 127.0.0.1
    port: 7007
integrations:
  github: []
  gitlab: []
auth:
  providers:
    github: null
    gitlab: null
catalog:
  providers:
    rhaap:
      development:
        orgs: [Default]
        sync:
          jobTemplates:
            enabled: false
          ansibleGitContents:
            enabled: false
          pahCollections:
            enabled: false
    automationContent:
      owner: group:default/ansible
      registries:
        # 1. Public registry: no trust configuration at all.
        - name: quay-public
          url: https://quay.io
          repositories: [ansible/network-ee]
          auth:
            type: anonymous
        # 2. Local registry: verify against our signer.
        - name: lab-tls
          url: https://localhost:8443
          repositories: [demo/network-ee]
          caFile: ${TLS_CA_FILE}
          auth:
            type: anonymous
        # 3. Identical to #2 except the caFile line is absent.
        - name: lab-no-ca
          url: https://localhost:8443
          repositories: [demo/network-ee]
          auth:
            type: anonymous
EOF
```

Export the CA path so `${TLS_CA_FILE}` resolves, then start the portal:

```bash
export TLS_CA_FILE="$LAB/certs/ca.pem"
cd "$MONO"
yarn install --immutable
yarn start
```

The first start compiles the frontend; allow several minutes before expecting
`http://localhost:3000` to answer. The backend is reachable at
`http://localhost:7007` and listens only on `127.0.0.1:7007`.

## 7. Start the sign-in mock

Sync requires a signed-in user (anonymous callers are rejected -- that's deliberate, and why `/health` works without a token but sync doesn't).

Leave `yarn start` running in its terminal and use a **second terminal** here.
Exports from step 1 do not carry over to a new terminal, so restore the paths
first. The mock checkout must contain `aap-mock/Dockerfile`.

The build recipe below assigns the copied files to the image's `node` user.
This is needed when the checkout was created with `umask 077`: its source files
can be mode `600`, and the upstream Dockerfile otherwise copies them as `root`.
The recipe is stored in the lab directory; the dependency checkout stays unchanged.

```bash
export LAB="$HOME/tls-validation"
export MONO="$LAB/ansible-backstage-plugins"
export PORTAL="$LAB/automation-portal-local"

(
  set -eu
  if [ ! -f "$PORTAL/aap-mock/Dockerfile" ]; then
    printf 'Missing mock checkout: %s/aap-mock/Dockerfile\n' "$PORTAL" >&2
    exit 1
  fi

  cat > "$LAB/aap-mock.Containerfile" <<'EOF'
FROM docker.io/library/node:22-alpine
WORKDIR /app
COPY --chown=node:node package.json ./
RUN npm install --omit=dev
COPY --chown=node:node src ./src
ENV PORT=8099
EXPOSE 8099
USER node
CMD ["node", "src/index.js"]
EOF

  podman build -f "$LAB/aap-mock.Containerfile" \
    -t localhost/tls-validation-aap-mock "$PORTAL/aap-mock"

  if podman container exists tls-validation-aap-mock; then
    if [ "$(podman inspect --format '{{.State.Running}}' tls-validation-aap-mock)" = true ]; then
      printf 'The mock is already running; check its health before replacing it.\n' >&2
      exit 1
    fi
    podman rm tls-validation-aap-mock
  fi

  podman run -d --pull=never --name tls-validation-aap-mock -p 127.0.0.1:8099:8099 \
    -e PORT=8099 \
    -e AAP_PUBLIC_URL=http://localhost:8099 \
    -e AAP_MOCK_USERNAME=user \
    -e AAP_MOCK_PASSWORD=validation \
    -e AAP_TOKEN=validation-token \
    -e OAUTH_CLIENT_ID=portal-local-mock \
    -e OAUTH_CLIENT_SECRET=validation-secret \
    localhost/tls-validation-aap-mock

  for attempt in {1..30}; do
    if curl --noproxy '*' --fail --silent --max-time 2 -o /dev/null \
      http://localhost:8099/health; then
      printf 'Mock ready: HTTP 200\n'
      exit 0
    fi
    if [ "$(podman inspect --format '{{.State.Running}}' tls-validation-aap-mock)" != true ]; then
      podman logs tls-validation-aap-mock
      exit 1
    fi
    sleep 1
  done
  printf 'Mock did not become ready; inspect podman logs tls-validation-aap-mock.\n' >&2
  exit 1
)
```

Expect `Mock ready: HTTP 200`. The subshell stops if the build fails, and
`--pull=never` prevents Podman from trying to download this locally built image
from a registry at `localhost`. An error naming `/aap-mock` instead of the full
checkout path means `$PORTAL` was empty in that terminal.

On a retry, the block removes an existing **stopped** mock container after the
new image builds. If the mock exits during startup, its logs are printed
immediately. `EACCES` opening `/app/src/index.js` indicates the old root-owned
file permissions; rebuild using the ownership-aware recipe above.

The mock's host port is bound to IPv4 loopback. This avoids a rootless Podman
forwarding failure where an IPv6 connection to `localhost:8099` is accepted
and then reset even though the IPv4 endpoint is healthy. With the IPv4-only
binding, clients can fall back to `127.0.0.1` when resolving `localhost`.

## 8. Sign in and validate in the UI

Open:

```text
http://localhost:3000/automation-content?portalFrontend=legacy
```

Sign in with the appropriate credentials

1. On the content overview, find the **Execution environments** card.
   If you opened an image's detail view, use the **Execution environments**
   breadcrumb to return to the overview.
2. Click **Refresh** in the card's upper-right corner. The button changes to
   **Refreshing…** while the backend synchronizes all configured registries.
3. Read the **Content refreshed** notification. It lists each registry's
   discovered-artifact count or failure cause. It disappears after a few seconds.
4. Inspect the **Registries** card below the execution-environment list. Its
   **Last reconciled** timestamps and **last attempt failed** indicators update.
5. Confirm that content from `lab-tls` appears and `lab-no-ca` fails certificate
   verification. `quay-public` should also discover content when the public
   registry is reachable. The notification is a warning when any registry fails;
   that is expected because `lab-no-ca` is deliberately untrusted.

This UI's **Refresh** invokes the global `/sync` endpoint. There are no
per-registry sync buttons in this build. Use the API commands below when you
want to run and inspect each registry independently. Detailed certificate
failures appear in the refresh notification, sync response, and backend logs;
the registry card shows a fixed failure summary.

### API alternative

For a scripted check, copy the `Authorization: Bearer ...` value from any
successful content API request in DevTools (Network tab). The following block
prompts for the token without echoing it or placing its value in shell history.
It saves the complete JSON body from each registry sync in `$LAB/evidence/`.

```bash
export LAB="$HOME/tls-validation"
(
  set -euo pipefail
  API=http://localhost:7007/api/automation-content
  read -r -s -p 'Backstage token (without the Bearer prefix): ' TOKEN
  printf '\n'
  umask 077
  mkdir -p "$LAB/evidence"

  for registry in quay-public lab-tls lab-no-ca; do
    response="$LAB/evidence/$registry-sync.json"
    http_status="$(curl -q --noproxy '*' --fail-with-body --silent --show-error \
      --connect-timeout 5 --max-time 300 \
      -H "Authorization: Bearer $TOKEN" -X POST \
      "$API/registries/$registry/sync" \
      -o "$response" -w '%{http_code}')"
    if [ "$http_status" != 202 ]; then
      printf 'FAIL: %s returned HTTP %s instead of 202.\n' "$registry" "$http_status" >&2
      exit 1
    fi
    printf '\n%s: HTTP %s; complete response saved to %s\n' "$registry" "$http_status" "$response"
    jq . "$response"
  done

  for registry in quay-public lab-tls; do
    printf '\nChecking successful discovery for %s:\n' "$registry"
    jq -e '.status == "completed" and .discovered > 0' \
      "$LAB/evidence/$registry-sync.json"
  done
  printf '\nChecking certificate rejection for lab-no-ca:\n'
  jq -e '.status == "failed" and
    (.error | type == "string" and test("certificate|verify|self.signed|issuer"; "i"))' \
    "$LAB/evidence/lab-no-ca-sync.json"

  curl -q --noproxy '*' --fail --silent --show-error --max-time 10 \
    -H "Authorization: Bearer $TOKEN" "$API/registries" \
    | jq -e '.items | map(.name) | sort == ["lab-no-ca", "lab-tls", "quay-public"]'
)
```

Expect full responses for all three registries, followed by `true` for each
assertion. The block stops on an HTTP error, missing content, wrong registry
list, or a failure unrelated to certificate verification. The token is scoped
to the subshell and no authorization headers are written to the evidence files.

Tokens expire after roughly an hour; copy a fresh one if calls start returning 401.

## 9. Expected results

| Check                    | Registry      | Expected                                       |
| ------------------------ | ------------- | ---------------------------------------------- |
| Public CA, no config     | `quay-public` | sync completed, content discovered             |
| Private CA, `caFile` set | `lab-tls`     | sync completed, content discovered             |
| Private CA, no `caFile`  | `lab-no-ca`   | sync failed, certificate error names the cause |

Both per-registry sync responses return HTTP 202 regardless of outcome -- read the `status` field, not the HTTP code.

## 10. Acceptance checklist

- [ ] Commit SHA recorded
- [ ] Zot and the backend listen only on host loopback
- [ ] Only the server certificate and server key are mounted into Zot
- [ ] `.env` permissions are `0600`
- [ ] Certificates generated and verified against the CA
- [ ] `curl` returns HTTP 200 with the CA and exit code 60 without it
- [ ] `quay-public` syncs
- [ ] `lab-tls` syncs and shows content
- [ ] `lab-no-ca` is refused with a certificate error
- [ ] Content from `lab-tls` remains available after the `lab-no-ca` failure (connection isolation)
- [ ] All three complete sync responses and the relevant backend log lines are collected

Evidence to return: the recorded SHA, `quay-public-sync.json`,
`lab-tls-sync.json`, and `lab-no-ca-sync.json` from `$LAB/evidence/`, plus the
backend log lines mentioning the certificate refusal. Copy the evidence you
intend to return before running cleanup. Do not include tokens, private keys,
or `.env` files.

## 11. If something fails

| Symptom                                            | Cause and fix                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `curl` fails with hostname error                   | The SAN does not cover the host in the URL. Regenerate or connect via `localhost`.         |
| Portal refuses with "certificate" but `curl` works | `caFile` path is wrong or unreadable by the backend process. Use an absolute path.         |
| Sync returns 401                                   | Sign in again; the token or session expired.                                               |
| Sync fails with "connection refused"               | The registry container is not running: `podman ps`, then `podman logs tls-validation-zot`. |
| `yarn start` fails on install                      | The checkout is dirty or the lockfile is out of date; re-clone at the recorded SHA.        |
| Port already in use                                | Find the listener with `ss -tlnp \| grep <port>` and stop it.                              |

All API responses are JSON; inspect them with `jq` rather than reading raw output -- `jq '{status, error}'` is safer than trusting a 202 to mean success.

## 12. Cleanup

```bash
# stop the portal: Ctrl+C in its terminal
podman rm -f tls-validation-zot tls-validation-aap-mock

rm -rf "$LAB"          # removes the clones, certificates, and evidence
```

Check nothing is left behind:

```bash
podman ps -a | grep -E 'tls-validation' || echo "no containers left"
ss -tln | grep -E ':(3000|7007|8099|8443)\b' || echo "no ports held"
```

## 13. Known limitations

- Pre-merge build; not a supported release.
- No mutual TLS: this build has no client-certificate settings.
- The auth-realm rewrite case (a TLS registry advertising a plain-HTTP token endpoint, as Quay does behind a TLS-terminating proxy) is covered by the separate Quay fixture in the PR's original test guide, not by this one.

## Appendix: why Zot instead of Quay

Both prove certificate verification. They differ in what else they exercise:

- **Zot** terminates TLS itself and needs no database or proxy. It is the fastest path to the two checks.
- **Quay behind a TLS proxy** additionally exercises `rewriteAuthRealmHost`, because Quay advertises its token endpoint on its own plain-HTTP address. That shape is worth validating separately when the registry in question is Quay behind a load balancer.

For that case, use the Quay fixture from the PR's test guide, with one correction: the image tag is `quay.io/projectquay/quay:3.18.2` -- without the `v`.
