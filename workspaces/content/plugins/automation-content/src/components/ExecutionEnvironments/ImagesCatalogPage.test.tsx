import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApiProvider } from '@backstage/test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { automationContentApiRef, type ExecutionEnvironment } from '../../api';
import { ImagesCatalogPage } from './ImagesCatalogPage';

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/self-service/ee',
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

it('does not describe a failed inventory request as empty', async () => {
  render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          {
            listExecutionEnvironments: async () => {
              throw new Error('offline');
            },
          },
        ],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
      ]}
    >
      <ImagesCatalogPage />
    </TestApiProvider>,
  );
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  expect(screen.queryByText('0 images loaded')).toBeNull();
  expect(screen.queryByText('No execution environments discovered')).toBeNull();
});

it('defaults to classified EEs and refetches everything when toggled', async () => {
  const listExecutionEnvironments = jest.fn(
    async (): Promise<ExecutionEnvironment[]> => [base],
  );
  render(
    <TestApiProvider
      apis={[
        [automationContentApiRef, { listExecutionEnvironments }],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
      ]}
    >
      <ImagesCatalogPage />
    </TestApiProvider>,
  );
  expect(await screen.findByRole('link', { name: 'repo' })).toBeTruthy();
  expect(
    screen.getByRole('heading', { name: 'Execution Environments images (1)' }),
  ).toBeTruthy();
  expect(listExecutionEnvironments).toHaveBeenLastCalledWith({
    allTypes: false,
  });
  await userEvent.click(screen.getByRole('checkbox', { name: /all images/ }));
  expect(listExecutionEnvironments).toHaveBeenLastCalledWith({
    allTypes: true,
  });
});

it('retains search controls when no images match and clears the filters', async () => {
  render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          { listExecutionEnvironments: async () => [base] },
        ],
        [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
      ]}
    >
      <ImagesCatalogPage />
    </TestApiProvider>,
  );
  expect(await screen.findByRole('link', { name: 'repo' })).toBeTruthy();
  await userEvent.type(
    screen.getByRole('searchbox', { name: 'Search images' }),
    'absent',
  );
  expect(await screen.findByText('No images match your filters')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(await screen.findByRole('link', { name: 'repo' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Sync|Build|Edit/ })).toBeNull();
});

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
