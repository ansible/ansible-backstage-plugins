import { CONTENT_TYPES } from '@ansible/portal-extension-api';
import type { EntityOverviewCardDescriptor } from '@ansible/portal-extension-api/alpha';
import { validateManifest } from '../validateManifest';
import { resolveEntityContribution } from './useEligibleContributions';

export function collectEntityOverviewCards(
  cards: readonly EntityOverviewCardDescriptor[],
  hostApiVersion = '0.1.0',
) {
  const seen = new Set<string>();
  return cards
    .filter(card => {
      try {
        const { capability, entry } = resolveEntityContribution(card);
        const known = (type: string) =>
          Object.values(CONTENT_TYPES).some(value => value === type);
        if (
          !validateManifest(card.manifest, hostApiVersion).valid ||
          !capability ||
          !entry ||
          capability.ownerPlugin !== card.manifest.id ||
          capability.appliesTo ||
          !(
            capability.appliesToContentTypes === '*' ||
            capability.appliesToContentTypes.every(known)
          ) ||
          !capability.id.startsWith(`${card.manifest.id}.`) ||
          !entry.id.startsWith(`${card.manifest.id}.`) ||
          !['entity.overview.main', 'entity.overview.secondary'].includes(
            card.attachment,
          ) ||
          entry.kind !== 'overview-slot' ||
          entry.surface !== 'entity-page' ||
          entry.launches.type !== 'slot' ||
          entry.launches.targetSlot !== card.attachment ||
          entry.appliesToContentTypes.length === 0 ||
          !entry.appliesToContentTypes.every(
            type =>
              known(type) &&
              (capability.appliesToContentTypes === '*' ||
                capability.appliesToContentTypes.includes(type)),
          ) ||
          typeof card.loader !== 'function' ||
          !(card.requiredEntitlements ?? []).every(id =>
            card.manifest.entitlements.some(item => item.id === id),
          ) ||
          seen.has(entry.id)
        ) {
          throw new Error('Invalid or duplicate entity overview-card contract');
        }
        if (card.detailsEntryPointId) {
          const target = card.manifest.capabilities
            .flatMap(item => item.entryPoints)
            .find(item => item.id === card.detailsEntryPointId);
          if (
            !target ||
            !target.id.startsWith(`${card.manifest.id}.`) ||
            target.kind !== 'entity-tab' ||
            target.surface !== 'entity-page' ||
            target.launches.type !== 'slot' ||
            target.launches.targetSlot !== 'entity.detail.tabs'
          ) {
            throw new Error('Unsupported overview-card details destination');
          }
        }
        seen.add(entry.id);
        return true;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(
          `[Portal NFS] Rejected entity overview card ${card.entryPointId}`,
          error,
        );
        return false;
      }
    })
    .sort(
      (a, b) =>
        (resolveEntityContribution(a).entry?.order ?? 0) -
        (resolveEntityContribution(b).entry?.order ?? 0),
    );
}
