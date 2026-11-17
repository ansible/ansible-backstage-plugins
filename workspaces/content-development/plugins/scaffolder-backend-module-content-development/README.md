# Scaffolder Backend Module: Content Development

This backend module provides Ansible content development and execution environment scaffolder actions.

## Required backend module

The execution environment lifecycle adapter calls the `/ansible/ee` routes provided by `@ansible/backstage-plugin-catalog-backend-module-rhaap`. Enable that catalog backend module in the same backend deployment whenever this scaffolder module is enabled. Without it, execution environment registration and cleanup actions fail because their catalog routes are unavailable.
