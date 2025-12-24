# Feedback Configuration

The Ansible Backstage plugins provide a configurable feedback system that allows users to submit sentiment feedback about their experience. This feature can be enabled or disabled through the Backstage configuration.

## Configuration

The feedback system is controlled by the `ansible.feedback.enabled` configuration option in your `app-config.yaml` file.

### Default Configuration

By default, the feedback system is **disabled** completely. If no configuration is provided, the feedback forms will not be displayed.

### Configuration Options

```yaml
ansible:
  feedback:
    enabled: false
```

When disabled:

- The feedback floating action button (FAB) will not be displayed
- Users will not be able to access the feedback modal
- No feedback forms will be rendered in the UI

### Enabling Feedback

To enable the feedback system, set the `enabled` option to `true`:

```yaml
ansible:
  feedback:
    enabled: true
```

## Where Feedback Appears

The feedback system appears in two locations:

1. **Self-Service Plugin**: A floating feedback button in the bottom-right corner of the self-service interface
2. **Backstage RHAAP Plugin**: A floating feedback button in the bottom-right corner of the Ansible page

## What Feedback Captures

When enabled, the feedback system captures:

- **User Rating**: A 1-5 star rating system
- **Feedback Text**: Detailed user comments about their experience
- **Consent**: User acknowledgment that feedback is shared with Red Hat

## Analytics Integration

When feedback is submitted, it sends analytics events to the configured analytics provider:

```typescript
analytics.captureEvent('feedback', 'sentiment', {
  attributes: {
    type: 'sentiment',
    ratings: number, // 1-5 star rating
    feedback: string, // user's detailed feedback
  },
});
```

## Privacy and Compliance

The feedback system includes:

- Explicit consent checkbox
- Link to Red Hat's Privacy Policy
- Clear indication that feedback is shared with Red Hat for product improvement

## Configuration Examples

```yaml
ansible:
  feedback:
    enabled: true # Default set to disabled
```

## Troubleshooting

### Feedback Button Not Appearing

1. Check that `ansible.feedback.enabled` is set to `true` in your configuration
2. Verify the configuration is properly loaded by checking the browser's developer tools
3. Ensure you're using a recent version of the Ansible Backstage plugins

### Configuration Not Taking Effect

1. Restart the Backstage backend after changing configuration
2. Clear browser cache and refresh the frontend
3. Check for YAML syntax errors in your configuration file

## Related Documentation

- [Self-Service Plugin Documentation](../plugins/self-service.md)
- [Backstage RHAAP Plugin Documentation](../plugins/backstage-frontend.md)
