import '@testing-library/jest-dom';
import { act, screen, waitFor } from '@testing-library/react';
import { compatWrapper } from '@backstage/core-compat-api';
import {
  createFrontendPlugin,
  createRouteRef,
} from '@backstage/frontend-plugin-api';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
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
  type ScaffolderFieldDescriptor,
} from '@ansible/portal-extension-api/alpha';
import { createPortalScaffolderPage } from './createPortalScaffolderPage';
import { NativeScaffolderFields } from './NativeScaffolderFields';
import { collectScaffolderFields } from './validateScaffolderField';

const validation = jest.fn(async () => {});
const loader = jest.fn(async () => ({
  name: 'RepositoryInput',
  component: (): JSX.Element | null => <div>Repository widget</div>,
  validation,
}));
function descriptor(): ScaffolderFieldDescriptor {
  return {
    manifest: {
      id: 'contributor',
      version: '1.0.0',
      apiVersion: '0.1.0',
      entitlements: [],
      capabilities: [
        {
          id: 'contributor.authoring',
          ownerPlugin: 'contributor',
          experienceId: 'content-authoring',
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
    capabilityId: 'contributor.authoring',
    entryPointId: 'contributor.repo-field',
    attachment: 'scaffolder.fields',
    fieldName: 'RepositoryInput',
    enabledByConfig: 'contributor.enabled',
    loader,
  };
}

describe('native scaffolder field discovery', () => {
  async function compose(
    options: {
      declaration?: ScaffolderFieldDescriptor;
      owner?: string;
      enabled?: boolean;
      deny?: boolean;
      reserved?: string[];
      experiences?: string[];
      mountWidget?: boolean;
    } = {},
  ) {
    const page = createPortalScaffolderPage({
      path: '/templates',
      routeRef: createRouteRef(),
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
          pluginId: 'portal-scaffolder',
          extensions: [page],
        }),
        createFrontendPlugin({
          pluginId: options.owner ?? 'contributor',
          extensions: [
            ScaffolderFieldBlueprint.make({
              name: 'repository',
              params: options.declaration ?? descriptor(),
            }),
          ],
        }),
      ],
      config: { contributor: { enabled: options.enabled ?? true } },
      initialRouteEntries: ['/templates'],
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
    });
  });
  it('loads a statically declared field and preserves asynchronous validation without registry registration', async () => {
    await compose();
    expect(
      await screen.findByText('RepositoryInput: validator preserved'),
    ).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(contributionRegistry.getScaffolderFields()).toEqual([]);
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
