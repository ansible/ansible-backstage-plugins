# ADR-001: Create `portal-scaffolder-common` for shared scaffolder contracts

- **Status:** Accepted
- **Date:** 2026-10-28
- **Related work:** [AAP-98942](https://redhat.atlassian.net/browse/AAP-98942)

## Context

The Portal scaffolder re-architecture introduces a `common-library` package in
the existing `workspaces/portal-scaffolder` workspace. Shared types and
validation schemas should be usable by frontend and backend packages without
importing the frontend plugin, React, database code, or implementation-specific
clients. Keeping these contracts in the frontend plugin would make reuse
awkward and risk coupling future consumers to that plugin's implementation
boundary.

The architecture plan identifies shared types, schemas, and Portal scaffolder
route path constants as candidates for this package. Extracting them in
reviewable slices makes the package boundary and each consumer migration easier
to review. Existing AAP permissions remain in `backstage-rhaap-common`; there
are no separate Portal scaffolder permission definitions to move.

## Decision

Create `@ansible/portal-scaffolder-common` under
`workspaces/portal-scaffolder/plugins/` with the Backstage role
`common-library`. The package root exports shared contracts and validation
schemas. It may depend on framework-independent libraries such as Zod, but it
must not contain UI, frontend-plugin implementation, backend services, or
database code.

The initial extractions are:

1. Move the `UserJobTemplate`, `EEBuildRegistryType`, `EEBuildRequest`, and
   `EEBuildResult` wire types from the portal-scaffolder frontend plugin
   without changing their names, fields, types, or optionality. The frontend
   depends on the common package through `workspace:^` and preserves type-only
   compatibility exports from `src/apis.ts`.
2. Move the EE definition input Zod schema and its validation tests into the
   common package. Export the schema from the package root, add Zod as a common
   package runtime dependency, and make the AAP scaffolder backend module
   depend on the common package through `workspace:^` and consume the shared
   schema. The backend keeps its action implementation and helper types.
3. Extract the existing Portal scaffolder page and sub-route path strings into
   the common package. Keep route refs and IDs in the frontend plugin and
   preserve every path value exactly.

API references, clients, and factories remain in the frontend plugin. Backend
action orchestration, templates, and services remain in the backend module.
Existing AAP permissions remain in `backstage-rhaap-common`; no additional
permission definitions are moved. This ADR does not include the separate
`portal-scaffolder-react` package, delivery manifests, or changes to UI route
behavior.

## Alternatives considered

1. **Keep shared contracts in the frontend plugin and duplicate them for other
   consumers.** Rejected because duplicated definitions can drift and leave
   callers with multiple definitions of the same contract.
2. **Have other packages import the frontend plugin.** Rejected because it
   couples shared contracts to frontend implementation and risks dependency
   cycles or frontend-only dependencies at backend boundaries.
3. **Move all shared code in one large change.** Rejected in favor of separate
   slices that keep package setup, wire types, schemas, and later constants
   independently reviewable.

## Consequences

- Frontend and backend packages can share wire types and EE definition
  validation without a runtime dependency on the frontend plugin.
- The frontend compatibility exports preserve existing type import paths.
- The EE definition input schema has one shared runtime definition, and its
  validation tests live with the common package.
- Portal scaffolder route path strings have one shared definition while route
  refs, IDs, and path values remain unchanged.
- The common package has a runtime dependency on Zod and must remain free of
  React, database code, frontend implementation, and backend services.
- Future migrations must keep consumers and compatibility paths covered by
  type checks and focused regression tests.

## References

- [Portal scaffolder re-architecture plan, §4.1 and Phase 1](https://github.com/ansible/ansible-backstage-plugins/blob/53dffe6ab883e058735bc6a76bcb3b54c9389733/.sdlc/research/portal-scaffolder-re-architecture.md)
