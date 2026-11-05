import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';
import { MCPServersPickerExtension } from '@ansible/portal-scaffolder-react';

export const MCPServersPickerFieldExtension = scaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'MCPServersPicker',
    component: MCPServersPickerExtension,
  }),
);
