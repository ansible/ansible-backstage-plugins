import {
  coreExtensionData,
  type AppTreeApi,
} from '@backstage/frontend-plugin-api';

/** Accept only canonical, app-relative page paths, not arbitrary URLs or subroutes. */
export function isLandingPath(path: string): boolean {
  return (
    /^\/[A-Za-z0-9_.~-]+(?:\/[A-Za-z0-9_.~-]+)*$/.test(path) &&
    !path.split('/').some(segment => segment === '.' || segment === '..')
  );
}

/** Inspect mounted page metadata without loading a contributor's page component. */
export function resolveLandingDestination(
  appTree: AppTreeApi,
  destination = '/self-service',
): string | undefined {
  if (!isLandingPath(destination)) return undefined;

  const { tree } = appTree.getTree();
  const installed = Array.from(tree.nodes.values()).some(
    node =>
      node.spec.id !== 'page:portal/landing' &&
      !node.spec.disabled &&
      node.edges.attachedTo?.node.spec.id === 'app/routes' &&
      node.edges.attachedTo.input === 'routes' &&
      node.instance?.getData(coreExtensionData.routePath) === destination,
  );
  return installed ? destination : undefined;
}
