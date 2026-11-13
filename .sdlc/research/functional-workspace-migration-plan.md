# Functional Workspace Migration Plan

**Status:** Draft for review; implementation is not authorized by this document.
**Date:** 2026-11-05
**Code baseline:** local `main`, `ae7c4216cf4cf62f5eff90776a64dca5da9b5405`.
**Historical baseline:** [Portal-Scaffolder Re-Architecture Plan at 53dffe6](https://github.com/ansible/ansible-backstage-plugins/blob/53dffe6ab883e058735bc6a76bcb3b54c9389733/.sdlc/research/portal-scaffolder-re-architecture.md).

This is a separate replacement proposal. The historical document remains unchanged. Findings below describe source and merged history at the code baseline; existing tests were inspected, not executed as part of this planning exercise. Unmerged team work is not included.

## 1. Decisions and interpretation

The new decisions replace the old plan's assumption that portal-scaffolder remains the owner of templates, history, and EE definition pages:

- Eliminate the portal-scaffolder **workspace** in favor of functional workspaces. This rename has already landed as `content-development`.
- Use `content-management` for EE, collections, and Git repository experiences; ANSTRAT-1758 owns that migration.
- **Confirmed EE scope:** move the full existing EE frontend experience to content-management: definition catalog, creation, build flow/progress, and details. Coordinate its integration with existing built-image browsing.
- Keep `portal-scaffolder-react` in `content-development` as a reusable scaffolder UI library.
- Move templates and history, including the current template Home experience, into the `portal-core` workspace.

The following are **recommendations in this draft**, not additional decisions already agreed by the team:

1. Put templates/history in a dedicated `@ansible/portal-templates` frontend plugin under the portal-core workspace. Do not put all their code directly into the generic `@ansible/portal-core` host plugin. Workspace ownership and package identity are separate concerns.
2. Retire the monolithic `@ansible/portal-scaffolder` frontend plugin after its consumers migrate. The user decision explicitly eliminates the workspace; retiring the leftover plugin is the recommended consequence of redistributing all its pages.
3. Move the complete templates/task journey together: Home, template details, CreateTask, RunTask, TaskList, catalog import, route wrappers, and their supporting providers. Moving listing/history alone would retain a runtime dependency on the monolith.
4. Keep current URLs during the ownership migration. Package and extension identities can change through a documented configuration migration; URL redesign is separate work.

## 2. What has actually landed

### 2.1 Workspace names: complete

`27e79581` / PR #1059 renamed `content` to `content-management`. `d659ec4d` / PR #1060 renamed the portal-scaffolder workspace to `content-development`. Both directories already exist. Do not schedule these renames again.

The three packages `portal-scaffolder`, `portal-scaffolder-common`, and `portal-scaffolder-react` still live under `workspaces/content-development/plugins/`. Renaming the workspace did not redistribute plugin behavior.

### 2.2 Old Phase 1: reusable work to retain

The common package exists with `backstage.role: common-library`. Its root exports:

- `UserJobTemplate`, `EEBuildRegistryType`, `EEBuildRequest`, and `EEBuildResult`.
- `eeDefinitionInputSchema`, consumed by the current AAP scaffolder backend's `createEEDefinition.ts`.
- `portalScaffolderRoutePaths`, with tests preserving path values.

The frontend preserves type compatibility exports through `src/apis.ts`. The backend explicitly embeds the common package during dynamic export. This extraction is real, not just a proposed package skeleton. See [ADR-001](../adrs/ADR-001-portal-scaffolder-common.md), PR #984 (`c530a047`, wire types), PR #986 (`d86fd984`, schema), and PR #987 (`bf3133f1`, paths).

The React web-library exports seven reusable widgets: FileUploadPicker, EEFileNamePicker, EETagsPicker, ScmSelector, AdditionalBuildStepsPicker, PackagesPicker, and MCPServersPicker. It also owns FieldValidationProvider/useFieldValidation and parseMarkdownLinks. PRs #1007–#1012 provide the extraction slices. The plugin's `formExtraFields.tsx` imports these implementations from the library, while registration wrappers remain in the plugin.

**Disposition:** retain both extractions and their tests. The common package's mixed domain ownership and the plugin's registration wrappers need follow-up; recreating the widgets or schemas does not.

### 2.3 Old Phase 2: auth complete in part; shell split incomplete

`@ansible/aap-app-auth` already owns rhAapAuthApiRef, its OAuth factory, SignInPage, AAPLogoutButton, and current logout/profile integration. The host uses the extracted authentication package. PR #880 (`a1a44246`) and PR #954 (`293cdd00`) are relevant history.

However, a separate `components/AAPLogoutHandler/AAPLogoutHandler.tsx` implementation still exists in portal-scaffolder. Do not mark every logout artifact moved. Establish whether any supported consumer still mounts it; migrate or delete it in favor of the current auth-owned lifecycle without installing two logout handlers.

Portal-core's native `src/alpha.tsx` owns `/` via PortalLandingPage and a theme baseline. Landing selection is configuration driven and has host-without-scaffolder tests. PR #942 (`13643940`) delivered this independence. The old plugin still contains a LandingPage redirect, LocationListener, and FeedbackFooter. AppThemeFixer there is already a re-export of portal-plugin-sdk, not an implementation waiting to be copied.

**Disposition:** preserve native landing/auth work; finish consumer cleanup and reconcile legacy shell behavior rather than repeating Phase 2 wholesale.

### 2.4 Page ownership: migration still required

`portal-scaffolder/src/alpha.tsx` still registers collections, EE, repositories, templates, history, and the AAP/EE API factories. `plugin.ts` also supplies legacy extensions. NativeScaffolderPage still contains an EE detail route at `catalog/:templateName`, catalog import, template execution, and history routes. `RouteView/RouteView.tsx` still combines all domains in the legacy route tree.

The content-management workspace has a real automation-content frontend/backend/model stack, not an empty destination. Its frontend currently supplies an OCI-oriented `/automation-content` drill-down through EE, collections, and content items. That is not evidence that the old EE-definition, PAH collection, or Git repository screens have moved. Its inspected frontend entry is a legacy `createPlugin` implementation, with no `src/alpha.tsx` native entry at this baseline.

**Disposition:** coordinate with ANSTRAT-1758 on integration into its existing frontend or additional functional plugins. Do not independently create a competing content application or claim the old screens are already migrated.

### 2.5 Extension and backend contracts: keep, but correct old assumptions

ScaffolderFieldBlueprint now attaches to `api:portal/contributions`, input `scaffolderFields`, rather than directly to the historical templates page ID. `createPortalScaffolderPage` reads those collected descriptors. Moving the page can retain the field contract without preserving the old page owner identity. Existing native field tests cover lazy loading, validation, and independence from portal-scaffolder.

The old plugin still statically includes AAPResourcePicker, AAPTokenField, BaseImagePicker, and CollectionsPicker in `formExtraFields`. CollectionsPicker currently calls scaffolder autocomplete provider `aap-api-cloud` and uses AAP auth. It has **not** already become an operation-backed content contribution. BaseImagePicker currently presents configured/user input rather than demonstrating a completed content-operation migration.

PR #992 (`3a600249`) freezes contracts for the **backend split**, not proof of frontend page migration. The [backend implementation guide](scaffolder-implementation-guide.md) now places creator CLI/ADT actions, including `ansible:create:ee-definition`, in content-development and AAP actions in AAP. It also plans an explicit autocomplete provider migration. Do not infer backend ownership from the EE page's frontend destination.

## 3. Target boundaries

### Portal-core workspace

- `portal-core`: portal contribution host, root landing behavior, generic navigation and shell integration.
- **Proposed `portal-templates` plugin:** templates listing/detail/execution, task list/detail, catalog import and their native page registrations. Move the existing wizard; do not replace it with an unrelated default scaffolder page.
- `portal-extension-api` / `portal-extension-host`: shared contribution contracts, collector, native field rendering, operation bridge, and existing extension lifecycle.
- `portal-plugin-sdk`: reusable UI primitives already extracted; avoid duplicating their implementations.

Templates retain their current AAP access filtering, sync behavior and explicit AAP API/auth dependencies in the new templates plugin. The generic core host must boot without that plugin or content plugins. Moving pages into the portal-core workspace does not require making those domain pages independent of AAP. A provider-neutral templates interface is a possible later enhancement, not a prerequisite for this ownership move. Preserve current loading/failure behavior; do not introduce an unfiltered fallback when AAP access lookup fails.

This includes the current permission backend dependency: templates/history permissions are declared in aap-common and registered with `ansiblePermissions` by catalog-backend-module-rhaap. Include that backend in the deployment inventory until permission registration is deliberately reassigned. Preserve the current background-refresh behavior, which retains the previous ready snapshot on a refresh failure; changing that policy requires separate agreement.

### Content-development workspace

- `portal-scaffolder-react`: retain its web-library role, current widget implementations, validation context, and public exports. Scaffolder terminology accurately describes these fields.
- `portal-scaffolder-common`: retain during migration to avoid breaking current consumers. Reassign contracts by actual domain, not by a blanket rename: UserJobTemplate belongs with AAP contracts; creator EE input schemas belong with content-development contracts; route paths follow their owning pages; EE build wire types need frontend/backend owner agreement.
- Creator CLI/ADT actions and related authoring backends follow the separate backend split guide. This plan does not remove the content-development workspace when the monolithic frontend is retired.

### Content-management workspace / ANSTRAT-1758

Own the migrated EE, collections, and repository page registrations, detail surfaces, navigation, relevant notifications/cache invalidation, and page-specific API registrations. Agree how EE definition views and the existing OCI artifact drill-down coexist; neither may be silently dropped.

Content-backed picker declarations belong with the plugin that owns the queried content service. Make them optional native contributions using registered operations where that is the agreed content interface. Do not hard-import content frontend internals into templates or the reusable React library. Pure configurable input widgets can stay in the React library; classify BaseImagePicker by its actual final data source.

### AAP workspace

Retain authentication and AAP backend integrations. Reuse aap-app-auth and AAP contracts from the moved templates plugin. AAPTokenField/AAPResourcePicker implementations and native declarations belong with AAP integration code; use a module of the existing AAP frontend plugin unless independent deployment requires a separate field plugin. Preserve field names, schemas, validation and secret behavior. The templates plugin may require these AAP providers when enabled; the generic portal host must not require them.

### Cross-package rules

- No frontend package imports backend implementations or AAP/SCM clients.
- No templates or content package imports the retiring monolith at completion.
- No core host dependency on an optional content/AAP frontend plugin. Dependency on a reusable web-library is allowed; it must not register a frontend plugin as a side effect.
- No copied notification singleton across package boundaries. SDK notification presentation is reusable; the old notificationStore and syncPollingService are stateful implementations requiring explicit ownership.
- API refs and factories must have one active registration. Preserve `ansible.auth.rhaap`, `ansible`, and `plugin.self-service.ee-build` IDs during extraction unless a separately documented contract migration replaces them.

## 4. What changes from the old plan

- **Retain:** common/react extractions, SDK extraction, auth separation, independent root landing, native collector, third-party fields and regression coverage.
- **Replace:** the target portal-scaffolder workspace/plugin holding templates/history and EE. The workspace rename is already done; redistribute frontend ownership next.
- **Expand:** content-management scope now includes EE frontend views, which the old plan explicitly kept in scaffolder.
- **Rework:** API registration ownership changes. ansibleApiRef/client currently handles AAP access/sync and can move with the templates integration without a new abstraction. EEBuildApi and its factory travel with EE consumers, while creator backend action placement follows content-development.
- **Rework:** formExtraFields and registration wrappers become generic built-ins plus optional AAP/content contributions, with stable field names and no duplicate reservations.
- **Replace:** historical page-ID attachment assumptions with the current collector contract. Page IDs referenced by navigation/config/tests still require migration.
- **Finish:** shell consumer cleanup, native destination registration in content-management, deployment examples/manifests, and removal of the monolith once all consumers have migrated.

## 5. Delivery sequence

These are reviewable migration slices. Each slice must leave a usable app. Approve this proposal and settle the owner-dependent decisions in §7 before implementation.

### Slice 1 — Agree the integration contract with ANSTRAT-1758

**Files in scope:** this proposal initially; later ADRs/delivery docs owned by the relevant teams. Do not edit the historical plan.

- [x] Confirm full EE frontend scope: definition catalog, creation, build flow/progress, and details move to content-management.
- [ ] Agree the destination package(s) for that confirmed scope, accounting for the existing automation-content application.
- [ ] Confirm portal-templates as a separate plugin in the portal-core workspace, and retirement of the old frontend plugin.
- [ ] Record page/extension IDs, API ownership, routes, permissions, picker providers, backend dependencies, and the configuration migration policy.
- [ ] Record templates' existing AAP dependencies and preserve their access/filtering behavior. Document that templates are optional at the host level and AAP providers are required when the existing AAP-backed journey is enabled.

**Exit:** no page, field, API factory or stateful service is left without an owner; 1758 integration points are explicit.

### Slice 2 — Separate contracts and domain adapters

**Existing files:** portal-scaffolder `src/apis.ts`, `src/hooks/`, `Home/JobTemplatesProvider.tsx`; portal-scaffolder-common `src/{types,routePaths,eeDefinitionInputSchema}.ts`; AAP and content backend consumers/export scripts.
**Proposed files:** portal-templates `src/apis.ts` for the moved templates API and factory; AAP-owned native field declarations; content-owned EE API declarations/factory.

- [ ] Add behavior tests for existing AAP template filtering, sync refresh, loading, failures, and non-default template namespaces before changing providers.
- [ ] Extract API declarations/implementations by domain without changing wire shapes, secrets, or backend endpoints.
- [ ] Keep one schema implementation and one API-ref identity. Use temporary compatibility re-exports where needed; do not make a new owner depend on the old plugin for them.
- [ ] Move common contracts only as their consumers migrate; update runtime dependencies, config schemas, lockfile and dynamic embedding in the same slice.

**Exit:** new owners can consume contracts without importing the monolithic frontend; existing behavior tests pass.

### Slice 3 — Move templates and history into portal-core workspace

**Source:** portal-scaffolder `Home/`, `CatalogItemDetails/`, `CreateTask/`, `RunTask/`, `TaskList/`, `CatalogImport/`, supporting hooks/utils/styles and route references.
**Destination:** proposed `workspaces/portal-core/plugins/portal-templates/src/` with `alpha.tsx`, `routes.ts`, native page wrappers and co-located tests.

- [ ] Move the complete template/task journey and required providers, retaining the existing wizard, secrets handling, cancellation/retry behavior and catalog-import superuser/catalog permission checks.
- [ ] Retain generic field implementations from portal-scaffolder-react; do not move or duplicate the library.
- [ ] Register templates/history using the existing portal collector. Migrate matching extension config/navigation IDs and root landing targets in the same change.
- [ ] Split stateful template notifications from content cache invalidators; preserve in-progress notifications across template/task navigation without creating another polling singleton.
- [ ] Remove old templates/history page registrations when their replacements are enabled. One owner per path; no simultaneous duplicate route/API registration.

**Exit tests:** listing → namespaced detail → execution → task detail → history works; a native third-party field renders and validates through submission; disabled history/templates permissions deny direct links; core host boots without templates/AAP/content plugins; enabled template pages work with their declared AAP dependencies and without the old frontend plugin.

### Slice 4 — Move content experiences with ANSTRAT-1758

**Source:** portal-scaffolder `ExecutionEnvironments/`, `CollectionsCatalog/`, `GitRepositories/`, relevant `SidebarItems/`, `selfServiceManifest.ts`, API consumers, cache invalidators and sync notification logic.
**Destination:** agreed content-management frontend package(s); extend automation-content or introduce functional plugins as agreed in Slice 1.

- [ ] Move whole vertical page slices, including details, navigation, API factories, permission gates and operation registrations.
- [ ] Preserve EE authoring/build progress and existing OCI content browsing under their agreed owners. Keep creator action implementation in content-development per the backend guide.
- [ ] Transfer the old `catalog/:templateName` EE detail route explicitly; it currently lives outside the `/ee` page and is easy to miss.
- [ ] Preserve supported APME/third-party repository tabs, cards and actions while ownership changes. Record any native extension identity migration.
- [ ] Add native page entries where destinations currently expose only legacy routable extensions. Remove source registrations in coordination with destination enablement.

**Exit tests:** each content page mounts independently without portal-scaffolder; EE definition creation/detail/build and content browsing remain available; collection/repository detail links, permissions, extension tabs and sync invalidation still work.

### Slice 5 — Complete field and shell separation

**Files:** portal-scaffolder `CreateTask/formExtraFields.tsx`, `components/Scaffolder/*`, shell/feedback/logout remnants; owner plugins' native contribution modules; portal-core landing/navigation; portal extension-host field tests.

- [ ] Keep the seven generic widgets in portal-scaffolder-react. Move registration wrappers to their new frontend owners, preserving FieldValidationProvider coverage and each widget schema/validator.
- [ ] Contribute AAPTokenField/AAPResourcePicker from AAP and data-backed content fields from their agreed providers. Remove migrated names from static formExtraFields reservations so collector declarations are not rejected as duplicate built-ins.
- [ ] Coordinate CollectionsPicker's provider change with the backend split guide (`aap-api-cloud` → `aap-api` or `portal-catalog` by data source). Preserve picker source-string semantics and EE action round-trip tests. An operation-backed replacement requires a real provider implementation and response mapping, not merely a changed import.
- [ ] Define absence behavior: pages start without optional integrations; templates requiring an unavailable field cannot submit an incomplete form and show a clear requirement for that integration.
- [ ] Consume SDK theme/UI implementations directly. Move host feedback/layout behavior to portal-core and retire obsolete shell wrappers after auditing imports/config consumers.
- [ ] Audit LocationListener redirects and the old AAPLogoutHandler. Keep intended route compatibility and auth lifecycle through owner-controlled integration; avoid carrying XPath DOM manipulation or global redirect interception into the native host by default.

**Exit tests:** generic fields work without content plugins; contributed fields load once with schema/validation/secrets intact; missing providers do not break app startup or permit incomplete execution; remounted pages do not duplicate polling; current logout behavior works without the old frontend plugin.

### Slice 6 — Cut over deployment and retire the monolith

**Files:** host `packages/app/src/composition.ts`, `AppNfs.tsx`, `App.tsx` and related tests; app dependencies; landing/nav config; portal-scaffolder `app-config.janus-idp.yaml`; `dynamic-plugins.portal-extension.dev.yaml`; affected package config/dynamic export metadata; `.config/eslint-architecture.js`; release and operator migration docs.

- [ ] Update feature loading and development profiles: `core` remains host-only; templates and content integrations are independently selectable. Preserve or explicitly migrate the existing `scaffolder` profile value.
- [ ] Publish the replacement dynamic plugin inventory, required AAP auth/provider loading, shared singleton configuration, config-schema ownership, page IDs and sidebar mounts. Audit whether `portal-plugin.yaml` remains the repository delivery contract before introducing the old plan's blanket manifest requirement; none was found in the current checkout.
- [ ] Provide migration mapping for old exports/extension IDs. Recommended end state removes the old frontend package; a temporary release bridge, if required, must have an owner and removal milestone and must never register duplicate pages.
- [ ] Remove the old package only after app code, dynamic config, external consumer documentation and all domain pages stop depending on it. Keep portal-scaffolder-react; keep or migrate common contracts according to their actual remaining consumers.
- [ ] Update current architecture docs/ADR successors to describe the accepted final boundaries. Leave the historical plan intact.

**Exit:** no active import or dynamic loading of `@ansible/portal-scaffolder`; no obsolete portal-scaffolder workspace references in active tooling; every supported journey works with only the functional plugin set installed. Historical documentation references are allowed.

**Cutover/rollback:** keep the source registrations available until destination tests and dynamic exports pass. Switch the supported deployment configuration as one reviewed unit. If deployment verification fails, restore the previous package/config set together; do not enable old and new route/API registrations simultaneously. Remove source implementations only after the replacement deployment has passed its acceptance checks.

## 6. Route and compatibility requirements

Preserve these routes as canonical routes or explicit aliases during cutover:

- Templates owner: `/self-service`, `/self-service/catalog`, `/self-service/catalog/:namespace/:templateName`, `/self-service/create/templates/:namespace/:templateName`, `/self-service/catalog-import`.
- History owner: `/self-service/create/tasks`, `/self-service/create/tasks/:taskId`.
- Content owner: `/self-service/ee/*`, `/self-service/catalog/:templateName` for EE definitions, `/self-service/collections/*`, `/self-service/repositories/*`.
- Host owner: `/` and deliberate compatibility redirects from existing standard `/create` and catalog template links.

Do not give `/self-service/*` an unconditional templates catch-all that intercepts content routes. Verify nested page matching, direct reloads, namespaces, configured base paths, query parameters and browser back/forward. Redirects are navigation behavior; permission checks must continue on destination routes and their underlying APIs.

Keep the native field data ref `ansible.portal.scaffolder-field.v1`, `scaffolder.fields` attachment semantics, and collector `api:portal/contributions`. The old plan's page-specific attachment requirement is superseded by the inspected implementation. Extension/page IDs are configuration contracts even when URLs stay unchanged.

Legacy lifecycle removal remains a separate coordinated cutover requirement inherited from the old plan. Do not rebuild a legacy registry inside the new templates plugin. Migrate supported extension consumers first, including APME, then remove legacy discovery/shims and obsolete host configuration without losing equivalent native behavior.

## 7. Decisions needed before implementation

The full EE frontend move is confirmed. Backend creator ownership remains in content-development under the separate backend split guide.

1. **Portal-core packaging:** approve a dedicated portal-templates plugin inside the workspace, rather than expanding the generic host plugin with domain implementation.
2. **1758 destination and contracts:** identify the actual destination package(s), EE authoring integration, content operations/picker contracts and native delivery owner. This requires coordination with that team's current work, not another workspace rename.
3. **Release policy:** agree whether removing the monolithic frontend is a coordinated breaking release or needs a short compatibility period. Stable URLs do not imply stable package/extension IDs.

Exact internal file splits may be decided by implementers. Provider classification, page ownership, unavailable-field behavior and release compatibility must be settled as contracts before dependent work starts.

## 8. Verification and completion criteria

Each implementation slice runs focused tests, package lint and package TypeScript checks. Use existing regression suites rather than duplicating assertions around unchanged widgets. At integration, run repo type checking, build, appropriate lint and browser journeys against the new plugin set.

Representative commands from the repository workflow:

```bash
yarn workspace @ansible/portal-scaffolder-react test --watch=false
yarn workspace @ansible/portal-scaffolder-common test --watch=false
yarn workspace @ansible/portal-core test --watch=false
yarn workspace @ansible/aap-app-auth test --watch=false
yarn workspace @ansible/plugin-scaffolder-backend-module-backstage-rhaap test --watch=false
yarn tsc
yarn build
yarn lint:all
```

Run replacement templates/content package tests, lint and `npx tsc --noEmit -p <package-directory>` as they are introduced. Backend package commands above apply until its independent split lands; afterward run the successor suites. Verify dynamic exports and a real supported native RHDH deployment; source-app success alone does not prove loading or shared singleton behavior.

Required deployment combinations: host only; host + templates with declared AAP/auth and reusable React fields; content-management without templates/old plugin; full app with third-party field and repository contributions. Include denied permissions, unavailable providers, remounted routes and direct deep links. Do not claim migration complete until the full app runs with the monolithic frontend package absent.
