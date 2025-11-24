import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';
import { MCPServersPickerExtension } from './MCPServersPickerExtension';

export const MCPServersPickerFieldExtension = scaffolderPlugin.provide(
  createScaffolderFieldExtension({
    name: 'MCPServersPicker',
    component: MCPServersPickerExtension,
  }),
);
