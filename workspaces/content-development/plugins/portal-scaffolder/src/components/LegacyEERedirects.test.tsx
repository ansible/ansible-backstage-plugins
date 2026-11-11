import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router-dom';
import {
  LegacyDefinitionRedirect,
  LegacyEERedirects,
} from './LegacyEERedirects';

const getEntities = jest.fn();
beforeEach(() => getEntities.mockReset().mockResolvedValue({ items: [] }));

function Destination() {
  const { pathname, search, hash } = useLocation();
  const navigationType = useNavigationType();
  return (
    <div data-testid="destination" data-navigation={navigationType}>
      {pathname + search + hash}
    </div>
  );
}

function renderRedirect(path: string) {
  return render(
    <TestApiProvider apis={[[catalogApiRef, { getEntities }]]}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/self-service/ee/*" element={<LegacyEERedirects />} />
          <Route
            path="/self-service/catalog/:templateName"
            element={<LegacyDefinitionRedirect />}
          />
          <Route path="/content/ee/*" element={<Destination />} />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );
}

it.each([
  ['/self-service/ee', '/content/ee'],
  ['/self-service/ee/catalog', '/content/ee'],
  ['/self-service/ee/create', '/content/ee'],
  ['/self-service/ee/catalog/old-name', '/content/ee'],
  ['/self-service/ee/details/old-name', '/content/ee'],
  ['/self-service/ee/unknown/path', '/content/ee'],
  ['/self-service/ee/catalog/team/my-ee', '/content/ee/catalog/team/my-ee'],
  [
    '/self-service/ee/catalog/team%20one/my%23ee?tab=source%20file#definition',
    '/content/ee/catalog/team%20one/my%23ee?tab=source%20file#definition',
  ],
  ['/self-service/ee/create?x=1#top', '/content/ee?x=1#top'],
])('redirects %s to %s', async (path, destination) => {
  renderRedirect(path);
  expect(await screen.findByTestId('destination')).toHaveTextContent(
    destination,
  );
  expect(screen.getByTestId('destination')).toHaveAttribute(
    'data-navigation',
    'REPLACE',
  );
});

const definition = (namespace?: string): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'actual-ee',
    ...(namespace === undefined ? {} : { namespace }),
  },
  spec: { type: 'execution-environment' },
});

it.each([
  '/self-service/ee/catalog/old-name',
  '/self-service/catalog/old-name',
])('resolves the actual definition namespace and name for %s', async path => {
  getEntities.mockResolvedValue({ items: [definition('team-one')] });
  renderRedirect(`${path}?tab=source%20file#definition`);
  expect(await screen.findByTestId('destination')).toHaveTextContent(
    '/content/ee/catalog/team-one/actual-ee?tab=source%20file#definition',
  );
  expect(getEntities).toHaveBeenCalledWith({
    filter: {
      kind: 'Component',
      'spec.type': 'execution-environment',
      'metadata.name': 'old-name',
    },
  });
  expect(screen.getByTestId('destination')).toHaveAttribute(
    'data-navigation',
    'REPLACE',
  );
});

it('defaults the namespace only when the matching entity omits it', async () => {
  getEntities.mockResolvedValue({ items: [definition()] });
  renderRedirect('/self-service/ee/catalog/old-name');
  expect(await screen.findByTestId('destination')).toHaveTextContent(
    '/content/ee/catalog/default/actual-ee',
  );
});

it.each([
  ['not found', []],
  ['ambiguous', [definition('team-one'), definition('team-two')]],
])('falls back without guessing when %s', async (_label, items) => {
  getEntities.mockResolvedValue({ items });
  renderRedirect('/self-service/catalog/old-name?x=1#top');
  expect(await screen.findByTestId('destination')).toHaveTextContent(
    '/content/ee?x=1#top',
  );
});

it('falls back on catalog API errors', async () => {
  getEntities.mockRejectedValue(new Error('Catalog unavailable'));
  renderRedirect('/self-service/ee/catalog/old-name');
  expect(await screen.findByTestId('destination')).toHaveTextContent(
    '/content/ee',
  );
});

it('does not look up namespace-qualified definitions', async () => {
  renderRedirect('/self-service/ee/catalog/team/my-ee');
  await screen.findByTestId('destination');
  expect(getEntities).not.toHaveBeenCalled();
});

it('encodes the resolved identity as individual path segments', async () => {
  const entity = definition('team one');
  entity.metadata.name = 'my#ee';
  getEntities.mockResolvedValue({ items: [entity] });
  renderRedirect('/self-service/catalog/old%20name');
  expect(await screen.findByTestId('destination')).toHaveTextContent(
    '/content/ee/catalog/team%20one/my%23ee',
  );
  expect(getEntities.mock.calls[0][0].filter['metadata.name']).toBe('old name');
});

it('waits for the current lookup and ignores an older name result', async () => {
  let resolveOld!: (value: { items: Entity[] }) => void;
  let resolveNew!: (value: { items: Entity[] }) => void;
  getEntities
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveOld = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveNew = resolve;
        }),
    );
  let navigate!: ReturnType<typeof useNavigate>;
  function Navigation() {
    navigate = useNavigate();
    return null;
  }
  render(
    <TestApiProvider apis={[[catalogApiRef, { getEntities }]]}>
      <MemoryRouter initialEntries={['/self-service/ee/catalog/old-name']}>
        <Navigation />
        <Routes>
          <Route path="/self-service/ee/*" element={<LegacyEERedirects />} />
          <Route path="/content/ee/*" element={<Destination />} />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );
  expect(screen.queryByTestId('destination')).not.toBeInTheDocument();
  act(() => navigate('/self-service/ee/catalog/new-name'));
  await act(async () => resolveOld({ items: [definition('old-team')] }));
  expect(screen.queryByTestId('destination')).not.toBeInTheDocument();
  await act(async () => resolveNew({ items: [definition('new-team')] }));
  expect(await screen.findByTestId('destination')).toHaveTextContent(
    '/content/ee/catalog/new-team/actual-ee',
  );
});
