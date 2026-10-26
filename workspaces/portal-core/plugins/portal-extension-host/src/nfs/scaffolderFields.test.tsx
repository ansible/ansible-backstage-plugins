import '@testing-library/jest-dom';
import { act, screen, waitFor } from '@testing-library/react';
import { compatWrapper } from '@backstage/core-compat-api';
import { useApi } from '@backstage/core-plugin-api';
import {
  createFrontendPlugin,
  createRouteRef,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import type { FieldExtensionOptions } from '@backstage/plugin-scaffolder-react';
import {
  AuthorizeResult,
  createPermission,
} from '@backstage/plugin-permission-common';
import {
  CONTENT_TYPES,
  contributionRegistry,
} from '@ansible/portal-extension-api';
import {
  ScaffolderFieldBlueprint,
  portalContributionsApiRef,
  type ScaffolderFieldDescriptor,
} from '@ansible/portal-extension-api/alpha';
import { createPortalScaffolderPage } from './createPortalScaffolderPage';
import { NativeScaffolderFields } from './NativeScaffolderFields';
import { collectScaffolderFields } from './validateScaffolderField';
import { createPortalContributionProvider } from './createPortalContributionProvider';

const validation = jest.fn(async () => {});
const schema = {
  returnValue: { type: 'string' as const },
  uiOptions: {
    type: 'object' as const,
    properties: { placeholder: { type: 'string' as const } },
  },
};
const loader = jest.fn(
  async (): Promise<FieldExtensionOptions<any, any>> => ({
    name: 'RepositoryInput',
    component: (): JSX.Element | null => <div>Repository widget</div>,
    validation,
    schema,
  }),
);

/** Inspect declaration metadata without mounting a templates host or loading a widget. */
function FieldInspector() {
  const contributions = useApi(portalContributionsApiRef);
  const fields = contributions.scaffolderFields ?? [];
  return (
    <>
      <div>Portal ready</div>
      <div>Fields discovered: {fields.length}</div>
      {fields.map(field => (
        <div key={field.entryPointId}>
          {field.manifest.id}: {field.fieldName}
        </div>
      ))}
      <div>
        {Object.isFrozen(fields)
          ? 'Immutable declarations'
          : 'Mutable declarations'}
      </div>
    </>
  );
}
function descriptor(
  owner = 'contributor',
  fieldName = 'RepositoryInput',
): ScaffolderFieldDescriptor {
  return {
    manifest: {
      id: owner,
      version: '1.0.0',
      apiVersion: '0.1.0',
      entitlements: [],
      capabilities: [
        {
          id: `${owner}.authoring`,
          ownerPlugin: owner,
          experienceId: 'content-authoring',
          displayName: 'Authoring',
          description: 'Authoring',
          minimumHostApiVersion: '0.1.0',
          appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
          entryPoints: [
            {
              id: `${owner}.repo-field`,
              kind: 'scaffolder-field',
              surface: 'experience-slot',
              appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
              label: 'Repository',
              requiredPermission: createPermission({
                name: 'contributor.field.view',
                attributes: { action: 'read' },
              }),
              launches: { type: 'slot', targetSlot: 'scaffolder.fields' },
            },
          ],
        },
      ],
    },
    capabilityId: `${owner}.authoring`,
    entryPointId: `${owner}.repo-field`,
    attachment: 'scaffolder.fields',
    fieldName,
    enabledByConfig: 'contributor.enabled',
    loader,
  };
}

describe('native scaffolder field discovery', () => {
  async function compose(
    options: {
      declaration?: ScaffolderFieldDescriptor;
      declarations?: ScaffolderFieldDescriptor[];
      firstPartyDeclaration?: ScaffolderFieldDescriptor;
      owner?: string;
      enabled?: boolean;
      deny?: boolean;
      reserved?: string[];
      experiences?: string[];
      mountWidget?: boolean;
      templatesHost?: boolean;
      templatesPluginId?: string;
      disabled?: boolean;
      hostApiVersion?: string;
      collectorApiVersion?: string;
    } = {},
  ) {
    const page = createPortalScaffolderPage({
      path: '/templates',
      routeRef: createRouteRef(),
      hostApiVersion: options.hostApiVersion,
      loader: async declarations =>
        compatWrapper(
          <NativeScaffolderFields
            declarations={declarations}
            reservedNames={options.reserved}
            availableExperiences={options.experiences}
          >
            {fields => (
              <>
                <div>Wizard ready</div>
                {fields.map(field => {
                  const Widget = field.component;
                  return (
                    <div key={field.name}>
                      {field.name}:{' '}
                      {field.validation === validation
                        ? 'validator preserved'
                        : 'no validator'}
                      {field.schema === schema && <span>schema preserved</span>}
                      {options.mountWidget && <Widget {...({} as any)} />}
                    </div>
                  );
                })}
              </>
            )}
          </NativeScaffolderFields>,
        ),
    });
    return renderTestApp({
      features: [
        createFrontendPlugin({
          pluginId: 'portal',
          extensions: [
            createPortalContributionProvider(options.collectorApiVersion),
            PageBlueprint.make({
              name: 'field-inspector',
              params: {
                path: '/field-inspector',
                loader: async () => compatWrapper(<FieldInspector />),
              },
            }),
          ],
        }),
        ...(options.templatesHost === false
          ? []
          : [
              createFrontendPlugin({
                pluginId: options.templatesPluginId ?? 'portal-scaffolder',
                extensions: [
                  page,
                  ...(options.firstPartyDeclaration
                    ? [
                        ScaffolderFieldBlueprint.make({
                          name: 'first-party',
                          params: options.firstPartyDeclaration,
                        }),
                      ]
                    : []),
                ],
              }),
            ]),
        createFrontendPlugin({
          pluginId: options.owner ?? 'contributor',
          extensions: (
            options.declarations ?? [options.declaration ?? descriptor()]
          ).map((field, index) =>
            ScaffolderFieldBlueprint.make({
              name: `repository-${index}`,
              disabled: options.disabled,
              params: field,
            }),
          ),
        }),
      ],
      config: { contributor: { enabled: options.enabled ?? true } },
      initialRouteEntries: [
        options.templatesHost === false ? '/field-inspector' : '/templates',
      ],
      apis: [
        mockApis.permission({
          authorize: options.deny
            ? AuthorizeResult.DENY
            : AuthorizeResult.ALLOW,
        }),
      ],
    });
  }
  beforeEach(() => {
    jest.clearAllMocks();
    loader.mockResolvedValue({
      name: 'RepositoryInput',
      component: () => <div>Repository widget</div>,
      validation,
      schema,
    });
  });
  it('loads a statically declared field and preserves asynchronous validation without registry registration', async () => {
    await compose();
    expect(
      await screen.findByText('RepositoryInput: validator preserved'),
    ).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(screen.getByText('schema preserved')).toBeInTheDocument();
    expect(contributionRegistry.getScaffolderFields()).toEqual([]);
  });

  it('collects inspectable inert fields without installing portal-scaffolder', async () => {
    await compose({ templatesHost: false });
    expect(await screen.findByText('Portal ready')).toBeInTheDocument();
    expect(screen.getByText('Fields discovered: 1')).toBeInTheDocument();
    expect(
      screen.getByText('contributor: RepositoryInput'),
    ).toBeInTheDocument();
    expect(screen.getByText('Immutable declarations')).toBeInTheDocument();
    expect(loader).not.toHaveBeenCalled();
    expect(screen.queryByText('Wizard ready')).not.toBeInTheDocument();
    expect(contributionRegistry.getScaffolderFields()).toEqual([]);
  });

  it('lets a different templates plugin consume the same generic declarations', async () => {
    await compose({ templatesPluginId: 'alternative-templates' });
    expect(
      await screen.findByText('RepositoryInput: validator preserved'),
    ).toBeInTheDocument();
    expect(screen.getByText('schema preserved')).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('preserves first-party and third-party widgets through the same adapter', async () => {
    const firstPartyLoader = jest.fn(async () => ({
      name: 'BuiltInInput',
      component: () => <div>First-party widget</div>,
      validation,
      schema,
    }));
    await compose({
      firstPartyDeclaration: {
        ...descriptor('portal-scaffolder', 'BuiltInInput'),
        loader: firstPartyLoader,
      },
      mountWidget: true,
    });
    expect(await screen.findByText('First-party widget')).toBeInTheDocument();
    expect(screen.getByText('Repository widget')).toBeInTheDocument();
    expect(screen.getAllByText('schema preserved')).toHaveLength(2);
    expect(firstPartyLoader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('accepts an existing contribution API snapshot without the optional field list', async () => {
    const pageLoader = jest.fn(async () => <div>Templates without fields</div>);
    await renderTestApp({
      features: [
        createFrontendPlugin({
          pluginId: 'templates-host',
          extensions: [
            createPortalScaffolderPage({
              path: '/templates',
              routeRef: createRouteRef(),
              loader: pageLoader,
            }),
          ],
        }),
      ],
      apis: [
        [
          portalContributionsApiRef,
          { tabs: [], actions: [], cards: [], catalogActions: [] },
        ],
      ],
      initialRouteEntries: ['/templates'],
    });
    expect(
      await screen.findByText('Templates without fields'),
    ).toBeInTheDocument();
    expect(pageLoader).toHaveBeenCalledWith([]);
    expect(loader).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'honors NFS disabling with templatesHost=%s',
    async templatesHost => {
      await compose({ templatesHost, disabled: true });
      await screen.findByText(
        templatesHost ? 'Wizard ready' : 'Fields discovered: 0',
      );
      expect(loader).not.toHaveBeenCalled();
    },
  );

  it.each([
    'owner',
    'malformed',
    'duplicate-name',
    'duplicate-id',
    'version',
  ] as const)(
    'rejects %s declarations in the collector even without a templates host',
    async reason => {
      const field = descriptor();
      const other = descriptor();
      if (reason === 'duplicate-name') {
        other.entryPointId = 'contributor.other-field';
        other.manifest.capabilities[0].entryPoints[0].id = other.entryPointId;
      }
      if (reason === 'duplicate-id') other.fieldName = 'AnotherInput';
      await compose({
        templatesHost: false,
        owner: reason === 'owner' ? 'other-plugin' : undefined,
        declaration:
          reason === 'malformed'
            ? { ...field, manifest: undefined as never }
            : field,
        declarations: reason.startsWith('duplicate')
          ? [field, other]
          : undefined,
        collectorApiVersion: reason === 'version' ? '9.0.0' : undefined,
      });
      expect(
        await screen.findByText('Fields discovered: 0'),
      ).toBeInTheDocument();
      expect(loader).not.toHaveBeenCalled();
    },
  );

  it('preserves an explicit templates adapter API-version restriction', async () => {
    await compose({ hostApiVersion: '9.0.0' });
    await screen.findByText('Wizard ready');
    expect(loader).not.toHaveBeenCalled();
  });

  it('uses the collector host version unless the adapter explicitly restricts it', async () => {
    const field = descriptor();
    field.manifest.apiVersion = '0.2.0';
    field.manifest.capabilities[0].minimumHostApiVersion = '0.2.0';
    await compose({ declaration: field, collectorApiVersion: '0.2.0' });
    expect(
      await screen.findByText('RepositoryInput: validator preserved'),
    ).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(1);
  });
  it.each(['config', 'permission', 'experience', 'owner', 'reserved'] as const)(
    'filters %s before importing the widget',
    async gate => {
      await compose({
        enabled: gate !== 'config',
        deny: gate === 'permission',
        owner: gate === 'owner' ? 'other' : undefined,
        reserved: gate === 'reserved' ? ['RepositoryInput'] : undefined,
        experiences: gate === 'experience' ? [] : undefined,
      });
      await screen.findByText('Wizard ready');
      expect(loader).not.toHaveBeenCalled();
    },
  );
  it('isolates a failed loader and omits its widget rather than falling back', async () => {
    loader.mockRejectedValue(new Error('Federation unavailable'));
    await compose();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Some template fields could not be loaded',
    );
    expect(screen.getByText('Wizard ready')).toBeInTheDocument();
    expect(
      screen.queryByText('RepositoryInput: validator preserved'),
    ).not.toBeInTheDocument();
  });
  it('rejects a loaded widget that changes the declared name', async () => {
    loader.mockResolvedValue({
      name: 'WrongName',
      component: () => null,
      validation,
    });
    await compose();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Some template fields could not be loaded',
    );
  });
  it('stops the active form when a mounted widget throws', async () => {
    loader.mockResolvedValue({
      name: 'RepositoryInput',
      component: () => {
        throw new Error('Widget failed');
      },
      validation,
    });
    await compose({ mountWidget: true });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Template fields could not be loaded',
    );
    expect(screen.queryByText('Wizard ready')).not.toBeInTheDocument();
  });
  it('fails closed for duplicate IDs or names and incompatible contracts', () => {
    const field = descriptor();
    expect(collectScaffolderFields([field, field])).toEqual([]);
    expect(collectScaffolderFields([{ ...field, fieldName: '' }])).toEqual([]);
    expect(
      collectScaffolderFields([{ ...field, attachment: 'wrong' as never }]),
    ).toEqual([]);
    expect(
      collectScaffolderFields([
        { ...field, manifest: { ...field.manifest, apiVersion: '9.0.0' } },
      ]),
    ).toEqual([]);
  });
  it('does not mount a removed declaration after its loader resolves', async () => {
    let resolve!: (field: Awaited<ReturnType<typeof loader>>) => void;
    loader.mockImplementationOnce(
      () =>
        new Promise(done => {
          resolve = done;
        }),
    );
    const rendered = await compose();
    await waitFor(() => expect(loader).toHaveBeenCalled());
    expect(screen.queryByText('Wizard ready')).not.toBeInTheDocument();
    rendered.unmount();
    await act(async () => {
      resolve({ name: 'RepositoryInput', component: () => null, validation });
    });
    expect(screen.queryByText('Wizard ready')).not.toBeInTheDocument();
  });
});
