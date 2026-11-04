# `@ansible/portal-scaffolder-common`

Shared contract library for frontend and backend Portal scaffolder packages.
Source: `workspaces/portal-scaffolder/plugins/portal-scaffolder-common`.

## Responsibilities

- Wire types for user job templates and execution environment builds:
  `UserJobTemplate`, `EEBuildRegistryType`, `EEBuildRequest`, and `EEBuildResult`.
- `eeDefinitionInputSchema`: shared Zod validation for execution environment
  definition inputs.
- `portalScaffolderRoutePaths`: page and sub-route path constants for Portal
  scaffolder, including templates, collections, execution environments, Git
  repositories, task history, catalog import, template selection, and task details.

## Integration

Consume the package as a Backstage `common-library` dependency. Its package root
exports both shared types and runtime values:

```ts
import type { EEBuildRequest } from '@ansible/portal-scaffolder-common';
import {
  eeDefinitionInputSchema,
  portalScaffolderRoutePaths,
} from '@ansible/portal-scaffolder-common';
```

The frontend plugin consumes the wire types and route paths. Existing wire-type
exports from `@ansible/portal-scaffolder` remain available for compatibility. The
AAP scaffolder backend module uses the schema in its `createEEDefinition` action.

Route refs, IDs, API clients, and factories belong to the frontend plugin. Backend
actions and services belong to the backend module. Existing AAP permissions are
defined in `backstage-rhaap-common`. The common package's runtime dependency is
Zod; it contains framework-independent contracts and validation.

## Related modules

- [portal-scaffolder](portal-scaffolder.md): frontend pages and scaffolder UI.
- [AAP scaffolder module](scaffolder.md): backend action implementations.
- [backstage-rhaap-common](backstage-rhaap-common.md): shared AAP integration and
  permissions.

See [ADR-001](https://github.com/ansible/ansible-backstage-plugins/blob/main/.sdlc/adrs/ADR-001-portal-scaffolder-common.md)
for the package ownership decision.
