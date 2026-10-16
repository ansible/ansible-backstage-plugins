import type { CatalogItemActionDescriptor } from '@ansible/portal-extension-api/alpha';
import { collectOperationActions } from './validateEntityAction';

/** The mutation contract is shared; catalog actions have a separate identity/lifecycle. */
export function collectCatalogItemActions(
  actions: readonly CatalogItemActionDescriptor[],
  hostApiVersion = '0.1.0',
) {
  return collectOperationActions(actions, 'catalog', hostApiVersion);
}
