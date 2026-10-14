import '@testing-library/jest-dom';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import { createFrontendPlugin } from '@backstage/frontend-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import catalogImportPlugin from '@backstage/plugin-catalog-import/alpha';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import {
  contributionRegistry,
  CONTENT_TYPES,
} from '@ansible/portal-extension-api';
import {
  ScaffolderFieldBlueprint,
  type ScaffolderFieldDescriptor,
} from '@ansible/portal-extension-api/alpha';
import plugin from './alpha';

const mockSuperuser = jest.fn(() => ({ isSuperuser: true, loading: false }));
jest.mock('./hooks', () => ({
  ...jest.requireActual('./hooks'),
  useIsSuperuser: () => mockSuperuser(),
}));
jest.mock('./components/CatalogImport', () => ({
  CatalogImport: () => <div>Native catalog import</div>,
}));
jest.mock('./components/ExecutionEnvironments/catalog/EEDetailsPage', () => ({
  EEDetailsPage: () => <div>Native execution environment details</div>,
}));

jest.mock('./components/CreateTask/formExtraFields', () => ({
  formExtraFields: [],
}));
jest.mock('./components/Home', () => ({
  TemplatesRoutesPage: () => (
    <div data-testid="templates-content">Portal templates</div>
  ),
}));
jest.mock('./components/TaskList', () => ({
  HistoryRoutesPage: () => <div>Portal task history</div>,
}));
jest.mock('./components/CollectionsCatalog', () => ({
  CollectionsRoutesPage: () => <div>Native collections section</div>,
}));
jest.mock('./components/ExecutionEnvironments', () => ({
  EERoutesPage: () => <div>Native execution environments section</div>,
}));
jest.mock('./components/GitRepositories', () => ({
  GitRepositoriesRoutesPage: () => <div>Native repositories section</div>,
}));
const mockValidation = jest.fn();
jest.mock('./components/CreateTask/StepForm', () => ({
  StepForm: ({ nativeFields, submitFunction }: any) => (
    <>
      {nativeFields?.map((field: any) => (
        <p key={field.name}>
          {field.name}:{' '}
          {field.validation === mockValidation
            ? 'validator preserved'
            : 'validator missing'}
        </p>
      ))}
      <button
        onClick={() =>
          void submitFunction(
            { repoUrl: 'github.com?owner=org&repo=repo' },
            { SCM_TOKEN: 'test-secret' },
          )
        }
      >
        Submit test task
      </button>
    </>
  ),
}));

const declaration: ScaffolderFieldDescriptor = {
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
        experienceId: 'content-authoring',
        minimumHostApiVersion: '0.1.0',
        appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
        entryPoints: [
          {
            id: 'contributor.url-field',
            label: 'URL',
            kind: 'scaffolder-field',
            surface: 'experience-slot',
            appliesToContentTypes: [CONTENT_TYPES.PLAYBOOK_REPOSITORY],
            launches: { type: 'slot', targetSlot: 'scaffolder.fields' },
          },
        ],
      },
    ],
  },
  capabilityId: 'contributor.authoring',
  entryPointId: 'contributor.url-field',
  fieldName: 'RepositoryURL',
  attachment: 'scaffolder.fields',
  loader: async () => ({
    name: 'RepositoryURL',
    component: () => null,
    validation: mockValidation,
  }),
};

it('provides distinct native sidebar icons for the existing self-service sections', async () => {
  await renderTestApp({
    features: [plugin],
    initialRouteEntries: ['/self-service'],
    apis: [mockApis.permission()],
  });
  await screen.findByTestId('templates-content', {}, { timeout: 10000 });
  const paths = [
    'Templates',
    'History',
    'Execution Environments',
    'Collections',
    'Git repositories',
  ].map(name =>
    screen
      .getByRole('link', { name })
      .querySelector('svg path')
      ?.getAttribute('d'),
  );
  expect(paths.every(Boolean)).toBe(true);
  expect(new Set(paths).size).toBe(5);
});

it('discovers native fields on the real Portal wizard route and keeps the existing task/secrets flow', async () => {
  const scaffold = jest.fn().mockResolvedValue({ taskId: 'test-task' });
  const getTemplateParameterSchema = jest.fn().mockResolvedValue({
    title: 'Register repository',
    steps: [
      {
        title: 'Repository',
        schema: {
          properties: {
            repoUrl: { type: 'string', 'ui:field': 'RepositoryURL' },
          },
        },
      },
    ],
  });
  await renderTestApp({
    features: [
      plugin,
      createFrontendPlugin({
        pluginId: 'contributor',
        extensions: [
          ScaffolderFieldBlueprint.make({ name: 'url', params: declaration }),
        ],
      }),
    ],
    initialRouteEntries: [
      '/self-service/create/templates/default/register-repo?portalFrontend=nfs',
    ],
    apis: [
      [scaffolderApiRef, { getTemplateParameterSchema, scaffold }],
      [catalogApiRef, { getEntityByRef: async () => undefined }],
      mockApis.permission(),
    ],
  });
  expect(
    await screen.findByText(
      'RepositoryURL: validator preserved',
      {},
      { timeout: 10000 },
    ),
  ).toBeInTheDocument();
  expect(getTemplateParameterSchema).toHaveBeenCalledWith(
    'template:default/register-repo',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Submit test task' }));
  await waitFor(() =>
    expect(scaffold).toHaveBeenCalledWith({
      templateRef: 'template:default/register-repo',
      values: { repoUrl: 'github.com?owner=org&repo=repo' },
      secrets: { SCM_TOKEN: 'test-secret' },
    }),
  );
  expect(await screen.findByText('Portal task history')).toBeInTheDocument();
  expect(contributionRegistry.getScaffolderFields()).toEqual([]);
});

it.each([
  ['/self-service/collections', 'Native collections section'],
  ['/self-service/collections/example', 'Native collections section'],
  ['/self-service/ee/catalog', 'Native execution environments section'],
  ['/self-service/ee/create', 'Native execution environments section'],
  ['/self-service/repositories/catalog', 'Native repositories section'],
  ['/self-service/repositories/example', 'Native repositories section'],
  ['/self-service/repositories/ci-activity', 'Native repositories section'],
  ['/self-service/create/tasks', 'Portal task history'],
  ['/self-service/create/tasks/example-task', 'Portal task history'],
  ['/self-service/catalog', 'Portal templates'],
  ['/self-service/catalog/default/example', 'Portal templates'],
  ['/self-service/catalog-import', 'Native catalog import'],
  ['/self-service/catalog/example-ee', 'Native execution environment details'],
])(
  'discovers the section route %s without falling back to templates',
  async (path, title) => {
    await renderTestApp({
      features: [plugin, catalogImportPlugin],
      initialRouteEntries: [path],
      apis: [mockApis.permission()],
    });
    expect(await screen.findByText(title)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId('templates-content') !== null).toBe(
        title === 'Portal templates',
      ),
    );
  },
);

it('does not expose catalog import to a non-superuser', async () => {
  mockSuperuser.mockReturnValueOnce({ isSuperuser: false, loading: false });
  await renderTestApp({
    features: [plugin, catalogImportPlugin],
    initialRouteEntries: ['/self-service/catalog-import'],
    apis: [mockApis.permission()],
  });
  expect(await screen.findByTestId('templates-content')).toBeInTheDocument();
  expect(screen.queryByText('Native catalog import')).not.toBeInTheDocument();
});
