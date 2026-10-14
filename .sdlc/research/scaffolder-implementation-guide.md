# Scaffolder Re-Architecture — Implementation Guide

> **Canonical architecture:** [Content Experience Architecture](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md) ([§2.2 workspace layout](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md#22-proposal-one-workspace-per-experience), [§7.3](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md#73-frontend-what-moves-what-stays)–[§7.5 content/self-service boundary](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md#75-the-hard-case-seven-scaffolder-pickers), [§6.3 `scaffolder-field` contribution kind](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md#63-plugin-manifest))
> **Related Jira:** [ANSTRAT-2497](https://redhat.atlassian.net/browse/ANSTRAT-2497) (portal SDK, `portal-scaffolder` / self-service), [ANSTRAT-1758](https://redhat.atlassian.net/browse/ANSTRAT-1758) (content operations, content discovery)
> **Companion docs on this branch:** [`docs/next/portal-plugin-factory-implementation-guide.md`](../../docs/next/portal-plugin-factory-implementation-guide.md) (ANSTRAT-2497 portal factory), [`docs/next/portal-content-picker-contract-proposal.md`](../../docs/next/portal-content-picker-contract-proposal.md) (the ANSTRAT-1758 picker boundary this guide consumes)
> **Status:** Planning — no code split started for backend modules
> **Branch baseline:** `anstrat-2497-poc` in `ansible-backstage-plugins` — the `workspaces/` layout and `@ansible/portal-*` package family (see §2.4)
>
> **Scope: backend only.** This document is the ordered plan to split the monolithic
> scaffolder **backend** module — actions, autocomplete, and template filters — into
> separate backend modules aligned with the PoC's `workspaces/` layout. The **frontend
> self-service plugin is not changed by this effort** (§1).

---

## 1. What This Effort Owns

From the canonical architecture ([§7.1](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md#71-why-the-two-features-cannot-be-planned-separately)), **self-service and portal core** own scaffolder UX;
**AAP integration** owns Controller/Hub automation actions; **content management** owns
the data those pickers display.

This guide covers **backend** scaffolder deliverables:

| Deliverable                                    | Owner team                  | Purpose                                                                                                                                                                    |
| ---------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scaffolder-backend-module-backstage-rhaap`    | AAP integration             | `rhaap:*` template actions, AAP autocomplete resources, template filters — stays in the AAP workspace                                                                      |
| `scaffolder-backend-module-self-service`       | Self-service                | EE **definition** lifecycle and **publish** actions, `EEEntityProvider` route                                                                                              |
| `scaffolder-backend-module-content-operations` | Self-service (actions only) | **Conditional — not created by this guide.** Scaffolder actions invoking registered content operations (publish, certify), only if ANSTRAT-1758 ships such operations (§3) |

The AAP / self-service division follows the same sync: **API-related actions stay with
the AAP plugin**; **general EE-definition and publishing actions move out**. Concretely,
`rhaap:*` → AAP module; `ansible:create:ee-definition` and `ansible:prepare:publish` →
self-service module.

**In scope — `EEEntityProvider`:** per architecture §7.4, `EEEntityProvider` and its
`POST /ansible/ee` route move to `scaffolder-backend-module-self-service` (Phase 2 below).
It is **not** out of scope for this guide — it is explicitly this guide's deliverable,
called out here to avoid the reader assuming the catalog-module split below covers it.

**Out of scope for this guide (other teams / tickets):**

- **Any frontend change** — no `self-service-react` or other web-library extraction, no field-extension moves, no `scaffolder-field` `PluginManifest` capability registration, no picker rewiring. Deferred to a separate frontend effort.
- Splitting `catalog-backend-module-rhaap` (PAH, git sources, AAP entity providers) — see architecture §7.4. (`EEEntityProvider` is the one provider in that module this guide _does_ cover — see above.)
- Repo rename to `automation-portal-plugins` and the physical `workspaces/` move — coordinated with ANSTRAT-2497, tracked as Phase 5 (§5)

---

## 2. Baseline — the `anstrat-2497-poc` branch

This guide plans against the **`anstrat-2497-poc`** branch, not against an older layout.
Everything in §2 describes that branch: the `workspaces/` structure, the `@ansible/portal-*`
package family, and the monolithic scaffolder backend module the split carves up. §2.4
records the full layout.

### 2.1 Frontend — `workspaces/self-service/plugins/self-service` (read-only context, not changed by this guide)

The frontend is **not modified by this effort** (§1). It is described here only to record
which backend surfaces its field extensions consume, because those surfaces are what the
backend split moves.

> **On the `@ansible/portal-scaffolder` name.** The directory is
> `workspaces/self-service/plugins/self-service`; the package it publishes is
> **`@ansible/portal-scaffolder`** (`role: frontend-plugin`). Directory name and package
> name differ, which is the detail worth stating plainly — this is a package name, not a
> second plugin, and not a scaffolder-specific plugin sitting alongside self-service.
> There is exactly one frontend plugin here and this guide does not touch it.
>
> The canonical architecture
> ([§2.2](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md#22-proposal-one-workspace-per-experience))
> refers to this plugin as `self-service`. Reconciling that with `@ansible/portal-scaffolder`
> is a frontend-naming decision owned by the PoC, not by this backend guide.

A single Backstage frontend plugin bundles content browsing, shell pieces, and the
scaffolder surface — every field extension, the template/task/history UI, and the
content-browsing views (`ExecutionEnvironments`, `CollectionsCatalog`) — all registered
under one `BackstagePlugin`.

**Field extensions and the backend surfaces they consume** (registered via
`scaffolderPlugin.provide(createScaffolderFieldExtension(...))`). `MCPServersPicker` is
omitted: it never reached GA and is being removed from the source in a separate PR.

| Field extension                                                | Backend surface consumed                                                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `CollectionsPicker`                                            | `scaffolderApi.autocomplete` → provider `aap-api-cloud`, resources `collections` / `collection_sources` / `collection_versions` |
| `BaseImagePicker`                                              | None — static template schema / hardcoded recommended image                                                                     |
| `AAPResourcePicker`, `AAPTokenField`                           | AAP APIs via plugin `apis`                                                                                                      |
| `ScmSelector`, `FileUploadPicker`                              | SCM / upload UX only                                                                                                            |
| `PackagesPicker`, `AdditionalBuildStepsPicker`, `EETagsPicker` | None — enum/schema driven                                                                                                       |
| `EEFileNamePicker`                                             | `catalogApi.getEntityByRef`, to check for an existing EE **definition**                                                         |

Only `CollectionsPicker` depends on the autocomplete provider this guide splits, which is
why it is the one field the backend work has to stay compatible with.

**Backend coupling the split must preserve.** `CollectionsPicker` uses three autocomplete
resources. Only `collections` is handled by `getCollections()` (catalog entity query via
`discovery` + catalog API); `collection_sources` and `collection_versions` fall through to
`ansibleService.getResourceData()` in `handleAutocompleteRequest`.

There is also an **undocumented string contract** between the two sides, and because the
frontend is not changing, the backend split must not break it:
`autocomplete/utils.ts:formatSource()` emits display strings — `"Private Automation Hub / <repo>"`
and `"<Provider> / <host> / <org> / <repo>"` — which `createEEDefinition.ts` parses back
into structured data (`PAH_SOURCE_PREFIX`, `normalizeCollectionSources`,
`partitionCollectionsBySourceType`, `transformScmCollections`), and which
`templates/readmeTemplate.ts` duplicates. Splitting the autocomplete provider away from
the EE-definition action puts a package boundary between the producer and the consumer of
that format. It must move as a documented, tested contract, not as an incidental string.

**Architecture §7.5's seven pickers.** §7.5 names seven fields on the content boundary,
including `MCPServersPicker`. Dropping that one leaves six. Of those, only
`CollectionsPicker` and `BaseImagePicker` are content-data pickers; `EEFileNamePicker`
reads the **definition** catalog (self-service-owned per architecture §7.2), and the rest
are enum/schema driven. Where any of the remaining fields later need content-team data,
that is a new §7.6 agreement with ANSTRAT-1758. None of this changes the frontend in this
effort — it records the boundary for whoever picks the frontend work up.

### 2.2 Backend — `@ansible/plugin-scaffolder-backend-module-backstage-rhaap`

One `createBackendModule({ pluginId: 'scaffolder', moduleId: 'ansible' })` registers
**everything** in `workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/module.ts`:

**Template actions**

| Action ID                            | File                              | Target module                                                                               |
| ------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------- |
| `ansible:content:create`             | `actions/ansible.ts`              | **TBD** — creator-service; not AAP; keep with self-service until creator ownership is clear |
| `ansible:create:ee-definition`       | `actions/createEEDefinition.ts`   | `scaffolder-backend-module-self-service`                                                    |
| `ansible:prepare:publish`            | `actions/prepareForPublish.ts`    | `scaffolder-backend-module-self-service`                                                    |
| `rhaap:create-project`               | `actions/aapCreateProject.ts`     | `scaffolder-backend-module-backstage-rhaap`                                                 |
| `rhaap:create-execution-environment` | `actions/aapCreateEEEnv.ts`       | `scaffolder-backend-module-backstage-rhaap`                                                 |
| `rhaap:create-job-template`          | `actions/aapCreateJobTemplate.ts` | `scaffolder-backend-module-backstage-rhaap`                                                 |
| `rhaap:launch-job-template`          | `actions/aapLaunchJobTemplate.ts` | `scaffolder-backend-module-backstage-rhaap`                                                 |
| `rhaap:clean-up`                     | `actions/aapCleanUp.ts`           | `scaffolder-backend-module-backstage-rhaap`                                                 |

**Template filters:** `useCaseNameFilter`, `resourceFilter`, `multiResourceFilter`, `uuidFilter` → AAP templates → `scaffolder-backend-module-backstage-rhaap`.

**Autocomplete provider:** `id: 'aap-api-cloud'` → `handleAutocompleteRequest` in `src/autocomplete/autocomplete.ts`.
Renaming it is out of scope for this guide — it's a stable, already-published
provider id and template authors depend on it; renaming would be a breaking change
unrelated to the package split this guide covers, so it stays `aap-api-cloud`.

- `collections` → catalog entity query (`getCollections` in `autocomplete/utils.ts`) — **move to content-operations bridge**
- `verbosity`, `aaphostname` → config / static — split by consumer (AAP vs self-service)
- All other `resource` strings → `ansibleService.getResourceData` — **AAP module**

**Dependencies:** `@ansible/backstage-rhaap-common` (`ansibleServiceRef`, DTOs), Backstage scaffolder extension points, config, auth, discovery.

### 2.3 Catalog — `EEEntityProvider` (today in `catalog-backend-module-rhaap`)

`POST /ansible/ee` registers execution environment **definitions** pushed from the scaffolder
(architecture §7.4 cites ~52 lines; `EEEntityProvider.ts` is ~88 lines on this branch).
Either way it does not touch OCI/registries.

**Open item — does this endpoint need to exist at all?** [PR #189](https://github.com/ansible/ansible-backstage-plugins/pull/189)
proposes registering the EE definition entity directly from the scaffolder action via the
catalog processing extension point, removing `POST /ansible/ee` as a separate HTTP hop.
If that lands, Phase 3 below changes from "move the route" to "retire the route" — worth
re-opening #189 alongside this guide rather than moving the endpoint first and discussing
its removal later, since it would also set the precedent for how scaffolder actions
register catalog entities generally.

**Target:** HTTP route stays reachable; provider implementation lives in
`scaffolder-backend-module-self-service` (or `self-service` backend plugin) and is **wired**
into catalog via a thin registration module — not left inside the content catalog module.

### 2.4 Workspace layout

The layout the backend split has to land into:

```
workspaces/
├── aap/plugins/                  backstage-rhaap, backstage-rhaap-common,
│                                 catalog-backend-module-rhaap,
│                                 catalog-backend-module-rhaap-user-provisioner,
│                                 auth-backend-module-rhaap-provider,
│                                 scaffolder-backend-module-backstage-rhaap  ← still monolithic
├── apme/plugins/                 backstage-apme, catalog/scaffolder modules
├── portal-core/plugins/          portal-core, portal-plugin-sdk, portal-plugin-node,
│                                 portal-extension-{api,common,host},
│                                 portal-health-backend, portal-operations-backend
└── self-service/plugins/
    └── self-service/             package name: @ansible/portal-scaffolder (frontend-plugin)
```

Two details that matter and are easy to get wrong:

- The scaffolder backend module currently sits under **`workspaces/aap/`**, not under
  `workspaces/self-service/`. That is consistent with keeping AAP/API actions on the AAP
  side (§1); the split carves the non-AAP actions _out_ of it.
- `workspaces/self-service/plugins/self-service/` keeps the **directory** name
  `self-service` while carrying the **package** name `@ansible/portal-scaffolder`.

**Not done on the PoC:** the backend module split itself, the content-operation bridge,
and anything in ANSTRAT-1758's content-discovery path.

---

## 3. Target Package Layout

Backend modules only. The frontend plugin and the `portal-core` / `apme` workspaces are
shown for position but are **not** touched by this guide.

```
workspaces/aap/plugins/
└── scaffolder-backend-module-backstage-rhaap/     # keeps its package name
    Actions: rhaap:create-project, rhaap:create-execution-environment,
             rhaap:create-job-template, rhaap:launch-job-template, rhaap:clean-up
    Autocomplete: aap-api-cloud — AAP resource branch (verbosity, aaphostname, *)
    Template filters: useCaseNameFilter, resourceFilter, multiResourceFilter, uuidFilter
    Depends on: ansibleServiceRef from backstage-rhaap-common

workspaces/self-service/plugins/
├── self-service/                                  # @ansible/portal-scaffolder — UNCHANGED
│
└── scaffolder-backend-module-self-service/        # NEW
    Actions: ansible:create:ee-definition, ansible:prepare:publish
    Undecided: ansible:content:create (creator-service — see §8)
    EEEntityProvider registration + POST /ansible/ee  (Phase 3)
    Needs: ScmClientFactory (today bundled in backstage-rhaap-common — see §4.5)
    portal-plugin.yaml — installGroup: self-service
```

A third module, `scaffolder-backend-module-content-operations`, is **not created by this
guide**. Whether it exists at all depends on ANSTRAT-1758 landing registered content
operations (publish, certify) for a scaffolder action to invoke. It stays an open
checkpoint for the ANSTRAT-1758 pod sync (§7), not a Phase 1 deliverable.

**Which action goes where**

| Action                               | Target module                               | Rationale                                    |
| ------------------------------------ | ------------------------------------------- | -------------------------------------------- |
| `rhaap:create-project`               | `scaffolder-backend-module-backstage-rhaap` | AAP API action — stays with the AAP plugin   |
| `rhaap:create-execution-environment` | `scaffolder-backend-module-backstage-rhaap` | AAP API action                               |
| `rhaap:create-job-template`          | `scaffolder-backend-module-backstage-rhaap` | AAP API action                               |
| `rhaap:launch-job-template`          | `scaffolder-backend-module-backstage-rhaap` | AAP API action                               |
| `rhaap:clean-up`                     | `scaffolder-backend-module-backstage-rhaap` | AAP API action                               |
| `ansible:create:ee-definition`       | `scaffolder-backend-module-self-service`    | EE **definition** authoring, not an AAP call |
| `ansible:prepare:publish`            | `scaffolder-backend-module-self-service`    | **Publishing** prep, not an AAP call         |
| `ansible:content:create`             | **TBD**                                     | creator-service; ownership unresolved (§8)   |

> **Name note.** The AAP module keeps its existing package name,
> `@ansible/plugin-scaffolder-backend-module-backstage-rhaap`, which is also what the PoC
> branch uses. Canonical architecture §2.2 calls this package `scaffolder-backend-module-aap`;
> renaming it is a Phase 4/5 concern, not part of the split.

**Module identity**

| Current               | Target                                                                             |
| --------------------- | ---------------------------------------------------------------------------------- |
| `moduleId: 'ansible'` | `aap` and `self-service` — separate backend modules, same `pluginId: 'scaffolder'` |

**Backward compatibility.** Both modules register in `workspaces/portal-core/packages/backend` until RHDH
dynamic-plugin manifests list them separately. Action IDs and the autocomplete provider
id `aap-api-cloud` **must not change** in the split — only package boundaries move.

## 4. Design Decisions (Architecture-Aligned)

### 4.1 Scaffolder fields stay on Backstage registration (frontend — out of scope)

Architecture §6.3 defines `ContributionKind: 'scaffolder-field'` and
`ExperienceId: SELF_SERVICE`, so field extensions could eventually be declared on
`PluginManifest` and mounted by `portal-extension-host`. **That is frontend work and is
not part of this effort** (§1): field extensions keep their existing
`createScaffolderFieldExtension` registration, untouched.

Recorded here only so the gap is not mistaken for an oversight: nothing in
`portal-extension-host` currently resolves a `scaffolder-field` capability into a
Backstage RJSF field, so declaring such a capability would change nothing at runtime
today. Whoever takes the frontend effort needs to build that host resolution first.

### 4.2 Content pickers query generic content search, not per-step operations

> **Boundary record, not scheduled work.** The picker rewiring described here is
> frontend and therefore out of this effort's scope (§1), and it is additionally blocked
> on ANSTRAT-1758. It stays documented because it is the content/self-service boundary
> the two pods have to agree on, and because the **backend** half — retiring the
> catalog-backed `getCollections()` branch of the autocomplete provider — eventually
> lands on the module this guide creates. Nothing here is a Phase 1–3 deliverable.

**Revised per review feedback.** The earlier draft of this section proposed four named
operations (`content.collections.search`, `listSources`, `listVersions`,
`content.executionEnvironments.listBaseImages`) mapped one-to-one from today's
autocomplete resources. That freezes an incidental UI detail — `CollectionsPicker`'s
three-step name → source → version cascade is hardcoded in the widget
(`CollectionsPickerExtension.tsx`), not a template-author contract — into a permanent
backend surface. It also does not reuse the mechanism the architecture doc already
defines for exactly this: **projectors**. §3 of the architecture doc places
`search-backend-module-automation-content` alongside the catalog projector, rebuilding a
declarative, queryable view from the canonical store. That is the surface content
pickers should query.

**Revised model:**

```
CollectionsPicker (UI widget)
  → usePortalContext().apiClient.search({ type: 'collection', query, facets: { sourceId, version } })
  → generic content search surface (search-backend-module-automation-content)
  → type module declares which fields are queryable/facetable for its type
  → permission check enforced at the search layer, same as today's per-field check
```

The widget owns the cascade (name → source → version, or whatever the UI needs next);
the content side owns declaring which fields on a type are searchable and returnable.
Adding a new content type with a picker requires the type module to declare its
queryable fields — it does not require ANSTRAT-1758 to ship new operations.

**Open item to carry into the ANSTRAT-1758 conversation, not resolved here** (flagged for
explicit discussion with the ANSTRAT-1758 pod, not assumed agreed by writing it down
here)**:** this model
assumes type-specific fields (e.g. a collection's `sourceId` and `version[]`, an EE
image's `recommended` flag and `digest`) are declarable as queryable/returnable fields
on that type's search projection. That is somewhat more upfront modeling work for
ANSTRAT-1758 than three flat list endpoints would have been, but it does not grow per
picker the way named operations would.

**`scaffolder-backend-module-content-operations` scope, corrected:** this module is not
a `resource → operationId` bridge for listing. Read-only lookups go through content
search directly from the frontend client. The module's durable job, if it exists at
all, is **actions** that mutate state and need the audit/permission pipeline — publish,
certify — invoked via `operationId`, the same pattern `AAPResourcePicker` already uses
for AAP autocomplete (left untouched — AAP stays on `aap-api-cloud`, out of scope here).

### 4.3 Definition vs built image (do not conflate)

- Scaffolder templates author **`execution-environment-definition`** content (yaml in git).
- `BaseImagePicker` after migration lists **`execution-environment-image`** candidates
  (built images), not definition catalog rows (architecture §7.2 table).

### 4.4 EE entity registration stays on the definition path

`EEEntityProvider` + `POST /ansible/ee` remain self-service-owned (§7.4). Content team
does not absorb this endpoint when PAH/git providers move out of `catalog-backend-module-rhaap`.

### 4.5 Dependency rules the split must honour

`workspaces/self-service/**` may depend on content packages **by published version only**
(architecture §2.3); it must not import `content-type-*` packages or other workspaces'
backend modules. `main` enforces rules like these with an ESLint architecture config
(`.config/eslint-architecture.js`), which this branch does not yet carry — the split
should land that enforcement alongside the new module rather than relying on review to
catch violations.

**One concrete obstacle to the "no AAP REST" goal.** `scaffolder-backend-module-self-service`
is meant to be free of AAP, but `ansible:prepare:publish` imports `ScmClientFactory` from
`@ansible/backstage-rhaap-common`, and that package's barrel also exports `AAPClient`,
`AAPService`, and `permissions`. Splitting the scaffolder module alone therefore does
**not** achieve the stated property — `backstage-rhaap-common` itself has to be split
(SCM client out to a shared or self-service package; AAP client/service staying on the AAP
side), or the self-service module keeps a dependency edge straight back into AAP code.
This is unresolved and is a Phase 1 prerequisite, not a later cleanup.

---

### 4.6 Content discovery design and contract (ANSTRAT-1758)

**Why this section exists.** Earlier drafts treated content discovery as
"ANSTRAT-1758's problem, not resolved here" without explaining the design it refers to.
This guide does not own or build content discovery — the content management pod does,
per architecture §7.1 — but Phase 4's two pickers sit directly on top of it, so this
section documents the design as ANSTRAT-1758 specifies it (architecture [§1.3](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md#13-the-four-layers), [§3.2](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md#32-the-source-axis-in-code)–[§3.4](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md#34-the-type-axis-in-code),
[§4.1](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md#41-the-five-stages)), then states the narrower consuming contract this guide actually needs.

#### 4.6.1 The pipeline a collection or EE image goes through before a picker can see it

Per architecture [§4.1](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md#41-the-five-stages), content moves through five stages, each with a single owner:

| Stage     | What happens                                                                                            | Owner                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Publish   | Artifact lands in a registry (`ansible-builder`) or is uploaded through Portal                          | Build tooling or Portal                                                                              |
| Ingest    | Source module discovers it, resolves to an immutable digest, reads raw metadata                         | Content **source** module (`…-backend-module-source-oci`, `…-source-automation-hub`, `…-source-git`) |
| Normalise | Type identified, contents normalised into a `ContentObject`, observation committed with an outbox event | Content **type** module (`content-type-collection`, `content-type-execution-environment`)            |
| Enrich    | Trust, quality, intent processors write primitive records with evidence                                 | Primitive processors                                                                                 |
| Project   | Outbox drains into catalog entities **and search indexes**                                              | Projectors (`catalog-backend-module-…`, `search-backend-module-automation-content`)                  |

The last row is what a picker actually queries: `search-backend-module-automation-content`
is a **projector**, not the canonical store. It is rebuildable and never authoritative —
if it's lost, it regenerates from the store, it doesn't get re-read from the registry
(architecture [§4.1](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md#41-the-five-stages), "a failed read is not an empty result").

#### 4.6.2 Why the picker never sees `aap-api-cloud`-style resource strings again

Architecture [§3.2](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md#32-the-source-axis-in-code)–[§3.4](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md#34-the-type-axis-in-code) keeps two axes strictly apart: a **source module** knows how to
talk to a registry/SCM/Hub and nothing about Ansible; a **type module** knows what a
collection or EE image _means_ and nothing about where it came from. Both only ever
produce one shape, the universal `ContentObject`:

```ts
interface ContentObject {
  identity: ContentIdentity; // { type, namespace, name, digest }
  version: ContentVersion;
  source: ContentSource;
  lifecycle: ContentLifecycle;
  trust: TrustAttributes;
  relationships: ContentRelation[];
  enumeration: Enumeration; // complete | partial | unknown | failed
  extensions?: Record<string, unknown>;
}
```

This is why today's `collections` / `collection_sources` / `collection_versions`
autocomplete resources (§2.2, Appendix A) have no equivalent on the target side: those
are catalog-query shortcuts against one source (AAP/PAH via `aap-api-cloud`). The target
search index is built from `ContentObject`s that already merged every source a
collection could come from. A picker querying `type: 'collection'` gets one normalized
result set regardless of whether a given collection came from Automation Hub or Git.

**Registration is the whole extensibility mechanism ([§3.4](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md#34-the-type-axis-in-code)):** a type module declares
which `ContentObject` fields it exposes as queryable/returnable on the search
projection. Adding a new source (say, a second Hub instance) requires no change on the
scaffolder side at all — the type module's declared fields don't change, only which
source module resolved the artifact.

#### 4.6.3 The consuming contract this guide needs (illustrative, not the spec)

The authoritative version of this contract belongs in
[`docs/next/portal-content-picker-contract-proposal.md`](../../docs/next/portal-content-picker-contract-proposal.md),
which this guide consumes but does not own. What follows is this guide's statement of need against that design:

```ts
// Illustrative only — final shape is an ANSTRAT-1758 deliverable
apiClient.search({
  type: 'collection' | 'execution-environment-image',
  query?: string,
  facets?: Record<string, string | string[]>,
  cursor?: string,
}): Promise<{
  results: ContentSearchResult[],
  facets: Record<string, FacetValue[]>,
  nextCursor?: string,
}>
```

Per-type fields this guide's two Phase 4 pickers need declared as queryable/returnable
on the `collection` and `execution-environment-image` type modules' search projection:

| Content type                  | Picker              | Fields needed                                                                                                       | Used for                                                            |
| ----------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `collection`                  | `CollectionsPicker` | `identity.namespace`, `identity.name`, `source` (for `sourceId` faceting), `version.requested` / `version.resolved` | Name → source → version cascade, widget-owned (§4.2)                |
| `execution-environment-image` | `BaseImagePicker`   | `identity.digest`, `trust`/`lifecycle`-derived `recommended` flag, `extensions.platformVersion`                     | Dynamic recommended-image list, replacing the hardcoded enum (§4.3) |

Note the `collection`/`execution-environment-image` fields above map onto the generic
`ContentObject` shape in §4.6.2 (`identity`, `version`, `source`) rather than inventing
scaffolder-specific field names — the search projection should expose the same
`ContentObject` vocabulary every other L4 surface (REST, MCP, UI) uses, per the "one
contract, four surfaces" rule in architecture [§1.3](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md#13-the-four-layers).

**Permission enforcement.** Per architecture [§6.3](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md#63-plugin-manifest)'s entitlement model and [§1.3](https://github.com/ansible/ansible-rhdh-plugins/blob/portal-plugin-research/.sdlc/research/plugin-factory/Content%20Experience%20Architecture.md#13-the-four-layers)'s
"operations are registered, not proxied" rule, the search layer enforces permission at
query time — the picker does not run a second, scaffolder-owned permission check on top
of what `apiClient.search()` already returns.

**Status:** not built. This is the hard dependency for Phase 4 (§7, "Boundary Agreement
Needed Now") — Phases 1–3 do not need it.

---

## 5. Ordered Work Packages

Backend only. Phases 0–2 can proceed now; Phase 3 is blocked on ANSTRAT-1758.

### Phase 0 — Contract freeze (prerequisite)

**Output:** Machine-readable inventory of scaffolder action IDs and autocomplete resources (extend the WP-001 inventory in `tools/wp-001`).

| Item                                                                          | Status |
| ----------------------------------------------------------------------------- | ------ |
| Register all `ansible:*` and `rhaap:*` action IDs                             | ❌     |
| Register autocomplete resources (`collections`, `collection_sources`, …)      | ❌     |
| Document template YAML dependencies on provider id `aap-api-cloud`            | ❌     |
| Capture the picker↔action source-string format as an explicit contract (§2.1) | ❌     |

---

### Phase 1 — Split the backend module (no behaviour change)

**Output:** Two modules replacing one; identical action, filter, and autocomplete behaviour; all existing tests green.

**Work:**

| Item                                                            | Source                                                                                                              | Notes                                                                                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Keep AAP actions in `scaffolder-backend-module-backstage-rhaap` | `aap*.ts`, AAP branch of `autocomplete.ts`, filters, `ansibleService` deps                                          | `moduleId: 'aap'`                                                                                                                                            |
| Create `scaffolder-backend-module-self-service`                 | `createEEDefinition`, `prepareForPublish`                                                                           | `moduleId: 'self-service'`                                                                                                                                   |
| Resolve `ansible:content:create` ownership                      | `ansible.ts` + `ansibleContentCreate.ts`                                                                            | Blocks the package list — see §8                                                                                                                             |
| **Split `config.d.ts`**                                         | One shared schema today (`ansible.rhaap`, `ansible.creatorService`, `ansible.devSpaces`, `catalog.providers.rhaap`) | Each module declares only its own keys. Backstage validates against the union of installed schemas, so a mistake here is a startup failure, not a lint error |
| **Give each module its own `src/dynamic/index.ts`**             | Today a single `dynamicPluginInstaller` (`kind: 'new'`)                                                             | One installer per shippable module                                                                                                                           |
| **Resolve the `backstage-rhaap-common` edge**                   | `prepareForPublish` imports `ScmClientFactory` from the AAP common barrel                                           | See §4.5 — prerequisite for the "no AAP REST" goal                                                                                                           |
| Add import-boundary enforcement for both modules                | Port `.config/eslint-architecture.js` from `main`; absent on this branch                                            | Prevents regressions by CI, not review                                                                                                                       |
| Update `workspaces/portal-core/packages/backend/src/index.ts`   | Two `backend.add(import(...))`                                                                                      | Replaces the single monolithic entry                                                                                                                         |
| Split unit tests and shared `src/mock/` fixtures                | 23 test files; `mockData.ts`/`mockConfig.ts` etc. are used by both sides                                            | Shared fixtures need a test-util package or duplication                                                                                                      |
| Deprecate the monolithic export surface                         | Re-export shim or delete after backend wiring updates                                                               | Coordinate RHDH `dynamicPlugins.backend` entries                                                                                                             |

> **`createEEDefinition.ts` is not a simple move.** It is ~1400 lines and contains
> source- and type-axis logic the canonical architecture assigns to the content side —
> PAH repo identifiers, SCM provider/host/org/repo parsing, galaxy server config,
> semver-based collection merging, requirements/package merging. Moving it wholesale into
> `scaffolder-backend-module-self-service` relocates that logic without resolving who
> should own it. Whether it stays duplicated on the self-service side or migrates to
> ANSTRAT-1758 is an open boundary question of the same kind as the picker contract, and
> it is the main reason "no behaviour change" understates this phase's effort.

**Verification:** scaffolder module tests; smoke-test an EE template end-to-end in the dev app.

---

### Phase 2 — Move `EEEntityProvider` to the self-service backend

**Output:** EE-definition catalog mutation owned by the self-service module; `catalog-backend-module-rhaap` delegates or drops the route.

| Item                                                              | Notes                                                                |
| ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| Move `EEEntityProvider` class + `POST /ansible/ee` handler        | Register the router from `scaffolder-backend-module-self-service`    |
| Keep the URL path stable                                          | Architecture §7.7 — no URL regression                                |
| Update `createEEDefinition` catalog registration path             | Still uses discovery + service token; only provider location changes |
| Move tests from `catalog-backend-module-rhaap/src/router.test.ts` | `POST /ansible/ee` coverage travels with the route                   |

**Open first:** [PR #189](https://github.com/ansible/ansible-backstage-plugins/pull/189) proposes registering the
entity directly from the scaffolder action and dropping `POST /ansible/ee` entirely. If
that lands, this phase becomes "retire the route" rather than "move the route" — worth
settling before the move, not after.

---

### Phase 3 — Retire catalog-backed collections autocomplete (blocked on ANSTRAT-1758)

Backend half only; the picker-side rewiring is frontend and out of scope (§1, §4.2).

**Dependency:** a published content search surface with `collection` registering its
queryable fields (§4.6).

| Item                                                                   | Notes                                                                                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Remove the `getCollections` catalog scan from the autocomplete backend | Drops the catalog dependency from the self-service side                                                                   |
| Preserve the cache characteristics                                     | `autocomplete/utils.ts` has a 60s TTL cache plus in-flight request coalescing; losing either regresses type-ahead latency |
| Keep `aap-api-cloud` serving AAP resources                             | Unaffected — AAP branch stays on the AAP module                                                                           |

---

### Phase 4 — AAP workspace alignment

**Output:** the AAP scaffolder module sits in `workspaces/aap/` with AAP-only dependencies.

| Item                                                           | Notes                            |
| -------------------------------------------------------------- | -------------------------------- |
| Align with the `catalog-backend-module-rhaap` split            | Architecture §7.4                |
| Drop `backstage-rhaap-common` in favour of AAP-scoped packages | Depends on the §4.5 common split |

---

### Phase 5 — Physical workspace move

Coordinate with ANSTRAT-2497 (see [ANSTRAT-2497](https://redhat.atlassian.net/browse/ANSTRAT-2497)):

- Backend modules under `workspaces/self-service/plugins/` and `workspaces/aap/plugins/`
- `portal-plugin.yaml` per shippable backend module (architecture §8.5)
- Repo rename to `automation-portal-plugins`

---

## 6. Contracts Published for Other Teams

| Consumer         | Contract                                                                                               | Provided by                       |
| ---------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------- |
| ANSTRAT-1758     | Content search query surface (§4.2, consuming contract in §4.6): fields, facets, permission model      | Content backend + client          |
| Template authors | Action IDs and `aap-api-cloud` provider id unchanged across the split                                  | Changelog entry per Phase 1       |
| Frontend effort  | Picker↔action source-string format (§2.1), so a future picker rewrite knows what it must keep emitting | Phase 0 inventory                 |
| RHDH / operator  | Two backend dynamic plugin entries instead of one                                                      | `portal-plugin.yaml` installGroup |

**Semver:** the split is **internal packaging** as long as action IDs stay stable — a minor bump on the affected packages. Breaking action-schema changes need a changelog plus template-repo coordination (`ansible-rhdh-templates`).

---

## 7. Boundary Agreement Needed Now

Phases 0–2 need no content-team delivery. Only Phase 3 is blocked, and what it is blocked
on is the ANSTRAT-1758 content search surface (§4.6), not EE actions.

**Minimum to unblock Phase 3:**

1. Agree the content search query surface and the per-type queryable-field model (§4.6)
2. Content team ships handlers + a client release
3. Decide where the picker↔action source-string contract (§2.1) lands once pickers stop emitting display strings

---

## 8. Open Questions

| Question                                                                                 | Owner                   | Blocking                |
| ---------------------------------------------------------------------------------------- | ----------------------- | ----------------------- |
| Does `ansible:content:create` stay with self-service or move to a creator plugin?        | Self-service + devtools | Phase 1 package list    |
| Does `backstage-rhaap-common` get split so self-service can drop the AAP edge? (§4.5)    | Self-service + AAP      | Phase 1                 |
| Does the content/source logic inside `createEEDefinition.ts` stay or migrate to 1758?    | Self-service + 1758     | Phase 1 effort estimate |
| Should `POST /ansible/ee` be retired via PR #189 rather than moved?                      | Self-service            | Phase 2                 |
| Should `POST /ansible/ee/build` move with the EE provider or stay in the catalog module? | Self-service            | Phase 2                 |

---

## 9. Suggested Sequencing with ANSTRAT-2497

| ANSTRAT-2497 work      | Scaffolder work                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| Content extraction     | Phase 3 — drop the catalog-backed autocomplete branch                                         |
| Rename / workspaces    | Phase 5 — physical layout                                                                     |
| Future frontend effort | Picker migration, field-extension library, manifest capabilities — all out of scope here (§1) |

---

## 10. Documentation Deliverables

| Document                                 | Location                                               | Status                     |
| ---------------------------------------- | ------------------------------------------------------ | -------------------------- |
| This guide                               | `.sdlc/research/scaffolder-implementation-guide.md`    | ✅ This file               |
| Picker content boundary                  | `docs/next/portal-content-picker-contract-proposal.md` | ✅ Exists on this branch   |
| Per-module README after the split        | `plugins/scaffolder-backend-module-*/README.md`        | ❌                         |
| RHDH `dynamic-plugins.yaml` registration | `docs/plugins/scaffolder.md`                           | ❌ — required by AAP-95782 |
| Migration: monolithic → split imports    | `docs/sdk/migration-scaffolder-modules.md`             | ❌                         |

---

## Appendix A — Autocomplete resource map (current → target)

**Target column revised per review feedback (§4.2):** the three collection resources are
current-implementation rows, not a target contract to preserve. They collapse into one
widget-driven content search query; there is no per-resource target operation.

| Resource (today)      | Implementation today                       | Target                                                                  |
| --------------------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| `collections`         | Catalog entity filter via `getCollections` | Widget calls `apiClient.search({ type: 'collection' })` directly (§4.2) |
| `collection_sources`  | `ansibleService.getResourceData` (AAP)     | Same search call, faceted on `sourceId` — no separate resource          |
| `collection_versions` | `ansibleService.getResourceData` (AAP)     | Same search call, faceted on `version` — no separate resource           |
| `verbosity`           | Static list                                | `scaffolder-backend-module-backstage-rhaap` or self-service             |
| `aaphostname`         | Config                                     | `scaffolder-backend-module-backstage-rhaap`                             |
| `*` (AAP resources)   | `ansibleService.getResourceData`           | `scaffolder-backend-module-backstage-rhaap`                             |

---

## Appendix B — Reference map to source files

| Concern                    | Path                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| Module registration        | `workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/module.ts`                     |
| Catalog-backed collections | `workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/autocomplete/utils.ts`         |
| EE definition action       | `workspaces/aap/plugins/scaffolder-backend-module-backstage-rhaap/src/actions/createEEDefinition.ts` |
| Field extensions           | `workspaces/self-service/plugins/self-service/src/components/Scaffolder/`                            |
| EE push registration       | `workspaces/aap/plugins/catalog-backend-module-rhaap/src/providers/EEEntityProvider.ts`, `router.ts` |
| Backend wiring             | `workspaces/portal-core/packages/backend/src/index.ts`                                               |
