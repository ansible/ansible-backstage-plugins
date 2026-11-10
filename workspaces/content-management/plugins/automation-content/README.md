# automation-content

The automation-content plugin is the discovery frontend for Ansible content
sourced from configured OCI registries. It catalogs execution environments and
their contents as they exist in the registries, with per-image content
enumeration, item documentation, and registry health visibility.

## Pages

All routes live under `/content`:

| Route                                  | Page                                                                |
| -------------------------------------- | ------------------------------------------------------------------- |
| `/content`                             | Redirect to the images catalog                                      |
| `/content/ee`                          | Images catalog with Images, Definition files, and Create tabs       |
| `/content/ee/:ref`                     | EE details: tags, All Content tab, provided collections and plugins |
| `/content/ee/catalog/:namespace/:name` | Definition-file details: README, Builder definition and source      |

The old `/automation-content` root and execution-environment paths redirect to
their `/content` equivalents. There is no separate landing page. Registry sync
is available from the catalog header ("Sync registries") and image actions to
users with `ansible.content.sync`. The standalone collections catalog that
briefly lived at `/content/collections` was removed per the 2026-11-06
re-review scope fence; the pre-existing self-service Collections experience
remains the left-navigation collections area.

The same components render in both the new frontend system (`alpha.tsx`
blueprints, the default host) and the legacy app entry, so both hosts serve
identical URLs.

## Requirements

Registry discovery uses the portal backend through `automationContentApiRef`;
the browser does not contact registries directly:

- `@ansible/plugin-automation-content-backend` — serves the content API the
  pages read (inventory, enumeration, item docs, registry health, sync).
- `@ansible/plugin-catalog-backend-module-automation-content` — ingests
  registry content into the catalog. The pages use catalog entities for
  favorites/stars and matching collection metadata, not inventory truth.

Definition files also use catalog entities for their definitions, ownership,
and source links. Missing inline README/definition content is fetched through
the existing catalog backend SCM endpoint. That endpoint retains its existing
Ansible-view and catalog-read requirements; content-view access alone does not
grant source-file access.

The Definition files and Create tabs reuse the Portal SDK's EE authoring
components. The build flow forwards the requesting user's SCM token through
the established backend flow without persisting it.

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

- **Images catalog scope:** the default view shows classified execution
  environments; the all-images toggle includes unclassified images. Classification
  requires builder labels or manifest referrers that not every legitimate EE
  carries.
- **Inventory fidelity:** images whose contents could not be enumerated show a
  distinct "Contents unknown" badge; counts are never presented as complete
  when the inventory is partial.
- **View gating:** `ansible.content.view` gates the content views and API reads.
- **Sync gating:** manual sync and drift polls require a signed-in user and
  `ansible.content.sync`. Service credentials alone cannot invoke these actions.
- **Sync scope:** an image row or detail-page Sync resolves and inspects only
  that repository's current `latest` image. It does not scan the registry or
  other tags' image contents. Header and definition-tab Sync remain separate
  registry-wide actions. A missing `latest` tag on row Sync is reported
  without falling back to the old digest.
- **Sync results:** image-level Sync refreshes the target's metadata and collection
  contents. Details follow the new digest when `latest` moves. Failed reconciliation
  retains the previous inventory; unrelated images are not marked freshly synced.
- **Optional inventory:** unreadable optional content manifests leave contents
  unknown. Verified inventory can be retained for the same digest, but is never
  copied from an old digest to a new image.
- **Missing metadata:** collection status, publisher, signing, and source use
  `—` when absent. They are not inferred from names or registries.

The host must grant content permissions through its configured RBAC roles;
signing in does not automatically grant them. This plugin does not add a default
role, administrator access, or catalog create/delete permissions. Catalog
creation and unregister remain subject to their existing guards. Builds and
template actions still require their real SCM or AAP credentials. Existing
Guest-provider configuration is unchanged.

## Local development

Run `./install-deps` from the repository root, configure a reachable registry
in the gitignored `app-config.local.yaml`, then run `yarn start` and open
[/content/ee](http://localhost:3000/content/ee). The backend serves on port 7007.
Use the registry's actual HTTP/HTTPS scheme. Verified HTTPS is the default;
use `caFile` to trust a local CA. `insecure: true` permits plain HTTP or skips
certificate verification and is for local development only.

For sign-in without external identity providers, enable the guest provider in
`app-config.local.yaml`:

```yaml
auth:
  providers:
    guest: {}
```

The local definition fixture is
`dev/fixtures/networking-ee.catalog.yaml`. It does not build an image or
establish a production image-to-definition association.

See [the page data contract](../../docs/page-data-contract.md#implementation-follow-ups-for-the-pull-request)
for outstanding Controller-template, definition-association, metadata, and
signing integrations. Visible controls do not establish that those integrations
are complete.
