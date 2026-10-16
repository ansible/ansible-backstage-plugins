import { lazy, useEffect, useMemo, useState } from 'react';
import { configApiRef, useApiHolder } from '@backstage/core-plugin-api';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import {
  EXPERIENCE_IDS,
  type TabContribution,
} from '@ansible/portal-extension-api';
import {
  portalContributionsApiRef,
  type CatalogContributionContext,
  type CatalogTabDescriptor,
} from '@ansible/portal-extension-api/alpha';
import { resolveCatalogTab } from './catalogTabs';

/** Layout adapter only; no global registry or fake entity for catalog scope. */
export function useNativeCatalogTabs(context: CatalogContributionContext) {
  const holder = useApiHolder();
  const provider = holder.get(portalContributionsApiRef);
  const config = holder.get(configApiRef);
  const permissions = provider ? holder.get(permissionApiRef) : undefined;
  const [state, setState] = useState<{
    provider: typeof provider;
    context: CatalogContributionContext;
    tabs: CatalogTabDescriptor[];
  }>();
  useEffect(() => {
    if (!provider) return undefined;
    let cancelled = false;
    async function evaluate() {
      const matches = await Promise.all(
        (provider?.catalogTabs ?? []).map(async tab => {
          try {
            const { capability, entry } = resolveCatalogTab(tab);
            if (
              !capability ||
              !entry ||
              !entry.appliesToContentTypes.includes(context.contentType) ||
              !Object.values(EXPERIENCE_IDS).some(
                id => id === capability.experienceId,
              ) ||
              (tab.enabledByConfig &&
                config?.getOptionalBoolean(tab.enabledByConfig) !== true)
            )
              return undefined;
            if (entry.requiredPermission) {
              const requirement = entry.requiredPermission;
              const decision = await permissions?.authorize(
                'permission' in requirement
                  ? requirement
                  : { permission: requirement },
              );
              if (decision?.result !== AuthorizeResult.ALLOW) return undefined;
            }
            return tab;
          } catch {
            return undefined;
          }
        }),
      );
      if (!cancelled)
        setState({
          provider,
          context,
          tabs: matches.filter((item): item is CatalogTabDescriptor =>
            Boolean(item),
          ),
        });
    }
    void evaluate();
    return () => {
      cancelled = true;
    };
  }, [provider, context, config, permissions]);
  const tabs =
    state?.provider === provider && state?.context === context
      ? state.tabs
      : undefined;
  const presentation = useMemo<TabContribution[]>(
    () =>
      (tabs ?? []).map(tab => ({
        id: tab.entryPointId,
        label: resolveCatalogTab(tab).entry!.label,
        component: lazy(async () => {
          const element = await tab.loader(context);
          return { default: () => element };
        }),
      })),
    [tabs, context],
  );
  return provider ? presentation : undefined;
}
