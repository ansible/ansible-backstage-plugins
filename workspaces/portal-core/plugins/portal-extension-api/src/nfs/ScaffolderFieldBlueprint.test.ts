import type { FieldExtensionOptions } from '@backstage/plugin-scaffolder-react';
import { createFieldValidation } from '@backstage/plugin-scaffolder-react/alpha';
import { TestApiRegistry } from '@backstage/test-utils';
import { configApiRef } from '@backstage/core-plugin-api';
import { ConfigReader } from '@backstage/config';
import {
  AuthorizeResult,
  createPermission,
} from '@backstage/plugin-permission-common';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { CONTENT_TYPES } from '@ansible/portal-extension-common';
import {
  convertLegacyFieldSchema,
  createNativeFieldValidation,
  createNativeScaffolderField,
  createPortalScaffolderFieldBlueprints,
  defineScaffolderField,
  type ScaffolderFieldDescriptor,
} from './ScaffolderFieldBlueprint';

const descriptor = {
  manifest: {
    id: 'contributor',
    version: '1.0.0',
    apiVersion: '0.1.0',
    entitlements: [],
    capabilities: [
      {
        id: 'contributor.authoring',
        ownerPlugin: 'contributor',
        displayName: 'Authoring',
        description: 'Authoring',
        minimumHostApiVersion: '0.1.0',
        appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
        entryPoints: [
          {
            id: 'contributor.repo-field',
            kind: 'scaffolder-field',
            surface: 'experience-slot',
            appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
            label: 'Repository',
            launches: { type: 'slot', targetSlot: 'scaffolder.fields' },
          },
        ],
      },
    ],
  },
  capabilityId: 'contributor.authoring',
  entryPointId: 'contributor.repo-field',
  attachment: 'scaffolder.fields' as const,
  fieldName: 'RepositoryInput',
  loader: async (): Promise<FieldExtensionOptions> => ({
    name: 'RepositoryInput',
    component: () => null,
    schema: {
      returnValue: {
        type: 'string',
        default: 'https://git.example.org/repo',
      },
    },
  }),
} satisfies ScaffolderFieldDescriptor;

function makeParams(
  options: {
    capabilityId?: string;
    entryPointId?: string;
    gated?: boolean;
  } = {},
): any {
  return {
    ...descriptor,
    ...options,
    manifest: {
      ...descriptor.manifest,
      capabilities: descriptor.manifest.capabilities.map(capability => ({
        ...capability,
        entryPoints: capability.entryPoints.map(entry => ({
          ...entry,
          ...(options.gated
            ? {
                requiredPermission: createPermission({
                  name: 'scaffolder.fields.repository.read',
                  attributes: { action: 'read' },
                }),
              }
            : {}),
        })),
      })),
    },
  };
}

describe('createPortalScaffolderFieldBlueprints', () => {
  it('pairs the Portal contribution with a native Scaffolder field registration', () => {
    const [portalField, nativeField] = createPortalScaffolderFieldBlueprints(
      'repository-input',
      descriptor,
    );

    expect(portalField.$$type).toBe('@backstage/ExtensionDefinition');
    expect(nativeField.$$type).toBe('@backstage/ExtensionDefinition');
    expect(nativeField).not.toBe(portalField);
  });

  it('preserves legacy value and UI schemas when building native fields', () => {
    const schema = {
      returnValue: { type: 'string', default: 'https://git.example.org/repo' },
      uiOptions: {
        type: 'object',
        properties: { helperText: { type: 'string' } },
      },
    };

    expect(convertLegacyFieldSchema(schema).schema).toEqual(schema);
  });

  it('preserves a value schema when the optional UI schema is omitted', () => {
    expect(
      convertLegacyFieldSchema({ returnValue: { type: 'string' } }).schema,
    ).toEqual({ returnValue: { type: 'string' } });
  });

  it('rejects malformed legacy schemas instead of silently omitting constraints', () => {
    expect(() => convertLegacyFieldSchema(null)).toThrow(
      'Invalid legacy field schema',
    );
    expect(() => convertLegacyFieldSchema({})).toThrow(
      'Invalid legacy field schema',
    );
    expect(() =>
      convertLegacyFieldSchema({ returnValue: [], uiOptions: {} }),
    ).toThrow('Invalid legacy field schema');
    expect(() =>
      convertLegacyFieldSchema({ returnValue: {}, uiOptions: 'invalid' }),
    ).toThrow('Invalid legacy field schema');
    expect(() => convertLegacyFieldSchema([])).toThrow(
      'Invalid legacy field schema',
    );
  });

  it('defines a loader that preserves the contributor field options', async () => {
    const field = await defineScaffolderField(descriptor).loader();
    expect(field.name).toBe(descriptor.fieldName);
    expect(field.component).toEqual(expect.any(Function));
    expect(field.schema?.returnValue).toEqual({
      type: 'string',
      default: 'https://git.example.org/repo',
    });
  });

  it('rejects a loaded field with a different name', () => {
    expect(() =>
      createNativeScaffolderField(makeParams(), {
        name: 'DifferentField',
        component: () => null,
      }),
    ).toThrow(
      'Scaffolder field RepositoryInput loaded with name DifferentField',
    );
  });

  it('rejects a descriptor whose capability or entry point is missing', () => {
    expect(() =>
      createNativeScaffolderField(makeParams({ capabilityId: 'missing' }), {
        name: descriptor.fieldName,
        component: () => null,
      }),
    ).toThrow('Missing scaffolder field entry contributor.repo-field');
    expect(() =>
      createNativeScaffolderField(makeParams({ entryPointId: 'missing' }), {
        name: descriptor.fieldName,
        component: () => null,
      }),
    ).toThrow('Missing scaffolder field entry missing');
  });

  it('creates a native Scaffolder field through Backstage’s public field factory', () => {
    const nativeField = createNativeScaffolderField(makeParams(), {
      name: descriptor.fieldName,
      component: () => null,
    });

    expect(nativeField.$$type).toBe('@backstage/scaffolder/FormField');
  });

  it('blocks validation when the required permission is denied', async () => {
    const authorize = jest
      .fn()
      .mockResolvedValue({ result: AuthorizeResult.DENY });
    const apiHolder = TestApiRegistry.from([permissionApiRef, { authorize }]);
    const validation = createFieldValidation();
    const validator = createNativeFieldValidation(makeParams({ gated: true }));

    await validator('value', validation, {
      apiHolder,
      formData: {},
      schema: {},
    });

    expect(authorize).toHaveBeenCalledTimes(1);
    expect(validation.__errors).toContain(
      'Field RepositoryInput is unavailable due to configuration or permissions.',
    );
  });

  it('keeps field validation when the host allows access', async () => {
    const authorize = jest
      .fn()
      .mockResolvedValue({ result: AuthorizeResult.ALLOW });
    const apiHolder = TestApiRegistry.from([permissionApiRef, { authorize }]);
    const fieldValidation = jest.fn();
    const validation = createFieldValidation();
    const context = { apiHolder, formData: {}, schema: {} };
    const validator = createNativeFieldValidation(
      makeParams({ gated: true }),
      fieldValidation,
    );

    await validator('value', validation, context);

    expect(fieldValidation).toHaveBeenCalledWith('value', validation, context);
  });

  it('fails closed when the host permission check throws', async () => {
    const apiHolder = TestApiRegistry.from([
      permissionApiRef,
      { authorize: jest.fn().mockRejectedValue(new Error('unavailable')) },
    ]);
    const validation = createFieldValidation();
    const validator = createNativeFieldValidation(makeParams({ gated: true }));

    await validator('value', validation, {
      apiHolder,
      formData: {},
      schema: {},
    });

    expect(validation.__errors).toContain(
      'Field RepositoryInput is unavailable due to configuration or permissions.',
    );
  });

  it('delegates validation when the entry has no permission requirement', async () => {
    const fieldValidation = jest.fn();
    const apiHolder = { get: jest.fn() } as any;
    const validation = createFieldValidation();
    const context = { apiHolder, formData: {}, schema: {} };

    await createNativeFieldValidation(makeParams(), fieldValidation)(
      'value',
      validation,
      context,
    );

    expect(fieldValidation).toHaveBeenCalledWith('value', validation, context);
    expect(validation.__errors).toEqual([]);
  });

  it('fails closed when a required permission API is unavailable', async () => {
    const apiHolder = { get: jest.fn().mockReturnValue(undefined) } as any;
    const validation = createFieldValidation();

    await createNativeFieldValidation(makeParams({ gated: true }))(
      'value',
      validation,
      {
        apiHolder,
        formData: {},
        schema: {},
      },
    );

    expect(validation.__errors).toContain(
      'Field RepositoryInput is unavailable due to configuration or permissions.',
    );
  });

  it('fails closed when the descriptor entry is unavailable during validation', async () => {
    const fieldValidation = jest.fn();
    const validation = createFieldValidation();
    const apiHolder = { get: jest.fn() } as any;

    await createNativeFieldValidation(
      makeParams({ entryPointId: 'missing' }),
      fieldValidation,
    )('value', validation, { apiHolder, formData: {}, schema: {} });

    expect(validation.__errors).toContain(
      'Field RepositoryInput is unavailable due to configuration or permissions.',
    );
    expect(fieldValidation).not.toHaveBeenCalled();
  });

  it('allows validation when the configured host gate is enabled', async () => {
    const config = new ConfigReader({
      plugins: { contributor: { enabled: true } },
    });
    const apiHolder = TestApiRegistry.from([configApiRef, config]);
    const fieldValidation = jest.fn();
    const validation = createFieldValidation();
    const context = { apiHolder, formData: {}, schema: {} };

    await createNativeFieldValidation(
      {
        ...makeParams(),
        enabledByConfig: 'plugins.contributor.enabled',
      },
      fieldValidation,
    )('value', validation, context);

    expect(fieldValidation).toHaveBeenCalledWith('value', validation, context);
    expect(validation.__errors).toEqual([]);
  });

  it('fails closed when the configured host gate is disabled', async () => {
    const config = new ConfigReader({
      plugins: { contributor: { enabled: false } },
    });
    const apiHolder = TestApiRegistry.from([configApiRef, config]);
    const validation = createFieldValidation();
    const validator = createNativeFieldValidation({
      ...makeParams(),
      enabledByConfig: 'plugins.contributor.enabled',
    });

    await validator('value', validation, {
      apiHolder,
      formData: {},
      schema: {},
    });

    expect(validation.__errors).toContain(
      'Field RepositoryInput is unavailable due to configuration or permissions.',
    );
  });
});
