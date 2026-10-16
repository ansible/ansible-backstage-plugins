import { useEffect, useState } from 'react';
import { configApiRef, useApiHolder } from '@backstage/core-plugin-api';
import { LinkButton } from '@backstage/core-components';
import { parseEntityRef } from '@backstage/catalog-model';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { EXPERIENCE_IDS } from '@ansible/portal-extension-api';
import {
  portalContributionsApiRef,
  type CatalogHeaderActionDescriptor,
} from '@ansible/portal-extension-api/alpha';
import { resolveCatalogHeaderAction } from './catalogHeaderActions';

/** The host supplies routing. Contributors supply only validated catalog identities. */
export function NativeCatalogHeaderActions({
  contentType,
  templatePath,
}: {
  contentType: string;
  templatePath: (namespace: string, name: string) => string;
}) {
  const holder = useApiHolder();
  const provider = holder.get(portalContributionsApiRef);
  const config = holder.get(configApiRef);
  const permissions = provider ? holder.get(permissionApiRef) : undefined;
  const [state, setState] = useState<{
    provider: typeof provider;
    contentType: string;
    actions: CatalogHeaderActionDescriptor[];
  }>();
  useEffect(() => {
    let cancelled = false;
    async function evaluate() {
      const matches = await Promise.all(
        (provider?.catalogHeaderActions ?? []).map(async action => {
          try {
            const { capability, entry } = resolveCatalogHeaderAction(action);
            if (
              !entry ||
              !capability ||
              !entry.appliesToContentTypes.includes(contentType) ||
              !Object.values(EXPERIENCE_IDS).includes(
                capability.experienceId as (typeof EXPERIENCE_IDS)[keyof typeof EXPERIENCE_IDS],
              ) ||
              (action.enabledByConfig &&
                config?.getOptionalBoolean(action.enabledByConfig) !== true) ||
              !entry.requiredPermission
            )
              return undefined;
            const requirement = entry.requiredPermission;
            const decision = await permissions?.authorize(
              'permission' in requirement
                ? requirement
                : { permission: requirement },
            );
            return decision?.result === AuthorizeResult.ALLOW
              ? action
              : undefined;
          } catch {
            return undefined;
          }
        }),
      );
      if (!cancelled)
        setState({
          provider,
          contentType,
          actions: matches.filter(
            (item): item is CatalogHeaderActionDescriptor => Boolean(item),
          ),
        });
    }
    void evaluate();
    return () => {
      cancelled = true;
    };
  }, [provider, contentType, config, permissions]);
  if (state?.provider !== provider || state?.contentType !== contentType)
    return null;
  return (
    <>
      {state.actions.map(action => {
        const { entry } = resolveCatalogHeaderAction(action);
        const launch = entry?.launches;
        const workflow = provider?.scaffolderWorkflows?.find(
          item =>
            launch?.type === 'workflow' &&
            item.workflowId === launch.workflowId,
        );
        if (!entry || !workflow) return null;
        const ref = parseEntityRef(workflow.templateRef);
        return (
          <LinkButton
            key={entry.id}
            variant="contained"
            color="primary"
            to={templatePath(ref.namespace, ref.name)}
          >
            {entry.label}
          </LinkButton>
        );
      })}
    </>
  );
}
