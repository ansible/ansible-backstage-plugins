import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApiProvider } from '@backstage/test-utils';
import { automationContentApiRef } from '../../api';
import { ContentItemsTable } from './ContentItemsTable';

it('keeps documentation links and backend searches scoped to the immutable image', async () => {
  const ref = 'registry/repo@sha256:one';
  const searchContentItems = jest.fn().mockResolvedValue({
    items: [
      {
        fqcn: 'ansible.posix.mount',
        name: 'mount',
        type: 'module',
        collection: 'ansible.posix',
        collectionVersion: '1.0.0',
        shortDescription: 'Control active mount points',
      },
    ],
    totalItems: 501,
  });
  render(
    <TestApiProvider apis={[[automationContentApiRef, { searchContentItems }]]}>
      <ContentItemsTable
        inArtifact={ref}
        itemHref={item =>
          `/docs?${new URLSearchParams({ item: item.fqcn, in: ref })}`
        }
      />
    </TestApiProvider>,
  );
  const link = await screen.findByRole('link', { name: 'ansible.posix.mount' });
  expect(link.getAttribute('href')).toContain(
    new URLSearchParams({ item: 'ansible.posix.mount', in: ref }).toString(),
  );
  expect(screen.getByText('Control active mount points')).toBeTruthy();
  expect(
    screen.getByText('1 loaded of 501 matching content items'),
  ).toBeTruthy();
  expect(
    screen.getByText(
      'Results are limited to 500 items. Refine your search to find more.',
    ),
  ).toBeTruthy();
  await userEvent.type(
    screen.getByRole('searchbox', { name: 'Search content items' }),
    'mount',
  );
  expect(searchContentItems).toHaveBeenLastCalledWith({
    in: ref,
    collection: undefined,
    q: 'mount',
    limit: 500,
  });
});

it('does not report request failures as empty content', async () => {
  render(
    <TestApiProvider
      apis={[
        [
          automationContentApiRef,
          {
            searchContentItems: async () => {
              throw new Error('offline');
            },
          },
        ],
      ]}
    >
      <ContentItemsTable
        inArtifact="registry/repo@sha256:one"
        itemHref={() => '/docs'}
      />
    </TestApiProvider>,
  );
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  expect(screen.queryByText('No content items found')).toBeNull();
});
