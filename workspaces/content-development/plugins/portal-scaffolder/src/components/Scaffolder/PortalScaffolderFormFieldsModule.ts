import { createApiFactory, configApiRef } from '@backstage/core-plugin-api';
import {
  appTreeApiRef,
  createFrontendModule,
} from '@backstage/frontend-plugin-api';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import {
  FormFieldBlueprint,
  formFieldsApiRef,
} from '@backstage/plugin-scaffolder-react/alpha';
import scaffolderPlugin from '@backstage/plugin-scaffolder/alpha';
import { portalContributionsApiRef } from '@ansible/portal-extension-api/alpha';
import { createPortalScaffolderFormFieldsApi } from '@ansible/portal-extension-host/alpha';

function fieldNameFromExtensionId(extensionId: string): string | undefined {
  // Native field extension IDs use the field name in kebab-case.
  const suffix = extensionId.split(/[/:]/).pop();
  if (!suffix) return undefined;
  return suffix.replace(/(^|[-_])([a-z])/g, (_match, _separator, letter) =>
    letter.toUpperCase(),
  );
}

/** Preserve upstream field loaders while adapting Portal SDK fields for Scaffolder. */
const formFieldsApiOverride = scaffolderPlugin
  .getExtension('api:scaffolder/form-fields')
  .override({
    factory(originalFactory, { inputs }) {
      const nativeFieldLoaders = inputs.formFields.map(input =>
        input.get(FormFieldBlueprint.dataRefs.formFieldLoader),
      );
      const nativeFieldNames = inputs.formFields
        .map(input => fieldNameFromExtensionId(input.node.spec.id))
        .filter((name): name is string => Boolean(name));
      return originalFactory({
        params: defineParams =>
          defineParams(
            createApiFactory({
              api: formFieldsApiRef,
              deps: {
                appTreeApi: appTreeApiRef,
                configApi: configApiRef,
                permissionApi: permissionApiRef,
                portalContributionsApi: portalContributionsApiRef,
              },
              factory: ({
                appTreeApi,
                configApi,
                permissionApi,
                portalContributionsApi,
              }) => ({
                async loadFormFields() {
                  const pageNode = appTreeApi
                    .getTree()
                    .tree.nodes.get('page:scaffolder');
                  const pageFieldLoaders = (
                    pageNode?.edges.attachments.get('formFields') ?? []
                  ).flatMap(node => {
                    if (!node.instance) return [];
                    const loader = node.instance.getData(
                      FormFieldBlueprint.dataRefs.formFieldLoader,
                    );
                    return loader ? [loader] : [];
                  });
                  return createPortalScaffolderFormFieldsApi({
                    nativeFieldLoaders: [
                      ...nativeFieldLoaders,
                      ...pageFieldLoaders,
                    ],
                    nativeFieldNames: [
                      ...nativeFieldNames,
                      ...(
                        pageNode?.edges.attachments.get('formFields') ?? []
                      ).map(node => fieldNameFromExtensionId(node.spec.id)),
                      'AAPResourcePicker',
                    ].filter((name): name is string => Boolean(name)),
                    contributions: portalContributionsApi,
                    config: configApi,
                    permissions: permissionApi,
                  }).loadFormFields();
                },
              }),
            }),
          ),
      });
    },
  });

/** Install only alongside Portal Scaffolder; upstream navigation stays untouched. */
export const portalScaffolderFormFieldsModule = createFrontendModule({
  pluginId: 'scaffolder',
  extensions: [formFieldsApiOverride],
});
