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

For detailed configuration and usage of user, team, and organization synchronization, see the [Users, Teams, and Organizations Documentation](../features/users-teams-organizations.md).

### Job Template Sync

- Synchronizes AAP job templates as executable Backstage `Template` entities
- Supports job templates with surveys and dynamic form generation
- Enables direct job execution from Backstage interface
- Provides filtering by organization, labels, and survey status

For detailed configuration and usage of job template synchronization, see the [Job Template Documentation](../features/job-templates.md).

## Superuser REST routes (manual sync)

The catalog backend module exposes HTTP routes on the **catalog** service (paths are relative to the catalog plugin base URL, for example `/api/catalog` in development). These **superuser-only** endpoints trigger on-demand sync from AAP:

| Method | Path                                      | Purpose                                                                                  |
| ------ | ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET`  | `/ansible/sync/from-aap/orgs_users_teams` | Sync organizations, users, and teams                                                     |
| `GET`  | `/ansible/sync/from-aap/job_templates`    | Sync job templates into catalog templates                                                |
| `GET`  | `/ansible/sync/status`                    | Query sync status (supports query parameters such as `aap_entities`, `ansible_contents`) |

**Migration:** Older releases used paths under `/aap/sync_*`. Those were replaced by the `/ansible/sync/from-aap/...` routes above. Update any custom automation or bookmarks accordingly. See the [project CHANGELOG](https://github.com/ansible/ansible-backstage-plugins/blob/main/CHANGELOG.md) for details.
