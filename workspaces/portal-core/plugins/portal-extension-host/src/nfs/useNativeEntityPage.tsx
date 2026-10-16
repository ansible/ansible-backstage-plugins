import { Fragment, lazy, useCallback, useMemo, useState } from 'react';
import { type Entity, stringifyEntityRef } from '@backstage/catalog-model';
import { useApiHolder } from '@backstage/core-plugin-api';
import {
  portalEntitlementsApiRef,
  type TabContribution,
  type CardContribution,
} from '@ansible/portal-extension-api';
import {
  portalContributionsApiRef,
  type EntityContributionContext,
  type PortalContributionsApi,
} from '@ansible/portal-extension-api/alpha';
import { DEFAULT_EXPERIENCES } from './PortalEntityTabs';
import {
  useEligibleContributions,
  resolveEntityContribution,
  type EntitlementCheck,
} from './useEligibleContributions';

const EMPTY: PortalContributionsApi = {
  tabs: [],
  actions: [],
  cards: [],
  catalogActions: [],
};
const UNLOADED: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'unloaded' },
};

/** Layout adapter only: NFS descriptors remain the source of truth, never the registry. */
export function useNativeEntityPage(
  entity: Entity | null | undefined,
  contentType: string,
  onSelect: (index: number) => void,
) {
  const holder = useApiHolder();
  const provider = holder.get(portalContributionsApiRef);
  const entitlements = holder.get(portalEntitlementsApiRef);
  const declarations = provider ?? EMPTY;
  const context = useMemo<EntityContributionContext>(
    () => ({
      entity: entity ?? UNLOADED,
      contentType,
      sourceKinds: entity?.metadata.annotations?.[
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
  const tabs = useEligibleContributions(
    entity ? declarations.tabs : EMPTY.tabs,
    context,
    DEFAULT_EXPERIENCES,
    checkEntitlement,
  );
  const cards = useEligibleContributions(
    entity ? declarations.cards : EMPTY.cards,
    context,
    DEFAULT_EXPERIENCES,
    checkEntitlement,
  );
  const actions = useEligibleContributions(
    entity ? declarations.actions : EMPTY.actions,
    context,
    DEFAULT_EXPERIENCES,
    checkEntitlement,
  );
  const [resultsRevision, setResultsRevision] = useState(0);
  const select = useCallback(
    (id: string) => {
      const index = tabs?.findIndex(tab => tab.entryPointId === id) ?? -1;
      if (index >= 0) {
        onSelect(index);
        setResultsRevision(revision => revision + 1);
      }
    },
    [tabs, onSelect],
  );
  const presentationTabs = useMemo<TabContribution[]>(
    () =>
      (tabs ?? []).map(tab => ({
        id: tab.entryPointId,
        label: resolveEntityContribution(tab).entry!.label,
        component: lazy(async () => {
          const element = await tab.loader(context);
          return {
            default: () => <Fragment key={resultsRevision}>{element}</Fragment>,
          };
        }),
      })),
    [tabs, context, resultsRevision],
  );
  const presentationCards = useMemo<CardContribution[]>(
    () =>
      (cards ?? []).map(card => {
        const destination = tabs?.find(
          tab =>
            tab.entryPointId === card.detailsEntryPointId &&
            tab.manifest.id === card.manifest.id,
        );
        return {
          id: card.entryPointId,
          slot:
            card.attachment === 'entity.overview.main'
              ? 'overview-left'
              : 'overview-right',
          component: lazy(async () => {
            const element = await card.loader({
              ...context,
              openDetails: destination
                ? () => select(destination.entryPointId)
                : undefined,
            });
            return {
              default: () => (
                <Fragment key={resultsRevision}>{element}</Fragment>
              ),
            };
          }),
        };
      }),
    [cards, tabs, context, select, resultsRevision],
  );
  return provider
    ? {
        tabs: presentationTabs,
        cards: presentationCards,
        actions: actions ?? [],
        eligibleTabs: tabs,
        context,
        onSelect: select,
      }
    : undefined;
}
