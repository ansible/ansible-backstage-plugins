import {
  createExtensionBlueprint,
  createExtensionDataRef,
} from '@backstage/frontend-plugin-api';
import type { ComponentType } from 'react';

/** Action rendered beside Register Existing Component on Scaffolder templates. */
export interface ScaffolderHeaderActionDescriptor {
  id: string;
  component: ComponentType;
  order?: number;
}

export const scaffolderHeaderActionDataRef =
  createExtensionDataRef<ScaffolderHeaderActionDescriptor>().with({
    id: 'ansible.portal.scaffolder.header-action.v1',
  });

/** Register a component in the native Scaffolder templates header action slot. */
export const ScaffolderHeaderActionBlueprint = createExtensionBlueprint({
  kind: 'scaffolder-header-action',
  attachTo: {
    id: 'sub-page:scaffolder/templates',
    input: 'headerActions',
  },
  output: [scaffolderHeaderActionDataRef],
  factory(params: Omit<ScaffolderHeaderActionDescriptor, 'id'>, { node }) {
    return [
      scaffolderHeaderActionDataRef({
        ...params,
        id: node.spec.id,
      }),
    ];
  },
});
