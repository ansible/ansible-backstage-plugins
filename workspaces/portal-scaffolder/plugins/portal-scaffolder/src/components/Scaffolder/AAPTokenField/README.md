# AAPTokenField - Secret Field Extension

The `AAPTokenField` is a Backstage scaffolder field extension that automatically fetches and securely stores AAP (Ansible Automation Platform) authentication tokens.

## Features

- 🔐 **Secure Token Storage**: Tokens are stored in the secrets context, not regular form data
- 🎭 **Masked Display**: Shows masked values in the UI to prevent accidental token exposure
- ⚡ **Automatic Fetching**: Automatically retrieves tokens from the AAP authentication API
- 🔄 **Loading States**: Provides visual feedback during token fetching
- ❌ **Error Handling**: Gracefully handles authentication failures
- ✅ **Success Feedback**: Clear indication when tokens are successfully retrieved

## Usage in Templates

### 1. Add the field to your template schema

```yaml
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: my-aap-template
  title: My AAP Template
spec:
  parameters:
    - title: Authentication
      properties:
        aapToken:
          type: string
          title: AAP Authentication Token
          description: Automatically fetched AAP token
          ui:field: AAPTokenField
  steps:
    - id: launch-job
      name: Launch AAP Job
      action: rhaap:launch-job-template
      input:
        # Use the secret token - NOT the parameter!
        token: ${{ secrets.aapToken }}
        # ... other inputs
```

### 2. Important: Use `secrets.aapToken` instead of `parameters.aapToken`

❌ **Wrong:**

```yaml
token: ${{ parameters.aapToken }} # This would use the masked value!
```

✅ **Correct:**

```yaml
token: ${{ secrets.aapToken }} # This uses the actual token
```

## Field Properties

| Property      | Type   | Description                                      |
| ------------- | ------ | ------------------------------------------------ |
| `title`       | string | Label displayed in the UI (default: "AAP Token") |
| `description` | string | Help text shown below the field                  |
| `ui:field`    | string | Must be set to `"AAPTokenField"`                 |

## Security Features

### Token Masking

- Form data contains only masked characters (`••••••••••••••••`)
- Actual tokens are stored securely in the secrets context
- Review step automatically masks secret fields

### Read-Only Field

- Users cannot manually edit the token
- Token is automatically fetched from AAP authentication
- Prevents user input errors or token tampering

## Error Handling

The field handles various error scenarios:

- **Authentication Failures**: Shows clear error messages
- **Network Issues**: Displays appropriate error states
- **API Unavailability**: Graceful degradation with error feedback

## Loading States

- **Initial Load**: Shows spinner and "Fetching AAP authentication token..." message
- **Success**: Displays checkmark and usage instructions
- **Error**: Shows warning icon and error details

## Implementation Details

The field uses:

- `useTemplateSecrets()` hook for secure token storage
- `rhAapAuthApiRef` API for token fetching
- Material-UI components for consistent styling
- React hooks for state management

## Testing

The component includes comprehensive tests for:

- Loading states
- Success scenarios
- Error handling
- Props validation
- Accessibility features

Run tests with:

```bash
yarn test AAPTokenField.test.tsx
```
