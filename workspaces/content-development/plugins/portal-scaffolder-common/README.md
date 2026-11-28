# @ansible/portal-scaffolder-common

Shared contracts, Zod validation schemas, route paths, and pure Dev Spaces link
helpers for Portal scaffolder packages. This package owns wire types, validation
rules, path values, and link builders that can be used across frontend and
backend boundaries; it does not contain UI or
backend service implementation code. Route refs and their IDs remain in the
frontend plugin.

## Dev Spaces links

Content-development owns the reusable helpers that build links for opening
source code in OpenShift Dev Spaces. Content-management owns catalog discovery
and content management; these helpers perform neither of those operations.
They are exported from `@ansible/portal-scaffolder-common` so consumers use the
shared library without importing a frontend plugin or backend implementation.

The helpers preserve the existing repository parsing, slash/hash format, and
branch-over-pull-request preference from legacy common. Their original tests
move with them. They do not read configuration, create workspaces, or change
repositories. Consumers still supply the Dev Spaces base URL.

```ts
import { buildDevSpacesUrlFromRepoUrl } from '@ansible/portal-scaffolder-common';

const url = buildDevSpacesUrlFromRepoUrl(
  'https://devspaces.example.com',
  'https://github.com/team/demo',
  'fix-error',
);
// https://devspaces.example.com/#https://github.com/team/demo/tree/fix-error
```

APME retains its own decisions about link visibility, the default branch, and
the remediation branch or pull request. Its frontend declares and embeds this
library. Rebuild the affected libraries and consumers from the same repository
revision, because this migration does not change package versions. The separate
content scaffolder configuration helper and its URL behavior are unchanged.
