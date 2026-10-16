import { lazy, Suspense, useCallback, useMemo } from 'react';
import { CircularProgress, Grid } from '@material-ui/core';
import { stringifyEntityRef } from '@backstage/catalog-model';
import type {
  EntityContributionContext,
  EntityDetailTabDescriptor,
  EntityOverviewCardDescriptor,
} from '@ansible/portal-extension-api/alpha';
import { ContributionWrapper } from '../ContributionWrapper';
import { ErrorBoundary } from '../ErrorBoundary';
import { resolveEntityContribution } from './useEligibleContributions';

function OverviewCard({
  card,
  context,
  eligibleTabs,
  onSelect,
}: {
  card: EntityOverviewCardDescriptor;
  context: EntityContributionContext;
  eligibleTabs?: readonly EntityDetailTabDescriptor[];
  onSelect: (id: string) => void;
}) {
  const destination = eligibleTabs?.find(
    tab =>
      tab.entryPointId === card.detailsEntryPointId &&
      tab.manifest.id === card.manifest.id,
  );
  const openDetails = useCallback(() => {
    if (destination) onSelect(destination.entryPointId);
  }, [destination, onSelect]);
  const waiting = !!card.detailsEntryPointId && !eligibleTabs;
  const Content = useMemo(
    () =>
      waiting
        ? undefined
        : lazy(async () => {
            const element = await card.loader({
              ...context,
              openDetails: destination ? openDetails : undefined,
            });
            return { default: () => element };
          }),
    [card, context, waiting, destination, openDetails],
  );
  return (
    <section aria-label={resolveEntityContribution(card).entry?.label}>
      <ContributionWrapper>
        <ErrorBoundary contributionId={card.entryPointId}>
          <Suspense
            fallback={<CircularProgress aria-label="Loading overview card" />}
          >
            {Content ? (
              <Content />
            ) : (
              <CircularProgress aria-label="Loading card navigation" />
            )}
          </Suspense>
        </ErrorBoundary>
      </ContributionWrapper>
    </section>
  );
}

/** Only eligible cards reach loaders; the host owns layout and attachment regions. */
export function PortalEntityOverviewCards({
  eligibleCards,
  eligibleTabs,
  context,
  onSelect,
}: {
  eligibleCards?: readonly EntityOverviewCardDescriptor[];
  eligibleTabs?: readonly EntityDetailTabDescriptor[];
  context: EntityContributionContext;
  onSelect: (id: string) => void;
}) {
  if (!eligibleCards)
    return <CircularProgress aria-label="Loading available overview cards" />;
  if (eligibleCards.length === 0) return null;
  const subjectKey = `${stringifyEntityRef(context.entity)}:${
    context.contentType
  }`;
  return (
    <Grid container spacing={2}>
      {(['entity.overview.main', 'entity.overview.secondary'] as const).map(
        region => {
          const cards = eligibleCards.filter(
            card => card.attachment === region,
          );
          if (cards.length === 0) return null;
          return (
            <Grid
              item
              xs={12}
              md={region === 'entity.overview.main' ? 8 : 4}
              key={region}
            >
              <div
                role="region"
                aria-label={region}
                style={{ display: 'grid', gap: 16 }}
              >
                {cards.map(card => (
                  <OverviewCard
                    key={`${subjectKey}:${card.entryPointId}`}
                    card={card}
                    context={context}
                    eligibleTabs={eligibleTabs}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </Grid>
          );
        },
      )}
    </Grid>
  );
}
