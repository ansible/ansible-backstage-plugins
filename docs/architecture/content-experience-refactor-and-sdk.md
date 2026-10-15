# Content Experience Architecture Refactoring — What Needs to Be Done

> **Historical planning reference:** This document preserves an earlier proposed
> migration sequence, not the current delivery status. For the implemented SDK,
> see [SDK architecture](../next/portal-sdk-architecture.md) and the
> [implementation guide](../next/portal-plugin-factory-implementation-guide.md).

> **Source documents:** [Migration Plan](https://github.com/cidrblock/ansible-backstage-plugins/blob/1c62d85d20a25d70198dc3855adb4f4911b7a132/docs/next/Content%20Experience%20Architecture%20Refactoring%20and%20Migration%20Plan.md), [V4 Architecture Guide](https://github.com/cidrblock/ansible-backstage-plugins/blob/1c62d85d20a25d70198dc3855adb4f4911b7a132/docs/next/Content%20Experience%20Architecture%20%26%20Integration%20Guide%20V3.md), and 45 work packages in `docs/next/content-experience-migration/work-packages/`.

---

## 1. The Problem Being Solved

### Current state — a tightly coupled monorepo

The existing `ansible-backstage-plugins` repo has several architectural problems:

- **Mixed concerns**: Backend adapters (OCI, Galaxy/Pulp, Git), content-type interpretation, catalog projection, and UI are all tangled together in a few large packages (`catalog-backend-module-rhaap`, `self-service`, `backstage-rhaap-common`).
- **No durable state**: The earlier implementation (`automation-content-plugins`) uses in-memory indexes — content observations, EE digest caches, OCI reconcile history — that are lost on restart.
- **Hard-coded domain knowledge**: The core portal directly imports APME code. Adding or removing APME requires rebuilding and redeploying the entire portal.
- **No stable public contracts**: External plugins and field teams have no published SDK to depend on. Any integration must directly import internal code.
- **Arbitrary URL exposure**: Some capabilities allow plugins to register endpoint URLs that get proxied. This is unsafe and un-auditable.
- **Two diverging implementations**: The earlier `automation-content-plugins` implementation (which handles OCI/EE sources) and the main portal are separate codebases solving overlapping problems.

### Target state — the V4 architecture

The V4 architecture establishes four outcomes:

1. Preserve all current portal, AAP, SCM, Automation Hub, EE, scaffolder, and APME functionality with zero flag-day breakage.
2. Introduce **Content Primitives** — normalized, content-agnostic Trust, Intent, and Quality signals computed over any source (Git, OCI, Automation Hub, filesystem).
3. Allow domain plugins (APME, X2Ansible, Red Hat Edge, partner integrations) to register backend operations, entity UI, actions, and settings **without** direct imports in the portal core.
4. Give Portal UI, REST clients, Backstage Scaffolder, and MCP callers **the same service, authorization, and audit boundary**.

---

## 2. The New Architecture at a Glance

### The Content Primitives Model

Three families of signals are computed and normalized for every piece of automation content, regardless of where it comes from:

| Family      | Examples                                                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Trust**   | Certification status, publisher identity, signing status, provenance chain, security scan results, dependency health, support boundary |
| **Intent**  | Business use cases, target infrastructure, compliance alignment, capability definitions, industry verticals                            |
| **Quality** | Code quality, documentation completeness, test coverage, structure compliance, maintenance signals, compatibility matrix               |

These primitives are stored durably in PostgreSQL, not in Backstage Catalog annotations. Catalog is a rebuildable _projection_ from the canonical primitive store.

### End-to-end data flow

```
Source (SCM / OCI / Hub / filesystem)
  → Backend Adapter (protocol-specific discovery & reads)
  → Ingestion Orchestrator (coordinates adapter + content-type)
  → Content-Type Adapter (identifies & normalizes semantics)
  → PostgreSQL (canonical content observations & primitive records)
  → Primitive Processors / Enrichers (trust scores, AI metadata, CVE scans)
  → Transactional Outbox
  → Catalog Projector → Backstage Catalog
  → Search Projectors → Lexical + Vector indexes
  → Normalized REST API → Portal UI / REST clients / Scaffolder / MCP
```

### Target package layout (in `ansible-backstage-plugins`)

```
plugins/
├── core/
│   ├── portal-theme/                       # Shell, branding, global nav
│   ├── portal-auth-common/                 # Identity contracts (portable)
│   ├── portal-auth-frontend/               # Browser auth/logout
│   ├── portal-scaffolder-frontend/         # Generic Golden Path UX
│   └── scaffolder-backend-module-portal/   # Generic Ansible scaffolder actions
│
├── portal-extension-common/        # Serializable contribution descriptors (SDK boundary)
├── portal-extension-api/           # Frontend API refs & React bindings (SDK boundary)
├── portal-extension-host/          # Multi-provider registry & composition
│
├── content-primitives/
│   ├── content-primitives-common/          # Portable schemas & DTOs (SDK boundary)
│   ├── content-primitives-permissions/     # Backstage permission contracts (SDK boundary)
│   ├── content-primitives-client/          # Browser/Node REST client (SDK boundary)
│   ├── content-primitives-node/            # Backend extension points (SDK boundary)
│   ├── content-primitives-backend/         # Application service + PostgreSQL + API
│   ├── content-primitives-backend-module-trust/
│   ├── content-primitives-backend-module-quality-intent/
│   ├── content-primitives-frontend/        # Generic content UI components
│   └── content-primitives-mcp/             # MCP translation layer
│
├── backend-adapters/
│   ├── adapter-git/                # GitHub / GitLab / Gitea
│   ├── adapter-oci/                # OCI Distribution v2 (Quay, Harbor, GHCR)
│   ├── adapter-automation-hub/     # Galaxy v3 + Pulp
│   └── adapter-filesystem/         # Local / NFS
│
├── content-types/
│   ├── content-type-execution-environment-common/
│   ├── content-type-execution-environment-node/
│   ├── content-type-execution-environment-frontend/
│   └── content-type-collection-node/
│
├── aap/
│   ├── aap-common/                               # Controller/Hub DTOs, permissions
│   ├── aap-node/                                 # IAAPService, AAP REST client
│   ├── aap-backend/                              # Plugin ID `aap`, credential management
│   ├── aap-backend-module-content-operations/    # Typed AAP operation handlers
│   ├── auth-backend-module-aap-provider/         # OAuth provider
│   ├── catalog-backend-module-aap/               # Org/team/user/job-template sync
│   ├── scaffolder-backend-module-aap/            # rhaap:* action wrappers
│   └── aap-frontend/                             # /ansible overview, auth UI
│
├── catalog-backend-module-content-primitives/
├── search-backend-module-content-primitives/
├── scaffolder-backend-module-content-operations/
└── content-compatibility/          # Legacy route aliases during migration
```

After extraction, APME moves to a **separate repository** with this layout:

```
plugins/ (in apme repository)
├── apme-common/                              # Wire schemas
├── apme-client/                              # Authenticated client for plugin `apme`
├── apme-backend/                             # Plugin ID `apme`
├── apme-backend-module-content-operations/   # Registers operations into content-primitives
├── apme-backend-module-content-processors/   # APME primitive processors
├── catalog-backend-module-apme-compatibility/ # Legacy /api/catalog/apme/* aliases
├── apme-frontend/
└── apme-scaffolder/
```

---

## 3. How This Creates an SDK

The architecture is fundamentally about publishing a **stable, versioned SDK** that allows both Red Hat teams and external partners to extend the portal without touching core code.

### SDK surface — what gets published as NPM packages

| Package                          | Who consumes it                               | What it provides                                                                                                 |
| -------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `content-primitives-common`      | Everyone (frontend, backend, MCP, partners)   | Portable wire schemas: content identity, observations, primitive records, events, DTOs — no runtime dependencies |
| `content-primitives-permissions` | Backend modules, frontend plugins             | Backstage permission objects, resource types, conditional rule factories                                         |
| `content-primitives-client`      | Frontend plugins, MCP, partner tools          | Browser/Node REST client for the normalized content API — authentication and retry injected by caller            |
| `content-primitives-node`        | Backend plugins and modules only              | Interfaces for backend adapters, content-type adapters, primitive processors, operation handlers, registries     |
| `portal-extension-common`        | Domain plugins (APME, X2Ansible, Edge, Cisco) | Serializable descriptors for entity tabs, actions, overview cards, menus, settings sections, routes              |
| `portal-extension-api`           | Domain frontend plugins                       | Frontend API refs, React contribution contracts, lazy component loaders                                          |

### What the SDK enables

**1. Adding a new content source adapter**

A team implementing a new source (e.g. a Gitea instance or a private OCI registry) implements `BackendAdapter` from `content-primitives-node`, registers it, and gets ingestion, primitive processing, Catalog projection, and search indexing for free.

**2. Adding a new content type**

A team implementing a new content type (e.g. Ansible Skills) implements `ContentTypeContribution` from `content-primitives-node`. The type is detected across any capable source without source-specific code.

**3. Adding a domain plugin (APME, X2Ansible, Red Hat Edge)**

Domain plugins never touch the portal's source code. They:

- Register typed `OperationDescriptor` handlers via `content-primitives-node`
- Register UI contributions (entity tabs, actions, cards, settings) via `portal-extension-api`
- Consume the normalized content and operation APIs via `content-primitives-client`
- Deploy as independent RHDH Dynamic Plugins

**4. Field/partner declarative templates**

Partners (Cisco, F5, field consultants) can add `Template` entities as pure YAML in their own SCM repos. No code or portal rebuild required. When custom execution logic is needed, they package a thin `createTemplateAction` wrapper that calls a registered typed operation through the scaffolder bridge — the partner never owns credentials or direct network access.

**5. AI agent access via MCP**

`content-primitives-mcp` exposes a small, stable tool set over the same normalized API the portal UI uses. AI agents (Claude, Cursor, autonomous agents) get the same authorization, audit trail, and data as human users. MCP tools are generated only from approved operation descriptors — arbitrary URLs can never become MCP tools.

### The key design rule: register operations, not URLs

A core SDK principle that prevents supply-chain risk:

- Domain plugins register **`OperationDescriptor` + handler** (backend-owned)
- Consumers (UI, Scaffolder, MCP) discover a **serialized descriptor** (metadata only)
- Only the server resolves the handler — callers cannot supply target URLs, methods, headers, or credentials
- Every invocation goes through: authentication → input validation → resource resolution → authorization → policy + exposure check → audit

---

## 4. The 45 Work Packages by Workstream

### Freeze behavior (2 WPs)

**Goal:** Capture an immutable, machine-readable record of every current contract before anything moves.

| WP     | Title                                   | What it does                                                                                                                                                                                                                                                                    |
| ------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP-001 | Contract and behavior fixture inventory | Auto-generates inventories of all public exports, backend plugin/module registrations, REST routes, entity shapes, permissions, scaffolder action IDs, browser storage keys, and dynamic artifacts from both pinned baseline repos. CI fails if any contract is unregistered.   |
| WP-002 | Architecture ADR set                    | Writes and approves Architecture Decision Records for every cross-package boundary: adapter separation, digest identity, Catalog-as-projection, typed operation registration, PostgreSQL ownership, outbox, search, credential delegation, compatibility policy, and packaging. |

### Common contracts (3 WPs)

**Goal:** Publish the portable SDK contracts that everything else builds on.

| WP     | Title                            | What it does                                                                                                                                                                                                                     |
| ------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP-003 | Common primitive contracts       | Creates `content-primitives-common` — portable, runtime-agnostic schemas for content identity, observations, primitive records, evidence, events, operations, jobs, errors, and pagination. No React, no Backstage, no Express.  |
| WP-004 | Node adapter/processor contracts | Creates `content-primitives-node` — backend-neutral interfaces for backend adapters, content-type adapters, processors, enrichers, projectors, repositories, and operation handlers. Capability-based (no backend ID branching). |
| WP-005 | Shared API DTO client            | Creates `content-primitives-client` — one browser/Node-safe authenticated REST client for normalized content, primitives, provenance, search, operations, jobs, and SSE. Auth/retry injected by caller.                          |

### Unified ingestion (4 WPs)

**Goal:** Extract the earlier OCI/EE implementation into the new adapter structure; unify with the portal's existing ingestion.

| WP     | Title                                   | What it does                                                                                                                                                                         |
| ------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WP-006 | OCI adapter extraction                  | Moves OCI Distribution v2 client and discovery logic into `adapter-oci`, behind `BackendAdapter` from WP-004. Separates OCI protocol from EE content-type interpretation.            |
| WP-007 | Unified ingestion orchestrator          | Creates the ingestion coordinator in `content-primitives-backend` — drives backend adapters, routes candidates to content-type adapters, persists observations, emits outbox events. |
| WP-008 | EE runtime split and adapter correction | Splits EE code into `content-type-execution-environment-common/node/frontend`. Removes all `backendId: 'oci'` hardcoding; EE detection works over any capable source.                |
| WP-041 | Automation Hub adapter extraction       | Moves the Galaxy v3 + Pulp client into `adapter-automation-hub`. Preserves all collection entities, pagination, documentation reads, and sync behavior. Explicitly not OCI.          |

### Durable state (2 WPs)

**Goal:** Replace in-memory indexes with PostgreSQL-backed repositories.

| WP     | Title                          | What it does                                                                                                                                                                                                                               |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WP-009 | PostgreSQL content schema      | Adds migrations and repository implementations for sources, observations, mutable references, manifests, primitive records, evidence, reconciliation runs, jobs, outbox events, and idempotency keys. Backfills existing OCI observations. |
| WP-010 | Reconcile outbox + idempotency | Implements the transactional outbox pattern — content/primitive changes emit ordered, deduplicated events consumed by Catalog and Search projectors. Enables restart-safe enrichment.                                                      |

### Read/write API (5 WPs)

**Goal:** Expose the canonical normalized REST API and the typed operation system.

| WP     | Title                             | What it does                                                                                                                                                                                                                                 |
| ------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP-011 | Normalized read API               | Implements the stable `GET /v1/content/*`, `/v1/collections/*`, `/v1/content-items/*`, `/v1/content/{id}/primitives`, `/v1/content/{id}/provenance` endpoints in `content-primitives-backend`. OpenAPI-first; generated client.              |
| WP-012 | Operation registry and invocation | Implements typed `OperationDescriptor` registration, discovery, durable job invocation, idempotency, cancellation, SSE job events, and typed errors. Replaces arbitrary URL execution for all write operations.                              |
| WP-013 | Permission audit pipeline         | Implements the shared authentication → resource resolution → Backstage permission check → redaction → audit emission pipeline used by all REST, Scaffolder, UI, and MCP invocations.                                                         |
| WP-014 | Legacy content API aliases        | Adds `content-compatibility` — compatibility route aliases for all 13 RHAAP Catalog router paths and 20 automation-content router paths from the earlier implementation, preserving exact auth, status, and body semantics during migration. |
| WP-044 | AAP delegated authorization       | Implements the AAP user credential delegation model — how Backstage-authenticated users invoke AAP operations using their own controller credentials rather than a shared service account.                                                   |

### Remaining adapters (4 WPs)

**Goal:** Extract Git and collection adapters; add filesystem; add source administration UI.

| WP     | Title                           | What it does                                                                                                                                                                                                             |
| ------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WP-015 | Git adapter extraction          | Moves GitHub/GitLab/Gitea discovery, file reads, commit resolution, webhook/poll, and CI metadata into `adapter-git`. Decouples from `AnsibleGitContentsProvider` and the Git file-content route.                        |
| WP-016 | Collection content-type adapter | Creates `content-type-collection-node` — source-independent Galaxy metadata parsing, plugin/role/playbook/rulebook enumeration, documentation, and relation extraction. Works over Git, OCI, Hub, or filesystem sources. |
| WP-017 | Filesystem adapter              | Creates `adapter-filesystem` — root-allowlisted recursive discovery, hashing, marker reads, watch/poll, symlink safety. New capability; no predecessor.                                                                  |
| WP-042 | Source settings administration  | Creates admin UI for managing backend adapter source configurations (registries, repositories, Hub endpoints) via typed operations through WP-012.                                                                       |

### Catalog + processors (4 WPs)

**Goal:** Replace current Catalog providers with projectors over the canonical content store; add the processor framework.

| WP     | Title                             | What it does                                                                                                                                                                                                                     |
| ------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP-018 | Catalog projector                 | Creates `catalog-backend-module-content-primitives` — consumes outbox events to upsert Backstage entities, annotations, and relations from canonical content. Projections are rebuildable; Catalog is never the canonical store. |
| WP-019 | Primitive processor framework     | Implements the synchronous processor pipeline in `content-primitives-backend` — bounded, inexpensive pre-commit validators and extractors that run before the content observation transaction commits.                           |
| WP-020 | Initial trust processors          | Implements the first trust primitive processors (certification status, publisher identity, signing status, provenance chain) via `content-primitives-backend-module-trust`.                                                      |
| WP-021 | Initial quality/intent processors | Implements the first quality/intent processors (code quality, documentation completeness, structure compliance, business use cases) via `content-primitives-backend-module-quality-intent`.                                      |

### Portal composition (5 WPs)

**Goal:** Build the extension SDK for dynamic plugins; refactor the portal shell.

| WP     | Title                               | What it does                                                                                                                                                                                                                       |
| ------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP-022 | Portal extension API                | Creates `portal-extension-common` (serializable descriptors for tabs, actions, cards, menus, settings, routes) and `portal-extension-api` (frontend API refs, lazy React bindings). This is the core of the plugin SDK.            |
| WP-023 | Multi-provider extension host       | Creates `portal-extension-host` — aggregates contributions from all registered domain plugins, evaluates applicability, resolves permissions, and renders with conflict detection and zero-provider fallbacks.                     |
| WP-024 | Git repository extension adapter    | Migrates the current `GitRepositoriesExtensionsApi` to the new extension model. Git repository pages become open for contributions from any registered plugin.                                                                     |
| WP-025 | Generic content frontend            | Creates `content-primitives-frontend` — reusable React components for content browser, trust badge, provenance view, intent facets, quality graphs, compatibility and dependency panels.                                           |
| WP-043 | Dynamic runtime registration ledger | Creates a continuously-generated, machine-readable ledger of every deployed package, artifact digest, plugin/module ID, route, API ref, permission, and config schema. Reconciles against every deployment overlay before cutover. |

### Typed operations (2 WPs)

**Goal:** Wire Scaffolder into the operation system; register AAP operations.

| WP     | Title                       | What it does                                                                                                                                                                                                                                                                                       |
| ------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP-026 | Scaffolder operation bridge | Extracts `portal-scaffolder-frontend` and `scaffolder-backend-module-portal`, then creates `scaffolder-backend-module-content-operations` — a generic bridge that discovers WP-012 operations and invokes them from Scaffolder tasks. Partner template contribution model is also documented here. |
| WP-027 | AAP operation registrations | Registers typed `OperationDescriptor` handlers for all current AAP capabilities: job template launch, EE build, project create, organization sync, Git CI dispatch, source registration/deregistration. These replace the direct route implementations.                                            |

### APME extraction (6 WPs)

**Goal:** Move APME out of the portal core into its own independently releasable dynamic plugin.

| WP     | Title                                    | What it does                                                                                                                                                                                            |
| ------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP-028 | APME database migration                  | Migrates APME from JSON file storage to `DatabaseService`-backed PostgreSQL — projects, scans, settings, galaxy servers, activity outcomes, and scheduler cursors.                                      |
| WP-029 | APME backend plugin and operation module | Splits APME into `apme-backend` (plugin ID `apme`, `/api/apme` router, DB, scheduler) and `apme-backend-module-content-operations` (typed operation registrations into the content-primitives service). |
| WP-030 | APME frontend registration               | Registers APME's entity tabs, overview cards, fleet quality page, entity actions, violations column, and settings sections via the WP-022 extension API — no direct portal imports.                     |
| WP-031 | APME catalog compatibility module        | Creates `catalog-backend-module-apme-compatibility` — preserves all 36 `/api/catalog/apme/*` route declarations as aliases to the new APME operation system during the transition period.               |
| WP-032 | APME dynamic extraction                  | Packages APME as a standalone RHDH Dynamic Plugin deliverable. Dual-registration parity verified. After this, APME releases independently.                                                              |
| WP-045 | APME browser state compatibility         | Preserves the `AI_MODEL_STORAGE_KEY` (`localStorage`) behavior used by `@apme/ui-workflow` — server `defaultAiModelId` takes precedence, then local storage, then provider fallback.                    |

### Search, MCP, quality gates (6 WPs)

**Goal:** Add intelligent search; expose the full API to AI agents via MCP; run cross-surface parity validation.

| WP     | Title                        | What it does                                                                                                                                                                                                                                               |
| ------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP-033 | Lexical search collator      | Creates `search-backend-module-content-primitives` — Backstage Search collator that indexes normalized content, primitive summaries, and intent facets for text search.                                                                                    |
| WP-034 | Semantic search projection   | Adds vector embedding generation and `pgvector` indexing for semantic search. Embedding privacy and model provenance governed by ADR.                                                                                                                      |
| WP-035 | Intent and hybrid search API | Adds `POST /v1/search` (lexical + vector hybrid) and `POST /v1/intent:resolve` (natural language intent matching) endpoints to `content-primitives-backend`.                                                                                               |
| WP-036 | MCP stable tools             | Creates `content-primitives-mcp` — stable versioned tools: `search_content`, `resolve_intent`, `get_content_details`, `get_trust_signals`, `get_provenance_chain`, `scaffold_from_template`. All via `content-primitives-client` only; no backend imports. |
| WP-037 | MCP dynamic operation tools  | Generates additional MCP tools from WP-012 operation descriptors that pass an explicit exposure allowlist. Includes confirmation gates, audit links, emergency disable, and versioned tool naming.                                                         |
| WP-038 | Cross-surface parity suite   | Verifies that Portal UI, REST API, Scaffolder, and MCP callers receive equivalent authorized facts and behavior for the same principal and request. The final quality gate before deprecation.                                                             |

### Cleanup (2 WPs)

**Goal:** Retire compatibility shims; archive or repurpose the earlier content repository.

| WP     | Title                                   | What it does                                                                                                                                                                                                                                  |
| ------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP-039 | Compatibility telemetry and deprecation | Adds usage metrics to every compatibility alias. Removes aliases in a documented, sequenced process only after their contract-family retirement gate passes (WP-038 parity + measured zero use).                                              |
| WP-040 | Content repository disposition          | Decides (requires named owner approval) whether `automation-content-plugins` is archived after ADR/history transfer or retained as an integration harness consuming published packages. It must not remain a second divergent implementation. |

---

## 5. What Changes in the Existing Codebase

### Packages being split or renamed

| Current package                                             | Splits into                                                                                                                                        | Workstream                            |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `@ansible/backstage-rhaap-common`                           | `aap-common` + `aap-node`                                                                                                                          | Common contracts / typed operations   |
| `@ansible/plugin-backstage-rhaap`                           | `portal-theme` + `aap-frontend`                                                                                                                    | Portal composition / typed operations |
| `@ansible/plugin-backstage-self-service`                    | `portal-scaffolder-frontend` + `content-primitives-frontend` + `aap-frontend` + `portal-extension-host`                                            | Portal composition / typed operations |
| `@ansible/backstage-plugin-catalog-backend-module-rhaap`    | `catalog-backend-module-aap` + `adapter-automation-hub` + `adapter-git` + EE type/projector + `content-compatibility`                              | Ingestion through typed operations    |
| `@ansible/plugin-scaffolder-backend-module-backstage-rhaap` | `scaffolder-backend-module-portal` + `scaffolder-backend-module-aap` + content operation bridge                                                    | Typed operations                      |
| `@ansible/backstage-apme-common`                            | `apme-common` in APME repository                                                                                                                   | APME extraction                       |
| `@ansible/plugin-backstage-apme`                            | `apme-frontend` in APME repository                                                                                                                 | APME extraction                       |
| `@ansible/backstage-plugin-catalog-backend-module-apme`     | `apme-backend` + `apme-backend-module-content-operations` + `apme-backend-module-content-processors` + `catalog-backend-module-apme-compatibility` | APME extraction                       |

### Compatibility rules during migration

Nothing gets deleted when its target is created. Every current contract is preserved until:

1. The replacement passes the acceptance gate in its work package.
2. The `content-compatibility` package retains all route aliases.
3. WP-038 cross-surface parity proves equivalent behavior.
4. WP-039 telemetry shows measured zero use.

Contracts explicitly preserved:

- All `/api/catalog/ansible/*` and `/api/catalog/apme/*` routes (13 + 36 declarations)
- All scaffolder action IDs (`rhaap:*`, `ansible:*`) and autocomplete providers
- All `ansible.*` permissions and annotation shapes
- All dynamic plugin artifacts and RHDH route mount configurations
- Browser `sessionStorage` keys for OAuth redirect restoration
- `AI_MODEL_STORAGE_KEY` localStorage behavior

---

## 6. Dependency Rules (Enforced by Architecture Tests)

```
content-primitives-common  ← no runtime deps; portable
content-primitives-node    ← depends on common only; no concrete adapters
content-primitives-client  ← depends on common only; no backend/React
portal-extension-common    ← dependency-light descriptors
portal-extension-api       ← depends on extension-common; no backend
content-primitives-backend ← depends on node + common; no React
backend adapters           ← depend on node; no content-type branching
content-type adapters      ← depend on node; use capabilities, not backend IDs
content-primitives-mcp     ← depends on client only; no backend imports
domain frontends           ← depend on extension-api + common; no host internals
domain backends            ← depend on node + common; no portal core imports
```

CI enforces these with forbidden-import tests. A domain plugin importing a portal internal will fail the architecture check.

---

## 7. What the SDK Looks Like for a Third Party

A Cisco team wanting to add an "ACI validation" scaffolder action would:

1. Depend on `@ansible/content-primitives-common` and `@ansible/portal-extension-api` (published NPM packages)
2. Register a backend operation in their RHDH Dynamic Plugin
3. Write a thin `createTemplateAction` that calls the operation by ID through the scaffolder bridge
4. Ship a declarative `Template` YAML entity pointing to their skeleton repo

They never touch `ansible-backstage-plugins` source code. Their plugin's release cycle is independent.

```typescript
// cisco-scaffolder-plugin/src/actions.ts
import { createTemplateAction } from '@backstage/plugin-scaffolder-node';

export const createCiscoAciValidateAction = () =>
  createTemplateAction({
    id: 'cisco:aci:validate-endpoint',
    schema: {
      input: {
        type: 'object',
        required: ['targetId', 'tenantName'],
        properties: {
          targetId: { type: 'string' },
          tenantName: { type: 'string' },
        },
      },
    },
    async handler(ctx) {
      // Bridge invokes the registered server-side operation by ID.
      // The server owns credential resolution, SSRF prevention, and audit.
      await operationClient.invoke({
        operationId: 'cisco.aci.tenant.validate',
        version: '1.0.0',
        subject: { targetId: ctx.input.targetId },
        input: { tenantName: ctx.input.tenantName },
        idempotencyKey: ctx.task.id,
        correlationId: ctx.task.id,
      });
    },
  });
```

---

## 8. Execution Protocol

The work-package README defines these execution rules:

1. Work on one work package (or one explicitly listed PR slice) at a time.
2. Verify every prerequisite using linked artifacts — a dependency being merged is not sufficient unless its exit evidence is green.
3. Preserve baseline behavior until the relevant contract-family retirement gate passes.
4. Do not resolve a `TBD` or decision gate by assumption — record the decision in an ADR and obtain named approval.
5. Keep package moves separate from behavior changes where practical.
6. Update generated compatibility and runtime-registration ledgers in the same PR as any public contract change.
7. Attach test output, migration evidence, and rollback evidence to every PR.

### Required checks on every PR

| Repository                   | Checks                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `ansible-backstage-plugins`  | `prettier:check`, `lint:all`, `tsc`, `test`, `openapi:lint`, `openapi:check-drift` |
| `automation-content-plugins` | `prettier:check`, `lint:all`, `tsc`, `test`                                        |
| New APME / deployment repos  | Checked-in repository policy + all applicable build/lint/type/test/artifact gates  |

---

## 9. Key Decision Gates Still Required

Before implementation of some workstreams can begin, named owners must approve decisions:

- **Persistence ADR** (required before WP-009): PostgreSQL schema layout, transaction boundaries, retention, backup/restore, and downgrade behavior.
- **AAP delegated authorization** (WP-044): Exactly how Backstage-authenticated users delegate their AAP credentials to backend operations.
- **Gitea support** (WP-002): Confirm delivery or produce a dated deviation with a named owner and tracking issue.
- **`automation-content-plugins` disposition** (before search, MCP, and quality gates): Archive vs. integration harness — confirmed by named owners before WP-040.
- **Embedding model and privacy** (before WP-034): Approved by architecture and security before vector search implementation begins.
- **MCP stable tool inventory** (before WP-036): The exact list of approved stable tools must be confirmed before implementation.

---

## 10. Summary — What Needs to Be Done

| #   | What                                                                                          | When                           |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------ |
| 1   | Run WP-001 scanners — generate the complete behavioral inventory of both repos                | First                          |
| 2   | Write and approve the ADR set (WP-002) — every boundary decision must be explicit             | Before common contracts        |
| 3   | Publish the common contracts and client SDK (WP-003, 004, 005)                                | common contracts               |
| 4   | Extract OCI, Hub, and EE adapters into the unified ingestion pipeline (WP-006, 007, 008, 041) | unified ingestion              |
| 5   | Replace in-memory state with PostgreSQL (WP-009, 010)                                         | durable state                  |
| 6   | Ship the normalized REST API and typed operation registry (WP-011, 012, 013, 014, 044)        | read/write API                 |
| 7   | Extract Git, collection, and filesystem adapters; add source admin (WP-015, 016, 017, 042)    | remaining adapters             |
| 8   | Replace Catalog providers with projectors; add primitive processor framework (WP-018–021)     | catalog and processors         |
| 9   | Ship the extension SDK (WP-022, 023, 024, 025, 043) — this is the public plugin API           | Portal composition             |
| 10  | Wire Scaffolder to operation system; register all AAP operations (WP-026, 027)                | typed operations               |
| 11  | Extract APME to its own repo and dynamic plugin (WP-028–032, 045)                             | APME extraction                |
| 12  | Add lexical + semantic search and MCP tools (WP-033–038)                                      | search, MCP, and quality gates |
| 13  | Remove compatibility shims; archive the earlier content repository (WP-039, 040)              | compatibility cleanup          |
