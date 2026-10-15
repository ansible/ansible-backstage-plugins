# @ansible/portal-extension-common

Shared contract library for frontend and backend Portal packages. Source:
`workspaces/portal-core/plugins/portal-extension-common`.

## Contracts

- Plugin manifests, capabilities, entry points, and operation descriptors.
- Slot/workflow/operation launch unions and operation request/response shapes.
- Settings and entitlement declarations.
- Canonical content-type, experience, and compatibility extension-point IDs.

Host experiences include Content Quality, Content Authoring, and Content
Migration. Portal scaffolder is a plugin, not an experience. Runtime predicates
belong on frontend descriptors rather than serialized manifests.

## Usage

Import shared types without importing the React host or backend SDK:

```ts
import type { PluginManifest } from '@ansible/portal-extension-common';
```

See the [implementation guide](../next/portal-plugin-factory-implementation-guide.md)
for package ownership and remaining contract work.
