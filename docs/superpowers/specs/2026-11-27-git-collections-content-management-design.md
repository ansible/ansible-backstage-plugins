# Git and Collections Content Management Design

## Intent

Move Git repository and Ansible collection experiences out of
`@ansible/portal-scaffolder` and into the existing
`@ansible/plugin-automation-content` frontend plugin in
`workspaces/content-management`. Keep their current `/self-service` URLs during
this migration. Retirement of the remaining `portal-scaffolder` functionality
is a separate future effort.

## Goals

- Move the Git repositories and collections catalog pages, detail pages, and
  their feature-owned shared UI into `automation-content`.
- Move the CollectionsPicker and ScmSelector scaffolder fields, including the
  SCM selector implementation currently hosted by `portal-scaffolder-react`.
- Preserve current permission checks, page behaviors, field names, contribution
  behavior, and `/self-service/collections` and `/self-service/repositories`
  paths.
- Keep feature workspaces independent. Cross-feature interfaces used by the
  moved frontend belong in shared Portal SDK contracts.

## Out of Scope

- Removing `portal-scaffolder` or migrating its unrelated templates, task,
  execution-environment, AAP, or other scaffolder features.
- Changing public page URLs or catalog/backend behavior.

## Approaches

1. **Use the existing `automation-content` plugin (selected).** It already owns
   content discovery and scaffolder fields, and can host the moved pages without
   adding another frontend package.
2. **Create a separate Git and Collections plugin.** This adds another package
   and registration surface for content-management capabilities that already
   belong to the existing plugin.

## Design

Move feature UI and its tests into `automation-content`, and remove its page and
field registrations from `portal-scaffolder`. Preserve the `/self-service`
paths and app navigation entries. Move cross-feature contracts needed by the
frontend to `portal-extension-api` or `portal-extension-common`, then update
their current AAP implementations/re-exports to use those contracts. Reusable
UI shared with the still-active Content Development plugin stays available
through `portal-plugin-sdk`.

The `automation-content` package must not gain dependencies on Content
Development or AAP feature packages. It may depend on shared Portal SDK
contracts and its own content-management packages.

## Remaining Implementation Choices

Keep existing repository and collection page behavior as the reference. The
implementer can settle internal file placement and whether a shared helper is
extracted to the SDK or kept local, provided the workspace boundary above is
maintained and no behavior or route changes are introduced.
