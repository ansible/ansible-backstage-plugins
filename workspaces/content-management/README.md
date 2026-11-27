# Content management workspace

Ansible automation content management for Red Hat Developer Hub / Backstage —
discovery, governance, trust and lifecycle for execution environments,
collections and future content types, over any OCI-compliant registry.

Mounted in the Automation Portal at **`/automation-content`**.

The frontend plugin also owns the **Collections** and **Git repositories**
experiences, mounted at `/self-service/collections` and
`/self-service/repositories`, plus their Scaffolder fields.

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

Collections, Git repositories, the Collections picker, and the SCM selector
are provided by `@ansible/plugin-automation-content`. Their route paths remain
stable. The root app mounts the legacy routes from this plugin, and the native
plugin registers the same pages and fields for RHDH. Cross-workspace interfaces
such as permissions, auth, and repository cache invalidation use the shared
Portal extension SDK packages.

Both backend packages are registered in the development backend at
`workspaces/portal-core/packages/backend/src/index.ts`. Catalog provider
configuration lives under `catalog.providers.automationContent` in the root
`app-config.yaml` (disabled by default).

## EE discovery developer preview

The deployment configuration below defaults EE discovery to off.
**Definitions** and **Create** are available from `/content/ee` in either state.
In a Portal Developer Preview deployment, set `CONTENT_MANAGEMENT=true`
in the Portal process environment and restart the host to turn on discovery.
The monorepo development app defaults discovery to on. Set the same variable
to `false` to exercise the off state.

In the effective RHDH app config, include these entries alongside the host's
other `app.extensions` entries. Keep both the `automation-content` and
`portal-scaffolder` frontend plugins loaded so the shared page can show
Definitions. Backstage replaces the entire list when a higher-priority config
file defines `app.extensions`.

```yaml
app:
  extensions:
    - sub-page:automation-content/images: ${CONTENT_MANAGEMENT:-false}
    - scaffolder-field:automation-content/ee-image-version: ${CONTENT_MANAGEMENT:-false}
    - scaffolder-form-field:automation-content/ee-image-version: ${CONTENT_MANAGEMENT:-false}
    - entity-header-layout:automation-content/ee-repository: ${CONTENT_MANAGEMENT:-false}
    - entity-content-layout:automation-content/ee-repository: ${CONTENT_MANAGEMENT:-false}
    - entity-detail-tab:automation-content/image: ${CONTENT_MANAGEMENT:-false}
```

Check the frontend app API version in the preview host. Version 0.16.8 or later
accepts the environment variable shorthand above. For older hosts, resolve
`CONTENT_MANAGEMENT` to a boolean during config generation and
write that value to all six entries. An unset variable resolves to `false`.

### Rollout checks

1. **Check the default.** Start with discovery off. Open `/content/ee` and verify
   it opens **Definitions** and **Create** works. Visit `/content/ee/images`
   directly and confirm the Images table and **Sync registries** are absent.
2. **Stage data.** [Configure a registry](#registry-configuration) and let
   scheduled sync run with discovery off. Synced repositories can appear in the
   general Catalog. Manual sync still follows
   `automationContent.manualSync.enabled` and the user's permissions.
3. **Enable discovery.** Set `CONTENT_MANAGEMENT=true`, apply the
   updated config, and restart Portal. Check that **Images** shows the staged
   data and opens image details. Register the **Add execution environment to
   Controller** template from `ansible-rhdh-templates` in the preview deployment
   and check that its image version picker loads.
4. **Turn discovery off.** Remove the companion template registration, set the
   switch to `false`, apply the updated config, and restart Portal. Repeat the
   default check and confirm the staged repository is still in the Catalog.

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

The optional `repositoryTags` entries add descriptive tags to the Catalog
metadata for exact repositories in that registry.

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

Images filters indexed repositories by **Source**, **Source Type**, and
**Status**. The image links open Catalog repository Components.
Existing digest Components remain available under their existing Catalog
permissions.

### Use an image in Controller

Choose **Use in Controller** from an image’s actions menu in either Images view
to use its representative version. To choose a different version, open image
details, select the version, and choose **Use in Controller**. Start **Add
execution environment to Controller** from the filtered Templates list.
The wizard prefills the execution environment name and tag. The **Tags**
picker lists the selected repository’s tags and shows the resulting pull
reference and image digest. If you start the template directly from Templates,
enter a pull reference. Choose a Controller organization and run the task with
your AAP sign-in. On success, the task links to the execution environment in
Controller.

Administrators register the template from [ansible-rhdh-templates][templates-repo].
For a disconnected deployment, mirror the repository and register the local
SCM location. The **Create** actions resolve the templates destination through
the shared `portalTemplatesRouteRef` contract.

[templates-repo]: https://github.com/ansible/ansible-rhdh-templates

The inventory and digest APIs require `ansible.execution-environments.view`.
An EE view grant does not authorize manual refresh. Operators need
`ansible.content.sync`, and repository refresh also requires the EE view grant.
Register `automation-content` in the host's RBAC plugin metadata list.

Manual refresh, including existing registry poll and sync API routes, is enabled
by default for authorized users. Set `automationContent.manualSync.enabled` to
`false` to disable manual refresh. Scheduled reconciliation runs independently.

Inventory refresh returns a scheduling acknowledgment. The last successful
reconciliation timestamp describes a registry or repository, independent of
any particular scheduling request. Repository refresh reports committed tag
changes. Incomplete scans retain previously indexed data. A signature finding
describes registry evidence and does not establish publisher identity or
cryptographic verification.

### Apply execution environment metadata

A certification job or an authorized operator can submit a JSON file for an
execution environment the portal has already indexed. The portal saves the
metadata in its database and applies it without contacting the registry, so
the same file works in an air-gapped installation.

Save a complete metadata revision in a file such as `overlay.json`. The request
body can be up to 256 KiB, and metadata may be nested at most 64 levels deep.

```json
{
  "version": "2.1",
  "metadata": {
    "summary": "Review completed"
  }
}
```

Use the image's digest-qualified `ref` from the portal response. Set
`PORTAL_URL` to the portal base URL, `EE_REF` to that ref, and `PORTAL_TOKEN`
to a token authorized for `ansible.content.sync` and
`ansible.execution-environments.view`.

```sh
curl --fail-with-body --request PUT \
  --header "Authorization: Bearer ${PORTAL_TOKEN}" \
  --header 'Content-Type: application/json' \
  --data-binary @overlay.json \
  "${PORTAL_URL}/api/automation-content/execution-environments/${EE_REF}/metadata-overlay"
```

The execution environment detail API returns the current revision as
`metadataOverlay`. The latest newly applied version is current regardless
of how its name sorts. Retrying a saved version with identical metadata is
safe. Supply a new version when the metadata changes.
