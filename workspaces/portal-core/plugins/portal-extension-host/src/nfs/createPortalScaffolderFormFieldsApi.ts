import type { ConfigApi } from '@backstage/core-plugin-api';
import type { FormField } from '@backstage/plugin-scaffolder-react/alpha';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import type { PermissionApi } from '@backstage/plugin-permission-react';
import type { PortalContributionsApi } from '@ansible/portal-extension-api/alpha';
import { DEFAULT_EXPERIENCES } from './PortalEntityTabs';
import { toNativeScaffolderField } from './toNativeScaffolderField';
import { collectScaffolderFields } from './validateScaffolderField';

type NativeFieldLoader = () => Promise<FormField>;

/** Adapt Portal SDK field descriptors to Backstage's upstream Scaffolder API. */
export function createPortalScaffolderFormFieldsApi(options: {
  nativeFieldLoaders: readonly NativeFieldLoader[];
  nativeFieldNames?: readonly string[];
  contributions: PortalContributionsApi;
  config: ConfigApi;
  permissions: PermissionApi;
}) {
  return {
    async loadFormFields(): Promise<FormField[]> {
      const nativeFields = await Promise.all(
        options.nativeFieldLoaders.map(loader => loader()),
      );
      const descriptors = collectScaffolderFields(
        options.contributions.scaffolderFields ?? [],
      );
      const nativeFieldNames = new Set(options.nativeFieldNames ?? []);
      const collision = descriptors.find(descriptor =>
        nativeFieldNames.has(descriptor.fieldName),
      );
      if (collision) {
        throw new Error(
          `Portal Scaffolder field "${collision.fieldName}" collides with a native Scaffolder field.`,
        );
      }
      const portalFields = await Promise.all(
        descriptors.map(async descriptor => {
          const capability = descriptor.manifest.capabilities.find(
            item => item.id === descriptor.capabilityId,
          );
          const entry = capability?.entryPoints.find(
            item => item.id === descriptor.entryPointId,
          );
          if (
            !capability ||
            !entry ||
            !DEFAULT_EXPERIENCES.some(
              experience => experience === capability.experienceId,
            ) ||
            (descriptor.enabledByConfig &&
              options.config.getOptionalBoolean(descriptor.enabledByConfig) !==
                true)
          ) {
            return undefined;
          }
          if (entry.requiredPermission) {
            const requirement = entry.requiredPermission;
            const decision = await options.permissions.authorize(
              'permission' in requirement
                ? requirement
                : { permission: requirement },
            );
            if (decision.result !== AuthorizeResult.ALLOW) return undefined;
          }
          const field = await descriptor.loader();
          return toNativeScaffolderField(field, descriptor.fieldName);
        }),
      );

      return [
        ...nativeFields,
        ...portalFields.filter((field): field is FormField => Boolean(field)),
      ];
    },
  };
}
