# catalog-backend-module-rhaap-shared

Shared provider library for the AAP catalog backend split. Houses all entity providers, the sync router, slice-guard, and `createCatalogModule()`. Consumed by `catalog-backend-module-aap`, `catalog-backend-module-interim-content`, `catalog-backend-module-self-service-ee`, and the legacy `catalog-backend-module-rhaap` shim.

## Installation

Build plugin as a dynamic plugin.
Then configure your RHDH to load tar.gz with the plugin.

### AAP, Create token

Plugin needs access to AAP. Create a token as admin user:

- AAP UI, top left corner, click username, User details
- Select tab Tokens, click Create token
- Required properties:
  - OAuth application: leave empty
  - Scope: read

Use token value as `AAP_TOKEN`

### RHDH

Fragment for `app-config.local.yaml` when using the **split catalog modules** (`catalog-backend-module-aap`, `catalog-backend-module-interim-content`, etc.):

```yaml
catalog:
  providers:
    # Primary key for catalog-backend-module-aap (split bundle)
    aap:
      development:
        orgs: Default
        sync:
          # Sync users, teams, and organizations
          orgsUsersTeams:
            schedule:
              frequency: { minutes: 60 }
              timeout: { minutes: 15 }
          # Sync job templates (optional)
          jobTemplates:
            enabled: true
            schedule:
              frequency: { minutes: 60 }
              timeout: { minutes: 15 }
ansible:
  rhaap:
    baseUrl: ${AAP_URL}
    token: ${AAP_TOKEN}
    checkSSL: false
```

> **Legacy / shim deployments:** If you are still using the deprecated `catalog-backend-module-rhaap` shim (single bundle), replace `aap:` with `rhaap:` above. The split modules fall back to `catalog.providers.rhaap` automatically when their primary key is absent.

## Features

This plugin provides the following synchronization capabilities:

### User, Team, and Organization Sync

- Synchronizes AAP users as Backstage `User` entities
- Synchronizes AAP teams as Backstage `Group` entities
- Synchronizes AAP organizations as Backstage `Group` entities
- Creates dynamic `aap-admins` group for superusers
- Maintains group membership relationships

For detailed configuration and usage of user, team, and organization synchronization, see the [Users, Teams, and Organizations Documentation](../../docs/features/users-teams-organizations.md).

### Job Template Sync

- Synchronizes AAP job templates as executable Backstage `Template` entities
- Supports job templates with surveys and dynamic form generation
- Enables direct job execution from Backstage interface
- Provides filtering by organization, labels, and survey status

For detailed configuration and usage of job template synchronization, see the [Job Template Documentation](../../docs/features/job-templates.md).

## Superuser sync routes (HTTP)

On-demand sync triggers exposed by this module use:

- `POST .../ansible/sync/from-aap/orgs_users_teams`
- `POST .../ansible/sync/from-aap/job_templates`

Older path names under `/aap/sync_*` are **removed**; update custom clients. See the [CHANGELOG](https://github.com/ansible/ansible-backstage-plugins/blob/main/CHANGELOG.md).
