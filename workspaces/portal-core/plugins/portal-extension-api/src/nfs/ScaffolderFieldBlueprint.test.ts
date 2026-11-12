import type { FieldExtensionOptions } from '@backstage/plugin-scaffolder-react';
import { CONTENT_TYPES } from '@ansible/portal-extension-common';
import {
  convertLegacyFieldSchema,
  createPortalScaffolderFieldBlueprints,
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

  it('rejects malformed legacy schemas instead of silently omitting constraints', () => {
    expect(() => convertLegacyFieldSchema(null)).toThrow(
      'Invalid legacy field schema',
    );
    expect(() => convertLegacyFieldSchema({})).toThrow(
      'Invalid legacy field schema',
    );
  });
});
