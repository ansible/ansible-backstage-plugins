# @ansible/portal-scaffolder-react

Reusable React components for Portal scaffolder fields.

## Exported components

### `FileUploadPickerExtension`

Renders a scaffolder field that accepts pasted text or an uploaded text file.
The component is exported for hosts and plugins to use in their own field
registration adapters:

```tsx
import { FileUploadPickerExtension } from '@ansible/portal-scaffolder-react';
```

This package exports the React component. The consuming plugin remains
responsible for registering the field with its scaffolder host.

### EE fields and shared validation

`EEFileNamePickerExtension` and `EETagsPickerExtension` use the exported
`FieldValidationProvider` and `useFieldValidation` hook. Wrap the form once in
`FieldValidationProvider` so all fields and the form submit handler share the
same validation state. The hook exposes `hasErrors`, `submitAttempted`,
`setFieldError`, `notifySubmitAttempted`, and `resetSubmitAttempted`.

The EE filename field also requires a Backstage API context providing
`catalogApiRef` from `@backstage/plugin-catalog-react` to check existing names.
Field registration remains the consuming plugin's responsibility.

### `ScmSelectorExtension`

Selects the SCM provider, organization, and repository. The consuming host
provides `scmAuthApiRef` from `@backstage/integration-react`, the scaffolder
`SecretsContextProvider`, and the shared `FieldValidationProvider`. The
existing `requestUserCredentials.secretsKey` UI option controls where
credentials are stored in the scaffolder secrets channel. `ScmSelectorData`
is exported for the field value; credentials are not included in that value.

## Peer dependencies

Consumers provide React, React DOM, Backstage's scaffolder React package, and
Material-UI v4. The package does not register a Backstage plugin or field as a
module import side effect.
