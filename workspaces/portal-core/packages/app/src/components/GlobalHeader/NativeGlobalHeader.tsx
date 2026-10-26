import {
  appTreeApiRef,
  coreExtensionData,
  useApi,
} from '@backstage/frontend-plugin-api';
import { compatWrapper } from '@backstage/core-compat-api';
import { GlobalHeader } from './GlobalHeader';

/** Resolve the optional Templates destination from mounted native metadata. */
export function NativeGlobalHeader() {
  const appTree = useApi(appTreeApiRef);
  const page = appTree.getTree().tree.nodes.get('page:portal-scaffolder');
  const path =
    !page?.spec.disabled &&
    page?.edges.attachedTo?.node.spec.id === 'app/routes' &&
    page.edges.attachedTo.input === 'routes'
      ? page.instance?.getData(coreExtensionData.routePath)
      : undefined;
  return compatWrapper(<GlobalHeader createPath={path} />);
}
