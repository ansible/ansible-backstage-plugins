import { fireEvent, render, screen } from '@testing-library/react';
import type { Collection, Registry } from '../../api';
import type { Entity } from '@backstage/catalog-model';
import { CollectionCard } from './CollectionCard';

const collection: Collection = {
  namespace: 'ns',
  name: 'example',
  fqcn: 'ns.example',
  version: '1.2.0',
  repository: 'https://github.com/ansible/example',
  counts: {},
  providedBy: ['registry/team/ee@sha256:abcdef'],
};

const registry: Registry = {
  name: 'registry',
  url: 'https://registry.example.test',
  lastReconciledAt: new Date().toISOString(),
  lastReconcileOk: true,
};

const entity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'collection-ee-ns-example-1-2-0',
    namespace: 'default',
    annotations: {
      'ansible.com/collection': 'ns.example',
      'ansible.com/version': '1.2.0',
    },
    tags: ['ansible-collection', 'eda'],
  },
  spec: { type: 'ansible-collection' },
};

it('keeps the card compact and presents source and sync data without artifact refs', () => {
  render(
    <CollectionCard
      collection={collection}
      href="/content/collections/ns/example?version=1.2.0"
      registries={[registry]}
      catalogEntities={[entity]}
      catalogMetadataAvailable
      isStarredEntity={() => false}
      toggleStarredEntity={jest.fn()}
    />,
  );

  expect(
    screen.getByRole('link', { name: 'ns.example' }).getAttribute('href'),
  ).toBe('/content/collections/ns/example?version=1.2.0');
  expect(screen.getByText('v1.2.0')).toBeTruthy();
  expect(screen.getByText('External registry')).toBeTruthy();
  expect(screen.queryByRole('group', { name: 'Repository' })).toBeNull();
  expect(
    screen.getByRole('group', { name: 'Last sync' }).textContent,
  ).toContain('Just now');
  expect(screen.queryByText(/sha256/)).toBeNull();
  expect(screen.queryByText('Not reported')).toBeNull();
});

it('toggles only matched real catalog entities and disables unavailable favorites', () => {
  const toggleStarredEntity = jest.fn();
  const { rerender } = render(
    <CollectionCard
      collection={collection}
      href="/collections/ns/example"
      registries={[registry]}
      catalogEntities={[entity]}
      catalogMetadataAvailable
      isStarredEntity={() => false}
      toggleStarredEntity={toggleStarredEntity}
    />,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Add ns.example v1.2.0 to favorites' }),
  );
  expect(toggleStarredEntity).toHaveBeenCalledWith(entity);

  rerender(
    <CollectionCard
      collection={collection}
      href="/collections/ns/example"
      registries={[]}
      catalogEntities={[]}
      catalogMetadataAvailable
      isStarredEntity={() => false}
      toggleStarredEntity={toggleStarredEntity}
    />,
  );
  expect(
    screen.getByRole('button', {
      name: /Favorites unavailable for ns.example v1.2.0/,
    }),
  ).toHaveProperty('disabled', true);
});

it('uses an em dash for unverified source and sync metadata', () => {
  render(
    <CollectionCard
      collection={{
        ...collection,
        repository: undefined,
        providedBy: ['unknown/team/ee@sha256:abc'],
      }}
      href="/collections/ns/example"
      registries={[]}
      catalogEntities={[]}
      catalogMetadataAvailable={false}
      isStarredEntity={() => false}
      toggleStarredEntity={jest.fn()}
    />,
  );

  expect(screen.getByRole('group', { name: 'Source' }).textContent).toContain(
    '—',
  );
  expect(
    screen.getByRole('group', { name: 'Last sync' }).textContent,
  ).toContain('—');
});
