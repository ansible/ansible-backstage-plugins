import { CONTENT_TYPES } from '@ansible/portal-extension-api';
import type { EntityDetailTabDescriptor } from '@ansible/portal-extension-api/alpha';
import { validateManifest } from '../validateManifest';

export function resolveEntityTab(tab: EntityDetailTabDescriptor) {
  const capability = tab.manifest.capabilities.find(
    item => item.id === tab.capabilityId,
  );
  const entry = capability?.entryPoints.find(
    item => item.id === tab.entryPointId,
  );
  return { capability, entry };
}

/** Fail closed per contribution, so a malformed plugin does not kill the page. */
export function collectEntityTabs(
  tabs: readonly EntityDetailTabDescriptor[],
  hostApiVersion = '0.1.0',
): EntityDetailTabDescriptor[] {
  const seen = new Set<string>();
  return tabs
    .filter(tab => {
      try {
        const { capability, entry } = resolveEntityTab(tab);
        const validation = validateManifest(tab.manifest, hostApiVersion);
        const valid =
          validation.valid &&
          capability &&
          entry &&
          capability.ownerPlugin === tab.manifest.id &&
          !capability.appliesTo &&
          (capability.appliesToContentTypes === '*' ||
            capability.appliesToContentTypes.every(type =>
              Object.values(CONTENT_TYPES).some(known => known === type),
            )) &&
          capability.id.startsWith(`${tab.manifest.id}.`) &&
          entry.id.startsWith(`${tab.manifest.id}.`) &&
          tab.attachment === 'entity.detail.tabs' &&
          entry.kind === 'entity-tab' &&
          entry.surface === 'entity-page' &&
          entry.launches.type === 'slot' &&
          entry.launches.targetSlot === tab.attachment &&
          entry.appliesToContentTypes.length > 0 &&
          entry.appliesToContentTypes.every(
            type =>
              Object.values(CONTENT_TYPES).some(known => known === type) &&
              (capability.appliesToContentTypes === '*' ||
                capability.appliesToContentTypes.includes(type)),
          ) &&
          typeof tab.loader === 'function' &&
          (tab.requiredEntitlements ?? []).every(id =>
            tab.manifest.entitlements.some(
              entitlement => entitlement.id === id,
            ),
          ) &&
          !seen.has(entry.id);
        if (!valid) throw new Error('Invalid or duplicate entity-tab contract');
        seen.add(entry.id);
        return true;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(
          `[Portal NFS] Rejected entity tab ${tab.entryPointId}`,
          error,
        );
        return false;
      }
    })
    .sort(
      (a, b) =>
        (resolveEntityTab(a).entry?.order ?? 0) -
        (resolveEntityTab(b).entry?.order ?? 0),
    );
}
