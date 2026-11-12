import {
  createExtensionBlueprint,
  createExtensionDataRef,
} from '@backstage/frontend-plugin-api';
import type { ExtensionDefinition } from '@backstage/frontend-plugin-api';
import { configApiRef, useApiHolder } from '@backstage/core-plugin-api';
import { makeFieldSchema } from '@backstage/plugin-scaffolder-react';
import type {
  FieldExtensionOptions,
  FieldSchema,
} from '@backstage/plugin-scaffolder-react';
import {
  createFormField,
  FormFieldBlueprint,
} from '@backstage/plugin-scaffolder-react/alpha';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import type { PluginManifest } from '@ansible/portal-extension-common';
import { createElement, useEffect, useState } from 'react';
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
  return {
    ...params,
    loader: async () => params.loader(),
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLegacyFieldSchema(
  value: unknown,
): value is NonNullable<FieldExtensionOptions['schema']> {
  return (
    isRecord(value) &&
    isRecord(value.returnValue) &&
    (value.uiOptions === undefined || isRecord(value.uiOptions))
  );
}

type FieldEligibilityOptions = Pick<
  ScaffolderFieldDescriptor,
  'manifest' | 'capabilityId' | 'entryPointId' | 'fieldName' | 'enabledByConfig'
>;

function findEntry(params: FieldEligibilityOptions) {
  return params.manifest.capabilities
    .find(capability => capability.id === params.capabilityId)
    ?.entryPoints.find(entry => entry.id === params.entryPointId);
}

async function isFieldEligible(
  params: FieldEligibilityOptions,
  apiHolder: Parameters<
    NonNullable<FieldExtensionOptions['validation']>
  >[2]['apiHolder'],
): Promise<boolean> {
  const entry = findEntry(params);
  if (!entry) return false;

  try {
    if (params.enabledByConfig) {
      const config = apiHolder.get(configApiRef);
      if (
        !config ||
        config.getOptionalBoolean(params.enabledByConfig) !== true
      ) {
        return false;
      }
    }
    if (!entry.requiredPermission) return true;

    const requirement = entry.requiredPermission;
    const permissionApi = apiHolder.get(permissionApiRef);
    if (!permissionApi) return false;
    const decision = await permissionApi.authorize(
      'permission' in requirement ? requirement : { permission: requirement },
    );
    return decision.result === AuthorizeResult.ALLOW;
  } catch {
    return false;
  }
}

function createEligibleComponent<TValue, TUiOptions>(
  params: FieldEligibilityOptions,
  component: NonNullable<
    FieldExtensionOptions<TValue, TUiOptions>['component']
  >,
): NonNullable<FieldExtensionOptions<TValue, TUiOptions>['component']> {
  return function EligibleScaffolderField(
    props: Parameters<typeof component>[0],
  ) {
    const apiHolder = useApiHolder();
    const [eligible, setEligible] = useState<boolean>();

    useEffect(() => {
      let cancelled = false;
      void isFieldEligible(params, apiHolder).then(result => {
        if (!cancelled) setEligible(result);
      });
      return () => {
        cancelled = true;
      };
    }, [apiHolder]);

    if (eligible === undefined) {
      return createElement(
        'output',
        { 'aria-live': 'polite' },
        'Checking field access…',
      );
    }
    if (!eligible) {
      return createElement(
        'p',
        { role: 'alert' },
        `Field ${params.fieldName} is unavailable due to configuration or permissions.`,
      );
    }
    return createElement(component, props);
  };
}

/** Convert the legacy JSON Schema pair without dropping either constraint. */
export function convertLegacyFieldSchema(
  schema: unknown,
): FieldSchema<unknown, unknown> {
  if (!isLegacyFieldSchema(schema)) {
    throw new Error('Invalid legacy field schema');
  }

  const fieldSchema = makeFieldSchema({
    output: z => z.unknown(),
    uiOptions: z => z.unknown(),
  });

  return {
    ...fieldSchema,
    schema: {
      returnValue: schema.returnValue,
      ...(schema.uiOptions ? { uiOptions: schema.uiOptions } : {}),
    },
  };
}

/** Convert one loaded Portal widget into a native form field. */
export function createNativeScaffolderField<TValue, TUiOptions>(
  params: FieldEligibilityOptions,
  field: FieldExtensionOptions<TValue, TUiOptions>,
) {
  if (field.name !== params.fieldName) {
    throw new Error(
      `Scaffolder field ${params.fieldName} loaded with name ${field.name}`,
    );
  }

  const entry = findEntry(params);
  if (!entry) {
    throw new Error(`Missing scaffolder field entry ${params.entryPointId}`);
  }
  const hasEligibilityGate = Boolean(
    params.enabledByConfig || entry.requiredPermission,
  );
  const nativeValidation = async (
    ...args: Parameters<NonNullable<typeof field.validation>>
  ) => {
    const [value, validation, context] = args;
    if (!(await isFieldEligible(params, context.apiHolder))) {
      validation.addError(
        `Field ${params.fieldName} is unavailable due to configuration or permissions.`,
      );
      return;
    }
    await field.validation?.(value, validation, context);
  };

  return createFormField({
    name: field.name,
    component: hasEligibilityGate
      ? createEligibleComponent(params, field.component)
      : field.component,
    validation: hasEligibilityGate ? nativeValidation : field.validation,
    ...(field.schema !== undefined
      ? { schema: convertLegacyFieldSchema(field.schema) }
      : {}),
  });
}

/**
 * Register a Portal field for both the legacy Portal host and native Scaffolder.
 * The native field is a static FormFieldBlueprint so formFieldsApiRef can load
 * it from the app extension tree.
 */
export function createPortalScaffolderFieldBlueprints<TValue, TUiOptions>(
  name: string,
  params: Omit<ScaffolderFieldDescriptor, 'loader'> & {
    loader: () => Promise<FieldExtensionOptions<TValue, TUiOptions>>;
  },
): readonly [ExtensionDefinition, ExtensionDefinition] {
  const descriptor = defineScaffolderField(params);

  return [
    ScaffolderFieldBlueprint.make({ name, params: descriptor }),
    FormFieldBlueprint.make({
      name,
      params: {
        field: async () => {
          const field = await params.loader();
          return createNativeScaffolderField(params, field);
        },
      },
    }),
  ] as const;
}
