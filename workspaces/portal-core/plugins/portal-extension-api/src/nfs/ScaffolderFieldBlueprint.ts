import {
  createExtensionBlueprint,
  createExtensionDataRef,
} from '@backstage/frontend-plugin-api';
import type { FieldExtensionOptions } from '@backstage/plugin-scaffolder-react';
import type { PluginManifest } from '@ansible/portal-extension-common';
import { PORTAL_CONTRIBUTIONS_ATTACHMENT } from './contributions';

/** Template-context widget; declaring it does not require a templates page. */
export interface ScaffolderFieldDescriptor {
  manifest: PluginManifest;
  capabilityId: string;
  entryPointId: string;
  attachment: 'scaffolder.fields';
  fieldName: string;
  enabledByConfig?: string;
  loader: () => Promise<FieldExtensionOptions<any, any>>;
}

/** Preserve widget value/UI types until the heterogeneous host storage boundary. */
export function defineScaffolderField<TValue, TUiOptions>(
  params: Omit<ScaffolderFieldDescriptor, 'loader'> & {
    loader: () => Promise<FieldExtensionOptions<TValue, TUiOptions>>;
  },
): ScaffolderFieldDescriptor {
  return params as unknown as ScaffolderFieldDescriptor;
}

export const scaffolderFieldDataRef =
  createExtensionDataRef<ScaffolderFieldDescriptor>().with({
    id: 'ansible.portal.scaffolder-field.v1',
  });
export const ScaffolderFieldBlueprint = createExtensionBlueprint({
  kind: 'scaffolder-field',
  attachTo: {
    id: PORTAL_CONTRIBUTIONS_ATTACHMENT,
    input: 'scaffolderFields',
  },
  output: [scaffolderFieldDataRef],
  factory(params: ScaffolderFieldDescriptor, { node }) {
    return [
      scaffolderFieldDataRef({
        ...params,
        manifest: { ...params.manifest, id: node.spec.plugin.id },
      }),
    ];
  },
});
