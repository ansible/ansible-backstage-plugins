import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { stringifyEntityRef, type Entity } from '@backstage/catalog-model';
import { configApiRef, useApiHolder } from '@backstage/core-plugin-api';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { Tooltip } from '@material-ui/core';
import { portalEntitlementsApiRef } from '@ansible/portal-extension-api';
import {
  portalContributionsApiRef,
  type CatalogTableColumnDescriptor,
} from '@ansible/portal-extension-api/alpha';
import { ErrorBoundary } from '../ErrorBoundary';
import { DEFAULT_EXPERIENCES } from './PortalEntityTabs';
import {
  resolveEntityContribution,
  useEligibleContributions,
  type EntitlementCheck,
} from './useEligibleContributions';

function CatalogCell({
  column,
  entity,
  contentType,
}: {
  column: CatalogTableColumnDescriptor;
  entity: Entity;
  contentType: string;
}) {
  const holder = useApiHolder();
  const entitlements = holder.get(portalEntitlementsApiRef);
  const context = useMemo(
    () => ({
      entity,
      contentType,
      sourceKinds: entity.metadata.annotations?.[
        'backstage.io/source-location'
      ]?.startsWith('url:')
        ? ['git']
        : undefined,
    }),
    [entity, contentType],
  );
  const declarations = useMemo(() => [column], [column]);
  const check = useCallback<EntitlementCheck>(
    async (requirement, subject) =>
      (
        await entitlements?.check(
          requirement.id,
          stringifyEntityRef(subject.entity),
        )
      )?.allowed === true,
    [entitlements],
  );
  const eligible = useEligibleContributions(
    declarations,
    context,
    DEFAULT_EXPERIENCES,
    check,
  );
  const Cell = useMemo(
    () =>
      lazy(async () => {
        const element = await column.loader(context);
        return { default: () => element };
      }),
    [column, context],
  );
  if (!eligible?.length) return null;
  return (
    <ErrorBoundary contributionId={column.entryPointId}>
      <Suspense fallback={<span>…</span>}>
        <Cell />
      </Suspense>
    </ErrorBoundary>
  );
}

/** Table-shape adapter; each cell is independently scoped and error-bounded. */
export function useNativeCatalogColumns(contentType: string) {
  const holder = useApiHolder();
  const provider = holder.get(portalContributionsApiRef);
  const config = holder.get(configApiRef);
  const permissions = provider ? holder.get(permissionApiRef) : undefined;
  const [state, setState] = useState<{
    provider: typeof provider;
    contentType: string;
    columns: CatalogTableColumnDescriptor[];
  }>();
  useEffect(() => {
    if (!provider) return undefined;
    let cancelled = false;
    void Promise.all(
      (provider.catalogColumns ?? []).map(async column => {
        try {
          const { capability, entry } = resolveEntityContribution(column);
          if (
            !entry?.appliesToContentTypes.includes(contentType) ||
            !capability ||
            !DEFAULT_EXPERIENCES.some(id => id === capability.experienceId) ||
            (column.enabledByConfig &&
              config?.getOptionalBoolean(column.enabledByConfig) !== true)
          )
            return undefined;
          if (entry.requiredPermission) {
            const request = entry.requiredPermission;
            if (
              (
                await permissions?.authorize(
                  'permission' in request ? request : { permission: request },
                )
              )?.result !== AuthorizeResult.ALLOW
            )
              return undefined;
          }
          return column;
        } catch {
          return undefined;
        }
      }),
    ).then(matches => {
      if (!cancelled)
        setState({
          provider,
          contentType,
          columns: matches.filter(
            (item): item is CatalogTableColumnDescriptor => Boolean(item),
          ),
        });
    });
    return () => {
      cancelled = true;
    };
  }, [provider, contentType, config, permissions]);
  return useMemo(
    () =>
      state?.provider === provider && state?.contentType === contentType
        ? state.columns.map(column => ({
            id: column.entryPointId,
            title: column.tooltip ? (
              <Tooltip title={column.tooltip}>
                <span>{resolveEntityContribution(column).entry!.label}</span>
              </Tooltip>
            ) : (
              resolveEntityContribution(column).entry!.label
            ),
            sorting: false,
            render: (entity: Entity) => (
              <CatalogCell
                column={column}
                entity={entity}
                contentType={contentType}
              />
            ),
          }))
        : [],
    [state, provider, contentType],
  );
}
