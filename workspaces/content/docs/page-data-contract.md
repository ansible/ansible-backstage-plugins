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
2. **Backstage catalog** — only for user-owned signals: favourites/stars and
   entity ownership display. Never the source of inventory truth.
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
  `workspaces/content/plugins/catalog-backend-module-automation-content/src/OCIRegistryEntityProvider.ts`
  for the exact annotation names and entity naming scheme). If no catalog
  entity matches an EE, hide the star toggle for that row — never block the
  row.

## Page contracts

### Landing (`/automation-content`)

| Section                                                                                | Source                                                                 |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Registry health cards (name, url, `lastReconcileOk`, `lastReconciledAt`, capabilities) | `listRegistries()`                                                     |
| Counts (EEs, collections, content items)                                               | `listExecutionEnvironments()`, `listCollections()`                     |
| Sync action (admin)                                                                    | `syncAll()` with per-registry results surfaced as portal notifications |

### EE catalog (`/automation-content/execution-environments`)

Tina's `ImagesCatalogPage` layout, artifact data:

| UI element               | Source / mapping                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Row identity             | `repository` (+ `registry` as secondary text)                                                                                  |
| Tags                     | `tags` (digest shown as short sha)                                                                                             |
| Freshness                | `lastReconciledAt` (relative time)                                                                                             |
| Inventory fidelity badge | `enumeration.status` + `enumeration.source`; `contentsKnown` false ⇒ "contents unknown" badge, never render counts as complete |
| Volume indicators        | `counts.collections` / `counts.plugins` labelled approximate when `enumeration.status !== 'complete'`                          |
| Classification           | `classification.type` with `confidence`                                                                                        |
| Search / filter          | client-side over the loaded list                                                                                               |
| Favourites               | catalog stars (matching rules above)                                                                                           |
| Row action               | navigate to EE details — **no** build, edit, or SCM actions                                                                    |

### EE details (`/automation-content/execution-environments/…`)

Tina's `EEDetailsPage` tabs, artifact data:

| Tab                       | Content                                                                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| About                     | `ref`, `registry`, `repository`, `digest`, `tags`, `pullReference` (copy action), `classification`, `enumeration` (source, status, `ansibleCore`, `extractedAt`), `lastReconciledAt`                                                                                     |
| Collections in this image | `getContents(ref)` — `collections[]` with per-collection `counts`; row navigates to collection details scoped to this artifact                                                                                                                                           |
| Content items             | `searchContentItems({ in: ref, … })`; item row navigates to item documentation                                                                                                                                                                                           |
| Item documentation        | `getContentItem(fqcn, inArtifact)` — description, notes, options tree, examples, returns. This must preserve the old `ContentItemView` capability (ansible-doc style rendering), including the `variants` fallback behaviour in `AutomationContentClient.getContentItem` |

Readme-from-git, links cards, resources cards and build/edit actions are
**deferred** — they model definition authoring, not artifacts.

### Collections catalog (`/automation-content/collections`)

Tina's `CollectionsListPage` / `CollectionsCatalogPage` layout, artifact data:

| UI element         | Source / mapping                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Card/list identity | group `listCollections()` results by `fqcn`; card title `namespace.name`, latest `version` as badge                                                   |
| Version handling   | **Do not** filter on `ansible.io/is-latest-version` (prototype bug — OCI entities never set it). Compute "latest" as the max version within the group |
| Description        | `description`                                                                                                                                         |
| Volume indicators  | aggregated `counts`                                                                                                                                   |
| Provided-by        | `providedBy[]` — the EEs shipping it; links to EE details                                                                                             |
| Search             | `listCollections(query)` server-side where supported, plus client-side grouping                                                                       |
| Row action         | navigate to collection details                                                                                                                        |

### Collection details (`/automation-content/collections/…`)

| Section  | Content                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------- |
| Header   | `fqcn`, version selector (all versions present in the data, each showing which EEs provide it)                      |
| Contents | `searchContentItems({ collection: fqcn })`; item rows navigate to item documentation (same component as EE details) |
| About    | `description`, counts, provided-by list                                                                             |

Readme card is **deferred** (no git readme exists for registry artifacts).

## Deferred capability register

| Capability                          | Reason                                                                        | Where it lives instead |
| ----------------------------------- | ----------------------------------------------------------------------------- | ---------------------- |
| Build EE image dialog               | Authoring flow, not discovery; exists in production                           | portal-scaffolder      |
| SCM token handling                  | Only needed by the build flow — **this plugin must not handle tokens at all** | portal-scaffolder      |
| Edit / unregister entity            | Definition authoring                                                          | portal-scaffolder      |
| Readme / links / resources from git | No SCM metadata on artifacts                                                  | —                      |

## Testing requirements

- Fixtures must include: partial and unknown enumerations, an EE with
  `contentsKnown: false`, the same collection/version in two different EE
  digests, a registry with `lastReconcileOk: false`, and the `variants`
  response shape for an unscoped content item.
- Never assert on catalog-only shapes for inventory data.
