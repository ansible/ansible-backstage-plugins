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

## Peer dependencies

Consumers provide React, React DOM, Backstage's scaffolder React package, and
Material-UI v4. The package does not register a Backstage plugin or field as a
module import side effect.
