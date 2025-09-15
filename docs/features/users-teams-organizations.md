# Users, Teams, and Organizations Synchronization

The Users, Teams, and Organizations Synchronization feature automatically imports and synchronizes user accounts, team structures, and organizational hierarchies from Ansible Automation Platform (AAP) into Backstage. This integration ensures that your Backstage catalog reflects your AAP organizational structure and maintains consistent user and group management across both platforms.

## Overview

This synchronization feature creates Backstage entities that mirror your AAP organizational structure:

- **Organizations** → Backstage `Group` entities with type `organization`
- **Teams** → Backstage `Group` entities with type `team`
- **Users** → Backstage `User` entities with proper group memberships

### Key Features

- **Automatic Synchronization**: Users, teams, and organizations are automatically imported from AAP on a configurable schedule
- **Hierarchical Structure**: Maintains organizational hierarchy with proper parent-child relationships
- **Group Memberships**: Preserves team and organization memberships
- **Superuser Management**: Creates dynamic `aap-admins` group for AAP superusers
- **RBAC Integration**: Adds AAP-specific annotations for role-based access control
- **Batch Processing**: Efficiently handles large user bases with batch processing

## Configuration

### Basic Configuration

Add the following configuration to your `app-config.yaml`:

```yaml
catalog:
  providers:
    rhaap:
      development:
        orgs: Default # Organization name(s) to sync from
        sync:
          orgsUsersTeams:
            schedule:
              frequency: { minutes: 60 }
              timeout: { minutes: 15 }
```

### Advanced Configuration Options

```yaml
catalog:
  providers:
    rhaap:
      development:
        # Single organization
        orgs: Default

        # Multiple organizations
        # orgs:
        #   - Default
        #   - DevOps-Team
        #   - QA-Team

        sync:
          orgsUsersTeams:
            schedule:
              frequency: { minutes: 60 }
              timeout: { minutes: 15 }
```

### Configuration Parameters

| Parameter            | Type            | Required | Description                                     |
| -------------------- | --------------- | -------- | ----------------------------------------------- |
| `orgs`               | string or array | Yes      | Organization name(s) to synchronize from AAP    |
| `schedule.frequency` | object          | Yes      | How often to sync (e.g., `{ minutes: 60 }`)     |
| `schedule.timeout`   | object          | Yes      | Maximum sync duration (e.g., `{ minutes: 15 }`) |

### Multiple Organizations

To sync from multiple organizations, use an array format:

```yaml
catalog:
  providers:
    rhaap:
      development:
        orgs:
          - Default
          - DevOps-Team
          - QA-Team
        sync:
          orgsUsersTeams:
            schedule:
              frequency: { minutes: 60 }
              timeout: { minutes: 15 }
```

## Entity Structures

### Organization Entities

Organizations from AAP are synchronized as Backstage `Group` entities:

```yaml
apiVersion: backstage.io/v1alpha1
kind: Group
metadata:
  namespace: default
  name: default
  title: 'Default'
  annotations:
    backstage.io/managed-by-location: 'url:https://aap.example.com/access/organizations/1/details'
    backstage.io/managed-by-origin-location: 'url:https://aap.example.com/access/organizations/1/details'
spec:
  type: organization
  children:
    - devops-team
    - qa-team
  members:
    - john.doe
    - jane.smith
```

**Key Fields:**

- **name**: Sanitized organization name (lowercase, spaces to hyphens)
- **title**: Original organization name from AAP
- **type**: Always `organization`
- **children**: List of team names within the organization
- **members**: List of usernames who are direct organization members

### Team Entities

Teams from AAP are synchronized as Backstage `Group` entities:

```yaml
apiVersion: backstage.io/v1alpha1
kind: Group
metadata:
  namespace: default
  name: devops-team
  title: 'DevOps Team'
  description: 'DevOps and Infrastructure Team'
  annotations:
    backstage.io/managed-by-location: 'url:https://aap.example.com/access/teams/5/details'
    backstage.io/managed-by-origin-location: 'url:https://aap.example.com/access/teams/5/details'
spec:
  type: team
  children: []
  members:
    - alice.johnson
    - bob.wilson
```

**Key Fields:**

- **name**: Sanitized team name (lowercase, spaces to hyphens)
- **title**: Original team name from AAP
- **description**: Team description from AAP (if available)
- **type**: Always `team`
- **members**: List of usernames who are team members

### User Entities

Users from AAP are synchronized as Backstage `User` entities:

```yaml
apiVersion: backstage.io/v1alpha1
kind: User
metadata:
  namespace: default
  name: john.doe
  title: 'John Doe'
  annotations:
    backstage.io/managed-by-location: 'url:https://aap.example.com/access/users/123/details'
    backstage.io/managed-by-origin-location: 'url:https://aap.example.com/access/users/123/details'
    aap.platform/is_superuser: 'false'
spec:
  profile:
    username: john.doe
    displayName: 'John Doe'
    email: 'john.doe@example.com'
  memberOf:
    - default
    - devops-team
```

**Key Fields:**

- **name**: AAP username
- **title**: Full name (first + last name) or username if names not available
- **profile.username**: AAP username
- **profile.displayName**: Full name or username
- **profile.email**: User's email address from AAP
- **memberOf**: List of groups (organizations and teams) the user belongs to

### Superuser Handling

AAP superusers receive special treatment:

```yaml
apiVersion: backstage.io/v1alpha1
kind: User
metadata:
  name: admin.user
  annotations:
    aap.platform/is_superuser: 'true' # ← Superuser annotation
spec:
  memberOf:
    - default
    - devops-team
    - aap-admins # ← Automatic membership in aap-admins group
```

The `aap-admins` group is dynamically created and includes all AAP superusers, enabling RBAC policies based on AAP administrative privileges.

## Synchronization Process

### Data Flow

1. **Organization Discovery**: Fetches organizations matching the configured `orgs` filter
2. **Team Retrieval**: For each organization, retrieves all associated teams
3. **User Collection**: Collects users from both organization and team memberships
4. **Batch Processing**: Processes users in batches of 100 to avoid API overload
5. **Entity Creation**: Creates Backstage entities with proper relationships
6. **Catalog Update**: Updates the Backstage catalog with new/updated entities

### Membership Resolution

The sync process handles complex membership scenarios:

- **Organization Members**: Users directly assigned to organizations
- **Team Members**: Users assigned to teams within organizations
- **Duplicate Handling**: Users appearing in multiple teams are deduplicated
- **Membership Tracking**: Maintains accurate `memberOf` relationships

### Performance Optimization

- **Batch Processing**: Users are processed in batches of 100 to prevent API timeouts
- **Parallel Requests**: Team and user data is fetched in parallel where possible
- **Efficient Deduplication**: Uses unique user IDs to avoid duplicate processing
- **Incremental Updates**: Only updates entities that have changed

## User Interface Integration

### Discovering Users and Groups

1. Navigate to **Catalog** in Backstage
2. Filter by **Kind**:
   - Select **User** to see synchronized users
   - Select **Group** to see organizations and teams
3. Use the search functionality to find specific users or groups
4. View entity details to see memberships and relationships

### User Profiles

Synchronized users appear with:

- **Profile Information**: Name, email, username from AAP
- **Group Memberships**: Organizations and teams they belong to
- **AAP Links**: Direct links to user details in AAP
- **Superuser Status**: Visible through annotations and group membership

### Group Hierarchies

Organizations and teams maintain their hierarchical structure:

- **Organizations** show child teams and direct members
- **Teams** show their members and parent organization
- **Navigation** allows browsing the organizational structure

## RBAC Integration

### AAP Superuser Integration

The sync creates an `aap-admins` group containing all AAP superusers:

```yaml
# Example RBAC policy
policy.csv: |
  p, group:default/aap-admins, catalog-entity, read, allow
  p, group:default/aap-admins, catalog-entity, create, allow
  p, group:default/aap-admins, catalog-entity, update, allow
  p, group:default/aap-admins, catalog-entity, delete, allow
```

### Organization-Based Permissions

Use organization groups for department-level permissions:

```yaml
# Example: Default organization permissions
policy.csv: |
  p, group:default/default, catalog-entity, read, allow
  p, group:default/default, scaffolder-template, use, allow
```

### Team-Based Permissions

Use team groups for project-level permissions:

```yaml
# Example: DevOps team permissions
policy.csv: |
  p, group:default/devops-team, kubernetes-cluster, read, allow
  p, group:default/devops-team, deployment-pipeline, execute, allow
```

## Troubleshooting

### Common Issues

**Users not appearing in catalog:**

- Check AAP connectivity and token permissions
- Verify organization names match exactly (case-sensitive)
- Review sync schedule and logs for errors
- Ensure users have proper organization/team memberships in AAP

**Group memberships incorrect:**

- Check team assignments in AAP
- Verify organization membership settings
- Review batch processing logs for errors
- Ensure AAP API returns complete membership data

**Sync performance issues:**

- Adjust batch size if processing large user bases
- Increase sync timeout for large organizations
- Monitor AAP API rate limits
- Consider reducing sync frequency for stable environments

**Missing superuser privileges:**

- Verify `is_superuser` flag is set correctly in AAP
- Check `aap-admins` group creation in logs
- Ensure RBAC policies reference the correct group name

### Logging and Monitoring

Enable debug logging to troubleshoot sync issues:

```yaml
backend:
  logging:
    level: debug
```

Monitor these log entries:

- `plugin-catalog-rhaap`: Main sync process logs
- `backstage-rhaap-common`: AAP API interaction logs

### Manual Sync Trigger

To manually trigger a sync (useful for testing):

1. Access the catalog backend API
2. Call the refresh endpoint for the AAP entity provider
3. Monitor logs for sync progress and any errors

## Security Considerations

### Token Management

- Use AAP tokens with minimal required permissions (read access to users, teams, organizations)
- Rotate tokens regularly according to your security policy
- Store tokens securely using Backstage's secret management

### Data Privacy

- User email addresses and names are synchronized from AAP
- Ensure compliance with your organization's data privacy policies
- Consider data retention policies for synchronized user information

### Access Control

- Synchronized groups can be used in RBAC policies
- Superuser status is preserved and can be used for administrative access
- Regular auditing of group memberships is recommended

## Best Practices

### Organization Structure

- Use clear, consistent naming conventions in AAP
- Maintain clean team hierarchies for better Backstage navigation
- Regularly review and clean up unused teams and organizations

### Sync Configuration

- Set appropriate sync frequency based on organizational change rate
- Use longer timeouts for large organizations with many users
- Monitor sync performance and adjust batch sizes if needed

### User Management

- Maintain accurate user information in AAP (names, emails)
- Use AAP's team structure to organize users logically
- Regularly audit superuser assignments

### RBAC Design

- Design RBAC policies around organizational structure
- Use both organization and team groups for granular permissions
- Leverage the `aap-admins` group for administrative functions
- Test RBAC policies thoroughly before production deployment

## API Reference

### Configuration Schema

The plugin validates configuration against the following schema:

```typescript
interface OrgsUsersTeamsConfig {
  schedule: {
    frequency: { minutes: number } | { hours: number } | { days: number };
    timeout: { minutes: number } | { hours: number };
  };
}

interface CatalogProviderConfig {
  orgs: string | string[];
  sync: {
    orgsUsersTeams: OrgsUsersTeamsConfig;
  };
}
```

### Entity Annotations

The plugin adds these annotations to synchronized entities:

- `backstage.io/managed-by-location`: Link to AAP entity details
- `backstage.io/managed-by-origin-location`: Original AAP entity location
- `aap.platform/is_superuser`: User superuser status (users only)

## Migration Guide

### From Manual User Management

If you're currently managing users manually in Backstage:

1. Enable the sync feature with `enabled: true`
2. Configure appropriate organization filters
3. Remove manually created user and group entities
4. Update RBAC policies to use synchronized group names
5. Test user access and permissions thoroughly

### Upgrading Configuration

When upgrading from older versions:

1. Review new configuration options
2. Update sync schedules if needed
3. Test sync functionality in development environment
4. Monitor sync performance after upgrade

## Related Documentation

- [Job Template Synchronization](job-templates.md) - Job template sync feature
- [Auth Provider](../plugins/auth.md) - AAP OAuth2 authentication setup
- [Catalog Backend Module](../plugins/catalog.md) - Main catalog synchronization plugin
- [RBAC Configuration](https://backstage.io/docs/permissions/getting-started) - Backstage RBAC setup
