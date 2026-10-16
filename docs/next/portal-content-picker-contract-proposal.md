# Picker Content Boundary: Query Dimensions + Write Schema

## Portal and content service boundary

> **From:** Portal Plugin Factory team
> **To:** Content Management team
> **Status:** Draft — supersedes previous "operation contract" proposal
> **Context:** [Content extraction and picker contracts](portal-plugin-factory-implementation-guide.md#content-extraction-and-picker-contracts)

---

## 1. Background

The self-service plugin contains seven scaffolder field pickers. As part of the planned content extraction, these are split by data ownership:

- Pickers that query **Ansible content** (collections, EE images) — the content boundary
  defined in this document. The Content Management team owns the data; we own the picker widget.
- Pickers that query **AAP resources** (organizations, inventories, projects) — continue
  to use existing AAP API routes. Not part of this contract.
- Pickers that are **pure user-input** (tags, pip package names, file names, MCP servers,
  SCM choices) — free text or template-enum. No content boundary. Not part of this contract.

**What we are agreeing on here:**

- The **query dimensions** each picker needs (what fields are queryable on each content type)
- The **write schema** (what the template form persists after a picker selection)
- The **authz** requirement per query
- The **`sourceId` stability** invariant (non-negotiable — stored values must survive upgrades)

**What we are NOT prescribing:** how the query is implemented. Whether sources and versions
arrive as facets on a search query, relations, or a separate index is the Content Management team's
decision. The picker is a widget; we do not own the query engine.

### The two pickers in scope

| Picker component             | Content it queries                          |
| ---------------------------- | ------------------------------------------- |
| `CollectionsPickerExtension` | Ansible collections from PAH / Galaxy / OCI |
| `BaseImagePickerExtension`   | Built EE images available as base images    |

---

## 2. Current Behaviour (What We Ship Today)

Understanding the current implementation makes the required data surface explicit.

### 2.1 CollectionsPicker

The picker today calls `scaffolderApi.autocomplete` with three resource strings in a
cascade: name → source → version. The user flow is:

1. Type to search collection names → select one
2. Select a source (PAH instance, Galaxy, OCI registry) where that collection is available
3. Optionally select a version at that source (or leave blank for "latest")

The value stored in the template form is:

```typescript
interface CollectionItem {
  name: string; // e.g. "community.general"
  source: string; // source ID — stored in the EE definition file
  version?: string; // version string, or null for "latest"
}
```

### 2.2 BaseImagePicker

Currently **static** — available base images are hardcoded as a JSON schema `enum` in
the template YAML. No API call is made at runtime.

The planned integration requires this to become dynamic — fetching available base images from the content
catalog so that new AAP releases appear automatically without template edits.

The value stored in the template form is:

```typescript
interface EEBaseImageRef {
  imageRef: string; // fully qualified: "registry/image:tag"
  digest?: string; // sha256:... for reproducible pinning (preferred for production)
}
```

---

## 3. Content Boundary: Query Dimensions + Write Schema

### 3.1 Collection type

**What the picker needs to query:**

| Dimension  | Description                                                               | Notes                                                                                 |
| ---------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `name`     | Full-text / prefix search on collection name (e.g. "community.general")   | Powers the first autocomplete                                                         |
| `sources`  | For a selected collection: what sources carry it (PAH, Galaxy, OCI, etc.) | A relation or facet — not a separate RPC. Sources are IDs + human labels              |
| `versions` | For a selected collection + source: available versions                    | May be live-fetched or indexed — freshness is the content service's concern, not ours |

**Write schema (what we store and what must stay stable):**

```typescript
interface CollectionItem {
  name: string; // fully qualified collection name — stable
  source: string; // opaque source ID — MUST survive PAH upgrades (see §4)
  version?: string; // version string, or null/omitted for "latest"
}
```

**Authorization:** `ansible.collections.view` (already declared in `backstage-rhaap-common`)

---

### 3.2 Execution environment image type

**What the picker needs to query:**

| Dimension      | Description                                                       | Notes                                              |
| -------------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| `usableAsBase` | Filter to images that can act as a base image in an EE definition | Boolean facet — not all EEs are usable as base     |
| `imageRef`     | Fully qualified pull reference (`registry/image:tag`)             | Written into `execution-environment.yml`           |
| `digest`       | OCI digest (`sha256:...`) for reproducible pinning                | Optional but preferred for production definitions  |
| `recommended`  | Whether this is the RH-recommended base for new definitions       | UI renders a "Recommended" badge; at most one true |

**Write schema:**

```typescript
interface EEBaseImageRef {
  imageRef: string; // written directly into execution-environment.yml
  digest?: string; // sha256:... for reproducible pinning
}
```

**Authorization:** `ansible.execution-environments.view` (already declared)

---

## 4. Non-Negotiable: `sourceId` Stability

The `source` field in `CollectionItem` is stored inside `execution-environment.yml` files
committed to source control. If the Content Management team changes the opaque ID for a source across
PAH upgrades (e.g. during a re-registration), existing EE definitions silently reference
a source that no longer exists.

**We need one of:**

1. A **stability guarantee**: source IDs are immutable once assigned. Decommissioned sources
   get a tombstone (still resolvable, marked deprecated) rather than a deletion.
2. A **migration event**: an observable signal we can subscribe to when a source ID changes,
   so we can update stored EE definitions proactively.

This is the single hardest dependency between our teams. Everything else in this document
is a fresh build; this one touches committed customer files.

---

## 5. Open Questions

| #      | Question                                                                                                                                                                                                | Impact                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **Q1** | Is `Collection.providedBy` in the current `AutomationContentClient` the stable source ID, or a display label? Determines whether we can use it as the stored `source` field.                            | Write schema stability    |
| **Q2** | Is collection/version data served from a live PAH query or from a Backstage Search index (collator)? Determines picker latency, offline behaviour, and whether search is live-typed or request-on-open. | UX + freshness model      |
| **Q3** | For `usableAsBase` — is this a computed field (introspection-derived) or manually curated? Affects whether new Red Hat EE releases appear automatically or require a catalog update.                    | BaseImagePicker accuracy  |
| **Q4** | Is `digest` always available for catalog-indexed images, or only after a live registry fetch?                                                                                                           | Reproducibility guarantee |

---

## 6. What We Commit To (Portal team)

Once the open questions above are answered:

1. Implementing `CollectionsPicker` against the agreed query API — the cascade (name →
   source → version) maps to the declared query dimensions regardless of how the content service
   implements the underlying query.
2. Implementing `BaseImagePicker` dynamic fetching against the `usableAsBase` filter.
3. Publishing `CollectionItem` and `EEBaseImageRef` in `portal-extension-common` as the
   stable write schemas both teams import.
4. **Not coupling picker internals to RHDH APIs.** The picker calls our abstraction layer;
   that layer calls the published content client. When RHDH changes the search seam, we update the
   adapter — not the picker widget and not the template authors.

---

## 7. Non-Content Pickers (Out of Scope for This Contract)

The remaining five pickers have no content ownership dependency:

| Picker             | Data source                                    | Ownership after extraction                                                   |
| ------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| `EETagsPicker`     | User-provided free text                        | Stays in portal-scaffolder                                                   |
| `PackagesPicker`   | User-provided free text (pip package names)    | Stays in portal-scaffolder                                                   |
| `MCPServersPicker` | Static schema enum from template YAML          | Stays in portal-scaffolder                                                   |
| `AAResourcePicker` | AAP API (organizations, inventories, projects) | Stays in portal-scaffolder, continues to use AAP proxy                       |
| `ScmSelector`      | Static enum (GitHub, GitLab)                   | Stays in portal-scaffolder; may add Gitea if the content service supports it |

The Content Management team is not blocked on any of these five. They are entirely portal-scaffolder
owned and require no content boundary agreement.
