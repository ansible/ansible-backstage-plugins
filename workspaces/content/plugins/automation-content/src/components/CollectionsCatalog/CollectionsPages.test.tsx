import { fireEvent, screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
  mockApis,
} from '@backstage/test-utils';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { Route, Routes } from 'react-router-dom';
import { automationContentApiRef, type Collection } from '../../api';
import { CollectionsCatalogPage } from './CollectionsCatalogPage';
import { CollectionDetailsPage } from './CollectionDetailsPage';

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/self-service/collections',
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
  listCollections: jest.fn(async (query?: string) =>
    query === 'missing' ? [] : items,
  ),
  searchContentItems: jest.fn(async () => ({ totalItems: 0, items: [] })),
};

beforeEach(() => {
  jest.clearAllMocks();
});

function mount(path: string) {
  return renderInTestApp(
    <TestApiProvider
      apis={[
        [permissionApiRef, mockApis.permission()],
        [automationContentApiRef, api],
      ]}
    >
      <Routes>
        <Route path="/" element={<CollectionsCatalogPage />} />
        <Route path="/:namespace/:name" element={<CollectionDetailsPage />} />
      </Routes>
    </TestApiProvider>,
    { routeEntries: [path] },
  );
}

it('shows a single card, computed latest, fallback description and both digest links', async () => {
  await mount('/');
  expect(await screen.findByText('Latest: 1.10.0')).toBeTruthy();
  expect(screen.getAllByText('ns.name_with.dots')).toHaveLength(1);
  expect(screen.getByText('No description available.')).toBeTruthy();
  expect(screen.getByText('Page 1 of 1')).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'r/ee@sha256:two' }).getAttribute('href'),
  ).toContain('r%2Fee%40sha256%3Atwo');
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'missing' },
  });
  expect(
    await screen.findByText('No collections match your search or filters'),
  ).toBeTruthy();
  expect(api.listCollections).toHaveBeenLastCalledWith('missing');
});

it('opens dotted collection details with version context and provider aggregation', async () => {
  await mount('/ns/name_with.dots?version=1.9.0');
  expect(await screen.findByText('Version 1.9.0')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'r/ee@sha256:one' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'r/ee@sha256:two' })).toBeTruthy();
});

it('shows all computed versions when latest-only is turned off', async () => {
  await mount('/');
  await screen.findByText('Latest: 1.10.0');
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Show latest version only' }),
  );
  expect(screen.getByText('v1.9.0')).toBeTruthy();
  expect(screen.getByText('v1.10.0')).toBeTruthy();
  expect(
    screen
      .getAllByRole('link', { name: 'View ns.name_with.dots details' })
      .map(link => link.getAttribute('href')),
  ).toEqual([
    expect.stringContaining('version=1.10.0'),
    expect.stringContaining('version=1.9.0'),
  ]);
});

it('shows an error rather than an empty catalog when loading fails', async () => {
  api.listCollections.mockRejectedValueOnce(new Error('Unavailable'));
  await mount('/');
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Unable to load collections.',
  );
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  expect(screen.queryByText('No collections found')).toBeNull();
  expect(screen.queryByText('Latest: 1.10.0')).toBeNull();
});

it('distinguishes a missing collection from a failed detail request', async () => {
  await mount('/other/missing');
  expect(await screen.findByText('Collection not found')).toBeTruthy();
  expect(screen.queryByRole('tablist')).toBeNull();
});

it('searches contents using collection identity', async () => {
  await mount('/ns/name_with.dots?tab=content');
  await screen.findByText('No content items found');
  expect(api.searchContentItems).toHaveBeenCalledWith(
    expect.objectContaining({ collection: first.fqcn }),
  );
});

it('renders shared documentation preserving the providing artifact', async () => {
  await mount(
    '/ns/name_with.dots?item=ns.name_with.dots.module&itemIn=r%2Fee%40sha256%3Atwo',
  );
  expect(
    await screen.findByRole('heading', {
      name: 'ns.name_with.dots.module in r/ee@sha256:two',
    }),
  ).toBeTruthy();
});

it('shows every version/provider relationship in the environments table', async () => {
  await mount('/ns/name_with.dots?tab=environments');
  expect(await screen.findByRole('grid')).toBeTruthy();
  expect(screen.getAllByRole('link', { name: 'r/ee@sha256:one' })).toHaveLength(
    2,
  );
  expect(screen.getByRole('link', { name: 'r/ee@sha256:two' })).toBeTruthy();
});
