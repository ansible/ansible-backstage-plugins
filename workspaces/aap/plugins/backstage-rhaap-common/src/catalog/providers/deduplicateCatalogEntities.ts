import type { LoggerService } from '@backstage/backend-plugin-api';
import type { Entity } from '@backstage/catalog-model';

/**
 * Keep the first entity for each catalog identity and warn about conflicts.
 *
 * Keeping the first entity preserves deterministic sync output while the
 * warning exposes source collisions without sending invalid duplicates to
 * the catalog processor.
 */
export function deduplicateCatalogEntities(
  entities: Entity[],
  logger: LoggerService,
  pluginLogName: string,
): {
  entities: Entity[];
  duplicateEntityCount: number;
} {
  const seen = new Map<string, Entity>();
  const unique: Entity[] = [];
  // Keep warning volume bounded for large or repeatedly duplicated payloads.
  const conflicts: string[] = [];
  const maxConflictDetails = 10;

  for (const entity of entities) {
    const key = `${entity.kind}:${entity.metadata.namespace ?? 'default'}/${
      entity.metadata.name
    }`;
    const existing = seen.get(key);
    if (existing) {
      const formatAapIds = (candidate: Entity): string =>
        Object.entries(candidate.metadata.annotations ?? {})
          .filter(([name]) => name.startsWith('ansible.com/aap-'))
          .map(([name, value]) => `${name}=${value}`)
          .join(', ') || 'none';
      if (conflicts.length < maxConflictDetails) {
        conflicts.push(
          `${key}: first(${formatAapIds(existing)}) duplicate(${formatAapIds(
            entity,
          )})`,
        );
      }
      continue;
    }

    seen.set(key, entity);
    unique.push(entity);
  }

  // Count all skipped entities, including conflicts beyond the debug sample.
  const duplicateEntityCount = entities.length - unique.length;
  if (duplicateEntityCount > 0) {
    logger.warn(
      `[${pluginLogName}]: Skipped ${duplicateEntityCount} duplicate catalog entity keys; kept first entity for each key`,
    );
    logger.debug(`[${pluginLogName}]: Duplicate catalog entity details`, {
      // AAP IDs make collisions actionable without flooding normal logs.
      conflicts,
      totalConflicts: duplicateEntityCount,
      truncated: duplicateEntityCount > conflicts.length,
    });
  }

  return { entities: unique, duplicateEntityCount };
}
