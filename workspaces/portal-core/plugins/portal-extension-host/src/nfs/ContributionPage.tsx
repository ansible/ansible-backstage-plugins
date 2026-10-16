import { lazy, Suspense, useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { CircularProgress } from '@material-ui/core';
import {
  portalContributionsApiRef,
  type PortalContributionsApi,
} from '@ansible/portal-extension-api/alpha';

export function ContributionPage({
  loader,
}: {
  loader: (api: PortalContributionsApi) => Promise<JSX.Element>;
}) {
  const api = useApi(portalContributionsApiRef);
  const Content = useMemo(
    () =>
      lazy(async () => {
        const element = await loader(api);
        return { default: () => element };
      }),
    [api, loader],
  );
  return (
    <Suspense fallback={<CircularProgress aria-label="Loading content page" />}>
      <Content />
    </Suspense>
  );
}
