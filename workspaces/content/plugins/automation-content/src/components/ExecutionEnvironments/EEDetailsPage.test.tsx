import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TestApiProvider } from '@backstage/test-utils';
import userEvent from '@testing-library/user-event';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { automationContentApiRef, type ExecutionEnvironment } from '../../api';
import { EEDetailsPage } from './EEDetailsPage';

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/automation-content',
}));
const toggleStarredEntity = jest.fn();
jest.mock('@backstage/plugin-catalog-react', () => ({
  ...jest.requireActual('@backstage/plugin-catalog-react'),
  useStarredEntities: () => ({
    isStarredEntity: () => false,
    toggleStarredEntity: (...args: unknown[]) => toggleStarredEntity(...args),
  }),
}));

const image: ExecutionEnvironment = {
  ref: 'registry/repo@sha256:one',
  registry: 'registry',
  repository: 'repo',
  digest: 'sha256:one',
  tags: [],
  pullReference: 'registry/repo@sha256:one',
  contentsKnown: true,
  enumeration: { status: 'partial', source: 'labels' },
  collections: [],
};

it.each(['registry/repo@sha256:one', 'registry/repo@sha256:two'])(
  'keeps collections scoped to %s',
  async ref => {
    const getContents = jest.fn().mockResolvedValue({
      enumeration: image.enumeration,
      collections: [
        {
          namespace: 'ansible',
          name: 'posix',
          fqcn: 'ansible.posix',
          version: '1.0.0',
          counts: { plugins: 2 },
        },
      ],
      items: [],
    });
    render(
      <TestApiProvider
        apis={[
          [catalogApiRef, { getEntities: async () => ({ items: [] }) }],
          [
            automationContentApiRef,
            {
              getExecutionEnvironment: async () => ({ ...image, ref }),
              getContents,
            },
          ],
        ]}
      >
        <MemoryRouter
          initialEntries={[`/${encodeURIComponent(ref)}?tab=collections`]}
        >
          <Routes>
            <Route path=":ref" element={<EEDetailsPage />} />
          </Routes>
        </MemoryRouter>
      </TestApiProvider>,
    );
    const link = await screen.findByRole('link', { name: 'ansible.posix' });
    expect(link.getAttribute('href')).toContain(
      new URLSearchParams({ in: ref, version: '1.0.0' }).toString(),
    );
    expect(getContents).toHaveBeenCalledWith(ref);
    expect(screen.getByText('Approximate: 2')).toBeTruthy();
  },
);

it('shows artifact overview, tags, honest contents and copy action without authoring controls', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  const entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'image',
      annotations: {
        'ansible.com/registry': image.registry,
        'ansible.com/repository': image.repository,
        'ansible.com/digest': image.digest,
      },
    },
  };
  render(
    <TestApiProvider
      apis={[
        [catalogApiRef, { getEntities: async () => ({ items: [entity] }) }],
        [
          automationContentApiRef,
          {
            getExecutionEnvironment: async () => ({
              ...image,
              contentsKnown: false,
              counts: { collections: 0, plugins: 0 },
              tags: ['latest', '1.0'],
            }),
            getContents: async () => ({
              enumeration: image.enumeration,
              collections: [],
              items: [],
            }),
          },
        ],
      ]}
    >
      <MemoryRouter initialEntries={[`/${encodeURIComponent(image.ref)}`]}>
        <Routes>
          <Route path=":ref" element={<EEDetailsPage />} />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );
  expect(
    await screen.findByRole('tab', { name: 'Overview', selected: true }),
  ).toBeTruthy();
  expect(screen.getByText('Contents unknown')).toBeTruthy();
  expect(screen.queryByText('0 collections / 0 plugins')).toBeNull();
  expect(screen.getByText('latest')).toBeTruthy();
  expect(screen.getByText('1.0')).toBeTruthy();
  await userEvent.click(
    screen.getByRole('button', { name: /Add repo sha256:one to favorites/ }),
  );
  expect(toggleStarredEntity).toHaveBeenCalledWith(entity);
  await userEvent.click(
    screen.getByRole('button', { name: 'Copy pull reference' }),
  );
  expect(writeText).toHaveBeenCalledWith(image.pullReference);
  expect(await screen.findByText('Pull reference copied')).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: /Build|Edit|Sync|Use in Controller/ }),
  ).toBeNull();
  expect(screen.queryByRole('tab', { name: 'Definition file' })).toBeNull();
});
