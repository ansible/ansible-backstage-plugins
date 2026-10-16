import { CONTENT_TYPES } from '@ansible/portal-extension-api';
import type { CatalogTableColumnDescriptor } from '@ansible/portal-extension-api/alpha';
import { validateManifest } from '../validateManifest';
import { resolveEntityContribution } from './useEligibleContributions';

export function collectCatalogColumns(
  columns: readonly CatalogTableColumnDescriptor[],
  version = '0.1.0',
) {
  const seen = new Set<string>();
  return columns
    .filter(column => {
      try {
        const { capability, entry } = resolveEntityContribution(column);
        if (
          !validateManifest(column.manifest, version).valid ||
          !capability ||
          !entry ||
          capability.appliesTo ||
          capability.ownerPlugin !== column.manifest.id ||
          !capability.id.startsWith(`${column.manifest.id}.`) ||
          !entry.id.startsWith(`${column.manifest.id}.`) ||
          column.attachment !== 'catalog.table.columns' ||
          entry.kind !== 'table-column' ||
          entry.surface !== 'catalog-item' ||
          entry.launches.type !== 'slot' ||
          entry.launches.targetSlot !== column.attachment ||
          typeof column.loader !== 'function' ||
          !entry.appliesToContentTypes.length ||
          !entry.appliesToContentTypes.every(
            type =>
              Object.values(CONTENT_TYPES).some(known => known === type) &&
              (capability.appliesToContentTypes === '*' ||
                capability.appliesToContentTypes.includes(type)),
          ) ||
          !(column.requiredEntitlements ?? []).every(id =>
            column.manifest.entitlements.some(item => item.id === id),
          ) ||
          seen.has(entry.id)
        )
          return false;
        seen.add(entry.id);
        return true;
      } catch {
        return false;
      }
    })
    .sort(
      (a, b) =>
        (resolveEntityContribution(a).entry?.order ?? 0) -
        (resolveEntityContribution(b).entry?.order ?? 0),
    );
}
