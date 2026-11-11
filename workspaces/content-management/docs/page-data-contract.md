# Automation content UI — page data contract

Locked contract for the migrated UI. Implementation lanes must follow this
document; changes require orchestrator approval. Companion to
[ui-conversion-playbook.md](ui-conversion-playbook.md) (presentation rules).

## Context

The migration replaces the drill-down UI with Tina's prototype catalog pages.
The prototype pages read **Backstage catalog entities** that model _EE
definitions_ (git-authored recipes). Our content backend serves **registry
artifacts** (immutable images) — a different shape. This contract defines what
each page renders and where every field comes from, so the presentation can be
Tina's while the data stays backend-accurate.

Three data sources, in priority order:

1. **Content backend API** — `AutomationContentClient` (`src/api.ts`), mounted
   via `automationContentApiRef`. Authoritative for inventory, contents,
   documentation, provenance and sync. All API calls go through the
   authenticated Backstage fetch (`fetchApi`); the frontend never talks to a
   registry directly.
2. **Backstage catalog** — definition-file entities, favourites/stars, and
   entity ownership display. Never the source of registry-image inventory truth.
3. **Nothing else.** No direct SCM, registry, or proxy calls.

## Identity and matching rules

- The EE identity is its **digest-scoped ref** (`registry/repo@sha256:…`).
  Carry it through navigation and links; never navigate by tag alone.
- A collection occurrence is scoped to the EE that ships it
  (`fqcn` + `version` + providing artifact). The same collection legitimately
  appears in several EEs; deduplicate for display by grouping on
  `fqcn`, aggregating `providedBy`, never by silently dropping occurrences.
- Catalog stars are matched to backend EEs by the entity annotations emitted
  by `OCIRegistryEntityProvider` (read
  `workspaces/content-management/plugins/catalog-backend-module-automation-content/src/OCIRegistryEntityProvider.ts`
  for the exact annotation names and entity naming scheme). If no catalog
  entity matches an EE, hide the star toggle for that row — never block the
  row.

## Page contracts

### EE catalog (`/content/ee`)

Mounted at the content workspace's own endpoint per the 2026-11-02 sync
decision endorsed by Ganesh. The content workspace owns EE browsing, image
details, and definition-file management. The former portal-scaffolder EE UI
is retired; its static, dynamic-plugin, and native mounts are redirects only.
The existing permission-gated Execution Environments sidebar item now links to
`/content/ee`, retaining `executionEnvironmentsViewPermission`; the configured
native portal navigation links there too. Destination pages enforce
`ansible.content.view`, and sync still requires `ansible.content.sync`.
`/content` and `/automation-content` redirect to `/content/ee`; there is no
separate content landing page or Content navigation item.
The EE catalog header owns the manual Sync action ("Sync registries"), which
opens the existing registry-selection dialog on every view — images,
definition files. Per-registry results surface as portal
notifications.

The bespoke Create tab, template list, and WizardCard are deleted. The header's
**Create** link opens the stock Software Templates page at `/create` (the
legacy app's `ScaffolderPage` mount and the native scaffolder page's default
path), not the Portal's bespoke `/self-service` list. This uses the accepted
plain-link fallback: the pinned templates sub-page validates `groups` with
`createZodV4FilterPredicateSchema()` from `@backstage/filter-predicates`, but its
`$contains` operator matches array elements, not substrings in string
`spec.type`. `$hasPrefix` would not preserve the old substring predicate.
No approximate group or unsupported page-wide `templateFilter` is configured;
other templates remain visible. BaseImagePicker, CollectionsPicker, and
EEFileNamePicker registrations are retained for the stock wizard.

### Compatibility redirect map

All redirects replace the history entry. Namespace-qualified definition paths
retain their identity; old unqualified names have no guaranteed namespace or
digest mapping and return to the catalog rather than guessing an image ref.

| Old URL                                                                   | Destination                                              |
| ------------------------------------------------------------------------- | -------------------------------------------------------- |
| `/content`, `/automation-content`                                         | `/content/ee`                                            |
| `/automation-content/execution-environments`                              | `/content/ee`                                            |
| `/automation-content/execution-environments/:ref`                         | `/content/ee/:ref` (encoded digest-scoped ref preserved) |
| `/self-service/ee`, `/self-service/ee/catalog`, `/self-service/ee/create` | `/content/ee`                                            |
| `/self-service/ee/catalog/:namespace/:name`                               | `/content/ee/catalog/:namespace/:name`                   |
| `/self-service/ee/*` (including unqualified details and unknown subpaths) | `/content/ee`                                            |
| `/self-service/catalog/:templateName` (old EE definition detail)          | `/content/ee`                                            |
| `/content/ee/create` (retired Create tab bookmark)                        | `/create`                                                |

`/content/ee` selects the Images browse tab; `/content/ee/catalog` selects
Definition files. Collection, repository, template, and history pages remain
owned by portal-scaffolder and are not retired by this cutover. `EEPage` and
`eeRouteRef` remain public compatibility mounts for existing host configuration,
not management UI.

Tina's `ImagesCatalogPage` layout, artifact data:

| UI element               | Source / mapping                                                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Row identity             | `repository` (+ `registry` as secondary text)                                                                                                                                                                                   |
| Source, Source type      | Registry display name in one column; the derived source label (`External registry` / `Definition file`) as a badge in a separate column. A definition-file source requires an explicit association, not an inferred name match. |
| Freshness                | `lastReconciledAt` (relative time)                                                                                                                                                                                              |
| Inventory fidelity badge | `enumeration.status` + `enumeration.source`; `contentsKnown` false ⇒ "contents unknown" badge, never render counts as complete                                                                                                  |
| Volume indicators        | `counts.collections` / `counts.plugins` labelled approximate when `enumeration.status !== 'complete'`                                                                                                                           |
| Status                   | Last reconciliation result and age in a small outlined pill badge with a semantic status icon; Stale currently uses a 24-hour frontend threshold. Missing history is displayed as Syncing, not verified active-job telemetry.   |
| Classification           | `classification.type` when available; never append a missing confidence value                                                                                                                                                   |
| Search / filter          | client-side search over the loaded page, plus the all-images toggle; no facet sidebar                                                                                                                                           |
| Favourites               | catalog stars (matching rules above)                                                                                                                                                                                            |
| Row actions              | Visible favourite star; menu with Use in Controller and Sync. The image name links to details. Sync reconciles all image tags in this repository and requires a signed-in user with `ansible.content.sync`.                     |

Tags and digests are displayed in image details, not in the catalog table.
The client uses server pagination with 10, 20, or 50 rows per page. Changing the
page size returns to page 1; no pre-pagination response fallback remains.
Image, Source, Source type, and Last synced sort server-side (`sort`/`order`
query parameters) across the full result set before pagination, so sorting
never reorders only the visible page; Contents and Status are not sortable.

Content view/sync permissions come from the host's configured RBAC roles; no
default role is added for signed-in users. Manual sync and drift-poll endpoints
require a user identity and `ansible.content.sync`, rejecting anonymous and
service-only requests. Guest configuration, unrelated administration, and
catalog create/unregister permissions stay under their existing policies.
Downstream SCM and AAP credential requirements remain.

### EE details (`/content/ee/…`)

Image details follow the selected-image branch in Tina's
`ExecutionEnvironments/catalog/ImagesCatalogPage.tsx`. Her separate
`catalog/EEDetailsPage.tsx` is the definition-file view, not the image view.

| Tab                | Content                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Overview           | Compact metadata list with source/status labels, registry, digest, tags, pull reference with a standalone copy control, classification, available inventory metadata, and last synchronization time. Status uses a small outlined pill badge with a semantic icon; source and metadata badges retain BUI's native shape. The image menu does not contain a duplicate copy action.                                                          |
| All Content        | `getContents(ref)` — columns Collection, Type, Version, Status, Publisher, Signing, Source, Contents. The Type column renders the manifest-derived entry type (`collection` today; other kinds appear when the index reports them), `—` when the field is absent. Content counts form one summary, not separate count columns. Missing metadata uses `—`; never infer certification or signing. `N/A` is reserved for inapplicable values. |
| Item documentation | `getContentItem(fqcn, inArtifact)` — description, notes, options tree, examples, returns. This must preserve the old `ContentItemView` capability (ansible-doc style rendering), including the `variants` fallback behaviour in `AutomationContentClient.getContentItem`                                                                                                                                                                   |

Overview and All Content are the only image-details tabs. Collection-level
content/documentation views and existing direct documentation links remain
supported. Contents that are unknown or partial must be explained, but the
routine raw `complete inventory · build-time-manifest` readout is not part of
the reviewed design.

Row and detail-page Sync reconcile the selected image's entire repository:
enumerate image tags, HEAD each, inspect manifests/configs and reconcile added,
moved and deleted tags in one transaction. Signature/attachment tags are excluded
from image discovery. Other repositories and registry-wide freshness are unchanged.
The response includes added/removed/moved tag and refreshed digest counts; its
`ref` selects the original digest if it survives, otherwise `latest`'s digest,
otherwise a remaining digest (or the original ref if the repository is empty).
The `tag: latest` field is legacy compatibility, not a restriction on sync.
No `latest` tag is required. A missing or out-of-scope indexed reference returns
a structured 404 with `ARTIFACT_NOT_FOUND`. Core manifest/config read failures
preserve the previous index; invalid metadata retains existing same-digest rows.
Unavailable optional inventory remains unknown;
verified inventory may be retained for the same digest, never copied to a new
digest. Header and registry-selection Sync remain registry-wide actions.

Readme-from-git, links cards, and resources cards remain
**deferred** (no git readme exists for registry artifacts). Build/edit
actions moved into scope — see the capability register below.

For definition-file-origin images, Tina's `portalDefinitionName` link targets
the definition entity's details; it is distinct from her future external
definition-file tab. Porting that definition details view is approved as UI
work. The production image API/provider does not yet expose the image-to-
definition association. Use an explicit catalog-entity relationship when that
backend connection is implemented; do not infer one from image or registry
names. The definition page must not be confused with image details.

Definition details prefer inline README and Builder definition content in
`spec.readme` and `spec.definition`, respectively. When those fields are absent,
they read source files through the existing catalog
backend endpoint, using the entity's source location and SCM-provider
annotations. GitLab project namespaces may contain multiple groups. This
fallback requires the endpoint's existing Ansible-view and catalog-read
permissions, in addition to the content page's view permission; it does not
grant new access. Denied access, missing files, integration-authentication
failures, and unavailable services have distinct messages and a retry action.

**Scope decision (2026-10-29):** EE definition workflows are retained in
this plugin. Tina's prototype is the authoritative design. A different
team (or this one, later) populates the definition data; the views ship
now.

### Collections outside execution environments (removed)

The standalone collections catalog (`/content/collections`) and
collection-details pages added earlier on this branch were removed per the
2026-11-06 re-review scope fence: the pre-existing self-service Collections
experience remains the left-navigation collections area, and this feature's
collection scope is listing the collections inside an execution environment
(the All Content tab above). `listCollections` remains in the API client and
the backend contract; the standalone pages, routes, mounts, and redirects are
gone.

## Deferred capability register

| Capability                          | Reason                                                                                                                                                                                                            | Where it lives instead |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Build EE image dialog               | **In scope** (2026-10-29): definition workflows live here, per Tina's prototype; backend execution lands when the owning team populates it                                                                        | here                   |
| SCM token handling                  | No registry or portal credentials are handled or stored by this plugin; the build flow forwards the requesting user's own SCM token to the backend in a header per the established pattern and never persists it. | portal-scaffolder      |
| Edit / unregister entity            | **In scope** (2026-10-29): rendered per the prototype's entity-annotation gating                                                                                                                                  | here                   |
| Readme / links / resources from git | No SCM metadata on artifacts                                                                                                                                                                                      | —                      |

## Implementation follow-ups for the pull request

The pull-request description must distinguish rendered UI from implemented
backend behavior. Update this list with evidence before describing an item as
complete; update the PR body only after an authorized push.

| Area                         | Frontend state                                                                                        | Backend or integration follow-up                                                                                                                                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Use in Controller            | Dialog submits through the real scaffolder API.                                                       | Shipped as `examples/ee-use-in-controller/template.yaml`, registered by default and production `catalog.locations` as `template:default/ee-use-in-controller`; executes `rhaap:create-execution-environment` with the caller's AAP secret. |
| Definition-file relationship | Source presentation exists; porting Tina's definition detail page and navigation is approved UI work. | The image API/provider does not identify the definition entity that produced an image. Establish that association explicitly; test records are not proof that real image relationships work.                                               |
| Collection metadata          | Columns for Status, Publisher, Signing, and Source render `—` when absent.                            | Expose actual reported values through the data contract. Do not synthesize certification, publishers, signatures, or original collection sources from namespaces or image registries.                                                      |
| Signing evidence             | Image signing is Unknown; missing collection signing uses `—`.                                        | Confirm which evidence can be retrieved and expose it under an agreed contract. A signature does not imply a safety review or certification.                                                                                               |
| Favorites                    | Current UI reuses Backstage catalog stars for linked entities.                                        | Confirm whether that persistence meets the feature requirements; a separate artifact-favorites backend has not been implemented by adding the visible star.                                                                                |
| Sync status                  | Result/age-based labels are displayed.                                                                | If Syncing is intended to mean an active operation, provide actual operation state. Missing reconciliation history alone does not establish that a job is running.                                                                         |

Registry sync endpoints and server pagination already exist; they are not
frontend-only placeholders. Sync authorization and registry-wide scope still
apply. Wider collection grouping/pagination and search beyond the current EE
page should be tracked separately rather than implied by the current controls.

### Local test data is not a production feature

Synthetic status/source variants and their development adapter have been removed.
The UI always uses the real content client. Local Utopia images, including the
many-tag image, are real registry data and remain outside this repository.

Status labels derive only from actual registry reconciliation history: Available
after a successful recent reconciliation, Stale after more than 24 hours, Failed
after a failed sync, and Syncing when never reconciled. The Syncing label does not
prove an operation is running. Image metadata cannot manufacture reconciliation
history or unsupported source provenance. Functionality without a real backend
integration is not supplied through simulated results.

## Testing requirements

- Fixtures must include: partial and unknown enumerations, an EE with
  `contentsKnown: false`, the same collection/version in two different EE
  digests, a registry with `lastReconcileOk: false`, and the `variants`
  response shape for an unscoped content item.
- Never assert on catalog-only shapes for inventory data.
