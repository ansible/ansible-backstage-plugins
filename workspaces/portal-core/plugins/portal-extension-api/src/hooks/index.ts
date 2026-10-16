import { useReducer, useEffect, useMemo } from 'react';
import type { Entity } from '@backstage/catalog-model';
import { contributionRegistry } from '../registry';
import type {
  TabContribution,
  CardContribution,
  ActionContribution,
} from '../types';

function useRevision(): number {
  const [revision, forceUpdate] = useReducer((x: number) => x + 1, 0);
  useEffect(() => contributionRegistry.subscribe(forceUpdate), []);
  return revision;
}

/**
 * Returns sorted, filtered tab contributions for the given extension point.
 * Re-renders automatically when late-loading plugins register contributions.
 *
 * @param extensionPoint - The extension point ID (from `EXTENSION_POINTS`).
 * @param entity - The catalog entity being displayed. Used for `filter()` predicates.
 * @param contentType - The canonical content type of the current page (from `CONTENT_TYPES`).
 *   Contributions whose `appliesToContentTypes` does not include this value are excluded.
 *   Pass `undefined` to skip content-type filtering (shows all contributions).
 */
export function useExtensionTabs(
  extensionPoint: string,
  entity?: Entity,
  contentType?: string,
): TabContribution[] {
  const revision = useRevision();
  return useMemo(
    () => contributionRegistry.getTabs(extensionPoint, entity, contentType),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [extensionPoint, entity, contentType, revision],
  );
}

/**
 * Returns sorted, filtered card contributions for the given extension point.
 * Re-renders automatically when late-loading plugins register contributions.
 *
 * @param extensionPoint - The extension point ID (from `EXTENSION_POINTS`).
 * @param entity - The catalog entity being displayed.
 * @param contentType - The canonical content type of the current page (from `CONTENT_TYPES`).
 */
export function useExtensionCards(
  extensionPoint: string,
  entity?: Entity,
  contentType?: string,
): CardContribution[] {
  const revision = useRevision();
  return useMemo(
    () => contributionRegistry.getCards(extensionPoint, entity, contentType),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [extensionPoint, entity, contentType, revision],
  );
}

/**
 * Returns sorted, filtered action contributions for the given extension point.
 * Re-renders automatically when late-loading plugins register contributions.
 *
 * @param extensionPoint - The extension point ID (from `EXTENSION_POINTS`).
 * @param entity - The catalog entity being displayed.
 * @param contentType - The canonical content type of the current page (from `CONTENT_TYPES`).
 */
export function useExtensionActions(
  extensionPoint: string,
  entity?: Entity,
  contentType?: string,
): ActionContribution[] {
  const revision = useRevision();
  return useMemo(
    () => contributionRegistry.getActions(extensionPoint, entity, contentType),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [extensionPoint, entity, contentType, revision],
  );
}
