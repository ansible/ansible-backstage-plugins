import { PageBlueprint, type RouteRef } from '@backstage/frontend-plugin-api';
import type { CatalogItemActionDescriptor } from '@ansible/portal-extension-api/alpha';
import { ContributionPage } from './ContributionPage';

export function createPortalCatalogPage(options: {
  path: string;
  routeRef?: RouteRef;
  loader: (
    actions: readonly CatalogItemActionDescriptor[],
  ) => Promise<JSX.Element>;
}) {
  return PageBlueprint.make({
    name: 'catalog',
    params: {
      path: options.path,
      title: 'Portal content',
      routeRef: options.routeRef,
      noHeader: true,
      loader: async () => (
        <ContributionPage loader={api => options.loader(api.catalogActions)} />
      ),
    },
  });
}
