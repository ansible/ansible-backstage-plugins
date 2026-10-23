---
render_macros: false
---

# Third-party Portal plugin author guide

Use the Portal contracts to contribute functionality without modifying
self-service or importing another optional plugin's implementation. Declare
frontend extensions statically through NFS and register backend operations
through injected host services.

This guide describes the current experimental SDK for teams developing plugins
inside this repository's workspaces. The preview uses `workspace:^` SDK
dependencies and the shared root lockfile; npm publication is not required.
Supported-release compatibility guarantees and backend authorization closure
are not yet complete. Use this guide for coordinated internal development,
not as a production-readiness certification.

## Internal developer-preview contract

This section defines the proposed contract for coordinated internal plugin
development. The implemented behavior below is available on the SDK branch;
the compatibility and migration policy still requires agreement between SDK
maintainers and consuming teams. This document does not announce a published
preview release or certify every existing backend path.

### Preview API boundary

The preview surface consists of the documented shared contracts in
`@ansible/portal-extension-common`, native Blueprints and descriptors in
`@ansible/portal-extension-api/alpha`, operation and entitlement clients,
documented frontend SDK utilities, and injected backend services from
`@ansible/portal-plugin-node`. Use the API entry points and native interaction
contracts listed below; an exported type alone does not make every field or
launch combination supported.

The host owns contribution validation, attachment regions, rendering, and
navigation. Contributor packages must not import another optional plugin's
implementation or take over host composition. Legacy registry helpers and
module-load registration are compatibility-only, not the native authoring API.
Use host-owned attachments rather than imperative `moduleName` resolution.

Manifests must use the actual Backstage plugin ID, owner-prefixed capability
and entry-point IDs, a known `experienceId`, and canonical content types.
Entry-point scope must not broaden capability scope. Although the shared type
still contains `appliesTo`, native validators reject that manifest predicate;
put executable predicates on frontend descriptors as `isApplicable` instead.

The supported launch subset is:

- Slot contributions render through the matching native Blueprint and its
  allowed host attachment; a slot is not an arbitrary module or route resolver.
- Entity actions and catalog item actions invoke registered operations using
  the current subject.
- An entity operation action may follow on to an eligible entity detail tab.
  Declare a slot follow-on targeting `entity.detail.tabs` and the matching
  descriptor `followOnEntryPointId`. Navigation follows a successful operation
  response; it is not proof that a background job has completed.
- Catalog-header actions start workflows mapped by
  `ScaffolderWorkflowBlueprint` to registered scaffolder template references.
  They do not accept arbitrary workflow URLs.

Catalog item action follow-ons, operation-to-workflow follow-ons, arbitrary
multi-step launch chains, and workflow launches on other action surfaces are
outside this preview subset. A `CapabilityLaunch` union member is not a promise
that a host renderer supports it on every surface.

### Backend guarantees and author responsibilities

The operation dispatcher requires an authenticated user, trusted organization
context, a registered owner-prefixed operation ID, a permission, and REST
exposure. It checks RBAC, validates supplied input schemas, and enforces every
declared `requiredEntitlements` requirement before calling the handler. It
validates supplied output schemas after the handler returns. Schemas remain
optional in the current TypeScript descriptor; preview authors should define
input/output schemas for their public operation contracts.

The handler must independently authorize the subject resource, verify its
supported content type, and scope domain data appropriately. Frontend filtering
does not provide backend resource authorization. A deployment administrator
configures entitlement grants; plugin authors declare requirements and register
their definitions.

For shared resources, any trusted configured membership with the required grant
can enable the capability, subject to operation and resource RBAC. Git
repositories do not acquire AAP organization ownership. Organization-specific
operations require one validated organization; multiple memberships do not
implicitly select the first organization. There is no SDK organization selector.

The following are not dispatcher guarantees:

- `idempotent` metadata does not deduplicate requests, provide an idempotency
  key, or make retries safe. An output validation failure does not roll back
  effects already performed by the handler.
- `auditCategory` metadata does not select a durable audit destination. Current
  operation auditing emits structured logs, not a durable audit store.
- `exposure.mcp` does not automatically install an MCP adapter or publish tools.
- A successful response does not provide generic job execution, cancellation,
  progress storage, or background authorization revalidation. Plugins must
  define acceptance/progress/completion semantics for long-running work.
- Native enablement and interactive authorization do not secure every legacy
  mutation or automatic scheduler path. Do not copy those paths as the model
  for a new plugin.

### Proposed compatibility and migration policy

The initial host contract is `0.1.0`; coordinate compatible SDK packages and
contributors as one preview baseline. This is not a requirement that every
domain operation use the same version. `OperationDescriptor.version` records
the operation contract; it does not implement version negotiation or dispatch
multiple versions of the same operation ID.

The implemented manifest validator requires matching major and minor API
versions before `1.0.0` and checks `minimumHostApiVersion`. The proposed release
policy keeps `0.1.x` changes compatible with the documented preview subset and
uses a new minor version for incompatible changes. Package publication and
release automation for that policy are not established by this document.

Before a breaking preview update, SDK maintainers and affected consuming teams
should agree on the replacement API, migration instructions, required package
and artifact rebuilds, and acceptance checks. Record the change in the changelog
and affected author references. Do not silently remove a contract or promise an
unimplemented compatibility window.

The verified development deployment baseline is RHDH `next-2.1` with this
branch's platform dependencies, not a supported release matrix. The image tag
can change; record the tested image digest, SDK revision, package versions, and
dynamic artifacts for a reproducible acceptance run. Validation beyond this
baseline is not required for the current preview scope.

The shared SDK packages remain private workspace packages. Preview teams develop
their plugins in this monorepo using `workspace:^` dependencies, the shared root
lockfile, and repository build/test tooling. Acceptance starts from a fresh
clone and includes dynamic export and installation in RHDH. Public npm packages,
an external repository starter, and out-of-tree onboarding are outside this
preview scope, not release prerequisites. A third-party plugin is architecturally
independent of the host even when its source lives in the same repository.

## Contribution and experience model

A host experience represents a user goal, such as Content Quality. A plugin
provides capabilities that help with that goal. One capability can have a card,
tab, and action while reusing one backend operation.

Choose a Blueprint by the interaction, then declare applicability. Do not create
a Blueprint per plugin or content type. Host layout, permissions and lifecycle
are not plugin-owned DOM hooks.

The implemented manifest requires a known `experienceId`; this differs from the
proposed advisory `recommendedExperienceId` model. Do not invent experiences or
assume installing a plugin creates one.

## Repository structure

Inside this repository, packages belong to the root Yarn workspace configuration
and lockfile. The four ownership groups are `portal-core`, `self-service`, `aap`,
and `apme`. They are not independent Yarn projects with separate lockfiles.

An illustrative contributor layout is:

```text
workspaces/<contributor>/
└── plugins/
    ├── <plugin>-common/
    │   └── src/                 Shared domain types and operation descriptors
    ├── <frontend-plugin>/
    │   ├── src/alpha.tsx        Static native extension declarations
    │   ├── src/manifest.ts      Serializable capability metadata
    │   ├── src/components/     Domain UI
    │   ├── config.d.ts         Configuration schema and visibility
    │   └── package.json        Role, exports, dependencies, export script
    └── <backend-plugin-or-module>/
        ├── src/                Operation registration and domain handlers
        ├── config.d.ts
        └── package.json
```

A frontend-only contribution does not require a backend. A shared domain package
is useful when frontend and backend consume the same contracts. A scaffolder
action can live in a separate backend module, as APME demonstrates.

Create preview plugins under the appropriate `workspaces/<contributor>/plugins/`
ownership group and declare SDK dependencies with `workspace:^`. A new ownership
group also requires root workspace/CI registration rather than only creating a
directory. Repository co-location does not permit imports of host internals or
another optional plugin's implementation. Out-of-tree development would require
a separately agreed dependency delivery model and is not part of this preview.

## API entry points

| Import or service                                                                                          | Consumer                  | Responsibility                                                      |
| ---------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------- |
| `@ansible/portal-extension-common`                                                                         | Frontend and backend      | Manifest, capability, launch, operation and subject contracts       |
| `@ansible/portal-extension-api/alpha`                                                                      | Contributor frontend      | Native Blueprints and typed NFS descriptor/data-reference contracts |
| `portalOperationsApiRef` from `@ansible/portal-extension-api`                                              | Contributor frontend      | Execute a registered operation with subject and input               |
| `portalEntitlementsApiRef` from `@ansible/portal-extension-api`                                            | Host/frontend integration | Request host-resolved entitlement decisions                         |
| `@ansible/portal-plugin-sdk`                                                                               | Contributor frontend      | Shared UI, tokens, notifications, caching and utilities             |
| `portalOperationsServiceRef` from `@ansible/portal-plugin-node`                                            | Contributor backend       | Register and execute operation handlers                             |
| `portalHealthServiceRef` from `@ansible/portal-plugin-node`                                                | Contributor backend       | Report health to the host registry                                  |
| `portalActiveOrganizationServiceRef` and `portalEntitlementsServiceRef` from `@ansible/portal-plugin-node` | Backend integration       | Resolve trusted organization memberships and entitlement decisions  |
| `@ansible/portal-extension-host/alpha`                                                                     | Host pages/composition    | Install provider and native rendering adapters                      |

The host owns `portalContributionsApiRef`, validation, filtering and rendering.
Contributor declaration code normally uses the API library, not host rendering
internals. Host integration dependencies in contributor tests do not make the
contributor responsible for installing the provider.

## Supported native interaction contracts

| Blueprint                      | Current purpose                      | Attachment or integration                                              |
| ------------------------------ | ------------------------------------ | ---------------------------------------------------------------------- |
| `EntityDetailTabBlueprint`     | Durable entity facet                 | `entity.detail.tabs`                                                   |
| `EntityOverviewCardBlueprint`  | Compact entity summary               | `entity.overview.main` or `entity.overview.secondary`                  |
| `EntityActionBlueprint`        | Operation on the current entity      | `entity.actions`                                                       |
| `CatalogItemActionBlueprint`   | Operation from a catalog item        | `catalog.item.actions`                                                 |
| `CatalogTabBlueprint`          | Additional catalog view              | `catalog.tabs`                                                         |
| `CatalogTableColumnBlueprint`  | Comparable catalog value             | `catalog.table.columns`                                                |
| `CatalogHeaderActionBlueprint` | Catalog-level workflow entry         | `catalog.header.actions` with registered workflow                      |
| `ScaffolderWorkflowBlueprint`  | Workflow/template mapping            | Namespaced workflow ID and template reference                          |
| `ScaffolderFieldBlueprint`     | Typed custom template input          | `scaffolder.fields` via shared provider and optional templates adapter |
| `AppProfileMenuItemBlueprint`  | Profile navigation or lazy UI action | `appProfileMenuItems` via shared provider; source header consumer      |

For exact descriptor fields, use the exported types and the
[NFS composition guide](portal-sdk-nfs-composition.md). A union member in common
types is not proof that every launch/surface combination has a renderer. Native
entity actions currently dispatch operations; supported follow-ons select an
eligible entity detail tab. Catalog-header workflows map to registered
scaffolder templates, not arbitrary routes.

### Field declarations and optional templates adapters

Declare native fields through `ScaffolderFieldBlueprint` using the existing
`ScaffolderFieldDescriptor` and `defineScaffolderField` contracts. The Blueprint
attaches metadata to Portal's shared contribution provider, not to a
portal-scaffolder page. The provider validates ownership, manifests, version
compatibility, and duplicate IDs/names without loading the widget.

An installed templates host uses `createPortalScaffolderPage` and
`NativeScaffolderFields` from `@ansible/portal-extension-host/alpha` to consume
accepted declarations and apply runtime gates before loading widgets. Field
names, value/UI schemas, component props, and validation functions are unchanged.
Without a templates consumer, declarations remain inspectable but unused and
widget loaders do not run. Declaring a field does not install a templates page
or make its workflow available.

Contributor code does not import the optional portal-scaffolder implementation
or choose its page ID. Rebuild/re-export the host and contributors together,
remove old templates-page attachment overrides, and follow the
[field attachment migration](portal-sdk-nfs-composition.md#migrating-field-attachments).
No imperative module resolution, global registration fallback, or npm publication
is required.

## Declaring a profile menu item

Use `AppProfileMenuItemBlueprint` for a profile-menu row. No change to
`portal-rhdh` is needed for each contributor. The source header and optional RHDH
adapter render the same validated declarations; plugins do not import platform
header code or provide their own menu DOM.

### Prerequisites

- The Portal contribution provider and a profile-menu consumer are installed.
- Your plugin has an agreed ID and any permission is defined in shared contracts
  and registered by its backend.
- Navigation targets are enabled pages owned by your plugin. A UI action has
  the APIs or app-root UI integration it needs; the SDK does not install a dialog
  service merely because an action is declared.

### Procedure

1. Add a navigation declaration to your native plugin's extensions. This example
   assumes your plugin already registers `page:content-authoring/editor` through
   `PageBlueprint`:

   ```ts
   import { AppProfileMenuItemBlueprint } from '@ansible/portal-extension-api/alpha';
   import { authoringViewPermission } from './permissions';

   const profileLink = AppProfileMenuItemBlueprint.make({
     name: 'authoring',
     params: {
       type: 'navigation',
       title: 'Content authoring',
       targetPage: 'page:content-authoring/editor',
       authorization: {
         type: 'permission',
         requirement: authoringViewPermission,
       },
       order: 100,
     },
   });
   ```

2. For a UI interaction instead, declare a lazy handler. For example, display a
   notification without accessing backend data:

   ```ts
   const profileAction = AppProfileMenuItemBlueprint.make({
     name: 'authoring-help',
     params: {
       type: 'action',
       title: 'Authoring help',
       authorization: { type: 'authenticated' },
       order: 200,
       enabledByConfig: 'ansible.content-authoring.enabled',
       loadAction: async () => {
         const { alertApiRef } = await import('@backstage/core-plugin-api');
         return ({ apis }) => {
           const alerts = apis.get(alertApiRef);
           if (!alerts) throw new Error('Notification API is unavailable');
           alerts.post({
             message: 'Open Content authoring to create content.',
           });
         };
       },
     },
   });
   ```

   Include both declarations in your `content-authoring` plugin's `extensions`
   array alongside the editor page. A declared
   config gate must be frontend-visible in your plugin schema. Only UI code
   belongs in the handler; use registered operations for backend mutations and
   retain resource authorization in backend handlers. Hooks cannot run inside
   this callback: use the supplied API holder to access your plugin's UI service
   when opening a dialog.

### Verification

Verify the owned navigation path, including page-path overrides, and confirm
action code does not load until clicked. Test missing identity, permission
denial/errors, disabled configuration/extensions, invalid destinations, action
load/rejection, and a healthy sibling item. A pending action prevents repeated
clicks; failure reports a recoverable host error. `order` applies within the
Portal profile block, not unrelated platform entries.

`authorization.type: 'authenticated'` is for signed-in UI interactions, not a
backend permission grant. The host always requires a resolved user identity.
No arbitrary external navigation URL or unauthenticated action is supported.
AAP logout is one opt-in contribution owned by the AAP auth module; its special
session handling does not belong in the generic adapter.

## Declaring a native tab

### Prerequisites

- A host app with the Portal contribution provider installed.
- Compatible Portal packages and the branch's platform dependency set. The
  current frontend declarations use `@backstage/frontend-plugin-api` 0.17.1.
- An entity detail page supplying canonical content type and entity context.
- An agreed plugin ID, host experience, and configuration key.

### Procedure

1. Create a serializable manifest. This minimal example displays existing
   subject metadata and declares no backend operation or entitlement:

   ```ts
   // src/manifest.ts
   import type { PluginManifest } from '@ansible/portal-extension-common';

   export const manifest: PluginManifest = {
     id: 'quality-insights',
     version: '0.1.0',
     apiVersion: '0.1.0',
     entitlements: [],
     capabilities: [
       {
         id: 'quality-insights.subject',
         ownerPlugin: 'quality-insights',
         experienceId: 'content-quality-assessment',
         displayName: 'Subject details',
         description: 'Show the selected repository identity.',
         appliesToContentTypes: ['playbook-repository'],
         minimumHostApiVersion: '0.1.0',
         entryPoints: [
           {
             id: 'quality-insights.subject.tab',
             kind: 'entity-tab',
             surface: 'entity-page',
             label: 'Subject details',
             appliesToContentTypes: ['playbook-repository'],
             launches: { type: 'slot', targetSlot: 'entity.detail.tabs' },
           },
         ],
       },
     ],
   };
   ```

2. Declare a static extension. Use a matching NFS plugin ID, manifest references,
   host attachment, and configuration gate:

   ```tsx
   // src/alpha.tsx
   import { createFrontendPlugin } from '@backstage/frontend-plugin-api';
   import { EntityDetailTabBlueprint } from '@ansible/portal-extension-api/alpha';
   import { manifest } from './manifest';

   export default createFrontendPlugin({
     pluginId: 'quality-insights',
     extensions: [
       EntityDetailTabBlueprint.make({
         name: 'subject',
         params: {
           manifest,
           capabilityId: 'quality-insights.subject',
           entryPointId: 'quality-insights.subject.tab',
           attachment: 'entity.detail.tabs',
           enabledByConfig: 'ansible.quality-insights.enabled',
           loader: async ({ entity }) => {
             const { SubjectTab } = await import('./components/SubjectTab');
             return <SubjectTab name={entity.metadata.name} />;
           },
         },
       }),
     ],
   });
   ```

   ```tsx
   // src/components/SubjectTab.tsx
   export function SubjectTab({ name }: { name: string }) {
     return <p>Selected repository: {name}</p>;
   }
   ```

3. Export `./alpha` from the frontend package, declare its
   `backstage.role: frontend-plugin`, and use compatible peer/build dependencies.
   Follow APME's checked-in `package.json` for this branch's packaging pattern.
   Do not register native contributions through legacy `index.ts` side effects.

4. Install the frontend feature through the app composition root or dynamic
   package discovery. The consuming host plugin must not import the contributor
   implementation. Set the minimal runtime configuration:

   ```yaml
   ansible:
     quality-insights:
       enabled: true
   ```

### Verification

Open an eligible repository and select Subject details. Disable the config key
and confirm the contribution disappears. Confirm it does not load on an
execution-environment page. Add integration tests for invalid manifests,
permission/entitlement denial where declared, and contained loader failures.

This sample demonstrates declaration shape, not a complete workspace plugin.
Sensitive domain data requires explicit permission and resource checks; the
sample only displays metadata already supplied by the host page.

## Adding a backend operation

Keep the operation descriptor in a shared domain package when both sides need
it. Use an owner-prefixed ID such as `quality-insights.assessment.start`, an operation
permission, input/output schemas, and appropriate exposure flags. The current
dispatcher requires a permission and REST exposure for execution.

Declare `requiredEntitlements` on the backend operation descriptor when the
operation depends on an entitlement. The dispatcher enforces every listed ID
before invoking the handler; a frontend declaration alone does not secure it.
Register the matching entitlement definitions through the injected
`portalEntitlementsServiceRef`. Missing definitions, absent grants, denied
permissions, unresolved organization, and inconsistent context deny execution.

Inject `portalOperationsServiceRef` into the backend feature and call
`operations.register({ pluginId, descriptor, handler })` during initialization.
The handler receives `OperationRequest` and authenticated `OperationContext`.
Validate subject access and supported resource type before domain effects.

Frontend calls use this shape:

```ts
await operationsApi.execute('quality-insights.assessment.start', {
  subject: { entityRef: 'component:default/example-repository' },
  input: {},
});
```

Here `operationsApi` is the injected `portalOperationsApiRef` client. Pass the
host's actual current entity reference, not an arbitrary project ID or URL.
The transport returns `{ result }`; long-running work should return status/job
information that the contributor can monitor without blocking the host page.

Use APME's `catalog-backend-module-apme/src/operations.ts` as a concrete reference
for registration and resource checks, not as a claim that all backend hardening
is finished. Its scan operation and interactive workflow routes enforce the
trusted organization, scan entitlement, and repository access. Registration and
deregistration do not require the scanning entitlement. Other legacy routes
and automatic background scans still need their own policy migration.

Use `resolvePortalContext({ credentials, userInfo, organizations })` when
adapting another authenticated transport. Inject
`portalActiveOrganizationServiceRef`; do not infer organization from the user
namespace, SCM owner, submitted metadata, or a request header. The AAP adapter
verifies current direct/team memberships against configured organizations.
Resource handlers must still check catalog read permission, supported content
type, and domain-specific access.

Choose the backend operation scope explicitly:

- Omit `organizationScope`, or use `'organization'`, for organization-specific
  state. The dispatcher requires a single validated `organizationId`; multiple
  memberships are not an instruction to select the first. Scope persistence
  queries to that validated organization.
- Use `organizationScope: 'shared'` for operations on shared resources such as
  Git repositories. Any trusted membership with the required entitlement enables
  availability, but operation and resource RBAC still apply. The repository does
  not acquire an AAP organization owner.

For example, an operation descriptor for shared repository assessment includes:

```ts
import type { OperationDescriptor } from '@ansible/portal-extension-common';
import { createPermission } from '@backstage/plugin-permission-common';

export const startAssessment: OperationDescriptor = {
  id: 'quality-insights.assessment.start',
  version: '1.0.0',
  organizationScope: 'shared',
  requiredEntitlements: ['quality-insights.assessment'],
  permission: createPermission({
    name: 'quality-insights.assessment.start',
    attributes: { action: 'create' },
  }),
  exposure: { rest: true },
  inputSchema: { type: 'object', additionalProperties: false },
};
```

Backend context supplies `organizationId` for a single membership or
`organizationIds` for multiple memberships. There is no organization selector
in this SDK flow. For display, `usePortalContext` reads authenticated
`GET /api/portal-operations/context`; its result is not backend authority.

## Configuration and packaging responsibilities

Separate package installation, native extension configuration, capability
enablement, and authorization. Loading a package does not grant permission.

For new contributions, use `ansible.<capability>.enabled` and a shared config
reader across all capability artifacts. An absent enablement gate should disable
the capability. The implementation still has legacy/backend configuration paths requiring
conformance work; do not assume a native gate disables every backend route.

For an AAP deployment, a minimal entitlement policy is:

```yaml
portal:
  entitlements:
    grants:
      - id: quality-insights.assessment
        organizations: [engineering]
```

This assumes Engineering is configured in the existing AAP provider and the
capability declares the matching entitlement. An expanded multi-organization
example is:

```yaml
ansible:
  quality-insights:
    enabled: true
catalog:
  providers:
    rhaap:
      development:
        orgs: [Engineering, Finance]
        multiOrgEnabled: true
portal:
  entitlements:
    grants:
      - id: quality-insights.assessment
        organizations: [engineering, finance]
```

This expanded example is not required by the minimal tab above. It requires a
matching manifest entitlement definition and descriptor
`requiredEntitlements: ['quality-insights.assessment']`. Grants choose availability
for an organization; they are not user membership proof or replacements for RBAC.
Use the AAP adapter's canonical lowercase organization names in grants.
`organizations: ['*']` grants availability across the caller's configured
memberships, not membership in every AAP organization. Deployment administrators
configure grants; plugin authors declare entitlement requirements.

Shared Git repositories remain in the catalog independently of these grants.
No catalog namespace mapping or `ansible.io/portal-organization` annotation is
required. Existing records are not renamed. See the
[operations backend reference](../plugins/portal-operations-backend.md) for the
generic single-organization fallback and identity compatibility details.

Use the repository's `export-dynamic` scripts and actual `rhdh-cli` embedding
options, rather than the historical Janus/Scalprum examples. Re-export consumers
when shared contracts change. Packaging compatibility has only been exercised
against `next-2.1` in this work; supported version policy remains to be agreed.
Build SDK dependencies from the same repository revision and export the
resulting dynamic plugin artifacts for RHDH. This does not require npm
publication, a shared mutable registry singleton, or mount-point YAML.

## Author acceptance checklist

- [ ] SDK and consuming-team reviewers agree on the preview subset and migration policy.
- [ ] The SDK revision, package versions, tested RHDH image digest, and dynamic artifacts are recorded.
- [ ] Static `./alpha` declarations match the manifest and actual plugin owner.
- [ ] IDs, host API version, known experience, content scope and attachments are valid.
- [ ] Entry-point scope does not broaden capability scope.
- [ ] Predicates are executable frontend descriptors, not new serialized fields.
- [ ] Optional experiences and unsupported entities do not produce broken shells.
- [ ] Loading, empty, failure and restricted states are defined.
- [ ] New mutations use registered operations with permission and schema checks.
- [ ] Backend handlers authorize the selected resource independently of the UI.
- [ ] Backend operation entitlements are declared and registered, with denied-path tests.
- [ ] Operation scope distinguishes shared resources from organization-specific state and uses trusted memberships.
- [ ] Long-running operations distinguish acceptance, progress and completion.
- [ ] Disabled configuration and missing artifacts remove the intended capability.
- [ ] Other optional plugin implementations and private RHDH APIs are not dependencies.
- [ ] Health uses injected host services; audit/idempotency guarantees are stated honestly.
- [ ] Dynamic exports and the agreed platform version are verified.
- [ ] Tests cover enabled/disabled, matching/nonmatching, denied and failure cases.

### Preview onboarding acceptance

Before declaring the in-repository preview ready for a consuming team, SDK
maintainers and that team must complete the following from a fresh clone:

1. Check out the agreed SDK revision, install dependencies from the repository
   root with `./install-deps`, and confirm the team's plugin is included in root
   workspace/CI configuration. Keep SDK dependencies as `workspace:^` and use the
   shared root lockfile; no separately published SDK packages are required.
2. Run the repository checks below, build the required SDK and plugin packages,
   and export the plugin dynamically. Install it on the recorded RHDH baseline
   without importing its implementation into the host plugin.
3. Verify a supported contribution and operation, including nonmatching content,
   disabled configuration, permission/entitlement denial, and contained failures.
4. Record the results and resolve or explicitly exclude required unsupported
   behavior before the consuming team depends on it.

APME provides an in-tree integration reference. Each consuming team's plugin
still needs fresh-clone acceptance; success in an existing developer checkout
does not prove reproducibility. The checklist does not require npm publication
or an external-plugin repository and does not claim this acceptance is complete.

### Repository checks

From the root, run the repository's normal checks:

```bash
yarn tsc
yarn lint:all
yarn test
```

For focused native integration tests, use the `yarn test --runInBand ...`
command in the [NFS composition guide](portal-sdk-nfs-composition.md).

## Troubleshooting

**Installed plugin has no contribution:** check native feature discovery,
`api:portal/contributions`, manifest references, current subject scope,
configuration, experience, permissions and entitlements. Inspect host rejection
diagnostics before changing the loader.

**Action is visible but execution fails:** inspect registered operation ID,
REST exposure, schemas, caller permission, handler resource checks and current
organization behavior. Do not weaken authorization to bypass a denied decision.

**Changes do not appear in RHDH:** rebuild/re-export the affected consumers and
follow the local deployment cache/restart procedure. Source app success does not
prove a packed dynamic artifact was rebuilt.

## Related documentation

- [SDK architecture](portal-sdk-architecture.md)
- [Native NFS host integration](portal-sdk-nfs-composition.md)
- [Implementation scope and remaining work](portal-plugin-factory-implementation-guide.md)
- [Frontend declaration contracts](../plugins/portal-extension-api.md)
- [Backend SDK services](../plugins/portal-plugin-node.md)
- [Shared frontend utilities](../plugins/portal-plugin-sdk.md)
- [Theme-adaptive design tokens](portal-sdk-design-tokens.md)
