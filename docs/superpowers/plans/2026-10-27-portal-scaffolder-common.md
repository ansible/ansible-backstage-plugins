# Portal Scaffolder Common Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `@ansible/portal-scaffolder-common` and move framework-independent portal-scaffolder contracts, EE definition schemas, and route constants behind a stable common-library boundary without changing existing frontend behavior.

**Architecture:** The new package contains only TypeScript contracts, pure EE-definition YAML parsing/schema code, and string route identifiers/paths. Backstage route refs, API refs, HTTP clients, React components, and plugin-provided extensions remain in `@ansible/portal-scaffolder`; compatibility re-exports preserve the existing public frontend imports while consumers can migrate to the common package.

**Tech Stack:** TypeScript 5.8, Backstage CLI package conventions, Yarn 4 workspaces, Jest, `js-yaml`, and the existing portal-scaffolder test utilities.

**Spec:** `.sdlc/research/portal-scaffolder-re-architecture.md` (Phase 1 and sections 4.1, 6), Jira AAP-98942: “Portal scaffolder: Extract shared schemas and wire types into a common package”.

## Global Constraints

- The new common package imports no React, frontend plugin implementation, backend concrete client, or database code.
- Use the existing ownership location under `workspaces/portal-scaffolder/plugins` unless an explicit coordinated rename is agreed.
- Preserve route paths, persisted values, and API compatibility; re-export or migrate existing public imports intentionally.
- Do not introduce circular dependencies between portal-scaffolder packages or workspaces.
- The package must declare `backstage.role: common-library`, expose correct root/subpath exports, and participate in workspace, TypeScript, lint, and CI checks.
- Collections and Git Repository content ownership remains outside this change; no content implementation imports are added.
- `portal-plugin.yaml` delivery metadata belongs to the later Phase 3 work and is not part of AAP-98942.

## Review Focus

- Malformed, empty, non-string, and over-limit EE YAML must retain the current `parseEEDefinition` result behavior; covered by the common schema tests.
- Inline and file-reference EE dependency forms must preserve the current parsed field names and values; covered by the migrated parser tests.
- Existing imports from `@ansible/portal-scaffolder` must continue to resolve for API contracts and `ParsedEEDefinition`; covered by frontend compatibility tests and TypeScript compilation.
- Existing route IDs and paths must remain byte-for-byte compatible; covered by common route-constant tests and existing route-ref tests.
- The package boundary must remain implementation-free: its manifest and source must have no React, Backstage plugin API, HTTP client, database, or content-workspace dependency; covered by metadata/source inspection and package lint/type checks.

---

### Task 1: Scaffold the common-library package

**Files:**

- Create: `workspaces/portal-scaffolder/plugins/portal-scaffolder-common/package.json`
- Create: `workspaces/portal-scaffolder/plugins/portal-scaffolder-common/tsconfig.json`
- Create: `workspaces/portal-scaffolder/plugins/portal-scaffolder-common/src/index.ts`
- Create: `workspaces/portal-scaffolder/plugins/portal-scaffolder-common/src/routes.ts`
- Create: `workspaces/portal-scaffolder/plugins/portal-scaffolder-common/src/routes.test.ts`

**Interfaces:**

- Consumes: Existing root workspace glob `workspaces/portal-scaffolder/plugins/*` and package conventions from `automation-content-common` and `backstage-rhaap-common`.
- Produces: Package `@ansible/portal-scaffolder-common`, role `common-library`, root export `.`, subpath exports `./types`, `./schemas`, `./routes`, and `./package.json`.

- [ ] **Step 1: Write route export tests** asserting `PORTAL_SCAFFOLDER_ROUTE_IDS` contains the existing route IDs (`self-service`, `self-service/ee`, `self-service/collections`, `self-service/repositories`, `self-service/templates`, `self-service/history`, `self-service/catalog-import`, `self-service/selected-template`, `self-service/task`) and `PORTAL_SCAFFOLDER_ROUTE_PATHS` contains the existing sub-route paths.

- [ ] **Step 2: Run the new package test**

Run: `yarn workspace @ansible/portal-scaffolder-common test src/routes.test.ts --watch=false`

Expected: FAIL because the new workspace/package and route exports do not exist yet.

- [ ] **Step 3: Implement package metadata and barrel**

Create a publishable `0.1.0` common library with `main`/`types` pointing to `src/index.ts`, `backstage.role` set to `common-library`, `sideEffects: false`, standard Backstage build/lint/test/clean scripts, `files: ["dist"]`, and `js-yaml` as its only runtime dependency. Export the three contract modules from `src/index.ts`.

- [ ] **Step 4: Implement route constants**

Create framework-independent `as const` objects in `src/routes.ts` with the exact IDs and paths listed in Step 1; do not import any Backstage package.

- [ ] **Step 5: Run the route tests**

Run: `yarn workspace @ansible/portal-scaffolder-common test src/routes.test.ts --watch=false`

Expected: PASS.

- [ ] **Step 6: Commit the package scaffold**

```bash
git add workspaces/portal-scaffolder/plugins/portal-scaffolder-common
git commit -m "feat(portal-scaffolder): scaffold common package"
```

### Task 2: Extract shared API and wire types

**Files:**

- Create: `workspaces/portal-scaffolder/plugins/portal-scaffolder-common/src/types.ts`
- Create: `workspaces/portal-scaffolder/plugins/portal-scaffolder-common/src/types.test.ts`
- Modify: `workspaces/portal-scaffolder/plugins/portal-scaffolder-common/src/index.ts`
- Modify: `workspaces/portal-scaffolder/plugins/portal-scaffolder/src/apis.ts`
- Modify: `workspaces/portal-scaffolder/plugins/portal-scaffolder/package.json`
- Modify: `workspaces/portal-scaffolder/plugins/portal-scaffolder/src/apis.test.ts`

**Interfaces:**

- Consumes: Existing public declarations in `portal-scaffolder/src/apis.ts`.
- Produces: Common exports `UserJobTemplate`, `AnsibleApi`, `EEBuildRegistryType`, `EEBuildRequest`, `EEBuildResult`, `EEBuildTriggerOptions`, and `EEBuildApi`, preserving all existing field names, optionality, literal unions, and method signatures.

- [ ] **Step 1: Add compile-time contract coverage**

Create `types.test.ts` with representative assignments for `UserJobTemplate`, `EEBuildRequest`, `EEBuildResult`, and both `AnsibleApi`/`EEBuildApi` implementations so `tsc` verifies the exact public shapes without introducing runtime dependencies.

- [ ] **Step 2: Run the package type check to establish the failure**

Run: `npx tsc --noEmit -p workspaces/portal-scaffolder/plugins/portal-scaffolder-common`

Expected: FAIL because `src/types.ts` and its exports are not implemented.

- [ ] **Step 3: Move the framework-independent declarations**

Copy the existing declarations without behavior changes into `src/types.ts`; keep API refs, `ApiFactory` declarations, `AnsibleApiClient`, `EEBuildApiClient`, authentication imports, and HTTP parsing in the frontend `apis.ts` implementation.

- [ ] **Step 4: Add the frontend compatibility boundary**

Add `@ansible/portal-scaffolder-common: workspace:^` to the frontend package. Import the moved types into `apis.ts` for implementation signatures and re-export them as type exports from that module so existing `@ansible/portal-scaffolder` consumers continue to compile.

- [ ] **Step 5: Run focused contract and frontend tests**

Run: `npx tsc --noEmit -p workspaces/portal-scaffolder/plugins/portal-scaffolder-common`

Run: `yarn workspace @ansible/portal-scaffolder test src/apis.test.ts --watch=false`

Expected: Both commands pass, with API client behavior unchanged.

- [ ] **Step 6: Commit the type extraction**

```bash
git add workspaces/portal-scaffolder/plugins/portal-scaffolder-common/src/types.ts workspaces/portal-scaffolder/plugins/portal-scaffolder-common/src/types.test.ts workspaces/portal-scaffolder/plugins/portal-scaffolder-common/src/index.ts workspaces/portal-scaffolder/plugins/portal-scaffolder/src/apis.ts workspaces/portal-scaffolder/plugins/portal-scaffolder/src/apis.test.ts workspaces/portal-scaffolder/plugins/portal-scaffolder/package.json
git commit -m "refactor(portal-scaffolder): extract common API contracts"
```

### Task 3: Extract EE definition schemas and preserve the legacy utility

**Files:**

- Create: `workspaces/portal-scaffolder/plugins/portal-scaffolder-common/src/schemas.ts`
- Create: `workspaces/portal-scaffolder/plugins/portal-scaffolder-common/src/schemas.test.ts`
- Modify: `workspaces/portal-scaffolder/plugins/portal-scaffolder-common/src/index.ts`
- Modify: `workspaces/portal-scaffolder/plugins/portal-scaffolder/src/utils/eeDefinitionUtils.ts`
- Modify: `workspaces/portal-scaffolder/plugins/portal-scaffolder/src/utils/eeDefinitionUtils.test.ts`

**Interfaces:**

- Consumes: Existing `ParsedEEDefinition` and `parseEEDefinition(definitionYaml: string | undefined): ParsedEEDefinition | null` behavior.
- Produces: Common `ParsedEEDefinition` and `parseEEDefinition` exports through both the root and `./schemas` subpath; the frontend utility remains a compatibility re-export.

- [ ] **Step 1: Move the existing parser tests**

Move the current parser cases into `schemas.test.ts`, preserving coverage for empty/non-string input, base image, inline and file-reference galaxy/python/system dependencies, interpreter path, malformed YAML, and the 100,000-character limit.

- [ ] **Step 2: Run the common schema test to establish the failure**

Run: `yarn workspace @ansible/portal-scaffolder-common test src/schemas.test.ts --watch=false`

Expected: FAIL because `src/schemas.ts` is not implemented.

- [ ] **Step 3: Move the pure parser implementation**

Move `ParsedEEDefinition`, its helper functions, `MAX_DEFINITION_LENGTH`, and `parseEEDefinition` into `src/schemas.ts` unchanged. Keep `js-yaml` as a runtime dependency and do not add React, Backstage, catalog, HTTP, or database imports.

- [ ] **Step 4: Add the legacy frontend re-export**

Replace the frontend implementation with type/function re-exports from `@ansible/portal-scaffolder-common`; keep existing imports from `./utils/eeDefinitionUtils` valid and update its test only as needed to prove the compatibility path.

- [ ] **Step 5: Run common and frontend schema tests**

Run: `yarn workspace @ansible/portal-scaffolder-common test src/schemas.test.ts --watch=false`

Run: `yarn workspace @ansible/portal-scaffolder test src/utils/eeDefinitionUtils.test.ts --watch=false`

Expected: Both commands pass with identical parser results.

- [ ] **Step 6: Commit the schema extraction**

```bash
git add workspaces/portal-scaffolder/plugins/portal-scaffolder-common/src/schemas.ts workspaces/portal-scaffolder/plugins/portal-scaffolder-common/src/schemas.test.ts workspaces/portal-scaffolder/plugins/portal-scaffolder-common/src/index.ts workspaces/portal-scaffolder/plugins/portal-scaffolder/src/utils/eeDefinitionUtils.ts workspaces/portal-scaffolder/plugins/portal-scaffolder/src/utils/eeDefinitionUtils.test.ts
git commit -m "refactor(portal-scaffolder): extract EE definition schemas"
```

### Task 4: Wire route constants, workspace metadata, and full verification

**Files:**

- Modify: `workspaces/portal-scaffolder/plugins/portal-scaffolder/src/routes.ts`
- Modify: `yarn.lock`
- Modify: `workspaces/portal-scaffolder/plugins/portal-scaffolder-common/src/index.ts` (only if export wiring remains incomplete)
- Modify: `workspaces/portal-scaffolder/plugins/portal-scaffolder/src/routes.test.ts` (only if compatibility assertions need shared constants)

**Interfaces:**

- Consumes: `PORTAL_SCAFFOLDER_ROUTE_IDS` and `PORTAL_SCAFFOLDER_ROUTE_PATHS` from Task 1.
- Produces: Existing Backstage route refs backed by common constants, with no route ID/path drift and a lockfile entry for the new workspace.

- [ ] **Step 1: Rewire the frontend route refs**

Update `src/routes.ts` to use the common string constants for every route ID and sub-route path while retaining the same `createRouteRef`/`createSubRouteRef` calls and root-parent relationships.

- [ ] **Step 2: Refresh workspace resolution**

Run `yarn install` from the repository root so the new workspace and its `workspace:^` dependency are represented in `yarn.lock`; do not add unrelated dependency updates.

- [ ] **Step 3: Verify package boundary and focused behavior**

Run:

```bash
yarn workspace @ansible/portal-scaffolder-common lint
yarn workspace @ansible/portal-scaffolder-common test --watch=false
npx tsc --noEmit -p workspaces/portal-scaffolder/plugins/portal-scaffolder-common
yarn workspace @ansible/portal-scaffolder test src/routes.test.ts --watch=false
```

Expected: all commands pass; the common package has no React/frontend/backend/database/content dependency.

- [ ] **Step 4: Verify the affected frontend package**

Run:

```bash
yarn workspace @ansible/portal-scaffolder test --watch=false
yarn workspace @ansible/portal-scaffolder lint
npx tsc --noEmit -p workspaces/portal-scaffolder/plugins/portal-scaffolder
```

Expected: all existing portal-scaffolder tests, lint, and package type checks pass.

- [ ] **Step 5: Run repository formatting and changed-file checks**

Run: `yarn prettier:check`

Run: `git diff --check main...HEAD`

Expected: no formatting or whitespace errors.

- [ ] **Step 6: Commit the integration and lockfile**

```bash
git add yarn.lock workspaces/portal-scaffolder/plugins/portal-scaffolder/src/routes.ts workspaces/portal-scaffolder/plugins/portal-scaffolder/src/routes.test.ts
git commit -m "refactor(portal-scaffolder): wire common route contracts"
```
