import type { Entity } from '@backstage/catalog-model';
import type { ExecutionEnvironment } from '../../api';

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

/** Relative freshness, with explicit missing/invalid timestamp handling. */
export function relativeTime(value?: string): string {
  if (!value) return 'Never reconciled';
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return 'Unknown reconciliation time';
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minutes ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hours ago`;
  return `${Math.floor(minutes / 1440)} days ago`;
}
