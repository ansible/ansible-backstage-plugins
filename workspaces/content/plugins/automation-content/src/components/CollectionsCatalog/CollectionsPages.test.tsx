import { fireEvent, render, screen } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { automationContentApiRef, type Collection } from '../../api';
import { CollectionsCatalogPage } from './CollectionsCatalogPage';
import { CollectionDetailsPage } from './CollectionDetailsPage';

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/automation-content/collections',
}));
jest.mock('../ContentItemDocumentation', () => ({
  ContentItemDocumentation: ({
    fqcn,
    inArtifact,
  }: {
    fqcn: string;
    inArtifact?: string;
  }) => (
    <h1>
      {fqcn} in {inArtifact}
    </h1>
  ),
}));

const first: Collection = {
  namespace: 'ns',
  name: 'name_with.dots',
  fqcn: 'ns.name_with.dots',
  version: '1.9.0',
  description: '',
  counts: { plugins: 2 },
  providedBy: ['r/ee@sha256:one'],
};
const items = [
  first,
  { ...first, providedBy: ['r/ee@sha256:two'] },
  { ...first, version: '1.10.0' },
];
const api = {
  listCollections: jest.fn(async () => items),
  searchContentItems: jest.fn(async () => ({ totalItems: 0, items: [] })),
};

function mount(path: string) {
  return render(
    <TestApiProvider apis={[[automationContentApiRef, api]]}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<CollectionsCatalogPage />} />
          <Route path="/:namespace/:name" element={<CollectionDetailsPage />} />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );
}

it('shows a single card, computed latest, fallback description and both digest links', async () => {
  mount('/');
  expect(await screen.findByText('Latest: 1.10.0')).toBeTruthy();
  expect(screen.getAllByText('ns.name_with.dots')).toHaveLength(1);
  expect(screen.getByText('No description available.')).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'r/ee@sha256:two' }).getAttribute('href'),
  ).toContain('r%2Fee%40sha256%3Atwo');
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'missing' },
  });
  expect(
    await screen.findByText('No collections match your search or filters'),
  ).toBeTruthy();
});

it('opens dotted collection details with version context and provider aggregation', async () => {
  mount('/ns/name_with.dots?version=1.9.0');
  expect(await screen.findByText('Version 1.9.0')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'r/ee@sha256:one' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'r/ee@sha256:two' })).toBeTruthy();
});

it('searches contents using collection identity', async () => {
  mount('/ns/name_with.dots?tab=content');
  await screen.findByText('No content items found');
  expect(api.searchContentItems).toHaveBeenCalledWith(
    expect.objectContaining({ collection: first.fqcn }),
  );
});

it('renders shared documentation preserving the providing artifact', async () => {
  mount(
    '/ns/name_with.dots?item=ns.name_with.dots.module&itemIn=r%2Fee%40sha256%3Atwo',
  );
  expect(
    await screen.findByRole('heading', {
      name: 'ns.name_with.dots.module in r/ee@sha256:two',
    }),
  ).toBeTruthy();
});

it('shows every version/provider relationship in the environments table', async () => {
  mount('/ns/name_with.dots?tab=environments');
  expect(await screen.findByRole('grid')).toBeTruthy();
  expect(screen.getAllByRole('link', { name: 'r/ee@sha256:one' })).toHaveLength(
    2,
  );
  expect(screen.getByRole('link', { name: 'r/ee@sha256:two' })).toBeTruthy();
});
