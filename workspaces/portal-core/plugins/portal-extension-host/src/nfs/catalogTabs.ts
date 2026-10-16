import { CONTENT_TYPES } from '@ansible/portal-extension-api';
import type { CatalogTabDescriptor } from '@ansible/portal-extension-api/alpha';
import { validateManifest } from '../validateManifest';

export function resolveCatalogTab(tab: CatalogTabDescriptor) {
  const capability = tab.manifest.capabilities.find(
    item => item.id === tab.capabilityId,
  );
  return {
    capability,
    entry: capability?.entryPoints.find(item => item.id === tab.entryPointId),
  };
}
export function collectCatalogTabs(
  tabs: readonly CatalogTabDescriptor[],
  version = '0.1.0',
) {
  const seen = new Set<string>();
  return tabs
    .filter(tab => {
      try {
        const { capability, entry } = resolveCatalogTab(tab);
        if (
          !validateManifest(tab.manifest, version).valid ||
          !capability ||
          !entry ||
          capability.appliesTo ||
          capability.ownerPlugin !== tab.manifest.id ||
          !capability.id.startsWith(`${tab.manifest.id}.`) ||
          !entry.id.startsWith(`${tab.manifest.id}.`) ||
          tab.attachment !== 'catalog.tabs' ||
          entry.kind !== 'page-tab' ||
          entry.surface !== 'experience-slot' ||
          entry.launches.type !== 'slot' ||
          entry.launches.targetSlot !== tab.attachment ||
          typeof tab.loader !== 'function' ||
          !entry.appliesToContentTypes.length ||
          !entry.appliesToContentTypes.every(
            type =>
              Object.values(CONTENT_TYPES).some(known => known === type) &&
              (capability.appliesToContentTypes === '*' ||
                capability.appliesToContentTypes.includes(type)),
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
        (resolveCatalogTab(a).entry?.order ?? 0) -
        (resolveCatalogTab(b).entry?.order ?? 0),
    );
}
