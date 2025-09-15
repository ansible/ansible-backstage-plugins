# catalog-backend-module-rhaap

The catalog-backend-module-rhaap plugin synchronizes users, teams, organizations, and job templates from AAP into RHDH / Ansible Self-Service.

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

Fragment for `app-config.local.yaml`:

```yaml
catalog:
  providers:
    rhaap:
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
    baseUrl: { $AAP_URL }
    token: { $AAP_TOKEN }
    checkSSL: false
```

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
