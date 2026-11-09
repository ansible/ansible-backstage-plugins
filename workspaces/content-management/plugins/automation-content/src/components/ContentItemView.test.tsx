import '@testing-library/jest-dom';
import { render as renderComponent, screen } from '@testing-library/react';
import { TestApiProvider, wrapInTestApp } from '@backstage/test-utils';
import { automationContentApiRef } from '../api';
import { ContentItemView } from './views';

jest.mock('@ansible/portal-plugin-sdk', () => ({
  SkeletonLoader: () => <div>Loading</div>,
  useNotifications: () => ({ showNotification: jest.fn() }),
}));

const render = (element: React.ReactElement) =>
  renderComponent(wrapInTestApp(element));

describe('content item details', () => {
  it('renders top-level collection metadata as text and scopes duplicate item types', async () => {
    const api = {
      getContentItem: jest.fn().mockResolvedValue({
        fqcn: 'ansible.builtin.same_name',
        name: 'same_name',
        type: 'filter',
        collection: 'ansible.builtin',
        collectionVersion: '2.0.0',
        shortDescription: 'A filter variant',
        description: 'Filters values for a play.',
        authors: ['Utopia'],
        tags: ['network', 'operations'],
        license: ['Apache-2.0'],
        dependencies: { 'ansible.utils': '>=1.0.0' },
        documentation: 'https://example.test/docs',
        homepage: 'https://example.test/home',
        issues: 'https://example.test/issues',
        repository: 'file:///private/source',
        providedBy: ['registry/repo@sha256:abc'],
        enumeration: { status: 'complete', source: 'blob-fetch' },
      }),
    };

    render(
      <TestApiProvider apis={[[automationContentApiRef, api]]}>
        <ContentItemView
          environmentRef="registry/repo@sha256:abc"
          fqcn="ansible.builtin.same_name"
          itemType="filter"
        />
      </TestApiProvider>,
    );

    expect(await screen.findByText('Utopia')).toBeInTheDocument();
    expect(screen.getByText(/network, operations/)).toBeInTheDocument();
    expect(screen.getByText(/Apache-2.0/)).toBeInTheDocument();
    expect(screen.getByText(/ansible.utils: >=1.0.0/)).toBeInTheDocument();
    expect(screen.getByText('https://example.test/docs')).toBeInTheDocument();
    expect(screen.getByText('https://example.test/home')).toBeInTheDocument();
    expect(screen.getByText('https://example.test/issues')).toBeInTheDocument();
    expect(screen.getByText('file:///private/source')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /example\.test|private\/source/ }),
    ).not.toBeInTheDocument();
    expect(api.getContentItem).toHaveBeenCalledWith(
      'ansible.builtin.same_name',
      'registry/repo@sha256:abc',
      'filter',
    );
  });
});
