import { PageBlueprint, type RouteRef } from '@backstage/frontend-plugin-api';
import type { ScaffolderFieldDescriptor } from '@ansible/portal-extension-api/alpha';
import { ContributionPage } from './ContributionPage';
import { collectScaffolderFields } from './validateScaffolderField';

/** Optional templates adapter; field declarations belong to the Portal collector. */
export function createPortalScaffolderPage(options: {
  path: string;
  routeRef: RouteRef;
  /** Optional additional restriction; the Portal provider validates the host contract. */
  hostApiVersion?: string;
  loader: (
    fields: readonly ScaffolderFieldDescriptor[],
  ) => Promise<JSX.Element>;
}) {
  return PageBlueprint.make({
    name: 'templates',
    params: {
      path: options.path,
      routeRef: options.routeRef,
      title: 'Templates',
      noHeader: true,
      loader: () =>
        Promise.resolve(
          <ContributionPage
            loader={api => {
              const fields = api.scaffolderFields ?? [];
              return options.loader(
                options.hostApiVersion === undefined
                  ? fields
                  : collectScaffolderFields(fields, options.hostApiVersion),
              );
            }}
          />,
        ),
    },
  });
}
