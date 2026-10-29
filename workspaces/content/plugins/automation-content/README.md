# automation-content

The automation-content plugin is the discovery frontend for Ansible content
sourced from configured OCI registries. It catalogs execution environments and
collections as they exist in the registries, with per-image content
enumeration, item documentation, and registry health visibility.

## Pages

All routes live under `/automation-content`:

| Route                                                         | Page                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `/automation-content`                                         | Landing: registry health cards, inventory counts, sync (superuser)                   |
| `/automation-content/execution-environments`                  | EE catalog. Defaults to classified EEs; "Show all images" reveals the full inventory |
| `/automation-content/execution-environments/:ref`             | EE details: tags, contents, provided collections and plugins                         |
| `/automation-content/collections`                             | Collections catalog grouped by FQCN with latest-version badges                       |
| `/automation-content/collections/:namespace/:name`            | Collection details: versions, providing environments, contents                       |
| `/automation-content/collections/:namespace/:name/docs/:item` | Content item documentation (ansible-doc style)                                       |

The same components render in both the new frontend system (`alpha.tsx`
blueprints, the default host) and the legacy app entry, so both hosts serve
identical URLs.

## Requirements

The frontend is a discovery surface only — it holds no credentials and talks
exclusively to the portal backend through `automationContentApiRef`:

- `@ansible/plugin-automation-content-backend` — serves the content API the
  pages read (inventory, enumeration, item docs, registry health, sync).
- `@ansible/plugin-catalog-backend-module-automation-content` — ingests
  registry content into the catalog; the pages use catalog entities only for
  favorites/stars.

EE authoring (the build dialog) and SCM token handling are intentionally out
of scope; they remain in `@ansible/portal-scaffolder`.

## Configuration

Registries are configured through the catalog provider (see
`catalog-backend-module-automation-content`):

```yaml
catalog:
  providers:
    automationContent:
      registries:
        - name: my-registry
          url: https://registry.example.com
          repositories: [ansible/network-ee, ansible/creator-ee]
          auth: { type: anonymous }
```

The backend plugin's README documents authentication options (anonymous,
username/password, TLS verification) for registry connections.

## Behavior notes

- **EE catalog scope:** rows default to artifacts the backend classifies as
  execution environments. Unclassified images stay reachable through the
  "Show all images" toggle, because the classification requires builder
  labels or manifest referrers that not every legitimate EE carries.
- **Inventory fidelity:** images whose contents could not be enumerated show a
  distinct "Contents unknown" badge; counts are never presented as complete
  when the inventory is partial.
- **Sync gating:** registry sync actions are rendered only for superusers and
  the backend rejects sync requests from non-superusers with 403.

## Local development

Run `yarn start` from the repository root and open
[/automation-content](http://localhost:3000/automation-content). For a
self-contained registry, `scripts/dev-up.sh --registry` (repository root)
starts a local OCI registry seeded with demo images and writes the matching
`app-config.local.yaml`.

For sign-in without external identity providers, enable the guest provider in
`app-config.local.yaml`:

```yaml
auth:
  providers:
    guest: {}
```
