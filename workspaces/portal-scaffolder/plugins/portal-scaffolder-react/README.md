# @ansible/portal-scaffolder-react

Reusable React components, validation state, and helpers for Portal scaffolder
fields. This Backstage `web-library` exports implementations; consuming plugins
own field registration and host integration.

## Exports

All exports are available from `@ansible/portal-scaffolder-react`.

| Component                             | Existing field name          | Value             | Purpose                                                                   |
| ------------------------------------- | ---------------------------- | ----------------- | ------------------------------------------------------------------------- |
| `FileUploadPickerExtension`           | `FileUploadPicker`           | `string`          | Paste text or upload a text file.                                         |
| `EEFileNamePickerExtension`           | `EEFileNamePicker`           | `string`          | Enter an execution environment filename and check existing catalog names. |
| `EETagsPickerExtension`               | `EETagsPicker`               | `string[]`        | Add, edit, and remove execution environment tags.                         |
| `ScmSelectorExtension`                | `ScmSelector`                | `ScmSelectorData` | Select an SCM provider, organization, and repository.                     |
| `AdditionalBuildStepsPickerExtension` | `AdditionalBuildStepsPicker` | `BuildStep[]`     | Edit additional execution environment build steps and their commands.     |
| `PackagesPickerExtension`             | `PackagesPicker`             | `string[]`        | Add and remove packages, including comma-separated input.                 |
| `MCPServersPickerExtension`           | `MCPServersPicker`           | `string[]`        | Select MCP servers from the field schema's enum values.                   |

The components accept Backstage `FieldExtensionComponentProps`, retaining the
existing schema, `uiSchema`, value, and validation behavior.

| Supporting export         | Purpose                                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `FieldValidationProvider` | Shares field error and submit-attempt state within a form.                                                                               |
| `useFieldValidation`      | Reads and updates that shared validation state.                                                                                          |
| `ScmSelectorData` (type)  | SCM field value: `provider`, `providerLabel`, `org`, `repoName`, and `repoExists`.                                                       |
| `BuildStep` (type)        | Build step value: `stepType` and `commands`.                                                                                             |
| `parseMarkdownLinks`      | Renders markdown-style links as Material-UI links; shared by `PackagesPicker` and the `BaseImagePicker` retained in `portal-scaffolder`. |

## Register a field in a consuming plugin

For a legacy Backstage scaffolder host, keep the registration adapter in the
consuming plugin:

```tsx
import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';
import { FileUploadPickerExtension } from '@ansible/portal-scaffolder-react';

export const FileUploadPickerFieldExtension = scaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'FileUploadPicker',
    component: FileUploadPickerExtension,
  }),
);
```

Attach the resulting field extension through the host's scaffolder field
registration. Templates continue to select it with `ui:field: FileUploadPicker`.
Portal's existing registration adapters, built-in field list, and native host
integration remain in `@ansible/portal-scaffolder`. Importing this library does
not register a plugin or field.

## Host requirements

### Shared validation

`EEFileNamePickerExtension`, `EETagsPickerExtension`, and `ScmSelectorExtension`
use `FieldValidationProvider`. Wrap the active form and its submit controls in
the same provider. Consumers of `useFieldValidation` must use the provider from
this package so fields and submit controls share one context.

The hook exposes `hasErrors`, `submitAttempted`, `setFieldError`,
`notifySubmitAttempted`, and `resetSubmitAttempted`. The host uses `hasErrors`
to gate submission and calls `notifySubmitAttempted` when submission is blocked.
The hook returns default state outside a provider; wrapping the form is required
for shared validation to affect submission.

### Backstage APIs and secrets

- `EEFileNamePickerExtension` needs a Backstage API context providing
  `catalogApiRef` from `@backstage/plugin-catalog-react`.
- `ScmSelectorExtension` needs `scmAuthApiRef` from
  `@backstage/integration-react` and the scaffolder `SecretsContextProvider`.
  Its existing `ui:options.requestUserCredentials.secretsKey` controls where
  credentials are stored in the scaffolder secrets channel. Credentials are
  not part of `ScmSelectorData`.
- Hosts provide the usual React and Material-UI theme context and pass the
  field's existing schema and `uiSchema` options.

## Peer dependencies

Consumers provide the peer packages declared in [package.json](./package.json):

- React and React DOM, plus React Router and React Router DOM.
- Backstage core plugin API, integration React, catalog React, and scaffolder
  React packages.
- Material-UI v4 core, icons, and lab packages.

## Development

Run from the repository root after installing workspace dependencies. Run
`yarn tsc` before the package build to emit the required `dist-types` declarations:

```bash
NODE_OPTIONS="${NODE_OPTIONS:-} --experimental-vm-modules" yarn workspace @ansible/portal-scaffolder-react test --watch=false
yarn workspace @ansible/portal-scaffolder-react lint
npx tsc --noEmit -p workspaces/portal-scaffolder/plugins/portal-scaffolder-react
yarn tsc
yarn workspace @ansible/portal-scaffolder-react build
```

Component and helper tests live beside their implementations. Registration
adapter and Portal host integration tests remain in `portal-scaffolder`.
