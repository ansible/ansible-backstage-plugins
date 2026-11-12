# Content management workspace

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
Registry connections verify TLS by default — see
[`docs/guides/registry-tls.md`](docs/guides/registry-tls.md) for the opt-out
and private-CA trust. Registry credentials arrive through the container
environment and are redacted from every log, error and API response — see
[`docs/guides/registry-credentials.md`](docs/guides/registry-credentials.md)
for Secret delivery, rotation and the RBAC boundary.

## Registry configuration

Registries are **install-time configuration only** — there is no Portal or API
route that creates or edits one (the SSRF trust boundary for this plugin).
Configuration lives under `catalog.providers.automationContent.registries`:

```yaml
catalog:
  providers:
    automationContent:
      registries:
        - name: quay
          url: https://quay.io
          repositories: [ansible/ee]
          repositoryTags:
            - repository: ansible/ee
              tags: [networking, production]
```

The optional `repositoryTags` entries add descriptive tags to exact
repositories in that registry. They appear in the Images **Tag** filter and
the repository's Catalog metadata. The **Version** filter uses OCI container
tags. Repositories without configured descriptive tags still appear when
**All tags** is selected.

A registry `url` must be an absolute `http`/`https` URL with **no** embedded
credentials, query, or fragment. Anything else — including `file://`,
scheme-less strings like `quay.io`, URLs with userinfo, or trailing
whitespace that would break requests later — fails **backend startup** with an
error naming the offending registry. Surrounding whitespace and scheme case
are normalized to canonical form. Credentials belong in the `auth` fields,
never the URL. `POST /automation-content/config/validate` checks a
configuration document against the same rule before you install it.

The original standalone repository documents the full local end-to-end setup —
building an execution environment with a content manifest, running a local Quay,
and pushing images and manifests — see its README and `docs/guides/` on the
[poc branch][poc-repo]. The portal development environment for this monorepo
lives in `workspaces/portal-core`.

[poc-repo]: https://github.com/ansible/automation-content-plugins/tree/ANSTRAT-1758-poc

## Execution environment images

The native **Execution Environments** page opens at `/content/ee`. Content
Management provides **Images**, and Content Development provides **Definitions**.
The page's **Create** action opens the host Scaffolder template catalog.

Load the `@ansible/plugin-automation-content/alpha` and
`@ansible/portal-scaffolder/alpha` features and the Portal contributions provider.
Follow the root app config to order the native sub-pages and point the Portal
sidebar at `page:automation-content/ee`.

Images queries indexed repositories by source, tag, version, and configured
registry owner. Its favorites and links use real Catalog repository Components.
Existing digest Components remain available under their existing Catalog
permissions.

The inventory and digest APIs require `ansible.execution-environments.view`.
An EE view grant does not authorize manual refresh. Operators need
`ansible.content.sync`, and repository refresh also requires the EE view grant.
Register `automation-content` in the host's RBAC plugin metadata list.

Manual refresh, including existing registry poll and sync API routes, defaults
to disabled. Deployments that have verified a separate, append-only audit sink
may explicitly enable `automationContent.manualSync.enabled`. The default
Backstage audit logger does not provide that guarantee. Scheduled reconciliation
continues independently.

Inventory refresh returns a scheduling acknowledgment. The last successful
reconciliation timestamp describes a registry or repository, independent of
any particular scheduling request. Repository refresh reports committed tag
changes. Incomplete scans retain previously indexed data. A signature finding
describes registry evidence and does not establish publisher identity or
cryptographic verification.
