import { AuthorizeResult } from '@backstage/plugin-permission-common';
import type { FormField } from '@backstage/plugin-scaffolder-react/alpha';
import { CONTENT_TYPES } from '@ansible/portal-extension-api';
import type { ScaffolderFieldDescriptor } from '@ansible/portal-extension-api/alpha';
import { createPortalScaffolderFormFieldsApi } from './createPortalScaffolderFormFieldsApi';

function descriptor(
  fieldName: string,
  options: { enabledByConfig?: string; permission?: boolean } = {},
): ScaffolderFieldDescriptor {
  return {
    manifest: {
      id: 'contributor',
      version: '1.0.0',
      apiVersion: '0.1.0',
      entitlements: options.permission
        ? [
            {
              id: 'portal.field.access',
              displayName: 'Portal field access',
              description: 'Allows use of the repository URL field',
              scope: 'global',
              permissionName: 'portal.field.read',
            },
          ]
        : [],
      capabilities: [
        {
          id: 'contributor.authoring',
          ownerPlugin: 'contributor',
          displayName: 'Authoring',
          description: 'Authoring',
          experienceId: 'content-authoring',
          minimumHostApiVersion: '0.1.0',
          appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
          entryPoints: [
            {
              id: 'contributor.repository-url',
              label: 'Repository URL',
              kind: 'scaffolder-field',
              surface: 'experience-slot',
              appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
              launches: { type: 'slot', targetSlot: 'scaffolder.fields' },
              ...(options.permission && {
                requiredPermission: {
                  type: 'basic',
                  name: 'portal.field.read',
                  attributes: { action: 'read' },
                },
              }),
            },
          ],
        },
      ],
    },
    capabilityId: 'contributor.authoring',
    entryPointId: 'contributor.repository-url',
    fieldName,
    attachment: 'scaffolder.fields',
    enabledByConfig: options.enabledByConfig,
    loader: async () => ({
      name: fieldName,
      component: () => null,
      schema: { returnValue: { type: 'string' } },
    }),
  };
}

const nativeField = {
  $$type: '@backstage/scaffolder/FormField',
} as FormField;

function createApi(
  fields: ScaffolderFieldDescriptor[],
  overrides: {
    enabled?: boolean;
    permission?: 'allow' | 'deny';
    nativeLoaders?: Array<() => Promise<FormField>>;
  } = {},
) {
  const config = {
    getOptionalBoolean: jest.fn(() => overrides.enabled ?? true),
  };
  const permissions = {
    authorize: jest.fn(async () => ({
      result:
        overrides.permission === 'deny'
          ? AuthorizeResult.DENY
          : AuthorizeResult.ALLOW,
    })),
  };
  const api = createPortalScaffolderFormFieldsApi({
    nativeFieldLoaders: overrides.nativeLoaders ?? [],
    contributions: { scaffolderFields: fields } as any,
    config: config as any,
    permissions: permissions as any,
  });
  return { api, config, permissions };
}

describe('createPortalScaffolderFormFieldsApi', () => {
  it('keeps native fields and adapts permitted Portal fields', async () => {
    const { api, permissions } = createApi(
      [descriptor('RepositoryURL', { permission: true })],
      { nativeLoaders: [async () => nativeField] },
    );

    const fields = await api.loadFormFields();

    expect(fields).toHaveLength(2);
    expect(fields[0]).toBe(nativeField);
    expect(permissions.authorize).toHaveBeenCalledTimes(1);
  });

  it('omits a field denied by its entitlement-backed permission', async () => {
    const { api } = createApi(
      [descriptor('RepositoryURL', { permission: true })],
      { permission: 'deny' },
    );

    await expect(api.loadFormFields()).resolves.toHaveLength(0);
  });

  it('omits a field disabled by host configuration', async () => {
    const { api, config } = createApi(
      [descriptor('RepositoryURL', { enabledByConfig: 'portal.fields.url' })],
      { enabled: false },
    );

    await expect(api.loadFormFields()).resolves.toHaveLength(0);
    expect(config.getOptionalBoolean).toHaveBeenCalledWith('portal.fields.url');
  });

  it('fails closed when duplicate Portal field names are contributed', async () => {
    const { api } = createApi([
      descriptor('RepositoryURL'),
      descriptor('RepositoryURL'),
    ]);

    await expect(api.loadFormFields()).resolves.toHaveLength(0);
  });

  it('rejects a Portal field that collides with a native field name', async () => {
    const api = createPortalScaffolderFormFieldsApi({
      nativeFieldLoaders: [async () => nativeField],
      nativeFieldNames: ['RepositoryURL'],
      contributions: {
        scaffolderFields: [descriptor('RepositoryURL')],
      } as any,
      config: { getOptionalBoolean: () => true } as any,
      permissions: {
        authorize: async () => ({ result: AuthorizeResult.ALLOW }),
      } as any,
    } as any);

    await expect(api.loadFormFields()).rejects.toThrow(
      /collides with a native Scaffolder field/,
    );
  });

  it('keeps standard fields when no Portal field contributor is installed', async () => {
    const { api } = createApi([], {
      nativeLoaders: [async () => nativeField],
    });

    await expect(api.loadFormFields()).resolves.toEqual([nativeField]);
  });

  it('fails closed when a declared field contributor cannot load', async () => {
    const declaration = descriptor('RepositoryURL');
    declaration.loader = async () => {
      throw new Error('Field contributor unavailable');
    };
    const { api } = createApi([declaration]);

    await expect(api.loadFormFields()).rejects.toThrow(
      'Field contributor unavailable',
    );
  });
});
