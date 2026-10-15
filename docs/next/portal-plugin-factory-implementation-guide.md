# Portal Plugin Factory — Implementation Guide

## Current delivery scope

The Portal Plugin Factory provides the contracts and SDKs that let first-party and third-party
plugins contribute to Automation Portal. This is an experimental implementation,
not a claim that the full Content Experience Architecture has shipped.

Currently, native NFS composition and the agreed functional checks
are complete. Content extraction and cross-team query/write contracts
remain separate work. The upstream review branch is
`feat/portal-plugin-factory-sdk`; `anstrat-2497-poc` retains the original
development history in the fork.

Use [Portal NFS composition](portal-sdk-nfs-composition.md) for the current
frontend integration contract. Earlier registry and Scalprum descriptions in
historical architecture documents are not instructions for the native app.

## Internal developer-preview readiness

The [internal developer-preview contract](portal-sdk-plugin-author-guide.md#internal-developer-preview-contract)
defines the proposed API boundary, supported launch subset, backend
responsibilities, exclusions, and compatibility policy for consuming teams.
Its implemented behavior is distinct from the policy awaiting joint agreement.
Preview teams develop plugins in this repository's workspaces using
`workspace:^` SDK dependencies and the shared root lockfile. Native composition
being complete does not mean team onboarding or all architecture requirements
are complete; npm publication is not a preview requirement.

Before declaring a consumable preview:

1. Agree on the documented API subset and breaking-change migration policy
   with SDK maintainers and consuming teams.
2. Review the intended consumer's mutation and background-work paths. Migrate
   paths that bypass the agreed authorization/operation boundary, or explicitly
   exclude those features; frontend gates alone are not an exclusion mechanism.
3. Complete the author guide's fresh-clone acceptance with the consuming team's
   workspace plugin: install dependencies from the root, build/test the required
   packages, export dynamically, and install the artifacts in RHDH. No external
   plugin repository or npm publication is required.
4. Record the SDK revision, dependency versions, RHDH image digest, and tested
   artifacts. The current deployment baseline remains `next-2.1` only.

Broader content extraction, additional launch combinations, and a standalone
theme package are separate architecture work. They become preview prerequisites
only if the agreed consumer use case requires them. Idempotency deduplication,
automatic MCP exposure, and durable auditing are not current dispatcher
guarantees; do not advertise them merely because metadata fields exist.

## Workspace ownership

The repository remains named `ansible-backstage-plugins`. Package ownership is
organized under `workspaces/`, with one root Yarn workspace configuration and
lockfile:

- `portal-core/packages/app` and `portal-core/packages/backend`: development harnesses.
- `portal-core/plugins`: shared Portal contracts, host, SDK, operations, and health.
- `self-service/plugins/portal-scaffolder`: `@ansible/portal-scaffolder`, including
  templates, tasks, and the content pages awaiting extraction.
- `aap/plugins`: AAP integration clients, authentication, catalog providers,
  user provisioning, and scaffolder actions.
- `apme/plugins`: the third-party contribution example and its backend modules.

Root `plugins/` and `packages/` directories no longer contain application code.
The WP-001 inventory tool and its `inventory:scan` script are maintained separately
on the fork branch `tools/wp-001`, not in the SDK branch.

## Package responsibilities

All Portal packages below live under `workspaces/portal-core/plugins/`.

- `@ansible/portal-extension-common` owns shared manifest, capability, launch,
  operation, entitlement, and content-type contracts. Runtime predicates belong
  on frontend descriptors, not in serialized contribution metadata.
- `@ansible/portal-extension-api` provides frontend API references, clients, and
  native Blueprint/data-reference contracts through `./alpha`. Its registry
  helpers remain available for legacy compatibility.
- `@ansible/portal-extension-host` validates and filters native descriptors,
  renders eligible contributions, and supplies error boundaries, design-token
  wrappers, and an RJSF settings shell. Native adapters are exported through
  `./alpha`.
- `@ansible/portal-core` installs the `portal` frontend plugin's shared
  contribution, operation, and entitlement APIs. Its `./app-nav` module adapts
  discovered pages into configuration-driven navigation.
- `@ansible/portal-plugin-sdk` supplies reusable components, notifications,
  caching, context hooks, styles, icons, and theme utilities.
- `@ansible/portal-plugin-node` supplies backend operation registration,
  identity/context helpers, audit emission, organization helpers, and health
  reporting infrastructure.
- `@ansible/portal-operations-backend` exposes authorized operation dispatch and
  server-resolved organization/entitlement decisions.
- `@ansible/portal-health-backend` exposes aggregated health at
  `/api/portal-health/status`. Backend health reporting does not imply that a
  health indicator is installed in the application UI.

A standalone `portal-theme` package is not present. Current shell integration
uses Portal navigation, existing theme utilities, and an app-owned global-header
wrapper. RHDH keeps its own platform header.

## Native contribution lifecycle

Plugins declare reusable host-owned Blueprint extensions in static `./alpha`
entry points. They supply content scope, host attachment regions, permissions,
entitlements, and optional narrowing predicates.

The `portal` frontend plugin installs `api:portal/contributions` once.
The provider collects native descriptors through NFS data references rather than
a shared mutable module-load registry. The host validates ownership, contract
versions, references, regions, and content scope before activation.

Content/source matching, enabled experiences, configuration, permissions,
entitlements, and predicates gate component loading. Only eligible contributions
are mounted, inside host error boundaries. Actions dispatch registered operations
with the current subject; plugins do not supply handler URLs.

`CapabilityLaunch` is a discriminated union of slot, workflow, and operation
launches, with optional operation follow-on behavior. Although legacy types still
contain optional `moduleName` metadata, the native path does not resolve arbitrary
module names imperatively. NFS declarations own component loading.

Host experiences remain `content-quality-assessment`, `content-authoring`, and
`content-migration`. Portal scaffolder is a plugin, not a fourth experience.
Built-in catalog overview content is not an APME Quality capability.

## Delivered functional slices

The current native implementation includes:

- Collections, execution environment, repository, template, task history, and
  catalog-import routes, without duplicate `/portal/*` pages.
- Entity tabs, overview cards, entity actions, catalog item actions, catalog
  tabs/columns, workflow launchers, and native scaffolder fields.
- APME Quality, Quality activity, Dependencies, scan actions, Add repository,
  and manual registration/deregistration.
- Configurable sidebar links/groups with plugin-owned route/icon metadata.
  Administration can contain RBAC or link directly to it; Settings is independent.
- Native RBAC, Settings, Search, and source-app global-header integration,
  preserving authorization and existing logout behavior.
- Catalog-removal reconciliation before redirect/refresh, without resubmitting
  an accepted removal operation.
- APME-owned summary refresh while background operations remain active.
- Trusted AAP direct/team memberships intersected with configured organizations,
  and server-side entitlement grants. Any granted membership enables a shared
  capability, subject to RBAC; multiple memberships do not select an active
  organization for organization-specific state.
- Consistent organization context across operation and registration transports,
  central enforcement of declared operation entitlements, and authorized APME
  interactive workflow forwarding. Git repositories remain shared resources;
  new manual entries use `default` without AAP ownership annotations or catalog
  namespace mappings. Existing records are not rewritten.
- Flag-controlled stable AAP user/group/template identities, aligned across
  authentication, catalog sync, and the extracted user provisioner. The frontend
  SDK reads trusted membership context from the backend rather than user namespace.

The legacy app is an explicit `?portalFrontend=legacy` fallback. Do not install
its side-effect registration entry point alongside native APME declarations.

## Verification boundaries

Packed dynamic exports were exercised on
`quay.io/rhdh-community/rhdh:next-2.1` using mock AAP authentication and a local
APME gateway. Separately, the source NFS app was verified with real AAP login and
completed scan-only operations with persisted findings and automatic refresh.

The named manual test-repository registration was created and removed through
native surfaces, preserving the GitHub repository and existing APME history.
These checks do not prove real-AAP authentication inside the RHDH container,
successful scanning of every repository, or remediation/PR creation.

The closure regression run passed 30 targeted suites and 313 tests, with
TypeScript and lint checks passing. This is a previous targeted result, not the
current full-repository test count or a guarantee of GitHub CI status.

The current documentation passes the full strict build. Local documentation
environments must install the configured theme and support Cairo shared-library
discovery for social-card generation; a content-only diagnostic build is not
equivalent to the full configured build.

## Remaining architecture work

### Content extraction and picker contracts

Collections, repository browsing, and built-image views still need their agreed
content-owned boundary and migration. EE definition authoring and Portal picker
widgets retain their appropriate authoring/scaffolder ownership.

The content boundary is a generic query with type-declared fields and a stable
write schema, not a private RPC per dropdown. For collection and base-image
selection, agree on:

1. Query fields, source/version facets or relations, and freshness semantics.
2. Persisted collection selections and image reference/digest schemas.
3. Stable source IDs that survive upgrades and appear in EE definition files.
4. Authorization on returned hits and the published client/transport boundary.

AAP-resource pickers remain AAP integration concerns. Free-text/template-enum
fields do not block the content boundary. See the
[content picker contract proposal](portal-content-picker-contract-proposal.md).
It is still a proposal, not a jointly frozen production contract.

### Production contracts and delivery

Use the [preview contract](portal-sdk-plugin-author-guide.md#internal-developer-preview-contract)
for the bounded internal authoring surface. Its proposed `0.1.x` compatibility
policy is not a jointly approved supported-release commitment.

Authorization migration remains for legacy mutation routes and automatic
background scans. The current interactive checks do not create organization
selection, gateway tenancy, or cancellation of already-running work.

Before broader release, agree on contract versioning, compatibility guarantees,
and delivery ownership with the consuming teams. Package publication and
out-of-tree onboarding are separate future delivery decisions, not prerequisites
for this in-repository preview. Complete
remaining architecture requirements independently of native UI composition;
in particular, do not infer full multi-organization session support or durable
audit storage from the current SDK helpers.

Repository renaming to `automation-portal-plugins` remains deferred pending
coordination. The completed workspace move does not mean the repository rename
or all planned architecture work is complete.

## Related documentation

- [Portal NFS composition](portal-sdk-nfs-composition.md): native declarations,
  configuration, validation, and troubleshooting.
- [Content picker contract proposal](portal-content-picker-contract-proposal.md):
  cross-team query and write-schema agreement.
- [Developer quickstart](portal-sdk-quickstart.md): explicitly labeled legacy
  compatibility example; use the NFS guide for native integration.
- [Design tokens](portal-sdk-design-tokens.md): theme-adaptive styling.
- [RHDH dynamic plugins](portal-sdk-rhdh-dynamic-plugin.md): deployment guidance.
- `workspaces/README.md` in the repository: package ownership.
