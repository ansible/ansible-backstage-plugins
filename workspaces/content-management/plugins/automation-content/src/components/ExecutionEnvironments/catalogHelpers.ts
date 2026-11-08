import { parseEntityRef, type Entity } from '@backstage/catalog-model';
import type { ExecutionEnvironment, RepositoryTag } from '../../api';
import type { StatusBadgeTone } from '../common';

/** Reconciliation results older than this are displayed as stale. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/** Six-month verification window (183 days) for indexed execution environments. */
export const VERIFICATION_STALE_AFTER_MS = 183 * 24 * 60 * 60 * 1000;

/**
 * Order registry tags by their per-tag Last-Modified time when available.
 * Registries that do not expose timestamps fall back to natural descending
 * version order, with the mutable `latest` alias explicitly placed last.
 */
export function sortRepositoryTagsNewestFirst(
  tags: readonly RepositoryTag[],
): RepositoryTag[] {
  const timestamp = (tag: RepositoryTag): number | undefined => {
    if (!tag.lastModified) return undefined;
    const parsed = Date.parse(tag.lastModified);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  return [...tags].sort((a, b) => {
    const aTimestamp = timestamp(a);
    const bTimestamp = timestamp(b);
    if (aTimestamp !== undefined && bTimestamp !== undefined) {
      if (aTimestamp !== bTimestamp) return bTimestamp - aTimestamp;
    } else if (aTimestamp !== undefined) {
      return -1;
    } else if (bTimestamp !== undefined) {
      return 1;
    }

    if (a.tag === 'latest' && b.tag !== 'latest') return 1;
    if (b.tag === 'latest' && a.tag !== 'latest') return -1;
    return b.tag.localeCompare(a.tag, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

/** Missing or invalid reconciliation times are not evidence of a recent verification. */
export function isStale(lastReconciledAt?: string, now = Date.now()): boolean {
  if (!lastReconciledAt) return true;
  const reconciledAt = new Date(lastReconciledAt).getTime();
  return (
    !Number.isFinite(reconciledAt) ||
    now - reconciledAt > VERIFICATION_STALE_AFTER_MS
  );
}

/** Match immutable provider annotations, never a mutable tag or truncated entity name. */
export function matchesEnvironment(
  entity: Entity,
  image: ExecutionEnvironment,
): boolean {
  const a = entity.metadata.annotations ?? {};
  return (
    entity.kind.toLowerCase() === 'component' &&
    a['ansible.com/registry'] === image.registry &&
    a['ansible.com/repository'] === image.repository &&
    a['ansible.com/digest'] === image.digest
  );
}

/** Preserve the full digest-scoped reference in one URL segment. */
export function environmentHref(base: string, ref: string): string {
  return `${base}/${encodeURIComponent(ref)}`;
}

function parseDefinitionEntityRef(
  entityRef: string,
): { namespace: string; name: string } | undefined {
  const trimmed = entityRef.trim();
  const kindSeparator = trimmed.indexOf(':');
  const namespaceSeparator = trimmed.indexOf('/', kindSeparator + 1);
  if (
    trimmed !== entityRef ||
    kindSeparator <= 0 ||
    namespaceSeparator <= kindSeparator + 1 ||
    namespaceSeparator === trimmed.length - 1
  ) {
    return undefined;
  }

  try {
    const parsed = parseEntityRef(trimmed);
    if (parsed.kind.toLowerCase() !== 'component') return undefined;
    return { namespace: parsed.namespace, name: parsed.name };
  } catch {
    return undefined;
  }
}

/** Resolve a stable Component ref to its local definition-file details route. */
export function definitionFileHref(
  base: string,
  entityRef: string,
): string | undefined {
  const parsed = parseDefinitionEntityRef(entityRef);
  const root = base.replace(/\/+$/, '');
  if (!root || !parsed) return undefined;
  return `${root}/catalog/${encodeURIComponent(
    parsed.namespace,
  )}/${encodeURIComponent(parsed.name)}`;
}

/** Display the entity name for an explicit definition-file ref, if it is valid. */
export function definitionFileName(entityRef: string): string | undefined {
  return parseDefinitionEntityRef(entityRef)?.name;
}

/** Unknown inventories must never imply that an image contains no content. */
export function imageContentsSummary(image: ExecutionEnvironment): string {
  if (!image.contentsKnown) return 'Contents unknown';
  return `${image.enumeration.status !== 'complete' ? 'Approximate: ' : ''}${
    image.counts?.collections ?? 'Unknown'
  } collections / ${image.counts?.plugins ?? 'Unknown'} plugins`;
}

/** Relative freshness, with explicit missing/invalid timestamp handling. */
export function relativeTime(value?: string): string {
  if (!value) return 'Never reconciled';
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return 'Unknown reconciliation time';
  if (minutes < 1) return 'Just now';
  let amount: number;
  let unit: string;
  if (minutes < 60) {
    amount = minutes;
    unit = 'minute';
  } else if (minutes < 1440) {
    amount = Math.floor(minutes / 60);
    unit = 'hour';
  } else {
    amount = Math.floor(minutes / 1440);
    unit = 'day';
  }
  return `${amount} ${unit}${amount === 1 ? '' : 's'} ago`;
}

/**
 * Row sync state, derived from the owning registry's last reconciliation time
 * and outcome.
 */
export function syncStateLabel(
  lastReconciledAt?: string,
  lastReconcileOk?: boolean,
): string {
  if (!lastReconciledAt) return 'Syncing';
  if (lastReconcileOk === false) return 'Failed';
  const reconciledAt = new Date(lastReconciledAt).getTime();
  if (!Number.isFinite(reconciledAt)) return 'Stale';
  if (Date.now() - reconciledAt > STALE_AFTER_MS) return 'Stale';
  return 'Available';
}

/**
 * Where the artifact came from. Registry scans are the only source today; a
 * "Definition file" source arrives with that integration.
 */
export function sourceLabel(registry?: string): string {
  return registry ? 'External registry' : 'Definition file';
}

/** Consistent badge tone for image sync states in lists and details. */
export function syncStatusTone(status: string): StatusBadgeTone {
  if (status === 'Available') return 'success';
  if (status === 'Failed') return 'danger';
  if (status === 'Stale') return 'warning';
  return 'info';
}

/** Prefer a known definition-file origin over the registry fallback. */
export function imageSourceLabel(
  registry: string,
  definitionEntityRef?: string,
): string {
  if (definitionEntityRef) return 'Definition file';
  return sourceLabel(registry);
}
