import {
  PageBlueprint,
  createExtensionInput,
  type RouteRef,
} from '@backstage/frontend-plugin-api';
import {
  scaffolderFieldDataRef,
  type ScaffolderFieldDescriptor,
} from '@ansible/portal-extension-api/alpha';
import { collectScaffolderFields } from './validateScaffolderField';

export function createPortalScaffolderPage(options: {
  path: string;
  routeRef: RouteRef;
  hostApiVersion?: string;
  loader: (
    fields: readonly ScaffolderFieldDescriptor[],
  ) => Promise<JSX.Element>;
}) {
  return PageBlueprint.makeWithOverrides({
    name: 'templates',
    inputs: {
      scaffolderFields: createExtensionInput([scaffolderFieldDataRef]),
    },
    factory(originalFactory, { inputs }) {
      const fields = collectScaffolderFields(
        inputs.scaffolderFields.map(input => {
          const field = input.get(scaffolderFieldDataRef);
          return {
            ...field,
            manifest: { ...field.manifest, id: input.node.spec.plugin.id },
          };
        }),
        options.hostApiVersion,
      );
      return originalFactory({
        path: options.path,
        routeRef: options.routeRef,
        title: 'Templates',
        noHeader: true,
        loader: () => options.loader(fields),
      });
    },
  });
}
