import { useEffect, useState } from 'react';
import {
  appTreeApiRef,
  configApiRef,
  useApi,
  useApiHolder,
} from '@backstage/frontend-plugin-api';
import { identityApiRef, type ApiHolder } from '@backstage/core-plugin-api';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import {
  portalContributionsApiRef,
  type AppProfileMenuItemDescriptor,
  type ResolvedAppProfileMenuItem,
} from '@ansible/portal-extension-api/alpha';
import { collectAppProfileMenuItems } from './appProfileMenuItems';
import { resolveProfileMenuPath } from './profileMenuTargets';

async function isEligible(item: AppProfileMenuItemDescriptor, apis: ApiHolder) {
  if (
    item.enabledByConfig &&
    apis.get(configApiRef)?.getOptionalBoolean(item.enabledByConfig) !== true
  )
    return false;
  const identity = await apis.get(identityApiRef)?.getBackstageIdentity();
  if (identity?.type !== 'user' || !identity.userEntityRef) return false;
  if (item.authorization.type === 'authenticated') return true;
  const requirement = item.authorization.requirement;
  const decision = await apis
    .get(permissionApiRef)
    ?.authorize(
      'permission' in requirement ? requirement : { permission: requirement },
    );
  return decision?.result === AuthorizeResult.ALLOW;
}

/** Resolve metadata first; lazy action code runs only after a deliberate activation. */
export function useNativeAppProfileMenuItems(): readonly ResolvedAppProfileMenuItem[] {
  const tree = useApi(appTreeApiRef);
  const apis = useApiHolder();
  const provider = apis.get(portalContributionsApiRef);
  const [state, setState] = useState<{
    tree: typeof tree;
    apis: typeof apis;
    provider: typeof provider;
    items: ResolvedAppProfileMenuItem[];
  }>();
  useEffect(() => {
    let cancelled = false;
    async function resolveItems() {
      const resolved = await Promise.all(
        collectAppProfileMenuItems(provider?.appProfileMenuItems ?? []).map(
          async item => {
            try {
              const path =
                item.type === 'navigation'
                  ? resolveProfileMenuPath(item, tree)
                  : undefined;
              if (
                (item.type === 'navigation' && !path) ||
                !(await isEligible(item, apis))
              )
                return undefined;
              if (item.type === 'navigation')
                return {
                  id: item.id,
                  title: item.title,
                  type: 'navigation' as const,
                  path: path!,
                };
              return {
                id: item.id,
                title: item.title,
                type: 'action' as const,
                activate: async (beforeActivate?: () => void) => {
                  if (cancelled || !(await isEligible(item, apis)))
                    throw new Error('Profile action is no longer available');
                  const action = await item.loadAction();
                  if (cancelled) return;
                  if (typeof action !== 'function')
                    throw new Error('Invalid profile action implementation');
                  beforeActivate?.();
                  await action({ apis });
                },
              };
            } catch {
              return undefined;
            }
          },
        ),
      );
      if (!cancelled)
        setState({
          tree,
          apis,
          provider,
          items: resolved.filter(
            (item): item is ResolvedAppProfileMenuItem => item !== undefined,
          ),
        });
    }
    void resolveItems();
    return () => {
      cancelled = true;
    };
  }, [tree, apis, provider]);
  return state?.tree === tree &&
    state.apis === apis &&
    state.provider === provider
    ? state.items
    : [];
}
