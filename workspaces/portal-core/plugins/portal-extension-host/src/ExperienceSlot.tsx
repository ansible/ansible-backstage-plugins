import { Suspense, type ComponentType } from 'react';
import { CircularProgress } from '@material-ui/core';
import type { Entity } from '@backstage/catalog-model';
import {
  useExtensionCards,
  useExtensionTabs,
  type CardContribution,
  type TabContribution,
} from '@ansible/portal-extension-api';
import { ErrorBoundary } from './ErrorBoundary';

const Fallback = () => (
  <CircularProgress
    size={24}
    style={{ display: 'block', margin: '16px auto' }}
  />
);

// ── Inner renderers (defined first to satisfy no-use-before-define) ───────────

/** Inner renderer for a single card contribution. */
const CardContributionContent = ({
  contribution,
  entity,
}: {
  contribution: CardContribution;
  entity?: Entity;
}) => {
  const Component = contribution.component as ComponentType<{
    entity?: Entity;
  }>;
  return <Component entity={entity} />;
};

/** Inner renderer for a single tab contribution. */
const TabContributionContent = ({
  contribution,
  entity,
}: {
  contribution: TabContribution;
  entity?: Entity;
}) => {
  const Component = contribution.component as ComponentType<{
    entity?: Entity;
  }>;
  return <Component entity={entity} />;
};

// ── Card slot ─────────────────────────────────────────────────────────────────

interface CardSlotProps {
  /**
   * Extension point ID (from `EXTENSION_POINTS`). Selects which contributions
   * are rendered in this slot.
   */
  extensionPoint: string;
  entity?: Entity;
  /**
   * Canonical content type ID (from `CONTENT_TYPES`). Contributions whose
   * `appliesToContentTypes` does not include this value are excluded.
   */
  contentType?: string;
  /**
   * Wrapper element around the full slot. Defaults to a plain `<div>`.
   * Useful for applying layout styles (grid, stack, gap) without adding DOM
   * nesting inside each contribution.
   */
  slotWrapper?: ComponentType<{ children: React.ReactNode }>;
}

/**
 * Renders all card contributions registered for `extensionPoint`, stacking
 * them vertically. Each contribution is individually wrapped in an
 * `ErrorBoundary` and `Suspense` so one broken card cannot take down the
 * page.
 *
 * Returns `null` when no contributions are registered (no empty state — the
 * surrounding page decides how to handle the empty case).
 *
 * @example
 * ```tsx
 * <ExperienceCardSlot
 *   extensionPoint={EXTENSION_POINTS.COLLECTION_DETAIL_CARDS}
 *   entity={entity}
 *   contentType={CONTENT_TYPES.COLLECTION}
 * />
 * ```
 */
export const ExperienceCardSlot = ({
  extensionPoint,
  entity,
  contentType,
  slotWrapper: SlotWrapper,
}: CardSlotProps) => {
  const cards = useExtensionCards(extensionPoint, entity, contentType);

  if (cards.length === 0) return null;

  const rendered = cards.map(card => (
    <ErrorBoundary key={card.id} contributionId={card.id}>
      <Suspense fallback={<Fallback />}>
        <CardContributionContent contribution={card} entity={entity} />
      </Suspense>
    </ErrorBoundary>
  ));

  if (SlotWrapper) return <SlotWrapper>{rendered}</SlotWrapper>;
  return <>{rendered}</>;
};

// ── Tab slot ──────────────────────────────────────────────────────────────────

interface TabSlotProps {
  extensionPoint: string;
  entity?: Entity;
  contentType?: string;
}

/**
 * Renders the **content** of all tab contributions registered for
 * `extensionPoint`. The tab *strip* (the `<Tabs>` + `<Tab>` elements) is
 * owned by the detail page because it must be interleaved with built-in tabs.
 * This component renders the panel for a given tab index within the extension
 * tab list.
 *
 * @param activeTabIndex - 0-based index into the extension tabs list (not the
 *   global tab index that includes built-in tabs).
 *
 * @example
 * ```tsx
 * // In the detail page, after COLLECTION_BUILT_IN_TABS:
 * {tab >= COLLECTION_BUILT_IN_TABS && (
 *   <ExperienceTabContent
 *     extensionPoint={EXTENSION_POINTS.COLLECTION_DETAIL_TABS}
 *     entity={entity}
 *     contentType={CONTENT_TYPES.COLLECTION}
 *     activeTabIndex={tab - COLLECTION_BUILT_IN_TABS}
 *   />
 * )}
 * ```
 */
export const ExperienceTabContent = ({
  extensionPoint,
  entity,
  contentType,
  activeTabIndex,
}: TabSlotProps & { activeTabIndex: number }) => {
  const tabs = useExtensionTabs(extensionPoint, entity, contentType);
  const contribution = tabs[activeTabIndex];

  if (!contribution) return null;

  return (
    <ErrorBoundary contributionId={contribution.id}>
      <Suspense fallback={<Fallback />}>
        <TabContributionContent contribution={contribution} entity={entity} />
      </Suspense>
    </ErrorBoundary>
  );
};
