# @ansible/portal-extension-api

Frontend web library for Portal contribution contracts, API references, and
clients. Source: `workspaces/portal-core/plugins/portal-extension-api`.
This library is imported by contributors; it is not a standalone page plugin.

## Native contribution contracts

Import Blueprints from `@ansible/portal-extension-api/alpha` to declare entity
tabs, overview cards, entity/catalog actions, catalog tabs and columns,
workflow launchers, and scaffolder fields.

Entity/catalog descriptors attach to the host's `api:portal/contributions`
provider. Native components load only after host validation and applicability
checks. Shared data references do not require a mutable singleton registry.

## Compatibility

The root entry point also contains registry helpers and hooks for the explicit
legacy app. Do not call those helpers for native registration.

Use the [NFS composition guide](../next/portal-sdk-nfs-composition.md) for the
current integration contract, not the legacy quickstart.
