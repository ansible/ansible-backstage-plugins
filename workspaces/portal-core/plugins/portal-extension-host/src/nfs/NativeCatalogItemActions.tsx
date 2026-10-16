import { useCallback, useMemo } from 'react';
import { type Entity, stringifyEntityRef } from '@backstage/catalog-model';
import { useApiHolder } from '@backstage/core-plugin-api';
import { portalEntitlementsApiRef } from '@ansible/portal-extension-api';
import { portalContributionsApiRef } from '@ansible/portal-extension-api/alpha';
import { PortalCatalogItemActions } from './PortalCatalogItemActions';
import type { EntitlementCheck } from './useEligibleContributions';

/** Append to an existing host row menu without depending on any contributor. */
export function NativeCatalogItemActions({
  entity,
  contentType,
  onSubjectRemoved,
}: {
  entity: Entity;
  contentType: string;
  onSubjectRemoved?: () => void;
}) {
  const holder = useApiHolder();
  const provider = holder.get(portalContributionsApiRef);
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
  const checkEntitlement = useCallback<EntitlementCheck>(
    async (requirement, subject) =>
      (
        await entitlements?.check(
          requirement.id,
          stringifyEntityRef(subject.entity),
        )
      )?.allowed === true,
    [entitlements],
  );
  return provider ? (
    <PortalCatalogItemActions
      actions={provider.catalogActions}
      context={context}
      checkEntitlement={checkEntitlement}
      presentation="menu-item"
      onSubjectRemoved={onSubjectRemoved}
    />
  ) : null;
}
