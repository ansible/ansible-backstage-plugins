import { CONTENT_TYPES } from '@ansible/portal-extension-api';
import type {
  EntityActionDescriptor,
  CatalogItemActionDescriptor,
} from '@ansible/portal-extension-api/alpha';
import { validateManifest } from '../validateManifest';
import { resolveEntityContribution } from './useEligibleContributions';

export function collectEntityActions(
  actions: readonly EntityActionDescriptor[],
  hostApiVersion = '0.1.0',
) {
  return collectOperationActions(actions, 'entity', hostApiVersion);
}

export function collectOperationActions<
  T extends EntityActionDescriptor | CatalogItemActionDescriptor,
>(
  actions: readonly T[],
  surface: 'entity' | 'catalog',
  hostApiVersion = '0.1.0',
): T[] {
  const seen = new Set<string>();
  return actions
    .filter(action => {
      try {
        const { capability, entry } = resolveEntityContribution(action);
        const known = (type: string) =>
          Object.values(CONTENT_TYPES).some(value => value === type);
        if (
          !validateManifest(action.manifest, hostApiVersion).valid ||
          !capability ||
          !entry ||
          capability.ownerPlugin !== action.manifest.id ||
          capability.appliesTo ||
          !(
            capability.appliesToContentTypes === '*' ||
            capability.appliesToContentTypes.every(known)
          ) ||
          !capability.id.startsWith(`${action.manifest.id}.`) ||
          !entry.id.startsWith(`${action.manifest.id}.`) ||
          action.attachment !==
            (surface === 'entity'
              ? 'entity.actions'
              : 'catalog.item.actions') ||
          entry.kind !==
            (surface === 'entity' ? 'entity-action' : 'catalog-item-action') ||
          entry.surface !==
            (surface === 'entity' ? 'entity-page' : 'catalog-item') ||
          entry.launches.type !== 'operation' ||
          !entry.launches.operationId.startsWith(`${action.manifest.id}.`) ||
          entry.launches.operationId.length <= action.manifest.id.length + 1 ||
          !entry.requiredPermission ||
          (action.completion !== undefined &&
            action.completion !== 'subject-removed') ||
          (action.completion === 'subject-removed' && !action.confirmation) ||
          (action.confirmation &&
            ![
              action.confirmation.title,
              action.confirmation.description,
              action.confirmation.confirmLabel,
            ].every(
              value => typeof value === 'string' && value.trim().length > 0,
            )) ||
          entry.appliesToContentTypes.length === 0 ||
          !entry.appliesToContentTypes.every(
            type =>
              known(type) &&
              (capability.appliesToContentTypes === '*' ||
                capability.appliesToContentTypes.includes(type)),
          ) ||
          !(action.requiredEntitlements ?? []).every(id =>
            action.manifest.entitlements.some(item => item.id === id),
          ) ||
          seen.has(entry.id)
        ) {
          throw new Error('Invalid or duplicate entity-action contract');
        }
        if (entry.launches.followOn) {
          if (surface !== 'entity' || !('followOnEntryPointId' in action))
            throw new Error('Catalog follow-ons are not supported');
          const followOn = entry.launches.followOn;
          const target = action.manifest.capabilities
            .flatMap(item => item.entryPoints)
            .find(item => item.id === action.followOnEntryPointId);
          if (
            followOn.type !== 'slot' ||
            followOn.targetSlot !== 'entity.detail.tabs' ||
            !target ||
            target.kind !== 'entity-tab' ||
            target.surface !== 'entity-page' ||
            target.launches.type !== 'slot' ||
            target.launches.targetSlot !== followOn.targetSlot
          ) {
            throw new Error('Unsupported entity-action follow-on');
          }
        } else if (
          'followOnEntryPointId' in action &&
          action.followOnEntryPointId
        )
          throw new Error('Follow-on entry requires a declared launch');
        seen.add(entry.id);
        return true;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(
          `[Portal NFS] Rejected entity action ${action.entryPointId}`,
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
