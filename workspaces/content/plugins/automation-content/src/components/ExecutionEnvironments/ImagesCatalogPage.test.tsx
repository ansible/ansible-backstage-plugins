import { render, screen } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { automationContentApiRef, type ExecutionEnvironment } from '../../api';
import { ImagesCatalogPage } from './ImagesCatalogPage';

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/automation-content/execution-environments',
}));
jest.mock('@backstage/plugin-catalog-react', () => ({
  ...jest.requireActual('@backstage/plugin-catalog-react'),
  useStarredEntities: () => ({
    isStarredEntity: () => false,
    toggleStarredEntity: jest.fn(),
  }),
}));

const base: ExecutionEnvironment = {
  ref: 'r/repo@sha256:one',
  registry: 'r',
  repository: 'repo',
  digest: 'sha256:one',
  tags: ['latest'],
  pullReference: 'r/repo@sha256:one',
  contentsKnown: true,
  enumeration: { status: 'partial', source: 'labels' },
  counts: { collections: 2, plugins: 3 },
  collections: [],
};

it('labels partial counts and unknown contents without requiring catalog matches', async () => {
  render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          {
            listExecutionEnvironments: async (): Promise<
              ExecutionEnvironment[]
            > => [
              base,
              {
                ...base,
                ref: 'r/repo@sha256:two',
                digest: 'sha256:two',
                contentsKnown: false,
                enumeration: { status: 'unknown', source: 'labels' },
              },
            ],
          },
        ],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
      ]}
    >
      <ImagesCatalogPage />
    </TestApiProvider>,
  );
  expect(
    await screen.findByText('Approximate: 2 collections / 3 plugins'),
  ).toBeTruthy();
  expect(screen.getAllByText('Contents unknown')).toHaveLength(2);
  expect(screen.getByText('partial')).toBeTruthy();
  expect(screen.queryByText('unknown')).toBeNull();
  expect(screen.getAllByText('labels')).toHaveLength(2);
  expect(screen.queryByRole('button', { name: /to favorites/ })).toBeNull();
  expect(
    screen.getAllByRole('link', { name: 'repo' })[0].getAttribute('href'),
  ).toContain('r%2Frepo%40sha256%3Aone');
});
