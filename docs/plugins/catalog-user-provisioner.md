# @ansible/backstage-plugin-catalog-backend-module-rhaap-user-provisioner

Catalog backend module for on-demand provisioning of authenticated AAP users.
Source: `workspaces/aap/plugins/catalog-backend-module-rhaap-user-provisioner`.

## Responsibilities

The module attaches to the `catalog` plugin, registers a user entity provider,
and connects its user-creation callback to `userProvisionerRef`.
It consumes `ansibleServiceRef` and server configuration through dependency injection.

Provisioned users carry source-location annotations and group memberships.
AAP superusers receive the AAP admin group membership used by the integration.
Namespace handling depends on configured organizations; it must not be mistaken
for the Portal host's active-organization entitlement resolver.

## Integration

```ts
backend.add(
  import('@ansible/backstage-plugin-catalog-backend-module-rhaap-user-provisioner'),
);
```

Install with the [AAP shared library](backstage-rhaap-common.md) and
[AAP authentication module](auth.md). User provisioning is separate from the
periodic [AAP catalog synchronization](catalog.md).
