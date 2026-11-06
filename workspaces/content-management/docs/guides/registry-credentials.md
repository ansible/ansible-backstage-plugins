# Registry credentials

Registry connections authenticate with credentials the plugin never persists and
never fetches from Kubernetes. They live in an OpenShift Secret, arrive through
the container
environment at startup, and are resolved into Backstage configuration before
any plugin sees them; every log line, error message and API response is then
redacted against them. Resolved values, including exchanged bearer tokens, are
held in process memory for registry requests and are not persisted by the
plugin. This guide covers where the credentials live, how they
reach the plugin, which permissions the deployment does and does not need, how
rotation works, and what the redaction boundary guarantees. TLS verification is
a separate concern — see [Registry TLS verification](registry-tls.md).

## How credentials reach the plugin

```text
OpenShift Secret in the portal's namespace
  → container environment, resolved by Kubernetes at pod start
    → Backstage configuration, via ${VARIABLE} substitution in app-config
      → registry clients, built once at plugin startup
```

Each arrow is one-way and happens once:

- Kubernetes resolves the Secret's values into environment variables when the
  backend container starts
- Backstage's config loader substitutes `${VARIABLE}` references with those
  environment variables, before the registry configuration is read
- the catalog provider and the content API each build their registry clients
  from the resolved configuration, once, at startup

The automation-content plugin never calls the Kubernetes API — not to read the
Secret, not to watch it, not for anything credential-related. That is what
keeps its runtime permission requirements at zero: a pod handed its
credentials as environment variables needs no `get`, `list`, or `watch` access
to Secrets.

## Where credentials are configured

Registry entries live under `catalog.providers.automationContent.registries`
in the root `app-config.yaml`:

```yaml
catalog:
  providers:
    automationContent:
      registries:
        - name: corporate-registry
          url: https://registry.example.com
          repositories:
            - automation/network-ee
          auth:
            type: basic
            username: ${CONTENT_REGISTRY_USERNAME}
            password: ${CONTENT_REGISTRY_PASSWORD}
```

The `auth` block selects one of three modes:

- `basic` — a `username` and `password`
- `bearer` — a pre-issued registry `token`:

  ```yaml
  auth:
    type: bearer
    token: ${CONTENT_REGISTRY_TOKEN}
  ```

- `anonymous` — no credentials at all; a local `zot` or `registry:2` needs
  nothing more

Variable names are a convention of this repo's example configuration, not a
requirement. Backstage's `${VARIABLE}` substitution connects whichever
variable the deployment sets to whichever field the configuration declares —
pick names, keep them consistent between the deployment and `app-config.yaml`,
and never write a literal credential into a config file. Config files carry
references; the Secret carries values.

Scope the registry account to read access on the repositories being
discovered. The plugin lists repositories, reads manifests and fetches blobs —
it never pushes, tags, or deletes.

### Which token is which

A deployment ends up holding three unrelated credentials, and a mixed-up
incident report wastes everyone's time:

- **the registry credential** — this guide's subject: authenticates the
  portal to the registry for discovery
- **the Backstage sign-in token** — authenticates a portal user to portal
  routes; unrelated to registries
- **the service account token** — the pod's Kubernetes identity, used by the
  platform, not by this plugin

## Delivering the Secret on OpenShift

Create an `Opaque` Secret in the same namespace as the portal workload:

Create the password file without a trailing newline:

```shell
IFS= read -r -s CONTENT_REGISTRY_PASSWORD
printf '%s' "$CONTENT_REGISTRY_PASSWORD" > /path/to/protected/registry-password
```

```shell
kubectl create secret generic automation-content-registry \
  --from-literal=username='registry-user' \
  --from-file=password=/path/to/protected/registry-password \
  --namespace rhdh
```

The password file should contain only the password and should be protected
like the Secret itself. Do not put the password directly in this command or in
the configuration file.

Reference the keys from the backend container's environment:

```yaml
env:
  - name: CONTENT_REGISTRY_USERNAME
    valueFrom:
      secretKeyRef:
        name: automation-content-registry
        key: username
  - name: CONTENT_REGISTRY_PASSWORD
    valueFrom:
      secretKeyRef:
        name: automation-content-registry
        key: password
```

### On the RHDH Helm chart

The chart exposes an existing Secret to the backend container directly:

```yaml
upstream:
  backstage:
    extraEnvVarsSecrets:
      - automation-content-registry
```

Every key of a Secret named here becomes an environment variable, so the
Secret's keys must be named as the variables — `CONTENT_REGISTRY_USERNAME` and
`CONTENT_REGISTRY_PASSWORD`, not `username` and `password` — when using this
convenient whole-Secret mapping. The Secret should hold only
registry-credential keys, since all of its keys are exposed. Setting an array
in Helm replaces it wholesale: merge with any entries already in
`extraEnvVarsSecrets` rather than overwriting them.

For different Secret key names, use `extraEnvVars` with a
`valueFrom.secretKeyRef` entry instead. That maps only the required keys and
never puts literal credentials in Helm values:

```yaml
upstream:
  backstage:
    extraEnvVars:
      - name: CONTENT_REGISTRY_USERNAME
        valueFrom:
          secretKeyRef:
            name: automation-content-registry
            key: username
      - name: CONTENT_REGISTRY_PASSWORD
        valueFrom:
          secretKeyRef:
            name: automation-content-registry
            key: password
```

Merge these entries with the chart's existing `extraEnvVars` entries rather
than replacing the array; those defaults may be required by the deployment's
existing app-config.

The registry configuration itself goes wherever the deployment's app-config
goes (`upstream.backstage.appConfig` for the chart).

## Required access: the RBAC boundary

**The portal's runtime service account needs no Kubernetes permissions for
this feature.** Kubernetes resolves `secretKeyRef` references for the
container; the running process only ever sees resolved environment variables.
The responsibilities sit with people and automation instead:

| Who                                             | Does                                    |
| ----------------------------------------------- | --------------------------------------- |
| Secret administrator or provisioning automation | create and rotate the registry Secret   |
| Deployment administrator or GitOps automation   | reference the Secret, roll out the pods |
| Portal runtime service account                  | run the backend with injected values    |
| Registry account                                | read the discovered repositories        |

Automation that manages the Secret directly — rather than a human running
`kubectl` — needs a namespace-scoped Role naming that one Secret:

The Role below assumes the Secret has already been created by a separate,
narrowly scoped bootstrap process. It grants read and update access to that
one existing Secret; it intentionally does not grant `create`.

```yaml
kind: Role
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  namespace: rhdh
  name: automation-content-registry-secret-manager
rules:
  - apiGroups: ['']
    resources: ['secrets']
    resourceNames: ['automation-content-registry']
    verbs: ['get', 'patch', 'update']
```

Two cautions from how Kubernetes permissions actually behave:

- `list` and `watch` on Secrets are read access in effect — a List response
  includes every Secret's contents, so they are not "safe" additions to a Role
- permission to create or modify workloads in a namespace carries access to
  every Secret that can be mounted or referenced there. The boundary that
  protects the registry credential is the deployment itself: whoever can
  change the portal's pod spec can redirect its credentials

## Rotation

1. Create the replacement credential at the registry, with the same read-only
   scope
2. Update the Secret
3. Roll out new backend pods
4. Confirm discovery succeeds — a manual sync from the portal, or the next
   scheduled refresh
5. Revoke the old credential at the registry

The order keeps discovery continuously credentialed: the old credential stays
valid until the new one is proven working.

The rollout step is not optional. A running container does not see updates to
a Secret it consumed as environment variables, and Backstage reads its
configuration once at startup — rolling new pods is the only thing that picks
up either change. On OpenShift the restart is a rolling one:

```shell
kubectl rollout restart deployment/rhdh-backstage -n rhdh
```

## Redaction and diagnostics

The backend builds one redactor from the configured connections, and every
output path passes through it. Registered against it, for every registry:

- the configured `password` and `token`
- the base64 form the client puts on the wire for basic authentication
- a password embedded in the registry URL, in both its percent-encoded and
  decoded spellings
- bearer tokens minted by the registry's token-exchange flow, registered the
  moment the client receives them

Matched text is replaced with `[REDACTED]`. URLs that reach diagnostics are
reduced to scheme, host and path — userinfo, query and fragment are removed,
since each can carry a credential — and that same public form is what the
registry listing serves and what catalog entities link to.

A failed sync still reports the real reason — a TLS rejection, a 401, a
timeout — walking the full error cause chain, with credentials replaced. The
registry listing reports a fixed failure summary and keeps the detailed cause
to backend logs and authenticated sync responses, for the reasons the
[TLS guide](registry-tls.md) covers.

What this is not: a general-purpose secret detector. The redactor recognises
the registered credential values and their known encodings — values shorter
than two characters are not registered, since shredding ordinary words out of
every log line protects nothing. Usernames are not treated as secrets; they
appear in logs and audit trails by design.

## The process boundary

Backend plugins run in one process. An environment variable injected for this
plugin is visible to every plugin in that process, not just to this one —
scope the Secret to registry credentials, and treat the backend deployment,
not the plugin, as the trust boundary: whoever can read the portal's
environment can read its registry credentials, exactly as they can read the
platform's own `BACKEND_SECRET`. This is the platform-wide configuration
boundary at work — credentials are infrastructure, pre-boot,
deployment-owned
([ADR-002](../../../../docs/adrs/host/002-config-boundary-rule.md)) — never
Day-2 settings-page material.

## Local development

Copy `.env.example` to `.env` and fill in the variables the example
configuration references — `CONTENT_REGISTRY_USERNAME`,
`CONTENT_REGISTRY_PASSWORD`, `CONTENT_REGISTRY_TOKEN`. `yarn start` loads
`.env` via dotenv-cli before the backend boots, so the same `${VARIABLE}`
references resolve locally that resolve in a deployment.
