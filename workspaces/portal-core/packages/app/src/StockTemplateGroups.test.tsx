import '@testing-library/jest-dom';
// Host configuration is read from disk only in this regression test, never in the browser.
// eslint-disable-next-line no-restricted-imports
import { readFileSync } from 'fs';
// eslint-disable-next-line no-restricted-imports
import { resolve } from 'path';
// Use the installed host tooling parser without adding a runtime dependency.
// eslint-disable-next-line @backstage/no-undeclared-imports
import YAML from 'yaml';
import { fireEvent, screen, within } from '@testing-library/react';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import scaffolderPlugin from '@backstage/plugin-scaffolder/alpha';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { Entity } from '@backstage/catalog-model';
// eslint-disable-next-line @backstage/no-undeclared-imports
import { ConfigReader } from '@backstage/config';

const repoRoot = resolve(__dirname, '../../../../..');
const config = YAML.parse(
  readFileSync(resolve(repoRoot, 'app-config.yaml'), 'utf8'),
);

const templates: Entity[] = [
  {
    apiVersion: 'scaffolder.backstage.io/v1beta3',
    kind: 'Template',
    metadata: { name: 'build-ee', title: 'Build an execution environment' },
    spec: { type: 'execution-environment', owner: 'guests', steps: [] },
  },
  {
    apiVersion: 'scaffolder.backstage.io/v1beta3',
    kind: 'Template',
    metadata: { name: 'controller-workflow', title: 'Use in Controller' },
    spec: { type: 'workflow', owner: 'guests', steps: [] },
  },
];

it('keeps the base host extension configuration in the production overlay', () => {
  const production = YAML.parse(
    readFileSync(resolve(repoRoot, 'app-config.production.yaml'), 'utf8'),
  );
  const base = new ConfigReader(config);
  const merged = new ConfigReader(production, 'production', base);
  expect(production.app.extensions).toBeUndefined();
  expect(
    merged.getConfigArray('app.extensions').map(extension => extension.get()),
  ).toEqual(
    base.getConfigArray('app.extensions').map(extension => extension.get()),
  );
  expect(config.app.extensions).toContainEqual({
    'sub-page:scaffolder/templates': {
      config: {
        groups: [
          {
            title: 'Execution environments',
            filter: { kind: 'Template', 'spec.type': 'execution-environment' },
          },
        ],
      },
    },
  });
});

beforeEach(() => jest.spyOn(window, 'scrollTo').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

it('consumes tracked stock grouping config and keeps Other templates and wizard access', async () => {
  const getTemplateParameterSchema = jest.fn().mockResolvedValue({
    title: 'Build an execution environment',
    steps: [
      { title: 'Configure EE', schema: { type: 'object', properties: {} } },
    ],
  });
  await renderTestApp({
    features: [scaffolderPlugin, catalogPlugin],
    config,
    initialRouteEntries: ['/create'],
    apis: [
      [
        catalogApiRef,
        {
          getEntities: async () => ({ items: templates }),
          streamEntities: async function* streamEntities() {
            yield templates;
          },
          queryEntities: async () => ({
            items: templates,
            pageInfo: {},
            totalItems: 2,
          }),
          getEntityFacets: async () => ({ facets: {} }),
          getEntityByRef: async () => templates[0],
        },
      ],
      [scaffolderApiRef, { getTemplateParameterSchema }],
      mockApis.permission(),
    ],
  });

  const eeHeading = await screen.findByRole(
    'heading',
    {
      name: 'Execution environments',
    },
    { timeout: 15000 },
  );
  // The installed stock translation labels its automatic Other group "Other Templates".
  const otherHeading = await screen.findByRole('heading', {
    name: 'Other Templates',
  });
  const eeSection = eeHeading.closest('article')!;
  const otherSection = otherHeading.closest('article')!;
  expect(
    within(eeSection).getByText('Build an execution environment'),
  ).toBeInTheDocument();
  expect(
    within(eeSection).queryByText('Use in Controller'),
  ).not.toBeInTheDocument();
  expect(
    within(otherSection).getByText('Use in Controller'),
  ).toBeInTheDocument();
  expect(
    within(otherSection).queryByText('Build an execution environment'),
  ).not.toBeInTheDocument();
  expect(screen.getAllByText('Build an execution environment')).toHaveLength(1);
  expect(screen.getAllByText('Use in Controller')).toHaveLength(1);
  fireEvent.click(within(eeSection).getByRole('button', { name: /Choose/i }));
  expect(await screen.findByText('Configure EE')).toBeInTheDocument();
  expect(getTemplateParameterSchema).toHaveBeenCalledWith(
    'template:default/build-ee',
  );
}, 30000);
