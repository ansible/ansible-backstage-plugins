# Git and Collections Content Management Implementation Plan

> **For agentic workers:** Use the approved design in `docs/superpowers/specs/2026-11-27-git-collections-content-management-design.md` as the scope authority.

**Goal:** Move Git repository and collection UI and scaffolder fields from `portal-scaffolder` to `automation-content`, preserving behavior and `/self-service` URLs.

**Architecture:** The existing content-management frontend plugin owns the moved pages and fields. Shared frontend and wire contracts live in `portal-extension-api` or `portal-extension-common`; no dependency from content-management to content-development or AAP feature packages is introduced.

**Tech Stack:** Backstage frontend plugin API, Portal extension API/common SDKs, React, TypeScript, existing Jest tests.

**Spec:** `docs/superpowers/specs/2026-11-27-git-collections-content-management-design.md`

## Global Constraints

- Keep `/self-service/collections` and `/self-service/repositories`.
- Keep `portal-scaffolder` and its unrelated features in place.
- Feature workspaces depend on shared SDK contracts rather than one another.
- Preserve field names `CollectionsPicker` and `ScmSelector` and their template data contracts.

## Review Focus

- Direct and transitive imports from `automation-content` into feature workspaces; inspect `package.json` and moved source imports.
- Duplicate or stale page/field registrations while both plugins remain loaded; verify the registrations have one owner.
- Permission denial and route/link construction for nested repository and collection pages; retain the existing URLs and permission gates.
- OAuth-backed field behavior and template field data shape; retain the existing field implementations and tests.
- External contribution surfaces on repository and collection views; retain existing Portal SDK hooks and contribution identifiers.

---

### Task 1: Publish shared contracts needed across feature workspaces

**Files:**

- Modify: `workspaces/portal-core/plugins/portal-extension-common/src/index.ts` and add shared permission/error-code contracts there.
- Modify: `workspaces/portal-core/plugins/portal-extension-api/src/index.ts` and add frontend API references for AAP auth and Git repository catalog cache invalidation.
- Modify: `workspaces/aap/plugins/aap-common/src/permissions.ts` to preserve its public exports through the shared contract.
- Modify: `workspaces/aap/plugins/backstage-rhaap-common/src/constants.ts` and `gitRepositoriesCatalog.ts` to retain compatible exports where still used.
- Modify: `workspaces/aap/plugins/aap-app-auth/src/api.ts` to use the shared auth API ref.
- Modify: `workspaces/content-management/plugins/automation-content-common/src/permissions.ts` to re-export shared EE grants.
- Modify: existing Content Development and APME consumers of moved contracts.

- [x] Add the shared permission and SCM integration error contracts, then update AAP exports to refer to the same contract values.
- [x] Add shared frontend API refs and migrate their current providers/consumers.
- [x] Confirm `automation-content` can consume these contracts without a dependency on `workspaces/aap`.

### Task 2: Move Git repository and Collections catalog experiences

**Files:**

- Move: `workspaces/content-development/plugins/portal-scaffolder/src/components/GitRepositories/**` to `workspaces/content-management/plugins/automation-content/src/components/GitRepositories/**`.
- Move: `workspaces/content-development/plugins/portal-scaffolder/src/components/CollectionsCatalog/**` to `workspaces/content-management/plugins/automation-content/src/components/CollectionsCatalog/**`.
- Move or extract: feature-owned common helpers from `workspaces/content-development/plugins/portal-scaffolder/src/components/common/`.
- Modify: `workspaces/content-management/plugins/automation-content/src/routes.ts`, `alpha.tsx`, `manifest.ts`, and `package.json`.
- Modify: `workspaces/content-development/plugins/portal-scaffolder/src/alpha.tsx`, `plugin.ts`, `routes.ts`, `selfServiceManifest.ts`, and `index.ts`.
- Modify: `app-config.yaml` only if necessary; existing navigation paths remain in place.

- [x] Relocate page trees, tests, and feature-owned shared files while updating imports.
- [x] Wire native page extensions and permission-gated navigation in `automation-content` at the existing `/self-service` URLs.
- [x] Remove old page and contribution registrations from `portal-scaffolder` without removing unrelated pages or fields.
- [x] Preserve portal-extension contribution hooks, manifest entries, and cache invalidation behavior.

### Task 3: Move CollectionsPicker and ScmSelector fields

**Files:**

- Move: `portal-scaffolder/src/components/Scaffolder/CollectionsPicker/**` to `automation-content/src/components/Scaffolder/CollectionsPicker/**`.
- Move: `portal-scaffolder-react/src/components/ScmSelector/**` to `automation-content/src/components/Scaffolder/ScmSelector/**`.
- Modify: `portal-scaffolder-react/src/index.ts` and its `ScmSelector` tests/exports.
- Modify: `portal-scaffolder/src/alpha.tsx`, `selfServiceManifest.ts`, and `index.ts`.
- Modify: `automation-content/src/alpha.tsx`, `manifest.ts`, and `package.json`.
- Modify: `app-config.yaml` and `workspaces/content-management/README.md` for the new field extension IDs/configuration.

- [x] Relocate the field implementations and tests, including local SCM validation helpers, so the target has no dependency on Content Development UI packages.
- [x] Register both field blueprints from `automation-content` and preserve the names and submitted data shape.
- [x] Remove the old field registrations and exports from Content Development, leaving its other fields intact.

### Task 4: Update host wiring and documentation

**Files:**

- Modify: `app-config.yaml` and `workspaces/portal-core/packages/app/src/App.tsx` only where required to preserve routes and navigation.
- Modify: `workspaces/content-management/README.md` and applicable extension configuration docs.
- Modify: `workspaces/portal-core` package manifests only if a new shared contract package dependency is required.

- [x] Keep current sidebar links and route strings pointed at the migrated pages.
- [x] Document the new owner of the pages and fields and keep remaining `portal-scaffolder` usage explicit.
- [x] Inspect package manifests and imports to ensure there is no direct feature-workspace dependency.

### Task 5: Review migration completeness

- [x] Search for stale imports, routes, manifests, and exports owned by the old plugin.
- [x] Review the final diff for behavior, route, field name, permission, and workspace-boundary preservation.
- [x] Report validation not run unless separately requested.

Ruling: Mount the legacy collection and repository routable extensions in `packages/app/src/App.tsx`, where the host's `FlatRoutes` are declared; `Root.tsx` controls the sidebar/layout and did not need route changes. Cost if wrong: if route ownership moves out of `App.tsx`, these two static mounts must move with it.

Final review: the independent code review found no actionable issues. `yarn lint`, applicable pre-commit hooks, static import/route scans, and `git diff --check` pass. Tests and builds were not run.
