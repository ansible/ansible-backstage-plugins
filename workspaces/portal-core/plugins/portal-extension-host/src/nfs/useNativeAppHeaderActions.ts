import { useEffect, useState } from 'react';
import {
  appTreeApiRef,
  configApiRef,
  useApi,
  useApiHolder,
} from '@backstage/frontend-plugin-api';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import {
  portalContributionsApiRef,
  type ResolvedAppHeaderAction,
} from '@ansible/portal-extension-api/alpha';
import {
  collectAppHeaderActions,
  resolveAppHeaderActionPath,
} from './appHeaderActions';

/** Fail closed while resolving navigation visibility; destination pages still authorize access. */
export function useNativeAppHeaderActions(
  group: 'create',
): readonly ResolvedAppHeaderAction[] {
  const appTree = useApi(appTreeApiRef);
  const holder = useApiHolder();
  const provider = holder.get(portalContributionsApiRef);
  const config = holder.get(configApiRef);
  const permissions = provider ? holder.get(permissionApiRef) : undefined;
  const [state, setState] = useState<{
    provider: typeof provider;
    appTree: typeof appTree;
    config: typeof config;
    permissions: typeof permissions;
    group: typeof group;
    actions: ResolvedAppHeaderAction[];
  }>();
  useEffect(() => {
    let cancelled = false;
    async function evaluate() {
      const actions = await Promise.all(
        collectAppHeaderActions(provider?.appHeaderActions ?? []).map(
          async action => {
            try {
              if (
                action.group !== group ||
                (action.enabledByConfig &&
                  config?.getOptionalBoolean(action.enabledByConfig) !== true)
              )
                return undefined;
              const path = resolveAppHeaderActionPath(action, appTree);
              if (!path) return undefined;
              const requirement = action.requiredPermission;
              const decision = await permissions?.authorize(
                'permission' in requirement
                  ? requirement
                  : { permission: requirement },
              );
              return decision?.result === AuthorizeResult.ALLOW
                ? { id: action.id, title: action.title, path }
                : undefined;
            } catch {
              return undefined;
            }
          },
        ),
      );
      if (!cancelled)
        setState({
          provider,
          appTree,
          config,
          permissions,
          group,
          actions: actions.filter(
            (action): action is ResolvedAppHeaderAction => action !== undefined,
          ),
        });
    }
    void evaluate();
    return () => {
      cancelled = true;
    };
  }, [provider, appTree, config, permissions, group]);
  if (
    state?.provider !== provider ||
    state?.appTree !== appTree ||
    state?.config !== config ||
    state?.permissions !== permissions ||
    state?.group !== group
  )
    return [];
  return state.actions;
}
