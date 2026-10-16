import { lazy, Suspense, useMemo, useState } from 'react';
import { Tab, Tabs, CircularProgress } from '@material-ui/core';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { EXPERIENCE_IDS } from '@ansible/portal-extension-api';
import type {
  EntityContributionContext,
  EntityDetailTabDescriptor,
} from '@ansible/portal-extension-api/alpha';
import { ContributionWrapper } from '../ContributionWrapper';
import { ErrorBoundary } from '../ErrorBoundary';
import { resolveEntityTab } from './validateEntityTab';
import {
  useEligibleContributions,
  type EntitlementCheck,
} from './useEligibleContributions';

export type { EntitlementCheck } from './useEligibleContributions';
export const DEFAULT_EXPERIENCES = Object.values(EXPERIENCE_IDS);

/** Shared presentation for standalone tabs and the entity action/results surface. */
export function PortalEntityTabContent({
  eligible,
  context,
  selectedId,
  onSelect,
}: {
  eligible?: readonly EntityDetailTabDescriptor[];
  context: EntityContributionContext;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const selected =
    eligible?.find(tab => tab.entryPointId === selectedId) ?? eligible?.[0];
  const Content = useMemo(
    () =>
      selected
        ? lazy(async () => {
            const element = await selected.loader(context);
            return { default: () => element };
          })
        : undefined,
    [selected, context],
  );
  if (!eligible)
    return <CircularProgress aria-label="Loading available tabs" />;
  if (!selected || !Content) return null;
  return (
    <>
      <Tabs
        value={selected.entryPointId}
        onChange={(_, id) => onSelect(id)}
        aria-label="Entity details"
      >
        {eligible.map(tab => (
          <Tab
            key={tab.entryPointId}
            id={`tab-${tab.entryPointId}`}
            aria-controls={`panel-${tab.entryPointId}`}
            aria-selected={tab === selected}
            value={tab.entryPointId}
            label={resolveEntityTab(tab).entry?.label}
          />
        ))}
      </Tabs>
      <div
        role="tabpanel"
        id={`panel-${selected.entryPointId}`}
        aria-labelledby={`tab-${selected.entryPointId}`}
      >
        <ContributionWrapper>
          <ErrorBoundary
            key={`${selected.entryPointId}:${
              context.entity.metadata.uid ?? stringifyEntityRef(context.entity)
            }:${context.contentType}`}
            contributionId={selected.entryPointId}
          >
            <Suspense fallback={<CircularProgress aria-label="Loading tab" />}>
              <Content />
            </Suspense>
          </ErrorBoundary>
        </ContributionWrapper>
      </div>
    </>
  );
}

/** Host-owned tab navigation. Works inside compatWrapper in an NFS page. */
export function PortalEntityTabs({
  tabs,
  context,
  availableExperiences = DEFAULT_EXPERIENCES,
  checkEntitlement,
}: {
  tabs: readonly EntityDetailTabDescriptor[];
  context: EntityContributionContext;
  availableExperiences?: readonly string[];
  checkEntitlement?: EntitlementCheck;
}) {
  const eligible = useEligibleContributions(
    tabs,
    context,
    availableExperiences,
    checkEntitlement,
  );
  const [selectedId, setSelectedId] = useState<string>();
  return (
    <PortalEntityTabContent
      eligible={eligible}
      context={context}
      selectedId={selectedId}
      onSelect={setSelectedId}
    />
  );
}
