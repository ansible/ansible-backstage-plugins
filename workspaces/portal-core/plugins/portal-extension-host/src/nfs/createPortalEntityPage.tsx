import { PageBlueprint } from '@backstage/frontend-plugin-api';
import type {
  EntityOverviewCardDescriptor,
  EntityActionDescriptor,
  EntityDetailTabDescriptor,
} from '@ansible/portal-extension-api/alpha';
import { ContributionPage } from './ContributionPage';

/** Pages consume the host provider; contributions no longer attach to a route. */
export function createPortalEntityPage(options: {
  path: string;
  loader: (
    tabs: readonly EntityDetailTabDescriptor[],
    actions: readonly EntityActionDescriptor[],
    cards: readonly EntityOverviewCardDescriptor[],
  ) => Promise<JSX.Element>;
}) {
  return PageBlueprint.make({
    name: 'entity',
    params: {
      path: options.path,
      loader: async () => (
        <ContributionPage
          loader={api => options.loader(api.tabs, api.actions, api.cards)}
        />
      ),
    },
  });
}
