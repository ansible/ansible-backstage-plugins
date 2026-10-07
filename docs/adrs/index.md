# Architecture Decision Records

ADRs for the Ansible Automation Portal and its plugins. They are **public by default**. An ADR stays unpublished only if it is labeled confidential or still contains secrets, internal hostnames, or customer data after a scrub.

Numbers are **global** (001, 002, …). Folders are the **audience**, not a second number space.

| Folder | Audience | Third-party authors |
| --- | --- | --- |
| [common](common/index.md) | Every factory plugin, in-tree or out-of-tree | **Required** |
| [third-party](third-party/index.md) | Extra obligations for plugins that live in other repositories | **Required** |
| [host](host/index.md) | Portal host, first-party plugins, installer, SDLC | Optional; skip unless you are changing the host |

## Index

| ADR | Title | Audience | Status |
| --- | --- | --- | --- |
| [001](host/001-config-storage-and-precedence.md) | Configuration Storage and Precedence | host | Proposed |
| [002](host/002-config-boundary-rule.md) | Configuration Boundary Rule | host | Proposed |
| [003](host/003-admin-experience-wizard-and-settings.md) | Admin Experience — Wizard and Settings Pages | host | Proposed |
| [004](host/004-auth-and-restart-lifecycle.md) | Authentication and Restart Lifecycle | host | Proposed |
| [005](host/005-deployment-architecture.md) | Deployment Architecture — Plugins and Database | host | Proposed |
| [006](host/006-sdlc-document-structure.md) | SDLC Document Structure | host | Accepted |
| [007](host/007-agent-skills-location.md) | Agent Skills Location | host | Accepted |
| [010](common/010-plugin-factory-composability.md) | Plugin Composability and Independence | common | Accepted |
| [011](common/011-plugin-factory-config-namespace.md) | Portal Plugin Configuration Namespace | common | Accepted |
| [012](common/012-plugin-factory-preview-labeling.md) | Plugin Factory Preview Labeling | common | Accepted |
| [013](common/013-plugin-factory-enablement-defaults.md) | Preview Plugin Enablement Defaults | common | Accepted |
| [015](common/015-plugin-factory-catalog-first-surfaces.md) | Catalog-First Placement and Host Surface Slots | common | Accepted |
| [016](common/016-plugin-factory-template-vs-plugin.md) | Software Template vs Factory Backstage Plugin | common | Accepted |
| [017](common/017-plugin-factory-preview-chip-placement.md) | Preview Chip Placement | common | Accepted |
| [018](common/018-plugin-factory-shared-ui-primitives.md) | Factory Shared UI Primitives | common | Accepted |
| [019](common/019-plugin-factory-delivery-lifecycle.md) | Factory Capability Delivery Lifecycle | common | Accepted |
| [020](common/020-multi-org-namespace-isolation.md) | Multi-Org Namespace Isolation | common | Accepted |
| [021](host/021-template-type-taxonomy.md) | Template Type Taxonomy | host | Accepted |
| [022](common/022-multi-org-rbac-and-auth.md) | Multi-Org RBAC and Auth | common | Accepted |
| [023](host/023-per-template-rbac-filtering.md) | Per-Template RBAC Visibility Filtering | host | Accepted |
| [024](host/024-sync-ux-backstage-signals.md) | Sync UX — Backstage Signals | host | Accepted |
| [026](common/026-multi-org-architecture-overview.md) | Multi-Org Architecture Overview | common | Accepted |
| [027](common/027-catalog-entity-naming-and-namespaces.md) | Catalog Entity Naming and Namespaces | common | Accepted |
| [028](third-party/028-out-of-tree-plugin-obligations.md) | Out-of-Tree Plugin Obligations | third-party | Proposed |

Some `common` ADRs still mention `packages/app` or in-tree paths. Those **location sentences** are host details. The **rules** (zero footprint, config namespace, no cross-plugin implementation deps) still bind out-of-tree plugins. See [ADR-028](third-party/028-out-of-tree-plugin-obligations.md).
