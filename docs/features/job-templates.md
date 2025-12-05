# Job Template Synchronization

The Job Template Synchronization feature enables automatic import and synchronization of job templates from Ansible Automation Platform (AAP) into Backstage. This integration creates executable templates in the Backstage catalog, allowing users to launch AAP job templates directly from the Backstage interface.

## Overview

Job templates from AAP are synchronized as Backstage `Template` entities with the `scaffolder.backstage.io/v1beta3` API version. Each job template becomes an executable template that users can run through Backstage's scaffolder interface, providing a self-service automation experience.

### Key Features

- **Automatic Synchronization**: Job templates are automatically imported from AAP on a configurable schedule
- **Survey Integration**: Job templates with surveys are supported with dynamic form generation
- **Filtering Options**: Sync can be filtered by organization, labels, and survey status
- **Direct Execution**: Templates can be launched directly from Backstage with AAP OAuth2 integration
- **Real-time Status**: Job execution status and results are displayed in Backstage

## Configuration

### Basic Configuration

Add the following configuration to your `app-config.yaml`:

```yaml
catalog:
  providers:
    rhaap:
      development:
        orgs: SIG-IDE # Organization name(s) to sync from
        sync:
          jobTemplates:
            enabled: true
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
        orgs: SIG-IDE
        sync:
          jobTemplates:
            enabled: true
            schedule:
              frequency: { minutes: 60 }
              timeout: { minutes: 15 }
            # Optional: Filter by survey status
            surveyEnabled: true # true, false, or omit for all
            # Optional: Filter by labels
            labels:
              - production
              - self-service
              - approved
```

### Configuration Parameters

| Parameter            | Type    | Required | Description                                     |
| -------------------- | ------- | -------- | ----------------------------------------------- |
| `enabled`            | boolean | Yes      | Enable/disable job template synchronization     |
| `schedule.frequency` | object  | Yes      | How often to sync (e.g., `{ minutes: 60 }`)     |
| `schedule.timeout`   | object  | Yes      | Maximum sync duration (e.g., `{ minutes: 15 }`) |
| `surveyEnabled`      | boolean | No       | Filter templates by survey status               |
| `labels`             | array   | No       | Filter templates by specific labels             |

### Multiple Organizations

To sync from multiple organizations:

```yaml
catalog:
  providers:
    rhaap:
      development:
        orgs:
          - SIG-IDE
          - DevOps-Team
          - QA-Team
        sync:
          jobTemplates:
            enabled: true
            schedule:
              frequency: { minutes: 60 }
              timeout: { minutes: 15 }
```

## Entity Structure

Job templates are synchronized as Backstage `Template` entities with the following structure:

```yaml
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  namespace: default
  name: my-job-template
  title: 'My Job Template'
  description: 'Description from AAP job template'
  aapJobTemplateId: 123
  tags:
    - ansible
    - automation
    - production
  annotations:
    backstage.io/managed-by-location: 'url:https://aap.example.com/execution/templates/job-template/123/details'
    backstage.io/managed-by-origin-location: 'url:https://aap.example.com/execution/templates/job-template/123/details'
spec:
  type: service
  parameters:
    - title: 'Job Configuration'
      required:
        - token
      properties:
        token:
          title: Token
          type: string
          ui:field: AAPTokenField
          ui:widget: hidden
        # Additional parameters based on job template configuration
  steps:
    - id: launch-job
      name: 'My Job Template'
      action: rhaap:launch-job-template
      input:
        token: '{% raw %}'${{ parameters.token }}'{% endraw %}'
        values:
          template: 'My Job Template'
          # Additional input values
  output:
    text:
      - title: 'Job executed successfully'
        content: |
          **Job ID:** {% raw %}${{ steps['launch-job'].output.data.id }}{% endraw %}
          **Job STATUS:** {% raw %}${{ steps['launch-job'].output.data.status }}{% endraw %}
```

### Metadata Fields

- **name**: Sanitized job template name (spaces and special characters converted to hyphens)
- **title**: Original job template name from AAP
- **description**: Job template description from AAP
- **aapJobTemplateId**: AAP job template ID for reference
- **tags**: Labels from AAP converted to Backstage tags
- **annotations**: Links back to the original AAP job template

## Dynamic Form Generation

The plugin automatically generates forms based on job template configuration:

### Standard Parameters

All job templates include these parameters:

- **Token**: OAuth2 token (automatically populated, hidden from user)
- **Job Type**: Run or Check mode (if `ask_job_type_on_launch` is enabled)
- **Inventory**: Target inventory (if `ask_inventory_on_launch` is enabled)
- **Credentials**: Required credentials (if `ask_credential_on_launch` is enabled)
- **Execution Environment**: EE selection (if `ask_execution_environment_on_launch` is enabled)
- **Verbosity**: Ansible verbosity level (if `ask_verbosity_on_launch` is enabled)
- **Tags**: Job tags (if `ask_tags_on_launch` is enabled)
- **Skip Tags**: Tags to skip (if `ask_skip_tags_on_launch` is enabled)
- **Limit**: Host limit pattern (if `ask_limit_on_launch` is enabled)
- **Extra Variables**: Additional variables (if `ask_variables_on_launch` is enabled)

### Survey Integration

Job templates with surveys automatically include survey questions as form fields:

```yaml
# Example survey integration
parameters:
  - title: 'Survey Questions'
    properties:
      target_environment:
        title: 'Target Environment'
        description: 'Select deployment environment'
        type: string
        enum: ['dev', 'staging', 'prod']
        default: 'dev'
      confirmation:
        title: 'Confirm Execution'
        description: "Type 'yes' to confirm"
        type: string
        pattern: '^yes$'
```

## Filtering Options

### By Survey Status

Filter job templates based on whether they have surveys enabled:

```yaml
# Sync only templates with surveys
surveyEnabled: true

# Sync only templates without surveys
surveyEnabled: false

# Sync all templates (default)
# surveyEnabled: (omit this field)
```

### By Labels

Filter job templates by specific labels:

```yaml
labels:
  - production
  - self-service
  - approved
```

This configuration will sync only job templates that have at least one of the specified labels.

### By Exclude Labels

Exclude job templates with specific labels:

```yaml
excludeLabels:
  - deprecated
  - experimental
  - internal-only
```

This configuration will exclude job templates that have any of the specified labels from synchronization.

**Implementation Details:**

- The plugin first attempts to use the AAP API parameter `not__labels__name__in` for server-side filtering
- If the API doesn't support this parameter, client-side filtering is applied as a fallback
- This ensures compatibility across different AAP versions

**Note:** You can use both `labels` and `excludeLabels` together. The `labels` filter is applied first (include only templates with these labels), then the `excludeLabels` filter is applied (exclude templates with these labels from the result).

### By Organization

Filter by AAP organization:

```yaml
# Single organization
orgs: SIG-IDE

# Multiple organizations
orgs:
  - SIG-IDE
  - DevOps-Team
```

## User Interface

### Discovering Job Templates

1. Navigate to **Create** → **Choose a template** in Backstage
2. Job templates appear with the "service" type
3. Filter by tags to find specific automation templates
4. Templates show AAP-specific metadata and descriptions

### Executing Job Templates

1. Select a job template from the template catalog
2. Fill out the generated form with required parameters
3. Review configuration in the final step
4. Click "Create" to launch the job in AAP
5. View job execution results and status

### Monitoring Execution

After launching a job template:

- **Job ID**: Unique identifier for the AAP job
- **Status**: Current execution status (pending, running, successful, failed)
- **Output**: Links to detailed job logs in AAP (if configured)

## Troubleshooting

### Common Issues

**Templates not appearing in catalog:**

- Check AAP connectivity and token permissions
- Verify organization names match exactly
- Review filter criteria (labels, survey status)
- Check sync schedule and logs

**Form fields missing:**

- Ensure job template has "Prompt on Launch" options enabled in AAP
- Verify survey is properly configured and enabled
- Check for survey specification errors

**Job launch failures:**

- Verify OAuth2 configuration between Backstage and AAP
- Check user permissions in AAP
- Ensure required credentials are available
- Validate inventory and execution environment access

### Logging

Enable debug logging to troubleshoot sync issues:

```yaml
backend:
  logging:
    level: debug
```

Look for log entries from:

- `plugin-catalog-rh-aap`: Job template provider logs
- `backstage-rhaap-common`: AAP client logs

### Manual Sync Trigger

To manually trigger a sync (useful for testing):

1. Access the catalog backend API
2. Call the refresh endpoint for the job template provider
3. Monitor logs for sync progress and errors

## Security Considerations

### Token Management

- Job templates use OAuth2 tokens for AAP authentication
- Tokens are automatically managed by the auth provider
- Users don't need to provide AAP credentials directly

### RBAC Integration

- Job template access respects AAP RBAC policies
- Users can only see and execute templates they have permissions for
- Backstage RBAC can provide additional access controls

### Audit Trail

- All job executions are logged in both Backstage and AAP
- Job IDs provide traceability between systems
- User attribution is maintained through OAuth2 integration

## Best Practices

### Template Organization

- Use consistent labeling in AAP for better filtering
- Group related templates with common labels
- Provide clear descriptions for self-service users

### Survey Design

- Keep surveys simple and user-friendly
- Use validation patterns for critical inputs
- Provide helpful descriptions and examples

### Sync Configuration

- Set appropriate sync frequency (avoid too frequent syncing)
- Use filtering to limit templates to relevant ones
- Monitor sync performance and adjust timeouts as needed

### User Experience

- Train users on template discovery and execution
- Provide documentation for complex templates
- Set up monitoring for failed job executions

## API Reference

### Scaffolder Action

The plugin provides the `rhaap:launch-job-template` scaffolder action:

```yaml
- id: launch-job
  name: Launch Job Template
  action: rhaap:launch-job-template
  input:
    token: string # OAuth2 token
    values:
      template: string # Job template name
      inventory: object # Inventory selection
      credentials: array # Credential selection
      extraVariables: object # Additional variables
      # ... other job template parameters
```

### Configuration Schema

The plugin validates configuration against the following schema:

```typescript
interface JobTemplateConfig {
  enabled: boolean;
  schedule: {
    frequency: { minutes: number } | { hours: number } | { days: number };
    timeout: { minutes: number } | { hours: number };
  };
  surveyEnabled?: boolean;
  labels?: string[];
}
```

## Migration Guide

### From Manual Job Template Management

If you're currently managing job templates manually in Backstage:

1. Enable the sync feature with `enabled: true`
2. Configure appropriate filters to avoid duplicates
3. Remove manually created template entities
4. Update any references to use the new synchronized templates

### Upgrading Configuration

When upgrading from older versions:

1. Review new configuration options
2. Update sync schedules if needed
3. Consider adding label-based filtering
4. Test sync functionality in development environment

## Related Documentation

- [Catalog Backend Module](../plugins/catalog.md) - Main catalog synchronization
- [Auth Provider](../plugins/auth.md) - AAP OAuth2 authentication setup
- [Scaffolder Actions](../plugins/scaffolder.md) - Additional scaffolder actions
- [Self-Service Portal](../plugins/self-service.md) - Enhanced UI for job templates
