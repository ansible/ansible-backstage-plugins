# Content workspace

Ansible automation content management for Red Hat Developer Hub / Backstage —
discovery, governance, trust and lifecycle for execution environments,
collections and future content types, over any OCI-compliant registry.

Mounted in the Automation Portal at **`/automation-content`**.

> **Status: proof of concept, under active development.** Interfaces, config
> shape, API routes and entity shape all still move without notice. Nothing
> here is supported or ready to depend on.

Imported from the standalone [automation-content-plugins][poc-repo] proof of
concept (branch `ANSTRAT-1758-poc`) and being adapted to the Portal SDK.

## Plugins

| Directory                                           | Package                                                     | Role                   |
| --------------------------------------------------- | ----------------------------------------------------------- | ---------------------- |
| `plugins/automation-content`                        | `@ansible/plugin-automation-content`                        | Frontend plugin        |
| `plugins/automation-content-backend`                | `@ansible/plugin-automation-content-backend`                | Backend plugin         |
| `plugins/automation-content-common`                 | `@ansible/automation-content-common`                        | Common library         |
| `plugins/catalog-backend-module-automation-content` | `@ansible/plugin-catalog-backend-module-automation-content` | Catalog backend module |
| `plugins/content-model`                             | `@ansible/content-model`                                    | Common library         |
| `plugins/content-type-execution-environment`        | `@ansible/content-type-execution-environment`               | Common library         |

Both backend packages are registered in the development backend at
`workspaces/portal-core/packages/backend/src/index.ts`. Catalog provider
configuration lives under `catalog.providers.automationContent` in the root
`app-config.yaml` (disabled by default).

## How content gets here

Content is discovered from configured OCI registries. Execution environments
built with a content manifest (generated inside the image by the image's own
`ansible-core` at build time) report exact contents; anything derived by
inspecting an image afterwards is approximate and labelled as such. Design
decision records for the model live in [`docs/adrs/`](docs/adrs/).

The original standalone repository documents the full local end-to-end setup —
building an execution environment with a content manifest, running a local Quay,
and pushing images and manifests — see its README and `docs/guides/` on the
[poc branch][poc-repo]. The portal development environment for this monorepo
lives in `workspaces/portal-core`.

## Transport trust

Registry connections verify TLS by default and refuse plain HTTP. A local
plain-HTTP registry (Quay, zot, `registry:2`) needs `insecure: true` on its
entry — the single, explicit opt-out, which also disables certificate
verification for that registry and is warned about at startup. A registry
behind a private CA keeps verification on via `caFile` instead. See
[ADR-006](docs/adrs/006-tls-verification-by-default.md) for the full policy,
and [`dev/tls/`](dev/tls/) for a portal-level demo of all three cases —
verified HTTPS, the plain-HTTP opt-out, and an untrusted certificate refused
by name.

[poc-repo]: https://github.com/ansible/automation-content-plugins/tree/ANSTRAT-1758-poc
