---
render_macros: false
---

# Third-party Portal plugin author guide

Use the Portal contracts to contribute functionality without modifying
self-service or importing another optional plugin's implementation. Declare
frontend extensions statically through NFS and register backend operations
through injected host services.

This guide describes the current experimental SDK. Published package versions,
supported-release compatibility guarantees, and backend authorization closure
are not yet complete. Use it for architecture review and coordinated internal
development, not as a production-readiness certification.

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

An out-of-tree plugin can use its own repository. Replace `workspace:^` with
agreed available package versions; workspace protocols do not resolve published
dependencies in an unrelated repository. A new in-tree ownership group also
requires root workspace/CI registration rather than only creating a directory.

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

| Blueprint                      | Current purpose                 | Attachment or integration                             |
| ------------------------------ | ------------------------------- | ----------------------------------------------------- |
| `EntityDetailTabBlueprint`     | Durable entity facet            | `entity.detail.tabs`                                  |
| `EntityOverviewCardBlueprint`  | Compact entity summary          | `entity.overview.main` or `entity.overview.secondary` |
| `EntityActionBlueprint`        | Operation on the current entity | `entity.actions`                                      |
| `CatalogItemActionBlueprint`   | Operation from a catalog item   | `catalog.item.actions`                                |
| `CatalogTabBlueprint`          | Additional catalog view         | `catalog.tabs`                                        |
| `CatalogTableColumnBlueprint`  | Comparable catalog value        | `catalog.table.columns`                               |
| `CatalogHeaderActionBlueprint` | Catalog-level workflow entry    | `catalog.header.actions` with registered workflow     |
| `ScaffolderWorkflowBlueprint`  | Workflow/template mapping       | Namespaced workflow ID and template reference         |
| `ScaffolderFieldBlueprint`     | Typed custom template input     | Native templates-page field input                     |

For exact descriptor fields, use the exported types and the
[NFS composition guide](portal-sdk-nfs-composition.md). A union member in common
types is not proof that every launch/surface combination has a renderer. Native
entity actions currently dispatch operations; supported follow-ons select an
eligible entity detail tab. Catalog-header workflows map to registered
scaffolder templates, not arbitrary routes.

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

This sample demonstrates declaration shape, not a complete published package.
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
against `next-2.1` in this work; publication and supported version policy remain
to be agreed. There is no plugin-author requirement to create a shared mutable
registry singleton or publish mount-point YAML.

## Author acceptance checklist

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
