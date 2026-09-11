import { screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { Entity } from '@backstage/catalog-model';
import {
  DefaultGitRepositoriesExtensionsApi,
  gitRepositoriesExtensionsApiRef,
} from '@ansible/backstage-rhaap-common/gitRepositoriesExtensions';
import { CatalogRowAddonSlot } from './CatalogRowAddonSlot';

const entity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'test-repo' },
};

describe('CatalogRowAddonSlot', () => {
  it('renders catalog row addons in order', async () => {
    class OrderedSlotsApi extends DefaultGitRepositoriesExtensionsApi {
      getCatalogRowSlots() {
        return [
          {
            id: 'second',
            order: 20,
            render: () => <span>second-slot</span>,
          },
          {
            id: 'first',
            order: 10,
            render: () => <span>first-slot</span>,
          },
        ];
      }
    }

    await renderInTestApp(
      <TestApiProvider
        apis={[[gitRepositoriesExtensionsApiRef, new OrderedSlotsApi()]]}
      >
        <CatalogRowAddonSlot entity={entity} />
      </TestApiProvider>,
    );

    const first = screen.getByText('first-slot');
    const second = screen.getByText('second-slot');
    expect(
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
