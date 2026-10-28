import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TestApiProvider } from '@backstage/test-utils';
import { automationContentApiRef, type ExecutionEnvironment } from '../../api';
import { EEDetailsPage } from './EEDetailsPage';

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRef: () => () => '/automation-content',
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
