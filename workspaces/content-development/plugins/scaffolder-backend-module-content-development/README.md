# Scaffolder Backend Module: Content Development

This backend module provides Ansible content development and execution environment scaffolder actions.

## Required backend module

The execution environment lifecycle adapter discovers its catalog provider through the generic provider registry in `@ansible/portal-plugin-node`. Load `@ansible/backstage-plugin-catalog-backend-module-content` in the same backend deployment; its default loader retains PAH and Git catalog registration and contributes the EE provider.

Configure the provider ID in trusted backend configuration. Do not pass it through a scaffolder template:

```yaml
ansible:
  ee:
    catalogProviderId: content-management.execution-environments
```

The content-management provider owns EE entity validation, catalog connectivity, durable registration state, and mutation locking. This module keeps the permission-aware lifecycle adapter and passes the initiating caller's credentials through its locked mutations.
